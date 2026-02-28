from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Any


# ─── Events ───────────────────────────────────────
class GameEvent(BaseModel):
    event_type: str = Field(..., examples=["stage_start", "stage_clear", "stage_fail", "item_use", "session_start"])
    session_id: str
    client_timestamp: int = Field(..., description="Unix ms from client")
    app_version: str = Field(default="0.1.0", max_length=20)
    schema_version: str = Field(default="1", max_length=4, description="Event schema version")
    payload: dict[str, Any] = Field(default_factory=dict)


class EventBatch(BaseModel):
    user_key: str = Field(..., max_length=64)
    app_version: str = Field(default="0.1.0", max_length=20)
    events: list[GameEvent] = Field(..., min_length=1, max_length=50)


class EventBatchResponse(BaseModel):
    accepted: int
    failed: int = 0


# ─── Users ────────────────────────────────────────
class UserCreate(BaseModel):
    user_key: str = Field(..., max_length=64)
    nickname: str | None = Field(None, max_length=30)


class UserResponse(BaseModel):
    user_key: str
    nickname: str | None
    created_at: datetime
    last_seen_at: datetime


# ─── Leaderboard ──────────────────────────────────
class LeaderboardEntry(BaseModel):
    rank: int | None = None
    user_key: str
    nickname: str | None = None
    mode: str
    time_limit_sec: int | None = None
    score: int
    stages_cleared: int
    avg_clear_ms: int | None = None
    played_at: datetime


class LeaderboardSubmit(BaseModel):
    user_key: str = Field(..., max_length=64)
    mode: str = Field(..., examples=["time_attack"])
    time_limit_sec: int | None = Field(None, examples=[60, 120, 180])
    score: int = Field(..., ge=0)
    stages_cleared: int = Field(default=0, ge=0)
    avg_clear_ms: int | None = None
    universal_used: int = Field(default=0, ge=0)


# ─── Stage Progress ──────────────────────────────
class StageProgress(BaseModel):
    stage_id: str
    best_time_ms: int | None
    clear_count: int
    universal_used: int
    first_cleared_at: datetime | None
    updated_at: datetime
