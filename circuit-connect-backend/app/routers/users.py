from fastapi import APIRouter, HTTPException
from app.models.schemas import UserCreate, UserResponse
from app.services.user_service import upsert_user, get_user

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", response_model=UserResponse)
async def create_or_update_user(body: UserCreate):
    """유저 생성 또는 갱신 (upsert)"""
    row = await upsert_user(body.user_key, body.nickname)
    return UserResponse(**row)


@router.get("/{user_key}", response_model=UserResponse)
async def read_user(user_key: str):
    row = await get_user(user_key)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**row)
