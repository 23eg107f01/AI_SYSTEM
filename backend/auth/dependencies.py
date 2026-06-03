"""
FastAPI dependencies for authentication and role-based access control.
"""
from typing import List

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session

from auth.security import decode_token
from db.base import get_db
from db.redis_client import get_redis, is_access_token_blacklisted
from models.user import User, UserRole

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
    redis=Depends(get_redis),
) -> User:
    """
    Validates the Bearer JWT and returns the authenticated User.
    Checks the token type, expiry, and blacklist status.
    """
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token)
    except JWTError:
        raise credentials_exception

    # Must be an access token
    if payload.get("type") != "access":
        raise credentials_exception

    # Check blacklist (logout / revoked)
    jti: str = payload.get("jti", "")
    if jti and await is_access_token_blacklisted(jti):
        raise credentials_exception

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception

    return user


def require_roles(*roles: UserRole):
    """
    Returns a dependency that restricts access to the specified roles.

    Usage:
        @router.get("/admin-only", dependencies=[Depends(require_roles(UserRole.ADMIN))])
    """
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {[r.value for r in roles]}",
            )
        return current_user

    return _check


# Convenience shortcuts
require_admin = require_roles(UserRole.ADMIN)
require_manager = require_roles(UserRole.MANAGER, UserRole.ADMIN)
require_agent = require_roles(UserRole.AGENT, UserRole.MANAGER, UserRole.ADMIN)
