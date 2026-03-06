from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Any
from app.models.schemas import StageProgress
from app.services.progress_service import get_progress, save_user_stats, load_user_stats

router = APIRouter(prefix="/progress", tags=["progress"])


# ── 전체 게임 상태 save/load (/{user_key} 보다 먼저 선언) ──

class SaveStatsRequest(BaseModel):
    user_key: str = Field(..., max_length=64)
    stats: dict[str, Any]


class SaveStatsResponse(BaseModel):
    user_key: str
    updated_at: str


@router.post("/stats")
async def save_stats(req: SaveStatsRequest):
    """전체 게임 상태 저장"""
    result = await save_user_stats(req.user_key, req.stats)
    return SaveStatsResponse(
        user_key=result["user_key"],
        updated_at=str(result["updated_at"]),
    )


@router.get("/stats/{user_key}")
async def get_stats(user_key: str):
    """전체 게임 상태 로드"""
    result = await load_user_stats(user_key)
    if not result:
        return {"user_key": user_key, "stats": None}
    return {"user_key": result["user_key"], "stats": result["stats"], "updated_at": str(result["updated_at"])}


# ── 스테이지별 진행 (기존) ──

@router.get("/{user_key}", response_model=list[StageProgress])
async def read_progress(user_key: str):
    """유저의 스테이지 진행 현황"""
    rows = await get_progress(user_key)
    return [StageProgress(**r) for r in rows]
