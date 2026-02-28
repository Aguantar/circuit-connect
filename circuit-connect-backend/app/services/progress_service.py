from app.core.database import get_pool


async def get_progress(user_key: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT stage_id, best_time_ms, clear_count, universal_used, first_cleared_at, updated_at
            FROM stage_progress
            WHERE user_key = $1
            ORDER BY stage_id
            """,
            user_key,
        )
    return [dict(r) for r in rows]


async def upsert_progress(
    user_key: str,
    stage_id: str,
    clear_time_ms: int,
    universal_used: int = 0,
) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO stage_progress (user_key, stage_id, best_time_ms, clear_count, universal_used, first_cleared_at, updated_at)
            VALUES ($1, $2, $3, 1, $4, NOW(), NOW())
            ON CONFLICT (user_key, stage_id) DO UPDATE SET
                best_time_ms = LEAST(stage_progress.best_time_ms, $3),
                clear_count = stage_progress.clear_count + 1,
                universal_used = stage_progress.universal_used + $4,
                updated_at = NOW()
            RETURNING *
            """,
            user_key, stage_id, clear_time_ms, universal_used,
        )
    return dict(row)
