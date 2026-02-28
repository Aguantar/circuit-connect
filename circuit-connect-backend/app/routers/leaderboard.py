from fastapi import APIRouter, Query
from app.models.schemas import LeaderboardEntry, LeaderboardSubmit
from app.services.leaderboard_service import submit_score, get_leaderboard, get_my_rank

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("/", response_model=list[LeaderboardEntry])
async def read_leaderboard(
    mode: str = Query("time_attack"),
    time_limit_sec: int | None = Query(None),
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
):
    """랭킹 조회"""
    rows = await get_leaderboard(mode, time_limit_sec, limit, offset)
    return [LeaderboardEntry(**r) for r in rows]


@router.get("/me", response_model=LeaderboardEntry | None)
async def read_my_rank(
    user_key: str = Query(...),
    mode: str = Query("time_attack"),
    time_limit_sec: int | None = Query(None),
):
    """내 순위 조회"""
    row = await get_my_rank(user_key, mode, time_limit_sec)
    if row is None:
        return None
    return LeaderboardEntry(**row)


@router.post("/", response_model=LeaderboardEntry)
async def create_leaderboard_entry(body: LeaderboardSubmit):
    """점수 등록"""
    row = await submit_score(body)
    return LeaderboardEntry(**row)
