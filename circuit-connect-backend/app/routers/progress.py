from fastapi import APIRouter
from app.models.schemas import StageProgress
from app.services.progress_service import get_progress

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/{user_key}", response_model=list[StageProgress])
async def read_progress(user_key: str):
    """유저의 스테이지 진행 현황"""
    rows = await get_progress(user_key)
    return [StageProgress(**r) for r in rows]
