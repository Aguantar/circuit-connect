import orjson
from aiokafka import AIOKafkaProducer
from app.core.config import get_settings

_producer: AIOKafkaProducer | None = None


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        raise RuntimeError("Kafka producer not initialized")
    return _producer


async def init_kafka():
    global _producer
    s = get_settings()
    _producer = AIOKafkaProducer(
        bootstrap_servers=s.KAFKA_BOOTSTRAP,
        value_serializer=lambda v: orjson.dumps(v),
        key_serializer=lambda k: k.encode("utf-8") if k else None,
        acks="all",
        compression_type="gzip",
        linger_ms=50,
    )
    await _producer.start()


async def close_kafka():
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None
