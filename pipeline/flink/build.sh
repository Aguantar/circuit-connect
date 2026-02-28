#!/bin/bash
# Circuit Connect Flink Job 빌드 + 배포
# 미니PC에서 실행: bash build.sh

set -e
echo "=== Circuit Connect Flink Build ==="

# 1. Docker로 Maven 빌드 (fat JAR)
echo "[1/4] Building JAR with Docker..."
docker build -t circuit-flink-builder .

# 2. 빌드된 JAR 추출
echo "[2/4] Extracting JAR..."
CONTAINER_ID=$(docker create circuit-flink-builder)
docker cp "$CONTAINER_ID:/circuit-connect-flink-1.0.0.jar" ./target/circuit-connect-flink-1.0.0.jar
docker rm "$CONTAINER_ID"
echo "  → target/circuit-connect-flink-1.0.0.jar"

# 3. ClickHouse 테이블 생성
echo "[3/4] Creating ClickHouse tables..."
docker exec cdc-clickhouse clickhouse-client --multiquery --query "
CREATE TABLE IF NOT EXISTS circuit_connect.fact_sessions (
    user_key         String,
    session_id       String,
    session_start    UInt64,
    session_end      UInt64,
    duration_ms      UInt64,
    total_events     UInt32,
    stage_clears     UInt16,
    stage_fails      UInt16,
    total_score      UInt32,
    primary_mode     LowCardinality(String),
    distinct_stages  UInt16,
    avg_clear_time_ms Float64,
    universal_used   UInt16,
    navigations      UInt16,
    created_at       DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDate(toDateTime(session_start / 1000)))
ORDER BY (user_key, session_start);

CREATE TABLE IF NOT EXISTS circuit_connect.game_alerts (
    user_key         String,
    session_id       String,
    alert_type       LowCardinality(String),
    description      String,
    detected_at      UInt64,
    event_id         String,
    stage_id         String,
    score            UInt32,
    clear_time_ms    UInt64,
    event_count      UInt16,
    created_at       DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDate(toDateTime(detected_at / 1000)))
ORDER BY (alert_type, user_key, detected_at);
"
echo "  → fact_sessions, game_alerts created"

# 4. TaskManager slot 수 확인
echo "[4/4] Checking available slots..."
SLOTS=$(curl -s http://localhost:8081/overview | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['slots-available'])")
echo "  → Available slots: $SLOTS"

if [ "$SLOTS" -lt 1 ]; then
    echo ""
    echo "⚠️  No available slots! Options:"
    echo "  1. Increase taskmanager.numberOfTaskSlots in docker-compose.yml"
    echo "  2. Stop existing job to free slots"
    echo ""
    echo "To increase slots:"
    echo "  Edit ~/cdc-realtime-pipeline/docker-compose.yml"
    echo "  Change: taskmanager.numberOfTaskSlots: 2  →  taskmanager.numberOfTaskSlots: 3"
    echo "  Then: cd ~/cdc-realtime-pipeline && docker compose up -d flink-taskmanager"
fi

echo ""
echo "=== Build Complete ==="
echo "To submit job:"
echo "  docker cp target/circuit-connect-flink-1.0.0.jar cdc-flink-jobmanager:/opt/flink/usrlib/"
echo "  docker exec cdc-flink-jobmanager flink run /opt/flink/usrlib/circuit-connect-flink-1.0.0.jar"
