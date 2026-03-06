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


# ── user_stats: 전체 게임 상태 저장/로드 ──

async def save_user_stats(user_key: str, stats: dict) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO user_stats (user_key, stats, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (user_key) DO UPDATE SET
                stats = $2::jsonb,
                updated_at = NOW()
            RETURNING user_key, stats, updated_at
            """,
            user_key, __import__('json').dumps(stats),
        )
    return dict(row)


async def load_user_stats(user_key: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT user_key, stats, updated_at FROM user_stats WHERE user_key = $1",
            user_key,
        )
    if not row:
        return None
    import json
    result = dict(row)
    if isinstance(result["stats"], str):
        result["stats"] = json.loads(result["stats"])
    return result
