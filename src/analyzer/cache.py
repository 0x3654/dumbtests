import os
import redis.asyncio as redis

_client = None


def get_client():
    global _client
    if _client is None:
        _client = redis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379"))
    return _client


async def get_cached(username: str) -> str | None:
    val = await get_client().get(f"verdict:{username}")
    return val.decode() if val else None


async def set_cached(username: str, verdict: str, ttl: int = 604800):
    await get_client().set(f"verdict:{username}", verdict, ex=ttl)
