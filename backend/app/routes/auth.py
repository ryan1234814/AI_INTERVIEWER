"""Signup / login / current-user endpoints.

Passwords are only ever stored as bcrypt hashes, and no response model exposes
`hashed_password`.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import crud, models
from app.database.session import get_db
from app.schemas.auth import AuthResponse, UserCreate, UserLogin, UserOut
from app.utils.deps import get_current_user
from app.utils.rate_limit import rate_limit
from app.utils.security import create_access_token

logger = logging.getLogger(__name__)

router = APIRouter()


def _client_ip(request: Request) -> str:
    """Best-effort client address (Render/proxies forward X-Forwarded-For)."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _issue_token(user: models.User) -> AuthResponse:
    token = create_access_token({"sub": str(user.id), "email": user.email})
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


async def _read_credentials(request: Request) -> tuple:
    """Accept either JSON `{email, password}` or an OAuth2 urlencoded form.

    The form branch is what Swagger's "Authorize" button (and any standards
    compliant OAuth2 client) posts, while the browser app sends JSON.
    """
    content_type = (request.headers.get("content-type") or "").lower()

    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        email = form.get("username") or form.get("email") or ""
        password = form.get("password") or ""
    else:
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        email = payload.get("email") or ""
        password = payload.get("password") or ""

    try:
        creds = UserLogin(email=str(email), password=str(password))
    except ValidationError as e:
        raise HTTPException(
            # Literal 422: the HTTP_422_* constant name differs across Starlette
            # versions, and FastAPI's own validation errors use this status.
            status_code=422,
            detail=e.errors(include_url=False),
        )
    return creds.email, creds.password


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create an account and return a token so the user lands logged-in."""
    rate_limit(f"signup:{_client_ip(request)}", settings.AUTH_RATE_LIMIT_PER_MINUTE)

    if crud.get_user_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    try:
        user = crud.create_user(db, name=payload.name, email=payload.email, password=payload.password)
    except IntegrityError:
        # Two signups for the same email raced past the pre-check above.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    logger.info("Signed up user id=%s", user.id)
    return _issue_token(user)


@router.post("/login", response_model=AuthResponse)
async def login(
    request: Request,
    db: Session = Depends(get_db),
):
    """Log in with JSON `{email, password}` or an OAuth2 password form."""
    email, password = await _read_credentials(request)

    # Failed attempts are what an attacker repeats, so only those consume budget.
    user = crud.authenticate_user(db, email, password)
    if user is None:
        rate_limit(f"login:{_client_ip(request)}:{email}", settings.AUTH_RATE_LIMIT_PER_MINUTE)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _issue_token(user)


@router.get("/me", response_model=UserOut)
async def me(current_user: models.User = Depends(get_current_user)):
    return current_user
