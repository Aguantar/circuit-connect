import asyncpg
from app.core.config import get_settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


async def init_db():
    global _pool
    s = get_settings()
    _pool = await asyncpg.create_pool(
        host=s.PG_HOST,
        port=s.PG_PORT,
        user=s.PG_USER,
        password=s.PG_PASSWORD,
        database=s.PG_DATABASE,
        min_size=2,
        max_size=10,
    )


async def close_db():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
