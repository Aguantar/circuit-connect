#!/usr/bin/env python3
"""
Circuit Connect — E2E Flink 검증 테스트
FastAPI를 통해 여러 이벤트를 전송하여 Flink 세션집계 + 이상탐지 동작 확인

Usage:
    python3 e2e_flink_test.py                     # FastAPI 경유 (기본)
    python3 e2e_flink_test.py --direct-kafka       # Kafka 직접 produce (FastAPI 우회)
    python3 e2e_flink_test.py --check-only         # ClickHouse 결과만 확인
"""

import argparse
import json
import time
import uuid
import subprocess
import sys
from datetime import datetime, timezone

API_URL = "http://localhost:8089/api/v1/events/"
KAFKA_BOOTSTRAP = "localhost:29092,localhost:29093,localhost:29094"
TOPIC = "game-events"

# ──────────────────────────────────────────────────────
# 테스트 시나리오 정의
# ──────────────────────────────────────────────────────

def now_ms():
    return int(time.time() * 1000)

def make_event(user_key, session_id, event_type, seq, **kwargs):
    """v2 이벤트 생성"""
    ts = now_ms()
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "user_key": user_key,
        "session_id": session_id,
        "timestamp": ts,
        "client_timestamp": ts - 100,  # 100ms 네트워크 지연
        "app_version": "0.1.0",
        "schema_version": "2",
        "seq": seq,
        "mode": kwargs.get("mode", ""),
        "stage_id": kwargs.get("stage_id", ""),
        "grid_size": kwargs.get("grid_size", ""),
        "time_limit_sec": kwargs.get("time_limit_sec", 0),
        "clear_time_ms": kwargs.get("clear_time_ms", 0),
        "taps": kwargs.get("taps", 0),
        "score": kwargs.get("score", 0),
        "bonus_collected": kwargs.get("bonus_collected", 0),
        "universal_used": kwargs.get("universal_used", 0),
        "completion_pct": kwargs.get("completion_pct", 0),
        "duration_ms": kwargs.get("duration_ms", 0),
        "elapsed_ms": kwargs.get("elapsed_ms", 0),
        "platform": kwargs.get("platform", "android"),
        "action": kwargs.get("action", ""),
        "item_type": kwargs.get("item_type", ""),
        "reason": kwargs.get("reason", ""),
        "cost": kwargs.get("cost", 0),
        "remaining": kwargs.get("remaining", 0),
        "screen": kwargs.get("screen", ""),
        "screen_width": kwargs.get("screen_width", 0),
        "screen_height": kwargs.get("screen_height", 0),
        "stages_cleared": kwargs.get("stages_cleared", 0),
        "total_score": kwargs.get("total_score", 0),
        "avg_clear_ms": kwargs.get("avg_clear_ms", 0),
        "extra": "",
    }


def scenario_normal_session():
    """시나리오 1: 정상 유저 세션 (세션집계 검증)"""
    user = f"user_e2e_normal_{int(time.time())}"
    session = str(uuid.uuid4())
    events = []
    seq = 0

    # session_start
    seq += 1
    events.append(make_event(user, session, "session_start", seq,
        platform="android", screen_width=390, screen_height=844))
    
    # navigation → story
    seq += 1
    events.append(make_event(user, session, "navigation", seq, screen="story"))

    # 3개 스테이지 클리어
    for i, (stage, grid) in enumerate([("1-1", "3x3"), ("1-2", "3x3"), ("1-3", "3x3")]):
        seq += 1
        events.append(make_event(user, session, "stage_start", seq,
            mode="story", stage_id=stage, grid_size=grid))
        time.sleep(0.1)
        
        seq += 1
        events.append(make_event(user, session, "stage_clear", seq,
            mode="story", stage_id=stage, grid_size=grid,
            clear_time_ms=3000 + i*500, taps=8+i, score=200+i*50,
            bonus_collected=1 if i==0 else 0))
        time.sleep(0.1)

    # heartbeat
    seq += 1
    events.append(make_event(user, session, "heartbeat", seq))

    # session_end
    seq += 1
    events.append(make_event(user, session, "session_end", seq, duration_ms=45000))

    return user, session, events, "정상 세션 (3 스테이지 클리어 → fact_sessions 집계 예상)"


def scenario_bot_cheater():
    """시나리오 2: 봇/치트 유저 (이상탐지 검증)"""
    user = f"user_e2e_bot_{int(time.time())}"
    session = str(uuid.uuid4())
    events = []
    seq = 0

    # session_start
    seq += 1
    events.append(make_event(user, session, "session_start", seq, platform="ios"))

    # IMPOSSIBLE_CLEAR: clear_time < 500ms
    seq += 1
    events.append(make_event(user, session, "stage_start", seq,
        mode="story", stage_id="1-1", grid_size="3x3"))
    time.sleep(0.05)
    seq += 1
    events.append(make_event(user, session, "stage_clear", seq,
        mode="story", stage_id="1-1", grid_size="3x3",
        clear_time_ms=120, taps=3, score=300))  # 120ms → IMPOSSIBLE_CLEAR

    # SCORE_OVERFLOW: score > 500 (3x3 max)
    seq += 1
    events.append(make_event(user, session, "stage_start", seq,
        mode="story", stage_id="1-2", grid_size="3x3"))
    time.sleep(0.05)
    seq += 1
    events.append(make_event(user, session, "stage_clear", seq,
        mode="story", stage_id="1-2", grid_size="3x3",
        clear_time_ms=80, taps=2, score=9999))  # 80ms + 9999점 → 2개 alert

    # session_end
    seq += 1
    events.append(make_event(user, session, "session_end", seq, duration_ms=5000))

    return user, session, events, "봇 세션 (IMPOSSIBLE_CLEAR + SCORE_OVERFLOW 알림 예상)"


# ──────────────────────────────────────────────────────
# 이벤트 전송
# ──────────────────────────────────────────────────────

def send_via_api(events):
    """FastAPI 경유 전송 — EventBatch 스키마: {user_key, events: [{event_type, session_id, client_timestamp, schema_version, payload: {...}}]}"""
    import urllib.request
    
    if not events:
        return 0, 0

    # user_key는 배치 레벨 (모든 이벤트 같은 유저)
    user_key = events[0]["user_key"]
    
    # FastAPI GameEvent 스키마로 변환
    api_events = []
    for evt in events:
        # 배치/엔벨로프 필드를 제외한 나머지는 payload로
        payload_fields = {k: v for k, v in evt.items() 
                         if k not in ("event_type", "session_id", "client_timestamp",
                                      "app_version", "schema_version", "user_key", "timestamp")}
        api_events.append({
            "event_type": evt["event_type"],
            "session_id": evt["session_id"],
            "client_timestamp": evt["client_timestamp"],
            "app_version": evt.get("app_version", "0.1.0"),
            "schema_version": evt.get("schema_version", "2"),
            "payload": payload_fields,
        })
    
    batch = {
        "user_key": user_key,
        "app_version": events[0].get("app_version", "0.1.0"),
        "events": api_events,
    }
    
    data = json.dumps(batch).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            if resp.status in (200, 201, 202):
                result = json.loads(body)
                accepted = result.get("accepted", len(events))
                failed = result.get("failed", 0)
                return accepted, failed
            else:
                print(f"  ⚠️  HTTP {resp.status}: {body}")
                return 0, len(events)
    except Exception as e:
        error_body = ""
        if hasattr(e, 'read'):
            error_body = e.read().decode('utf-8', errors='replace')
        print(f"  ❌ 전송 실패: {e}")
        if error_body:
            print(f"     응답: {error_body[:500]}")
        return 0, len(events)


def send_via_kafka(events):
    """Kafka 직접 전송 (FastAPI 우회)"""
    try:
        from kafka import KafkaProducer
    except ImportError:
        print("❌ kafka-python-ng 필요: pip install kafka-python-ng --break-system-packages")
        sys.exit(1)
    
    producer = KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP.split(","),
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda k: k.encode("utf-8") if k else None,
        acks="all",
    )
    
    for evt in events:
        producer.send(TOPIC, key=evt["user_key"], value=evt)
    producer.flush()
    return len(events), 0


# ──────────────────────────────────────────────────────
# ClickHouse 결과 확인
# ──────────────────────────────────────────────────────

def ch_query(sql):
    """ClickHouse 쿼리 실행"""
    result = subprocess.run(
        ["docker", "exec", "cdc-clickhouse", "clickhouse-client", "--query", sql],
        capture_output=True, text=True
    )
    return result.stdout.strip()


def check_results(users_info, wait_seconds=10):
    """ClickHouse에서 결과 확인"""
    print(f"\n⏳ {wait_seconds}초 대기 (파이프라인 처리 시간)...")
    
    # 프로그레스 바
    for i in range(wait_seconds):
        time.sleep(1)
        bar = "█" * (i+1) + "░" * (wait_seconds-i-1)
        sys.stdout.write(f"\r  [{bar}] {i+1}/{wait_seconds}s")
        sys.stdout.flush()
    print()

    for user, session, desc in users_info:
        print(f"\n{'='*60}")
        print(f"📋 {desc}")
        print(f"   유저: {user}")
        print(f"{'='*60}")

        # game_events 확인
        count = ch_query(f"SELECT count() FROM circuit_connect.game_events WHERE user_key = '{user}'")
        print(f"\n  [game_events] 이벤트 수: {count}")
        
        if int(count or "0") > 0:
            print("  ✅ ClickHouse 적재 성공!")
            details = ch_query(f"""
                SELECT event_type, mode, stage_id, score, clear_time_ms
                FROM circuit_connect.game_events
                WHERE user_key = '{user}'
                ORDER BY timestamp
                FORMAT PrettyCompact
            """)
            print(details)
        else:
            print("  ❌ ClickHouse에 이벤트 없음")
            print("  → FastAPI 로그 확인: docker logs circuit-connect-api --tail 20")
            print("  → Kafka 확인: docker exec cdc-kafka-1 kafka-console-consumer \\")
            print(f"      --bootstrap-server localhost:29092 --topic game-events --max-messages 5 --timeout-ms 5000 | grep '{user}'")

        # fact_sessions 확인
        sessions = ch_query(f"SELECT count() FROM circuit_connect.fact_sessions WHERE user_key = '{user}'")
        print(f"\n  [fact_sessions] 세션 수: {sessions}")
        
        if int(sessions or "0") > 0:
            print("  ✅ Flink 세션 집계 성공!")
            sess_details = ch_query(f"""
                SELECT session_id, duration_ms, total_events, stage_clears, 
                       total_score, primary_mode, avg_clear_time_ms
                FROM circuit_connect.fact_sessions
                WHERE user_key = '{user}'
                FORMAT PrettyCompact
            """)
            print(sess_details)
        else:
            print("  ⏳ 세션 아직 미집계 (Flink 5분 Session Window — 5분+ 대기 필요)")

        # game_alerts 확인
        alerts = ch_query(f"SELECT count() FROM circuit_connect.game_alerts WHERE user_key = '{user}'")
        print(f"\n  [game_alerts] 알림 수: {alerts}")
        
        if int(alerts or "0") > 0:
            print("  ✅ Flink 이상탐지 작동!")
            alert_details = ch_query(f"""
                SELECT alert_type, description, score, clear_time_ms
                FROM circuit_connect.game_alerts
                WHERE user_key = '{user}'
                FORMAT PrettyCompact
            """)
            print(alert_details)
        elif "봇" in desc:
            print("  ⏳ 아직 알림 없음 (Flink 처리 지연 가능 — 30초 후 재확인)")
        else:
            print("  ✅ 정상 — 정상 플레이 데이터에는 알림 없어야 함")


# ──────────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Circuit Connect E2E Flink 검증")
    parser.add_argument("--direct-kafka", action="store_true", help="Kafka 직접 전송 (FastAPI 우회)")
    parser.add_argument("--check-only", action="store_true", help="ClickHouse 결과만 확인")
    parser.add_argument("--wait", type=int, default=15, help="결과 확인 대기 시간(초)")
    args = parser.parse_args()

    print("╔══════════════════════════════════════════════════╗")
    print("║  Circuit Connect — E2E Flink 검증 테스트         ║")
    print("╚══════════════════════════════════════════════════╝")

    # 시나리오 생성
    scenarios = [
        scenario_normal_session(),
        scenario_bot_cheater(),
    ]

    users_info = [(s[0], s[1], s[3]) for s in scenarios]

    if args.check_only:
        # 이전 실행 결과만 확인 — user_key 직접 입력
        user = input("확인할 user_key: ").strip()
        if user:
            check_results([(user, "", "수동 확인")], wait_seconds=0)
        return

    # 이벤트 전송
    total_events = 0
    send_fn = send_via_kafka if args.direct_kafka else send_via_api
    method = "Kafka 직접" if args.direct_kafka else "FastAPI 경유"

    for user, session, events, desc in scenarios:
        print(f"\n📤 시나리오: {desc}")
        print(f"   유저: {user}, 이벤트 수: {len(events)}, 전송: {method}")
        
        ok, fail = send_fn(events)
        total_events += ok
        
        if fail == 0:
            print(f"   ✅ {ok}건 전송 완료")
        else:
            print(f"   ⚠️  성공 {ok}건 / 실패 {fail}건")

    print(f"\n📊 총 {total_events}건 전송 완료")

    # 결과 확인
    check_results(users_info, wait_seconds=args.wait)

    # 최종 안내
    print(f"\n{'='*60}")
    print("📌 세션 집계 확인 (5분 후):")
    for user, _, desc in users_info:
        print(f"   docker exec cdc-clickhouse clickhouse-client --query \\")
        print(f"     \"SELECT * FROM circuit_connect.fact_sessions WHERE user_key='{user}' FORMAT PrettyCompact\"")
    print(f"\n📌 Flink 로그 확인:")
    print(f"   docker logs cdc-flink-taskmanager --tail 50 2>&1 | grep -E 'SESSION|ALERT|DUPLICATE'")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
