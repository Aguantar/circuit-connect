from fastapi import APIRouter, HTTPException
from app.models.schemas import EventBatch, EventBatchResponse
from app.services.event_service import produce_event_batch

router = APIRouter(prefix="/events", tags=["events"])


@router.post("/", response_model=EventBatchResponse)
async def ingest_events(batch: EventBatch):
    """게임 이벤트 배치 수신 → Kafka produce"""
    try:
        accepted, failed = await produce_event_batch(batch)
        return EventBatchResponse(accepted=accepted, failed=failed)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
