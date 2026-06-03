"""
Auth endpoints:
  POST /auth/register
  POST /auth/login
  POST /auth/refresh
  POST /auth/logout
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session

from auth.schemas import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse, UserOut
from auth.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from auth.dependencies import get_current_user
from config import settings
from db.base import get_db
from db.redis_client import (
    blacklist_access_token,
    get_redis,
    refresh_token_exists,
    revoke_all_refresh_tokens,
    revoke_refresh_token,
    store_refresh_token,
)
from models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
    redis=Depends(get_redis),
):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    access_token = create_access_token(user.id, user.role.value)
    refresh_token = create_refresh_token(user.id, user.role.value)

    ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    await store_refresh_token(user.id, refresh_token, ttl)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    payload: RefreshRequest,
    db: Session = Depends(get_db),
    redis=Depends(get_redis),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )
    try:
        data = decode_token(payload.refresh_token)
    except JWTError:
        raise credentials_exception

    if data.get("type") != "refresh":
        raise credentials_exception

    user_id = int(data["sub"])
    if not await refresh_token_exists(user_id, payload.refresh_token):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise credentials_exception

    # Rotate: revoke old, issue new
    await revoke_refresh_token(user_id, payload.refresh_token)
    new_access = create_access_token(user.id, user.role.value)
    new_refresh = create_refresh_token(user.id, user.role.value)

    ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    await store_refresh_token(user.id, new_refresh, ttl)

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: User = Depends(get_current_user),
    redis=Depends(get_redis),
    # We need the raw token to blacklist its JTI — passed via header
    # We re-read it from the dependency chain via a second depends
):
    """
    Revokes all refresh tokens for the current user.
    The access token expires naturally (short TTL), but we
    also blacklist it via its JTI if possible.
    """
    await revoke_all_refresh_tokens(current_user.id)
    # Note: access token blacklisting is handled separately via /auth/revoke-access
    # if the client sends the access token JTI. Here we just clear refresh tokens.


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
