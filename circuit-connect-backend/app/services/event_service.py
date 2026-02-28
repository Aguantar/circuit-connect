import uuid
import time
import logging
from aiokafka import AIOKafkaProducer
from app.core.config import get_settings
from app.core.kafka import get_producer
from app.models.schemas import EventBatch

logger = logging.getLogger(__name__)
settings = get_settings()

# v2 정형 필드 목록 — payload에서 추출하여 레코드 최상위로 올림
# ClickHouse 정형 컬럼과 1:1 대응
V2_STRUCTURED_FIELDS = {
    "seq",
    "mode", "stage_id", "grid_size", "time_limit_sec",
    "clear_time_ms", "taps", "score", "bonus_collected",
    "universal_used", "completion_pct", "duration_ms",
    "platform", "action", "item_type", "reason",
    "cost", "remaining",
    "from_screen", "to_screen",
}


def _extract_v2_fields(payload: dict) -> tuple[dict, dict]:
    """v2 payload에서 정형 필드를 분리 추출.

    Returns:
        (structured, extra) — 정형 필드 dict, 나머지 payload dict
    """
    # 프론트 필드명 → ClickHouse 컬럼명 매핑 (예약어 회피)
    FIELD_REMAP = {"from": "from_screen", "to": "to_screen"}

    structured = {}
    extra = {}
    for k, v in payload.items():
        mapped_key = FIELD_REMAP.get(k, k)
        if mapped_key in V2_STRUCTURED_FIELDS:
            structured[mapped_key] = v
        # device_info는 내부 필드 추출 (platform)
        elif k == "device_info" and isinstance(v, dict):
            if "platform" in v:
                structured["platform"] = v["platform"]
            extra[k] = v
        else:
            extra[k] = v
    return structured, extra


async def produce_event_batch(batch: EventBatch) -> tuple[int, int]:
    """Produce event batch to Kafka. Returns (accepted, failed)."""
    producer: AIOKafkaProducer = await get_producer()
    accepted = 0
    failed = 0
    server_ts = int(time.time() * 1000)

    for event in batch.events:
        schema_ver = getattr(event, "schema_version", "1") or "1"

        record = {
            "event_id": str(uuid.uuid4()),
            "event_type": event.event_type,
            "user_key": batch.user_key,
            "session_id": event.session_id,
            "timestamp": server_ts,
            "client_timestamp": event.client_timestamp,
            "app_version": event.app_version,
            "schema_version": schema_ver,
        }

        if schema_ver >= "2":
            # v2: 정형 필드를 payload에서 추출 → 레코드 최상위에 배치
            structured, extra = _extract_v2_fields(event.payload)
            record.update(structured)
            if extra:
                record["extra"] = extra
            # payload는 포함하지 않음 (정형 필드로 대체)
        else:
            # v1: 기존 호환 — payload 그대로 포함
            record["payload"] = event.payload

        try:
            await producer.send(
                settings.KAFKA_TOPIC_EVENTS,
                value=record,
                key=batch.user_key,
            )
            accepted += 1
        except Exception as e:
            logger.error(f"Kafka produce failed: {e}")
            # DLQ로 보내기
            try:
                await producer.send(
                    settings.KAFKA_TOPIC_DLQ,
                    value={"error": str(e), "record": record},
                    key=batch.user_key,
                )
            except Exception:
                pass
            failed += 1

    return accepted, failed
