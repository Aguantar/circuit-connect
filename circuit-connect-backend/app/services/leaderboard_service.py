from app.core.database import get_pool
from app.models.schemas import LeaderboardSubmit


async def submit_score(data: LeaderboardSubmit) -> dict:
    """Insert leaderboard entry, return the row."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO leaderboard (user_key, mode, time_limit_sec, score, stages_cleared, avg_clear_ms, universal_used)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            """,
            data.user_key, data.mode, data.time_limit_sec,
            data.score, data.stages_cleared, data.avg_clear_ms, data.universal_used,
        )
    return dict(row)


async def get_leaderboard(
    mode: str = "time_attack",
    time_limit_sec: int | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[dict]:
    """
    Top scores for a given mode.
    - 유저별 최고 기록만 (DISTINCT ON)
    - DENSE_RANK: 점수 DESC → 클리어 수 DESC → 평균시간 ASC
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        if time_limit_sec is not None:
            rows = await conn.fetch(
                """
                WITH best AS (
                    SELECT DISTINCT ON (l.user_key)
                        l.*, u.nickname
                    FROM leaderboard l
                    JOIN users u ON l.user_key = u.user_key
                    WHERE l.mode = $1 AND l.time_limit_sec = $2
                    ORDER BY l.user_key, l.score DESC, l.stages_cleared DESC, l.avg_clear_ms ASC
                )
                SELECT *, DENSE_RANK() OVER (
                    ORDER BY score DESC, stages_cleared DESC, avg_clear_ms ASC
                )::int as rank
                FROM best
                ORDER BY rank, user_key
                LIMIT $3 OFFSET $4
                """,
                mode, time_limit_sec, limit, offset,
            )
        else:
            rows = await conn.fetch(
                """
                WITH best AS (
                    SELECT DISTINCT ON (l.user_key)
                        l.*, u.nickname
                    FROM leaderboard l
                    JOIN users u ON l.user_key = u.user_key
                    WHERE l.mode = $1
                    ORDER BY l.user_key, l.score DESC, l.stages_cleared DESC, l.avg_clear_ms ASC
                )
                SELECT *, DENSE_RANK() OVER (
                    ORDER BY score DESC, stages_cleared DESC, avg_clear_ms ASC
                )::int as rank
                FROM best
                ORDER BY rank, user_key
                LIMIT $2 OFFSET $3
                """,
                mode, limit, offset,
            )
    return [dict(r) for r in rows]


async def get_my_rank(
    user_key: str,
    mode: str = "time_attack",
    time_limit_sec: int | None = None,
) -> dict | None:
    """
    특정 유저의 최고 기록 + DENSE_RANK 순위 반환.
    기록이 없으면 None.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        if time_limit_sec is not None:
            row = await conn.fetchrow(
                """
                WITH best AS (
                    SELECT DISTINCT ON (l.user_key)
                        l.*, u.nickname
                    FROM leaderboard l
                    JOIN users u ON l.user_key = u.user_key
                    WHERE l.mode = $1 AND l.time_limit_sec = $2
                    ORDER BY l.user_key, l.score DESC, l.stages_cleared DESC, l.avg_clear_ms ASC
                ),
                ranked AS (
                    SELECT *, DENSE_RANK() OVER (
                        ORDER BY score DESC, stages_cleared DESC, avg_clear_ms ASC
                    )::int as rank
                    FROM best
                )
                SELECT * FROM ranked WHERE user_key = $3
                """,
                mode, time_limit_sec, user_key,
            )
        else:
            row = await conn.fetchrow(
                """
                WITH best AS (
                    SELECT DISTINCT ON (l.user_key)
                        l.*, u.nickname
                    FROM leaderboard l
                    JOIN users u ON l.user_key = u.user_key
                    WHERE l.mode = $1
                    ORDER BY l.user_key, l.score DESC, l.stages_cleared DESC, l.avg_clear_ms ASC
                ),
                ranked AS (
                    SELECT *, DENSE_RANK() OVER (
                        ORDER BY score DESC, stages_cleared DESC, avg_clear_ms ASC
                    )::int as rank
                    FROM best
                )
                SELECT * FROM ranked WHERE user_key = $2
                """,
                mode, user_key,
            )
    return dict(row) if row else None
