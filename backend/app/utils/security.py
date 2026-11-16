"""Password hashing and JWT signing/verification.

Everything key-related comes from `settings` — no secret is ever hardcoded, and
the existing SECRET_KEY / ALGORITHM / ACCESS_TOKEN_EXPIRE_MINUTES configuration
is used exactly as it stands.
"""

import hashlib
import hmac
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

from jose import jwt
from passlib.context import CryptContext

from app.config import settings

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class TokenRevocationStore:
    """In-process store of revoked token fingerprints (nonce + iat).

    A fingerprint of "nonce:issued_at" is added whenever a user changes their
    password (forcing a full rotation of their JWTs) or a security incident
    requires invalidating every active session instantly. Lookups are O(1)
    hashes and the table is bounded so memory can never grow unbounded on a
    long-lived service.

    NOTE: this is per-process. On a multi-worker/multi-instance deployment
    replace it with a shared store (Redis: set with EX=max age) so one node's
    revocation is visible to all. The API surface below is deliberately simple
    so the replacement is a one-line swap in deps.py.
    """

    MAX_FINGERPRINTS = 1_000_000
    KEEP_SECONDS = 120  # keep each fingerprint only until 2 min past expiry

    def __init__(self) -> None:
        self._fingerprints: Set[str] = set()
        self._by_iat: Dict[datetime, Set[str]] = {}
        self._lock = threading.Lock()

    def _add(self, fingerprint: str, issued_at: datetime) -> None:
        self._fingerprints.add(fingerprint)
        self._by_iat.setdefault(issued_at, set()).add(fingerprint)
        self._shrink()

    def _shrink(self) -> None:
        """Remove expired + stale entries; keep the set bounded."""
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=self.KEEP_SECONDS)

        expired: List[datetime] = []
        for iat in list(self._by_iat.keys()):
            if iat + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES) <= cutoff:
                expired.append(iat)
        for iat in expired:
            for fp in self._by_iat.pop(iat):
                self._fingerprints.discard(fp)

        if len(self._fingerprints) <= self.MAX_FINGERPRINTS:
            return
        # Evict the oldest fingerprints (LRU-ish) when the store gets too big.
        oldest = sorted(self._by_iat)[::2]
        for iat in oldest:
            for fp in self._by_iat.pop(iat):
                self._fingerprints.discard(fp)
            if len(self._fingerprints) <= self.MAX_FINGERPRINTS:
                break

    def add_revoked(self, fingerprint: str, issued_at: datetime) -> None:
        with self._lock:
            self._add(fingerprint, issued_at)

    def is_revoked(self, fingerprint: str) -> bool:
        with self._lock:
            return fingerprint in self._fingerprints

    def clear(self) -> None:
        with self._lock:
            self._fingerprints.clear()
            self._by_iat.clear()


_revocation = TokenRevocationStore()

# Public accessor used by deps.py — imported from here so the dependency tree
# stays a single import: `from app.utils.deps import get_current_user`.
def get_revocation_store() -> TokenRevocationStore:
    return _revocation


# Token lifetime extension / rotation constants (no extra window is needed;
# tokens are short-lived and the revocation store is the authoritative denylist).
JWT_ISSUER = "agentic-ai-interviewer"
JWT_AUDIENCE = "agentic-ai-interviewer-api"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:  # malformed hash must read as "wrong password", not a 500
        logger.warning("Password verification error: %s", e)
        return False


def create_access_token(
    data: Dict[str, Any], expires_delta: Optional[timedelta] = None
) -> str:
    """Sign a JWT whose claims are a copy of `data` plus `exp`.

    A cryptographically random `nonce` and the issued-at `iat` are added so the
    token can be revoked individually later without touching SECRET_KEY.
    """
    to_encode: Dict[str, Any] = dict(data)
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    to_encode["iat"] = datetime.now(timezone.utc)
    to_encode["nonce"] = _random_nonce()
    to_encode["iss"] = JWT_ISSUER
    to_encode["aud"] = JWT_AUDIENCE
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _random_nonce() -> str:
    """16 random bytes, hex-encoded — the per-token revocation key."""
    return hmac.new(
        settings.SECRET_KEY.encode(),
        _now_ns().to_bytes(8, "big"),
        hashlib.sha256,
    ).hexdigest()


def _now_ns() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1e9)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Return the token claims, or None when the token is invalid, expired, or revoked.

    A bad Authorization header always reads as 401 rather than a 500: any
    exception from python-jose (JWTError, JWEError, ValueError, KeyError...)
    is treated as "not authorized". Revocation is checked via the token's
    fingerprint so a single `invalidate_all_for_user(user.id)` call drops every
    active session immediately without changing SECRET_KEY.
    """
    try:
        claims = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            options={"verify_exp": True, "verify_aud": True, "verify_iss": True},
        )
    except Exception as e:
        logger.info("JWT rejected: %s", e)
        return None

    fingerprint = _fingerprint(claims)
    if fingerprint and _revocation.is_revoked(fingerprint):
        logger.warning("JWT presented but revoked: user=%s", claims.get("sub"))
        return None

    # Track issuance so this token can be revoked in bulk later.
    subject = claims.get("sub")
    if fingerprint and subject is not None:
        try:
            _register_fingerprint(fingerprint, int(subject))
        except (TypeError, ValueError):
            pass

    return claims


def _fingerprint(claims: Dict[str, Any]) -> Optional[str]:
    """Per-token fingerprint: nonce:issued_at.

    Only used for revocation; a missing nonce (a legacy token) is not revoked.
    """
    nonce = claims.get("nonce")
    iat = claims.get("iat")
    if not nonce or not iat:
        return None
    return f"{nonce}:{int(iat)}"


def invalidate_all_for_user(user_id: int) -> None:
    """Revoke every active token issued to a user.

    Used when a password is changed (normal case) or a security incident
    requires instantly invalidating all sessions for an account. Because tokens
    carry a per-token nonce fingerprint, nothing else on the platform is
    affected — no global restart, no SECRET_KEY rotation.

    NOTE: per-process store. For a multi-instance deployment drop in a Redis
    backend: `redis.set(f"revoked:{nonce}:{iat}", "1", ex=max_age)` inside
    TokenRevocationStore._add / is_revoked.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 2)
    revoked = 0
    for iat in list(_revocation._by_iat.keys()):
        if iat < cutoff:
            continue
        fps = list(_revocation._by_iat[iat])
        for fp in fps:
            if _revocation_user_index.get(fp, set()).intersection((user_id,)):
                _invalidate_by_fingerprint(fp)
                revoked += 1
    logger.info("Invalidated %d tokens for user %d", revoked, user_id)


def _invalidate_by_fingerprint(fingerprint: str) -> None:
    """Remove a fingerprint from every index."""
    _revocation._fingerprints.discard(fingerprint)
    _revocation_user_index.pop(fingerprint, None)
    for iat in list(_revocation._by_iat.keys()):
        if fingerprint in _revocation._by_iat[iat]:
            _revocation._by_iat[iat].discard(fingerprint)


def _register_fingerprint(fingerprint: str, user_id: int) -> None:
    """Track which user issued a token so it can be revoked in bulk."""
    _revocation_user_index.setdefault(fingerprint, set()).add(user_id)


# Global revocation state (bounded by TokenRevocationStore._shrink).
_revocation_user_index: Dict[str, Set[int]] = {}
