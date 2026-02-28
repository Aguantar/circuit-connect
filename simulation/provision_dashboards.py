#!/usr/bin/env python3
"""
Phase D: Grafana 대시보드 프로비저닝
3종 대시보드를 Grafana API로 배포

Usage:
    python3 provision_dashboards.py
    python3 provision_dashboards.py --grafana-url http://localhost:3000
"""

import json
import argparse
import urllib.request
import urllib.error

DATASOURCE_UID = "ffedbair9vbb4b"
GRAFANA_URL = "http://localhost:3000"
GRAFANA_USER = "admin"
GRAFANA_PASS = "admin"


def ds(uid=DATASOURCE_UID):
    return {"type": "grafana-clickhouse-datasource", "uid": uid}


def sql_target(raw_sql, ref_id="A", fmt=1):
    return {
        "datasource": ds(),
        "rawSql": raw_sql,
        "format": fmt,
        "queryType": "sql",
        "refId": ref_id,
    }


def panel(title, panel_type, targets, grid_pos, panel_id,
          field_config=None, options=None, overrides=None, transformations=None):
    p = {
        "id": panel_id,
        "title": title,
        "type": panel_type,
        "datasource": ds(),
        "targets": targets if isinstance(targets, list) else [targets],
        "gridPos": grid_pos,
        "fieldConfig": field_config or {"defaults": {}, "overrides": overrides or []},
    }
    if options:
        p["options"] = options
    if transformations:
        p["transformations"] = transformations
    return p


def stat_panel(title, sql, grid_pos, pid, color="#73BF69", unit=None, decimals=None):
    fc = {
        "defaults": {
            "color": {"fixedColor": color, "mode": "fixed"},
            "thresholds": {"mode": "absolute", "steps": [{"color": "green", "value": None}]},
        },
        "overrides": []
    }
    if unit:
        fc["defaults"]["unit"] = unit
    if decimals is not None:
        fc["defaults"]["decimals"] = decimals
    return panel(title, "stat", sql_target(sql), grid_pos, pid,
                 field_config=fc,
                 options={"colorMode": "value", "graphMode": "none", "textMode": "value"})


def timeseries_panel(title, targets, grid_pos, pid, unit=None, overrides=None):
    fc = {"defaults": {}, "overrides": overrides or []}
    if unit:
        fc["defaults"]["unit"] = unit
    return panel(title, "timeseries", targets, grid_pos, pid, field_config=fc)


def bar_panel(title, sql, grid_pos, pid, orientation="horizontal", overrides=None):
    return panel(title, "barchart", sql_target(sql), grid_pos, pid,
                 options={"orientation": orientation},
                 overrides=overrides)


def pie_panel(title, sql, grid_pos, pid):
    return panel(title, "piechart", sql_target(sql), grid_pos, pid,
                 options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": True},
                          "legend": {"displayMode": "table", "placement": "right", "values": ["value", "percent"]}})


def table_panel(title, sql, grid_pos, pid, overrides=None):
    return panel(title, "table", sql_target(sql), grid_pos, pid,
                 options={"showHeader": True, "sortBy": []},
                 overrides=overrides)


def row_panel(title, grid_pos, pid, collapsed=False):
    return {
        "id": pid,
        "title": title,
        "type": "row",
        "gridPos": grid_pos,
        "collapsed": collapsed,
    }


# ════════════════════════════════════════════════════════
# Dashboard 1: 운영 대시보드
# ════════════════════════════════════════════════════════

def build_ops_dashboard():
    panels = []
    pid = 1

    # ── Row: KPI ──
    panels.append(row_panel("📊 핵심 지표", {"h": 1, "w": 24, "x": 0, "y": 0}, pid))
    pid += 1

    panels.append(stat_panel("Total Events", 
        "SELECT count() as total FROM circuit_connect.game_events WHERE schema_version = '2'",
        {"h": 4, "w": 4, "x": 0, "y": 1}, pid, color="#6C9CFC"))
    pid += 1

    panels.append(stat_panel("Total Users",
        "SELECT uniqExact(user_key) as users FROM circuit_connect.game_events WHERE schema_version = '2'",
        {"h": 4, "w": 4, "x": 4, "y": 1}, pid, color="#B877D9"))
    pid += 1

    panels.append(stat_panel("DAU (Latest)",
        "SELECT uniqExact(user_key) as dau FROM circuit_connect.mv_daily_user_summary WHERE day = (SELECT max(day) FROM circuit_connect.mv_daily_user_summary WHERE day < today())",
        {"h": 4, "w": 4, "x": 8, "y": 1}, pid, color="#73BF69"))
    pid += 1

    panels.append(stat_panel("Avg Clears/User/Day",
        "SELECT round(avg(clears), 1) FROM circuit_connect.mv_daily_user_summary WHERE clears > 0",
        {"h": 4, "w": 4, "x": 12, "y": 1}, pid, color="#FF9830"))
    pid += 1

    panels.append(stat_panel("🚨 Total Alerts",
        "SELECT count() FROM circuit_connect.game_alerts",
        {"h": 4, "w": 4, "x": 16, "y": 1}, pid, color="#F2495C"))
    pid += 1

    panels.append(stat_panel("Sessions",
        "SELECT count() FROM circuit_connect.fact_sessions",
        {"h": 4, "w": 4, "x": 20, "y": 1}, pid, color="#FF6ACB"))
    pid += 1

    # ── Row: 트렌드 ──
    panels.append(row_panel("📈 트렌드", {"h": 1, "w": 24, "x": 0, "y": 5}, pid))
    pid += 1

    panels.append(timeseries_panel("DAU 추이",
        [sql_target("""
            SELECT day as time, uniqExact(user_key) as DAU
            FROM circuit_connect.mv_daily_user_summary
            WHERE day >= today() - 14
            GROUP BY day ORDER BY day
        """)],
        {"h": 8, "w": 12, "x": 0, "y": 6}, pid))
    pid += 1

    panels.append(timeseries_panel("일별 이벤트 처리량",
        [sql_target("""
            SELECT toDate(timestamp) as time,
                count() as total_events,
                countIf(event_type = 'stage_clear') as clears,
                countIf(event_type = 'stage_fail') as fails
            FROM circuit_connect.game_events
            WHERE schema_version = '2' AND timestamp >= now() - INTERVAL 14 DAY
            GROUP BY time ORDER BY time
        """)],
        {"h": 8, "w": 12, "x": 12, "y": 6}, pid))
    pid += 1

    # ── Row: 이벤트 분석 ──
    panels.append(row_panel("🔍 이벤트 분석", {"h": 1, "w": 24, "x": 0, "y": 14}, pid))
    pid += 1

    panels.append(pie_panel("이벤트 타입 분포",
        """SELECT event_type, count() as cnt
           FROM circuit_connect.game_events WHERE schema_version = '2'
           GROUP BY event_type ORDER BY cnt DESC""",
        {"h": 8, "w": 8, "x": 0, "y": 15}, pid))
    pid += 1

    panels.append(timeseries_panel("시간대별 이벤트 (KST)",
        [sql_target("""
            SELECT toStartOfHour(toTimezone(timestamp, 'Asia/Seoul')) as time,
                count() as events
            FROM circuit_connect.game_events
            WHERE schema_version = '2' AND timestamp >= now() - INTERVAL 14 DAY
            GROUP BY time ORDER BY time
        """)],
        {"h": 8, "w": 8, "x": 8, "y": 15}, pid))
    pid += 1

    panels.append(table_panel("🚨 이상 탐지 현황",
        """SELECT alert_type,
              count() as 건수,
              uniqExact(user_key) as 유저수,
              max(toDateTime(detected_at / 1000)) as 최근탐지
           FROM circuit_connect.game_alerts
           GROUP BY alert_type ORDER BY 건수 DESC""",
        {"h": 8, "w": 8, "x": 16, "y": 15}, pid))
    pid += 1

    return {
        "uid": "circuit-ops-v2",
        "title": "Circuit Connect - Operations",
        "tags": ["circuit-connect", "ops"],
        "timezone": "Asia/Seoul",
        "time": {"from": "now-7d", "to": "now"},
        "panels": panels,
        "version": 1,
        "schemaVersion": 39,
    }


# ════════════════════════════════════════════════════════
# Dashboard 2: 게임 분석 대시보드
# ════════════════════════════════════════════════════════

def build_game_dashboard():
    panels = []
    pid = 1

    # ── Row: 모드별 분석 ──
    panels.append(row_panel("🎮 모드별 분석", {"h": 1, "w": 24, "x": 0, "y": 0}, pid))
    pid += 1

    panels.append(pie_panel("모드별 플레이 비율",
        """SELECT mode, count() as cnt
           FROM circuit_connect.game_events
           WHERE schema_version = '2' AND mode != '' AND event_type IN ('stage_clear', 'stage_fail')
           GROUP BY mode""",
        {"h": 8, "w": 8, "x": 0, "y": 1}, pid))
    pid += 1

    panels.append(timeseries_panel("일별 모드별 플레이 수",
        [sql_target("""
            SELECT day as time,
                sumIf(clears + fails, mode = 'story') as story,
                sumIf(clears + fails, mode = 'time_attack') as time_attack
            FROM circuit_connect.mv_daily_user_summary
            WHERE day >= today() - 14
            GROUP BY day ORDER BY day
        """)],
        {"h": 8, "w": 8, "x": 8, "y": 1}, pid))
    pid += 1

    panels.append(timeseries_panel("일별 클리어 vs 실패",
        [sql_target("""
            SELECT day as time,
                sum(clears) as clears,
                sum(fails) as fails
            FROM circuit_connect.mv_daily_user_summary
            WHERE day >= today() - 14
            GROUP BY day ORDER BY day
        """)],
        {"h": 8, "w": 8, "x": 16, "y": 1}, pid))
    pid += 1

    # ── Row: 스테이지 분석 ──
    panels.append(row_panel("🧩 스테이지 분석", {"h": 1, "w": 24, "x": 0, "y": 9}, pid))
    pid += 1

    panels.append(bar_panel("스토리 스테이지 클리어율",
        """SELECT stage_id,
              round(countIfMerge(clear_count) * 100.0 / greatest(countMerge(attempt_count), 1), 1) as clear_rate_pct
           FROM circuit_connect.mv_stage_difficulty
           WHERE mode = 'story' AND stage_id != ''
           GROUP BY stage_id
           ORDER BY toInt32OrZero(splitByChar('-', stage_id)[1]) * 100 + toInt32OrZero(splitByChar('-', stage_id)[2])""",
        {"h": 8, "w": 12, "x": 0, "y": 10}, pid, orientation="vertical"))
    pid += 1

    panels.append(bar_panel("스토리 평균 클리어 시간 (ms)",
        """SELECT stage_id,
              round(avgIfMerge(avg_clear_time)) as avg_clear_ms
           FROM circuit_connect.mv_stage_difficulty
           WHERE mode = 'story' AND stage_id != ''
           GROUP BY stage_id
           ORDER BY toInt32OrZero(splitByChar('-', stage_id)[1]) * 100 + toInt32OrZero(splitByChar('-', stage_id)[2])""",
        {"h": 8, "w": 12, "x": 12, "y": 10}, pid, orientation="vertical"))
    pid += 1

    # ── Row: 유저 리텐션 & 세션 ──
    panels.append(row_panel("👤 유저 & 세션", {"h": 1, "w": 24, "x": 0, "y": 18}, pid))
    pid += 1

    panels.append(table_panel("유저 리텐션 (D1/D3/D7)",
        """WITH first_seen AS (
              SELECT user_key, min(toDate(timestamp)) as first_day
              FROM circuit_connect.game_events WHERE schema_version = '2'
              GROUP BY user_key
           ),
           daily_active AS (
              SELECT DISTINCT user_key, toDate(timestamp) as active_day
              FROM circuit_connect.game_events WHERE schema_version = '2'
           )
           SELECT
              fs.first_day as cohort_date,
              count(DISTINCT fs.user_key) as cohort_size,
              round(countDistinctIf(da.user_key, da.active_day = fs.first_day + 1) * 100.0
                    / count(DISTINCT fs.user_key), 1) as D1_pct,
              round(countDistinctIf(da.user_key, da.active_day = fs.first_day + 3) * 100.0
                    / count(DISTINCT fs.user_key), 1) as D3_pct,
              round(countDistinctIf(da.user_key, da.active_day = fs.first_day + 7) * 100.0
                    / count(DISTINCT fs.user_key), 1) as D7_pct
           FROM first_seen fs
           LEFT JOIN daily_active da ON fs.user_key = da.user_key
           GROUP BY fs.first_day
           ORDER BY fs.first_day""",
        {"h": 8, "w": 12, "x": 0, "y": 19}, pid))
    pid += 1

    panels.append(bar_panel("플레이 시간대 분포 (KST)",
        """SELECT
              concat(lpad(toString(toHour(toTimezone(timestamp, 'Asia/Seoul'))), 2, '0'), ':00') as hour_kst,
              count() as events
           FROM circuit_connect.game_events
           WHERE schema_version = '2' AND event_type IN ('stage_clear', 'stage_fail')
           GROUP BY hour_kst ORDER BY hour_kst""",
        {"h": 8, "w": 12, "x": 12, "y": 19}, pid, orientation="vertical"))
    pid += 1

    # ── Row: 스코어 & 아이템 ──
    panels.append(row_panel("⭐ 점수 & 만능블럭", {"h": 1, "w": 24, "x": 0, "y": 27}, pid))
    pid += 1

    panels.append(timeseries_panel("일별 평균 점수 (모드별)",
        [sql_target("""
            SELECT toDate(timestamp) as time,
                avgIf(score, mode = 'story' AND score > 0) as story_avg_score,
                avgIf(score, mode = 'time_attack' AND score > 0) as ta_avg_score
            FROM circuit_connect.game_events
            WHERE schema_version = '2' AND event_type = 'stage_clear'
            GROUP BY time ORDER BY time
        """)],
        {"h": 8, "w": 8, "x": 0, "y": 28}, pid))
    pid += 1

    panels.append(pie_panel("만능블럭 사용 vs 구매",
        """SELECT action, count() as cnt
           FROM circuit_connect.game_events
           WHERE schema_version = '2' AND event_type = 'item_use'
           GROUP BY action""",
        {"h": 8, "w": 8, "x": 8, "y": 28}, pid))
    pid += 1

    panels.append(bar_panel("그리드별 평균 클리어 시간",
        """SELECT grid_size,
              round(avgIf(clear_time_ms, mode = 'story')) as story_ms,
              round(avgIf(clear_time_ms, mode = 'time_attack')) as ta_ms
           FROM circuit_connect.game_events
           WHERE schema_version = '2' AND event_type = 'stage_clear' AND clear_time_ms > 0
           GROUP BY grid_size ORDER BY grid_size""",
        {"h": 8, "w": 8, "x": 16, "y": 28}, pid, orientation="vertical"))
    pid += 1

    # ── Row: 퍼널 분석 ──
    panels.append(row_panel("🔄 퍼널 분석", {"h": 1, "w": 24, "x": 0, "y": 36}, pid))
    pid += 1

    panels.append(bar_panel("스토리 모드 퍼널 (챕터별 도달 유저)",
        """SELECT
              splitByChar('-', stage_id)[1] as chapter,
              uniqExact(user_key) as users
           FROM circuit_connect.game_events
           WHERE schema_version = '2' AND mode = 'story' AND event_type = 'stage_start' AND stage_id != ''
           GROUP BY chapter ORDER BY chapter""",
        {"h": 8, "w": 12, "x": 0, "y": 37}, pid, orientation="vertical"))
    pid += 1

    panels.append(bar_panel("TA 모드 스테이지 도달 분포",
        """SELECT
              multiIf(
                  toInt32OrZero(splitByChar('-', stage_id)[2]) <= 3, '1-3',
                  toInt32OrZero(splitByChar('-', stage_id)[2]) <= 6, '4-6',
                  toInt32OrZero(splitByChar('-', stage_id)[2]) <= 10, '7-10',
                  '11+'
              ) as stage_group,
              uniqExact(user_key) as users
           FROM circuit_connect.game_events
           WHERE schema_version = '2' AND mode = 'time_attack' AND event_type = 'stage_start' AND stage_id LIKE 'ta-%'
           GROUP BY stage_group ORDER BY stage_group""",
        {"h": 8, "w": 12, "x": 12, "y": 37}, pid, orientation="vertical"))
    pid += 1

    return {
        "uid": "circuit-game-v2",
        "title": "Circuit Connect - Game Analytics",
        "tags": ["circuit-connect", "game"],
        "timezone": "Asia/Seoul",
        "time": {"from": "now-7d", "to": "now"},
        "panels": panels,
        "version": 1,
        "schemaVersion": 39,
    }


# ════════════════════════════════════════════════════════
# Dashboard 3: 데이터 품질 대시보드
# ════════════════════════════════════════════════════════

def build_quality_dashboard():
    panels = []
    pid = 1

    # ── Row: 품질 지표 ──
    panels.append(row_panel("🔍 데이터 품질 KPI", {"h": 1, "w": 24, "x": 0, "y": 0}, pid))
    pid += 1

    panels.append(stat_panel("Late Event 비율",
        """SELECT round(countIf(abs(toInt64(timestamp) - toInt64(client_timestamp)) > 30000) * 100.0
              / count(), 2) as late_pct
           FROM circuit_connect.game_events WHERE schema_version = '2'""",
        {"h": 4, "w": 6, "x": 0, "y": 1}, pid, color="#FF9830", unit="percent"))
    pid += 1

    panels.append(stat_panel("v2 이벤트 비율",
        """SELECT round(countIf(schema_version = '2') * 100.0 / count(), 1) as v2_pct
           FROM circuit_connect.game_events""",
        {"h": 4, "w": 6, "x": 6, "y": 1}, pid, color="#73BF69", unit="percent"))
    pid += 1

    panels.append(stat_panel("이상 탐지 알림 수",
        "SELECT count() FROM circuit_connect.game_alerts",
        {"h": 4, "w": 6, "x": 12, "y": 1}, pid, color="#F2495C"))
    pid += 1

    panels.append(stat_panel("봇 의심 유저 수",
        "SELECT uniqExact(user_key) FROM circuit_connect.game_alerts",
        {"h": 4, "w": 6, "x": 18, "y": 1}, pid, color="#F2495C"))
    pid += 1

    # ── Row: 이벤트 지연 분석 ──
    panels.append(row_panel("⏱ 이벤트 지연 분석", {"h": 1, "w": 24, "x": 0, "y": 5}, pid))
    pid += 1

    panels.append(timeseries_panel("일별 Late Event 비율 (>30s)",
        [sql_target("""
            SELECT toDate(timestamp) as time,
                round(countIf(abs(toInt64(timestamp) - toInt64(client_timestamp)) > 30000) * 100.0
                      / count(), 2) as late_pct
            FROM circuit_connect.game_events
            WHERE schema_version = '2'
            GROUP BY time ORDER BY time
        """)],
        {"h": 8, "w": 12, "x": 0, "y": 6}, pid, unit="percent"))
    pid += 1

    panels.append(bar_panel("server-client 지연 분포",
        """SELECT
              multiIf(
                  abs(diff) < 1000, '< 1s',
                  abs(diff) < 5000, '1-5s',
                  abs(diff) < 10000, '5-10s',
                  abs(diff) < 30000, '10-30s',
                  '>= 30s'
              ) as latency_bucket,
              count() as cnt
           FROM (
              SELECT toInt64(timestamp) - toInt64(client_timestamp) as diff
              FROM circuit_connect.game_events WHERE schema_version = '2'
           )
           GROUP BY latency_bucket
           ORDER BY multiIf(
              latency_bucket = '< 1s', 1,
              latency_bucket = '1-5s', 2,
              latency_bucket = '5-10s', 3,
              latency_bucket = '10-30s', 4, 5)""",
        {"h": 8, "w": 12, "x": 12, "y": 6}, pid, orientation="vertical"))
    pid += 1

    # ── Row: 이상 탐지 상세 ──
    panels.append(row_panel("🚨 이상 탐지", {"h": 1, "w": 24, "x": 0, "y": 14}, pid))
    pid += 1

    panels.append(pie_panel("Alert 유형 분포",
        """SELECT alert_type, count() as cnt
           FROM circuit_connect.game_alerts GROUP BY alert_type""",
        {"h": 8, "w": 8, "x": 0, "y": 15}, pid))
    pid += 1

    panels.append(table_panel("Alert 상세 (최근 50건)",
        """SELECT
              toDateTime(detected_at / 1000) as detected,
              alert_type,
              user_key,
              stage_id,
              score,
              clear_time_ms,
              description
           FROM circuit_connect.game_alerts
           ORDER BY detected_at DESC
           LIMIT 50""",
        {"h": 8, "w": 16, "x": 8, "y": 15}, pid))
    pid += 1

    # ── Row: 스키마 & 데이터 정합성 ──
    panels.append(row_panel("📋 스키마 & 정합성", {"h": 1, "w": 24, "x": 0, "y": 23}, pid))
    pid += 1

    panels.append(pie_panel("스키마 버전 분포",
        """SELECT schema_version, count() as cnt
           FROM circuit_connect.game_events GROUP BY schema_version""",
        {"h": 8, "w": 8, "x": 0, "y": 24}, pid))
    pid += 1

    panels.append(table_panel("이벤트 타입별 필드 채움률",
        """SELECT event_type,
              count() as total,
              round(countIf(mode != '') * 100.0 / count(), 0) as mode_pct,
              round(countIf(stage_id != '') * 100.0 / count(), 0) as stage_id_pct,
              round(countIf(grid_size != '') * 100.0 / count(), 0) as grid_pct,
              round(countIf(score > 0) * 100.0 / count(), 0) as score_pct,
              round(countIf(clear_time_ms > 0) * 100.0 / count(), 0) as clear_time_pct
           FROM circuit_connect.game_events WHERE schema_version = '2'
           GROUP BY event_type ORDER BY total DESC""",
        {"h": 8, "w": 16, "x": 8, "y": 24}, pid))
    pid += 1

    # ── Row: Flink 파이프라인 ──
    panels.append(row_panel("⚙️ Flink 파이프라인", {"h": 1, "w": 24, "x": 0, "y": 32}, pid))
    pid += 1

    panels.append(stat_panel("Flink 세션 집계 수",
        "SELECT count() FROM circuit_connect.fact_sessions",
        {"h": 4, "w": 6, "x": 0, "y": 33}, pid, color="#6C9CFC"))
    pid += 1

    panels.append(stat_panel("평균 세션 시간 (초)",
        "SELECT round(avg(duration_ms) / 1000, 0) FROM circuit_connect.fact_sessions WHERE duration_ms > 0",
        {"h": 4, "w": 6, "x": 6, "y": 33}, pid, color="#73BF69", unit="s"))
    pid += 1

    panels.append(stat_panel("평균 세션 이벤트 수",
        "SELECT round(avg(total_events), 0) FROM circuit_connect.fact_sessions",
        {"h": 4, "w": 6, "x": 12, "y": 33}, pid, color="#B877D9"))
    pid += 1

    panels.append(stat_panel("평균 세션 클리어 수",
        "SELECT round(avg(stage_clears), 1) FROM circuit_connect.fact_sessions WHERE stage_clears > 0",
        {"h": 4, "w": 6, "x": 18, "y": 33}, pid, color="#FF9830"))
    pid += 1

    return {
        "uid": "circuit-quality-v2",
        "title": "Circuit Connect - Data Quality",
        "tags": ["circuit-connect", "quality"],
        "timezone": "Asia/Seoul",
        "time": {"from": "now-7d", "to": "now"},
        "panels": panels,
        "version": 1,
        "schemaVersion": 39,
    }


# ════════════════════════════════════════════════════════
# Grafana API 배포
# ════════════════════════════════════════════════════════

def deploy_dashboard(dashboard_model, grafana_url, user, passwd):
    url = f"{grafana_url}/api/dashboards/db"
    payload = json.dumps({
        "dashboard": dashboard_model,
        "overwrite": True,
        "message": "Phase D: automated provisioning"
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")

    import base64
    creds = base64.b64encode(f"{user}:{passwd}".encode()).decode()
    req.add_header("Authorization", f"Basic {creds}")

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode())
            return True, result
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return False, {"status": e.code, "error": body}


def main():
    parser = argparse.ArgumentParser(description="Circuit Connect Grafana 대시보드 프로비저닝")
    parser.add_argument("--grafana-url", default=GRAFANA_URL)
    parser.add_argument("--user", default=GRAFANA_USER)
    parser.add_argument("--password", default=GRAFANA_PASS)
    parser.add_argument("--save-json", action="store_true", help="JSON 파일로도 저장")
    args = parser.parse_args()

    dashboards = [
        ("Operations", build_ops_dashboard()),
        ("Game Analytics", build_game_dashboard()),
        ("Data Quality", build_quality_dashboard()),
    ]

    print("=" * 60)
    print("📊 Circuit Connect — Grafana 대시보드 프로비저닝")
    print("=" * 60)

    for name, model in dashboards:
        if args.save_json:
            fname = f"dashboard_{model['uid']}.json"
            with open(fname, "w") as f:
                json.dump({"dashboard": model, "overwrite": True}, f, indent=2)
            print(f"  💾 {fname} 저장")

        print(f"\n  배포 중: {name} ({model['uid']})...", end=" ")
        ok, result = deploy_dashboard(model, args.grafana_url, args.user, args.password)
        if ok:
            print(f"✅ {result.get('url', '')}")
        else:
            print(f"❌ {result}")

    print("\n" + "=" * 60)
    print(f"🌐 Grafana: {args.grafana_url}")
    print("=" * 60)


if __name__ == "__main__":
    main()
