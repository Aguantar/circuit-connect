from app.core.database import get_pool


async def upsert_user(user_key: str, nickname: str | None = None) -> dict:
    """Create or update user, return user row."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (user_key, nickname)
            VALUES ($1, $2)
            ON CONFLICT (user_key) DO UPDATE
                SET last_seen_at = NOW(),
                    nickname = COALESCE($2, users.nickname)
            RETURNING user_key, nickname, created_at, last_seen_at
            """,
            user_key, nickname,
        )
    return dict(row)


async def get_user(user_key: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT user_key, nickname, created_at, last_seen_at FROM users WHERE user_key = $1",
            user_key,
        )
    return dict(row) if row else None
