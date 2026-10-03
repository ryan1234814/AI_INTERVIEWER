"""Password hashing and JWT signing/verification.

Everything key-related comes from `settings` — no secret is ever hardcoded, and
the existing SECRET_KEY / ALGORITHM / ACCESS_TOKEN_EXPIRE_MINUTES configuration
is used exactly as it stands.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from jose import jwt
from passlib.context import CryptContext

from app.config import settings

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
    """Sign a JWT whose claims are a copy of `data` plus `exp`."""
    to_encode: Dict[str, Any] = dict(data)
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Return the token claims, or None when the token is invalid or expired.

    Broadly caught on purpose: python-jose raises several error families
    (JWTError, JWSError, JWEError) depending on how the token is malformed, and
    a bad Authorization header must always read as 401 rather than a 500.
    """
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except Exception as e:
        logger.info("JWT rejected: %s", e)
        return None
