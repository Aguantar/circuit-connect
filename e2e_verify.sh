#!/usr/bin/env bash
# ============================================================
# Circuit Connect — E2E 파이프라인 검증 스크립트
# 브라우저 → FastAPI → Kafka → ClickHouse → Flink 전체 경로 검증
#
# Usage: bash e2e_verify.sh
# ============================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✅ $1${NC}"; }
fail() { echo -e "  ${RED}❌ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }
info() { echo -e "  ${CYAN}ℹ️  $1${NC}"; }
header() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

ERRORS=0

# ============================================================
# STEP 1: 서비스 헬스 체크
# ============================================================
header "STEP 1: 서비스 헬스 체크"

REQUIRED_CONTAINERS=(
  "circuit-connect-api"
  "my-postgres"
  "cdc-kafka-1"
  "cdc-kafka-2"
  "cdc-kafka-3"
  "cdc-clickhouse"
  "cdc-flink-jobmanager"
  "cdc-flink-taskmanager"
  "cdc-grafana"
)

for c in "${REQUIRED_CONTAINERS[@]}"; do
  STATUS=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo "not_found")
  if [ "$STATUS" = "running" ]; then
    pass "$c — running"
  else
    fail "$c — $STATUS"
    ERRORS=$((ERRORS+1))
  fi
done

# FastAPI 응답 확인
echo ""
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8089/docs 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass "FastAPI :8089 응답 OK"
else
  fail "FastAPI :8089 응답 실패 (HTTP $HTTP_CODE)"
  ERRORS=$((ERRORS+1))
fi

# Kafka 토픽 확인
TOPICS=$(docker exec cdc-kafka-1 kafka-topics --bootstrap-server localhost:29092 --list 2>/dev/null || echo "")
if echo "$TOPICS" | grep -q "game-events"; then
  pass "Kafka 토픽 'game-events' 존재"
else
  fail "Kafka 토픽 'game-events' 없음"
  ERRORS=$((ERRORS+1))
fi

# ClickHouse 연결
CH_OK=$(docker exec cdc-clickhouse clickhouse-client --query "SELECT 1" 2>/dev/null || echo "")
if [ "$CH_OK" = "1" ]; then
  pass "ClickHouse 연결 OK"
else
  fail "ClickHouse 연결 실패"
  ERRORS=$((ERRORS+1))
fi

# Flink Job 상태
FLINK_JOBS=$(docker exec cdc-flink-jobmanager bash -c 'curl -s http://localhost:8081/jobs' 2>/dev/null || echo "{}")
RUNNING_JOBS=$(echo "$FLINK_JOBS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    jobs = [j for j in data.get('jobs', []) if j.get('status') == 'RUNNING']
    for j in jobs:
        print(j.get('id', 'unknown'))
except: pass
" 2>/dev/null)

FLINK_COUNT=$(echo "$RUNNING_JOBS" | grep -c . || echo "0")
if [ "$FLINK_COUNT" -ge 2 ]; then
  pass "Flink 실행 중 Job: ${FLINK_COUNT}개 (CDC + Circuit Connect)"
elif [ "$FLINK_COUNT" -ge 1 ]; then
  warn "Flink 실행 중 Job: ${FLINK_COUNT}개 (Circuit Connect Job 누락 가능)"
else
  fail "Flink 실행 중 Job 없음"
  ERRORS=$((ERRORS+1))
fi

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  fail "서비스 헬스 체크 실패 ($ERRORS건). 위 이슈 해결 후 재실행하세요."
  exit 1
fi

# ============================================================
# STEP 2: FastAPI 이벤트 수신 테스트 (curl)
# ============================================================
header "STEP 2: FastAPI에 테스트 이벤트 전송"

# 고유 마커로 추적 가능한 테스트 이벤트
TEST_MARKER="e2e_test_$(date +%s)"
TEST_USER="user_e2e_${TEST_MARKER}"
TEST_SESSION="sess_${TEST_MARKER}"
TEST_EVENT_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")

# 이벤트 JSON 생성 — FastAPI EventBatch 스키마:
#   user_key: 배치 레벨
#   events[].payload: 게임 데이터
TEST_EVENT=$(cat <<EOF
{
  "user_key": "${TEST_USER}",
  "app_version": "0.1.0",
  "events": [{
    "event_type": "stage_clear",
    "session_id": "${TEST_SESSION}",
    "client_timestamp": ${NOW_MS},
    "app_version": "0.1.0",
    "schema_version": "2",
    "payload": {
      "event_id": "${TEST_EVENT_ID}",
      "seq": 1,
      "mode": "story",
      "stage_id": "1-1",
      "grid_size": "3x3",
      "time_limit_sec": 0,
      "clear_time_ms": 3500,
      "taps": 8,
      "score": 250,
      "bonus_collected": 1,
      "universal_used": 0,
      "completion_pct": 0,
      "duration_ms": 0,
      "elapsed_ms": 0,
      "platform": "android",
      "action": "",
      "item_type": "",
      "reason": "",
      "cost": 0,
      "remaining": 0,
      "screen": "",
      "screen_width": 0,
      "screen_height": 0
    }
  }]
}
EOF
)

info "테스트 유저: ${TEST_USER}"
info "테스트 event_id: ${TEST_EVENT_ID}"

# FastAPI 엔드포인트로 전송
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  http://localhost:8089/api/v1/events/ \
  -H "Content-Type: application/json" \
  -d "${TEST_EVENT}" 2>/dev/null || echo -e "\n000")

HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "202" ]; then
  pass "FastAPI 응답: HTTP $HTTP_STATUS"
  info "응답 본문: $HTTP_BODY"
else
  fail "FastAPI 응답: HTTP $HTTP_STATUS"
  info "응답 본문: $HTTP_BODY"
  
  # 가능한 원인 진단
  if [ "$HTTP_STATUS" = "422" ]; then
    warn "422 = 요청 스키마 불일치. FastAPI의 event 모델 확인 필요"
    warn "확인: ~/circuit-connect/circuit-connect-backend/app/routers/events.py"
  elif [ "$HTTP_STATUS" = "500" ]; then
    warn "500 = 서버 에러. FastAPI 로그 확인: docker logs circuit-connect-api --tail 30"
  elif [ "$HTTP_STATUS" = "000" ]; then
    warn "연결 불가. FastAPI 컨테이너 확인: docker logs circuit-connect-api --tail 30"
  fi
  ERRORS=$((ERRORS+1))
fi

# ============================================================
# STEP 3: Kafka 메시지 도착 확인
# ============================================================
header "STEP 3: Kafka 'game-events' 토픽 확인"

info "최근 메시지에서 테스트 event_id 검색 (10초 대기)..."
sleep 3

# Kafka에서 최근 메시지 확인 (마지막 10건)
KAFKA_MSG=$(docker exec cdc-kafka-1 timeout 10 kafka-console-consumer \
  --bootstrap-server localhost:29092 \
  --topic game-events \
  --from-beginning \
  --max-messages 5 \
  --timeout-ms 8000 \
  2>/dev/null | tail -5 || echo "")

if [ -n "$KAFKA_MSG" ]; then
  pass "Kafka 'game-events' 토픽에 메시지 존재"
  
  # 테스트 이벤트 검색 (최신 메시지에서)
  KAFKA_CHECK=$(docker exec cdc-kafka-1 timeout 15 kafka-console-consumer \
    --bootstrap-server localhost:29092 \
    --topic game-events \
    --offset latest \
    --partition 0 \
    --max-messages 20 \
    --timeout-ms 12000 \
    2>/dev/null | grep -c "${TEST_EVENT_ID}" 2>/dev/null || true)
  KAFKA_CHECK=$(echo "$KAFKA_CHECK" | tr -d '[:space:]')
  
  if [ -n "$KAFKA_CHECK" ] && [ "$KAFKA_CHECK" -gt 0 ] 2>/dev/null; then
    pass "테스트 이벤트가 Kafka에 도착 확인!"
  else
    warn "테스트 이벤트를 최근 메시지에서 못 찾음 (파티션/오프셋 차이일 수 있음)"
    info "수동 확인: docker exec cdc-kafka-1 kafka-console-consumer --bootstrap-server localhost:29092 --topic game-events --from-beginning --max-messages 3 --timeout-ms 5000 | grep '${TEST_USER}'"
  fi
else
  warn "Kafka 메시지 조회 타임아웃 (토픽이 비어있거나 연결 문제)"
fi

# Consumer Group 오프셋 확인
echo ""
info "Consumer Group 상태:"
for GROUP in "clickhouse-circuit-connect" "flink-circuit-connect"; do
  LAG=$(docker exec cdc-kafka-1 kafka-consumer-groups \
    --bootstrap-server localhost:29092 \
    --group "$GROUP" \
    --describe 2>/dev/null | grep "game-events" | awk '{sum+=$6} END {print sum+0}' || echo "N/A")
  info "  $GROUP — LAG: $LAG"
done

# ============================================================
# STEP 4: ClickHouse 적재 확인
# ============================================================
header "STEP 4: ClickHouse 적재 확인"

info "5초 대기 (Kafka→ClickHouse MV 처리 시간)..."
sleep 5

# 전체 이벤트 수
TOTAL_EVENTS=$(docker exec cdc-clickhouse clickhouse-client \
  --query "SELECT count() FROM circuit_connect.game_events" 2>/dev/null || echo "0")
info "game_events 전체 건수: ${TOTAL_EVENTS}"

# 테스트 이벤트 검색
TEST_FOUND=$(docker exec cdc-clickhouse clickhouse-client \
  --query "SELECT count() FROM circuit_connect.game_events WHERE user_key = '${TEST_USER}'" 2>/dev/null || echo "0")

if [ "$TEST_FOUND" -gt 0 ]; then
  pass "테스트 이벤트 ClickHouse 도착 확인! (${TEST_FOUND}건)"
  
  # 상세 확인
  docker exec cdc-clickhouse clickhouse-client --query "
    SELECT event_id, event_type, user_key, mode, stage_id, score, clear_time_ms, schema_version
    FROM circuit_connect.game_events
    WHERE user_key = '${TEST_USER}'
    FORMAT PrettyCompact
  " 2>/dev/null
else
  warn "테스트 이벤트가 ClickHouse에 아직 없음"
  info "가능한 원인:"
  info "  1. FastAPI가 Kafka에 produce 실패 (FastAPI 로그 확인)"
  info "  2. ClickHouse Kafka Engine consumer가 중단됨"
  info "  3. 필드명 매핑 불일치 (schema_version 필터 등)"
  
  # Kafka Engine 상태 확인
  info ""
  info "game_events_queue 상태 확인:"
  docker exec cdc-clickhouse clickhouse-client --query "
    SELECT name, engine, total_rows, total_bytes
    FROM system.tables
    WHERE database = 'circuit_connect' AND name LIKE '%queue%'
    FORMAT PrettyCompact
  " 2>/dev/null || warn "테이블 조회 실패"
fi

# 최근 이벤트 확인 (시뮬레이션 데이터 포함)
echo ""
info "최근 5건 이벤트:"
docker exec cdc-clickhouse clickhouse-client --query "
  SELECT event_type, user_key, mode, stage_id, score, timestamp
  FROM circuit_connect.game_events
  ORDER BY timestamp DESC
  LIMIT 5
  FORMAT PrettyCompact
" 2>/dev/null || warn "조회 실패"

# ============================================================
# STEP 5: Flink 처리 확인
# ============================================================
header "STEP 5: Flink 처리 확인"

# fact_sessions 최근 데이터
SESSIONS=$(docker exec cdc-clickhouse clickhouse-client \
  --query "SELECT count() FROM circuit_connect.fact_sessions" 2>/dev/null || echo "0")
info "fact_sessions 전체: ${SESSIONS}건"

# game_alerts 데이터
ALERTS=$(docker exec cdc-clickhouse clickhouse-client \
  --query "SELECT count() FROM circuit_connect.game_alerts" 2>/dev/null || echo "0")
info "game_alerts 전체: ${ALERTS}건"

# 테스트 이벤트는 정상 플레이(clear_time=3500ms, score=250)이므로 alert은 없어야 함
TEST_ALERT=$(docker exec cdc-clickhouse clickhouse-client \
  --query "SELECT count() FROM circuit_connect.game_alerts WHERE user_key = '${TEST_USER}'" 2>/dev/null || echo "0")

if [ "$TEST_ALERT" = "0" ]; then
  pass "테스트 이벤트에 대해 이상탐지 알림 없음 (정상 — 정상 플레이 데이터)"
else
  warn "테스트 이벤트에 대해 alert ${TEST_ALERT}건 발생 (예상 외)"
fi

# Flink 세션은 5분 gap window → 테스트 이벤트 1건으로는 세션 닫히지 않음
info "※ fact_sessions은 5분 Session Window — 단일 이벤트로는 즉시 생성되지 않음"
info "  세션 테스트: 여러 이벤트를 연속 전송하거나 5분+ 대기 후 확인"

# Flink Job 로그에서 최근 처리 확인
echo ""
info "Flink TaskManager 최근 로그 (Circuit Connect 관련):"
docker logs cdc-flink-taskmanager --tail 30 2>&1 | grep -i -E "circuit|game|session|alert|duplicate|event" | tail -10 || info "관련 로그 없음"

# ============================================================
# STEP 6: 프론트엔드 설정 확인
# ============================================================
header "STEP 6: 프론트엔드 이벤트 전송 설정 확인"

# .env 또는 .env.local에서 VITE_API_URL 확인
FRONTEND_DIR="$HOME/circuit-connect/frontend/circuit-connect/circuit-connect"
if [ -d "$FRONTEND_DIR" ]; then
  ENV_FILE=""
  for f in "$FRONTEND_DIR/.env.local" "$FRONTEND_DIR/.env" "$FRONTEND_DIR/.env.development"; do
    if [ -f "$f" ]; then
      ENV_FILE="$f"
      break
    fi
  done
  
  if [ -n "$ENV_FILE" ]; then
    info "환경변수 파일: $ENV_FILE"
    API_URL=$(grep "VITE_API_URL" "$ENV_FILE" 2>/dev/null | head -1 || echo "")
    if [ -n "$API_URL" ]; then
      info "  $API_URL"
      # localhost인지 확인
      if echo "$API_URL" | grep -q "localhost:8089\|127.0.0.1:8089"; then
        pass "VITE_API_URL이 FastAPI(:8089)를 가리킴"
      else
        warn "VITE_API_URL이 예상과 다름 — FastAPI(:8089)와 일치하는지 확인"
      fi
    else
      warn "VITE_API_URL 설정 없음 — 프론트엔드가 어디로 이벤트를 보내는지 확인 필요"
    fi
  else
    warn ".env 파일 없음 — .env.example 참고하여 생성 필요"
    if [ -f "$FRONTEND_DIR/.env.example" ]; then
      info ".env.example 내용:"
      cat "$FRONTEND_DIR/.env.example"
    fi
  fi
  
  # events.ts 파일 확인
  EVENTS_TS="$FRONTEND_DIR/src/api/events.ts"
  if [ -f "$EVENTS_TS" ]; then
    info ""
    info "events.ts 이벤트 전송 코드:"
    grep -n -E "fetch|trackEvent|sendBeacon|API_URL|/api/v1/events" "$EVENTS_TS" | head -15
  else
    warn "events.ts 파일을 찾을 수 없음: $EVENTS_TS"
    info "실제 경로 확인: find ~/circuit-connect -name 'events.ts' -type f"
  fi
else
  warn "프론트엔드 디렉토리를 찾을 수 없음: $FRONTEND_DIR"
  info "실제 경로 확인: find ~/circuit-connect -name 'events.ts' -type f"
fi

# Vite dev server 확인
VITE_PID=$(lsof -ti :5173 2>/dev/null || echo "")
if [ -n "$VITE_PID" ]; then
  pass "Vite dev server 실행 중 (:5173)"
else
  warn "Vite dev server 미실행. 시작: cd $FRONTEND_DIR && npm run dev"
fi

# ============================================================
# STEP 7: CORS 설정 확인
# ============================================================
header "STEP 7: CORS 설정 확인"

# FastAPI CORS 확인 (OPTIONS 요청)
CORS_RESP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X OPTIONS http://localhost:8089/api/v1/events/ \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" 2>/dev/null || echo "000")

if [ "$CORS_RESP" = "200" ]; then
  pass "CORS preflight 응답 OK (localhost:5173 → :8089)"
else
  warn "CORS preflight 응답: HTTP $CORS_RESP"
  info "FastAPI에서 CORS 설정 확인 필요:"
  info "  grep -r 'CORSMiddleware\|allow_origins' ~/circuit-connect/circuit-connect-backend/"
fi

# ============================================================
# 결과 요약
# ============================================================
header "결과 요약"

echo ""
echo "  테스트 유저:    ${TEST_USER}"
echo "  테스트 event_id: ${TEST_EVENT_ID}"
echo ""

if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}  🎉 기본 파이프라인 검증 완료!${NC}"
  echo ""
  echo "  다음 단계:"
  echo "  1. Vite dev server 시작: cd $FRONTEND_DIR && npm run dev"
  echo "  2. 브라우저에서 http://localhost:5173 접속"
  echo "  3. 게임 플레이 (스테이지 1개 클리어)"
  echo "  4. ClickHouse에서 실시간 확인:"
  echo "     docker exec cdc-clickhouse clickhouse-client --query \\"
  echo "       \"SELECT event_type, user_key, mode, stage_id, score, timestamp"
  echo "        FROM circuit_connect.game_events"
  echo "        ORDER BY timestamp DESC LIMIT 10 FORMAT PrettyCompact\""
else
  echo -e "${RED}  ⚠️  ${ERRORS}건의 이슈 발견. 위 로그 확인 후 수정하세요.${NC}"
fi

echo ""
