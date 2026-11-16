"""Shared FastAPI dependencies: DB session, current user, ownership checks."""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import models
from app.database.session import get_db  # re-exported: `from app.utils.deps import get_db`
from app.utils.security import decode_token, invalidate_all_for_user

logger = logging.getLogger(__name__)

# `invalidate_all_for_user` is re-exported above so the password-change handler
# can `from app.utils.deps import invalidate_all_for_user` without reaching into
# security.py's internals.

# tokenUrl points at the real login route so Swagger's "Authorize" works.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def _credentials_error() -> HTTPException:
    # Built per raise so a shared exception instance never accumulates tracebacks.
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """Resolve the bearer token to a User row, or 401."""
    payload = decode_token(token)
    if not payload:
        raise _credentials_error()

    subject = payload.get("sub")
    if subject is None:
        raise _credentials_error()

    user: Optional[models.User] = None
    # `sub` is the user id for tokens issued by this app; email is accepted so a
    # token from an older/external issuer keyed on email still resolves.
    try:
        user = db.query(models.User).filter(models.User.id == int(subject)).first()
    except (TypeError, ValueError):
        user = (
            db.query(models.User)
            .filter(models.User.email == str(subject).lower())
            .first()
        )

    if user is None:
        raise _credentials_error()
    return user


def resolve_principal(current_user) -> Optional[models.User]:
    """Normalize a route handler's `current_user` argument for direct callers.

    Over HTTP FastAPI always injects a real `User` (or the dependency 401s). This
    exists for the two other ways these handlers get invoked — the WebSocket
    finalizer and the test suite — which pass `None` because there is no HTTP
    principal. Anything else means a caller forgot to resolve the dependency.
    """
    if current_user is None:
        return None
    if isinstance(current_user, models.User):
        return current_user
    # Failing loudly is deliberate: the alternative is silently skipping an
    # ownership check.
    raise RuntimeError(
        "expected a User or None, got %r — internal callers must pass "
        "current_user=None explicitly" % (current_user,)
    )


def assert_owner(
    resource_user_id: Optional[int], current_user: Optional[models.User]
) -> None:
    """403 unless `resource_user_id` belongs to the signed-in user.

    Rows written before authentication have user_id = NULL: they stay reachable
    through internal callers (which pass current_user=None, e.g. the WebSocket
    handler) but are 403 for any signed-up user, so no account can read another
    tenant's legacy data.
    """
    principal = resolve_principal(current_user)
    if principal is None:
        return
    if resource_user_id is None or resource_user_id != principal.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions for this resource",
        )


def get_current_websocket_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Query(None),
) -> Optional[models.User]:
    """Resolve the `?token=` query param on a WebSocket handshake to a User.

    A WebSocket handshake carries no Authorization header, so the client
    attaches the JWT as `?token=<jwt>` when it opens the connection. If a token
    is present we validate it exactly like an HTTP bearer token and 401 on
    failure; if absent we return None (legacy, unauthenticated behavior —
    callers MUST still refuse writes until authentication is implemented).

    This is the bridge referenced in the security pipeline for Phase 3.
    """
    if not token:
        logger.info("WebSocket without token — not authenticated")
        return None
    payload = decode_token(token)
    if not payload:
        logger.warning("WebSocket token rejected for interview")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="WebSocket connection not authorized",
            headers={"WWW-Authenticate": "Bearer"},
        )
    subject = payload.get("sub")
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="WebSocket connection not authorized",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user: Optional[models.User] = None
    try:
        user = db.query(models.User).filter(models.User.id == int(subject)).first()
    except (TypeError, ValueError):
        user = (
            db.query(models.User)
            .filter(models.User.email == str(subject).lower())
            .first()
        )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="WebSocket connection not authorized",
            headers={"WWW-Authenticate": "Bearer"},
        )
    logger.info("WebSocket authenticated: user=%d", user.id)
    return user
