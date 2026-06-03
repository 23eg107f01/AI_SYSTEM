import logging

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from config import settings

logger = logging.getLogger(__name__)

if settings.REDIS_ENABLED:
    redis_client: aioredis.Redis | None = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
    )
else:
    redis_client = None


async def get_redis() -> aioredis.Redis | None:
    """FastAPI dependency - returns the shared async Redis client when enabled."""
    return redis_client


async def _redis_available() -> bool:
    if not settings.REDIS_ENABLED or redis_client is None:
        return False
    try:
        await redis_client.ping()
        return True
    except RedisError as exc:
        logger.warning("Redis unavailable, using auth fallback mode: %s", exc)
        return False


REFRESH_TOKEN_PREFIX = "refresh:"
BLACKLIST_PREFIX = "blacklist:"


async def store_refresh_token(user_id: int, token: str, ttl_seconds: int) -> None:
    if not await _redis_available():
        return
    key = f"{REFRESH_TOKEN_PREFIX}{user_id}:{token}"
    await redis_client.setex(key, ttl_seconds, "1")


async def refresh_token_exists(user_id: int, token: str) -> bool:
    if not await _redis_available():
        return True
    key = f"{REFRESH_TOKEN_PREFIX}{user_id}:{token}"
    return await redis_client.exists(key) == 1


async def revoke_refresh_token(user_id: int, token: str) -> None:
    if not await _redis_available():
        return
    key = f"{REFRESH_TOKEN_PREFIX}{user_id}:{token}"
    await redis_client.delete(key)


async def revoke_all_refresh_tokens(user_id: int) -> None:
    """Revoke every refresh token for a given user when Redis is available."""
    if not await _redis_available():
        return
    pattern = f"{REFRESH_TOKEN_PREFIX}{user_id}:*"
    keys = await redis_client.keys(pattern)
    if keys:
        await redis_client.delete(*keys)


async def blacklist_access_token(jti: str, ttl_seconds: int) -> None:
    """Add an access token's JTI to the blacklist when Redis is available."""
    if not await _redis_available():
        return
    key = f"{BLACKLIST_PREFIX}{jti}"
    await redis_client.setex(key, ttl_seconds, "1")


async def is_access_token_blacklisted(jti: str) -> bool:
    if not await _redis_available():
        return False
    key = f"{BLACKLIST_PREFIX}{jti}"
    return await redis_client.exists(key) == 1
