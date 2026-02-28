#!/usr/bin/env python3
"""
Phase D: Grafana 대시보드 프로비저닝 (v2 — 수정본)

수정사항:
- Operations: 이벤트 타입 파이→바, 이상탐지 테이블 쿼리 수정
- Game Analytics: 스테이지 클리어율/시간 가로바, 퍼널 숫자 정렬, 봇 제외
- Data Quality: Late event 비교 로직, 지연 분포 버킷, 세션 시간 단위

Usage:
    python3 provision_dashboards_v2.py --password YOUR_GRAFANA_PASSWORD
"""

import json
import argparse
import urllib.request
import urllib.error
import base64

DATASOURCE_UID = "ffedbair9vbb4b"
GRAFANA_URL = "http://localhost:3000"


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
          field_config=None, options=None):
    p = {
        "id": panel_id,
        "title": title,
        "type": panel_type,
        "datasource": ds(),
        "targets": targets if isinstance(targets, list) else [targets],
        "gridPos": grid_pos,
        "fieldConfig": field_config or {"defaults": {}, "overrides": []},
    }
    if options:
        p["options"] = options
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


def timeseries_panel(title, targets, grid_pos, pid, unit=None):
    fc = {"defaults": {}, "overrides": []}
    if unit:
        fc["defaults"]["unit"] = unit
    return panel(title, "timeseries", targets, grid_pos, pid, field_config=fc)


def bar_panel(title, sql, grid_pos, pid, orientation="horizontal"):
    return panel(title, "barchart", sql_target(sql), grid_pos, pid,
                 options={"orientation": orientation, "xTickLabelRotation": -45 if orientation == "vertical" else 0})


def pie_panel(title, sql, grid_pos, pid):
    return panel(title, "piechart", sql_target(sql), grid_pos, pid,
                 options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": True},
                          "legend": {"displayMode": "table", "placement": "right", "values": ["value", "percent"]}})


def table_panel(title, sql, grid_pos, pid):
    return panel(title, "table", sql_target(sql), grid_pos, pid,
                 options={"showHeader": True, "sortBy": []})


def row_panel(title, grid_pos, pid):
    return {"id": pid, "title": title, "type": "row", "gridPos": grid_pos, "collapsed": False}


# ════════════════════════════════════════════════════════
# Dashboard 1: 운영 대시보드
# ════════════════════════════════════════════════════════

def build_ops_dashboard():
    panels = []
    pid = 1

    # ── Row: KPI ──
    panels.append(row_panel("📊 핵심 지표", {"h": 1, "w": 24, "x": 0, "y": 0}, pid)); pid += 1

    panels.append(stat_panel("총 이벤트",
        "SELECT count() FROM circuit_connect.game_events WHERE schema_version = '2'",
        {"h": 4, "w": 4, "x": 0, "y": 1}, pid, color="#6C9CFC")); pid += 1

    panels.append(stat_panel("총 유저",
        "SELECT uniqExact(user_key) FROM circuit_connect.game_events WHERE schema_version = '2'",
        {"h": 4, "w": 4, "x": 4, "y": 1}, pid, color="#B877D9")); pid += 1

    panels.append(stat_panel("최근 DAU",
        """SELECT uniqExact(user_key)
           FROM circuit_connect.mv_daily_user_summary
           WHERE day = (SELECT max(day) FROM circuit_connect.mv_daily_user_summary)""",
        {"h": 4, "w": 4, "x": 8, "y": 1}, pid, color="#73BF69")); pid += 1

    panels.append(stat_panel("일 평균 클리어",
        """SELECT round(avg(daily_clears))
           FROM (
              SELECT toDate(timestamp) as day, count() as daily_clears
              FROM circuit_connect.game_events
              WHERE schema_version = '2' AND event_type = 'stage_clear'
              GROUP BY day
           )""",
        {"h": 4, "w": 4, "x": 12, "y": 1}, pid, color="#FF9830")); pid += 1

    panels.append(stat_panel("🚨 이상 탐지",
        "SELECT count() FROM circuit_connect.game_alerts",
        {"h": 4, "w": 4, "x": 16, "y": 1}, pid, color="#F2495C")); pid += 1

    panels.append(stat_panel("🤖 봇 유저",
        "SELECT uniqExact(user_key) FROM circuit_connect.game_alerts",
        {"h": 4, "w": 4, "x": 20, "y": 1}, pid, color="#F2495C")); pid += 1

    # ── Row: 트렌드 ──
    panels.append(row_panel("📈 트렌드", {"h": 1, "w": 24, "x": 0, "y": 5}, pid)); pid += 1

    panels.append(timeseries_panel("DAU 추이",
        [sql_target("""
            SELECT day as time, uniqExact(user_key) as DAU
            FROM circuit_connect.mv_daily_user_summary
            GROUP BY day ORDER BY day
        """)],
        {"h": 8, "w": 12, "x": 0, "y": 6}, pid)); pid += 1

    panels.append(timeseries_panel("일별 이벤트 처리량",
        [sql_target("""
            SELECT toDate(timestamp) as time,
                count() as total_events,
                countIf(event_type = 'stage_clear') as clears,
                countIf(event_type = 'stage_fail') as fails
            FROM circuit_connect.game_events
            WHERE schema_version = '2'
            GROUP BY time ORDER BY time
        """)],
        {"h": 8, "w": 12, "x": 12, "y": 6}, pid)); pid += 1

    # ── Row: 이벤트 분석 ──
    panels.append(row_panel("🔍 이벤트 분석", {"h": 1, "w": 24, "x": 0, "y": 14}, pid)); pid += 1

    panels.append(bar_panel("이벤트 타입 분포",
        """SELECT event_type, count() as cnt
           FROM circuit_connect.game_events WHERE schema_version = '2'
           GROUP BY event_type ORDER BY cnt DESC""",
        {"h": 8, "w": 8, "x": 0, "y": 15}, pid, orientation="horizontal")); pid += 1

    panels.append(timeseries_panel("시간대별 이벤트 (KST)",
        [sql_target("""
            SELECT toStartOfHour(toTimezone(timestamp, 'Asia/Seoul')) as time,
                count() as events
            FROM circuit_connect.game_events
            WHERE schema_version = '2'
            GROUP BY time ORDER BY time
        """)],
        {"h": 8, "w": 8, "x": 8, "y": 15}, pid)); pid += 1

    panels.append(table_panel("🚨 이상 탐지 현황",
        """SELECT
              alert_type,
              count() as cnt,
              uniqExact(user_key) as users,
              toString(max(toDateTime(detected_at / 1000))) as last_detected
           FROM circuit_connect.game_alerts
           GROUP BY alert_type
           ORDER BY cnt DESC""",
        {"h": 8, "w": 8, "x": 16, "y": 15}, pid)); pid += 1

    return {
        "uid": "circuit-ops-v2",
        "title": "Circuit Connect - Operations",
        "tags": ["circuit-connect", "ops"],
        "timezone": "Asia/Seoul",
        "time": {"from": "2026-02-20T15:00:00.000Z", "to": "2026-02-28T15:00:00.000Z"},
        "panels": panels,
        "version": 4,
        "schemaVersion": 39,
    }


# ════════════════════════════════════════════════════════
# Dashboard 2: 게임 분석 대시보드
# ════════════════════════════════════════════════════════

def build_game_dashboard():
    panels = []
    pid = 1

    # ── Row: 모드별 분석 ──
    panels.append(row_panel("🎮 모드별 분석", {"h": 1, "w": 24, "x": 0, "y": 0}, pid)); pid += 1

    panels.append(pie_panel("모드별 플레이 비율",
        """SELECT mode, count() as cnt
           FROM circuit_connect.game_events
           WHERE schema_version = '2' AND mode IN ('story', 'time_attack')
             AND event_type IN ('stage_clear', 'stage_fail')
           GROUP BY mode""",
        {"h": 8, "w": 8, "x": 0, "y": 1}, pid)); pid += 1

    panels.append(timeseries_panel("일별 모드별 플레이 수",
        [sql_target("""
            SELECT day as time,
                sumIf(clears + fails, mode = 'story') as story,
                sumIf(clears + fails, mode = 'time_attack') as time_attack
            FROM circuit_connect.mv_daily_user_summary
            GROUP BY day ORDER BY day
        """)],
        {"h": 8, "w": 8, "x": 8, "y": 1}, pid)); pid += 1

    panels.append(timeseries_panel("일별 클리어 vs 실패",
        [sql_target("""
            SELECT day as time,
                sum(clears) as clears,
                sum(fails) as fails
            FROM circuit_connect.mv_daily_user_summary
            GROUP BY day ORDER BY day
        """)],
        {"h": 8, "w": 8, "x": 16, "y": 1}, pid)); pid += 1

    # ── Row: 스테이지 분석 (챕터별 Bar Gauge) ──
    panels.append(row_panel("🧩 스테이지 클리어율", {"h": 1, "w": 24, "x": 0, "y": 9}, pid)); pid += 1

    def make_chapter_gauge_sql(ch):
        return (
            "WITH stage_nums AS ("
            "  SELECT arrayJoin(range(1, 11)) as num"
            "), "
            "stage_data AS ("
            "  SELECT stage_id,"
            "    round(countIfMerge(clear_count) * 100.0"
            "          / greatest(countMerge(attempt_count), 1), 1) as clear_pct"
            "  FROM circuit_connect.mv_stage_difficulty"
            f"  WHERE mode = 'story' AND stage_id LIKE '{ch}-%'"
            "  GROUP BY stage_id"
            ") "
            f"SELECT concat('{ch}-', toString(s.num)) as stage,"
            "  coalesce(d.clear_pct, 0) as \"클리어율\""
            " FROM stage_nums s"
            f" LEFT JOIN stage_data d ON d.stage_id = concat('{ch}-', toString(s.num))"
            " ORDER BY s.num"
        )

    stat_chapter_fc = {
        "defaults": {
            "color": {"mode": "thresholds"},
            "max": 100, "min": 0,
            "unit": "percent",
            "decimals": 1,
            "thresholds": {
                "mode": "absolute",
                "steps": [
                    {"color": "#1F60C4", "value": None},
                    {"color": "#3274D9", "value": 30},
                    {"color": "#56A8C7", "value": 60},
                    {"color": "#73BF69", "value": 80},
                ]
            }
        },
        "overrides": []
    }
    stat_chapter_opts = {
        "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": True},
        "colorMode": "background",
        "graphMode": "none",
        "textMode": "value_and_name",
        "justifyMode": "center",
    }

    # 3-2 배치 (컴팩트)
    panels.append(panel("Chapter 1", "stat", sql_target(make_chapter_gauge_sql(1)),
        {"h": 5, "w": 8, "x": 0, "y": 10}, pid, field_config=stat_chapter_fc, options=stat_chapter_opts)); pid += 1
    panels.append(panel("Chapter 2", "stat", sql_target(make_chapter_gauge_sql(2)),
        {"h": 5, "w": 8, "x": 8, "y": 10}, pid, field_config=stat_chapter_fc, options=stat_chapter_opts)); pid += 1
    panels.append(panel("Chapter 3", "stat", sql_target(make_chapter_gauge_sql(3)),
        {"h": 5, "w": 8, "x": 16, "y": 10}, pid, field_config=stat_chapter_fc, options=stat_chapter_opts)); pid += 1

    panels.append(panel("Chapter 4", "stat", sql_target(make_chapter_gauge_sql(4)),
        {"h": 5, "w": 8, "x": 0, "y": 15}, pid, field_config=stat_chapter_fc, options=stat_chapter_opts)); pid += 1
    panels.append(panel("Chapter 5", "stat", sql_target(make_chapter_gauge_sql(5)),
        {"h": 5, "w": 8, "x": 8, "y": 15}, pid, field_config=stat_chapter_fc, options=stat_chapter_opts)); pid += 1

    # ── Row: 유저 리텐션 & 세션 ──
    panels.append(row_panel("👤 유저 & 세션", {"h": 1, "w": 24, "x": 0, "y": 20}, pid)); pid += 1

    panels.append(table_panel("유저 리텐션 (D1/D3/D7)",
        """WITH first_seen AS (
              SELECT user_key, min(toDate(timestamp)) as first_day
              FROM circuit_connect.game_events
              WHERE schema_version = '2' AND user_key NOT LIKE 'user_bot%'
              GROUP BY user_key
           ),
           daily_active AS (
              SELECT DISTINCT user_key, toDate(timestamp) as active_day
              FROM circuit_connect.game_events
              WHERE schema_version = '2' AND user_key NOT LIKE 'user_bot%'
           )
           SELECT
              toString(fs.first_day) as cohort,
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
        {"h": 8, "w": 12, "x": 0, "y": 21}, pid)); pid += 1

    panels.append(bar_panel("플레이 시간대 분포 (KST)",
        """SELECT
              concat(lpad(toString(toHour(toTimezone(timestamp, 'Asia/Seoul'))), 2, '0'), ':00') as hour_kst,
              count() as events
           FROM circuit_connect.game_events
           WHERE schema_version = '2' AND event_type IN ('stage_clear', 'stage_fail')
           GROUP BY hour_kst ORDER BY hour_kst""",
        {"h": 8, "w": 12, "x": 12, "y": 21}, pid, orientation="vertical")); pid += 1

    # ── Row: 점수 & 만능블럭 ──
    panels.append(row_panel("⭐ 점수 & 만능블럭", {"h": 1, "w": 24, "x": 0, "y": 29}, pid)); pid += 1

    panels.append(timeseries_panel("일별 평균 점수 (모드별, 봇 제외)",
        [sql_target("""
            SELECT toDate(timestamp) as time,
                round(avgIf(score, mode = 'story' AND score > 0)) as story_avg,
                round(avgIf(score, mode = 'time_attack' AND score > 0)) as ta_avg
            FROM circuit_connect.game_events
            WHERE schema_version = '2' AND event_type = 'stage_clear'
              AND user_key NOT LIKE 'user_bot%'
            GROUP BY time ORDER BY time
        """)],
        {"h": 8, "w": 8, "x": 0, "y": 30}, pid)); pid += 1

    panels.append(pie_panel("만능블럭 사용 vs 구매",
        """SELECT action, count() as cnt
           FROM circuit_connect.game_events
           WHERE schema_version = '2' AND event_type = 'item_use'
           GROUP BY action""",
        {"h": 8, "w": 8, "x": 8, "y": 30}, pid)); pid += 1

    panels.append(bar_panel("그리드별 평균 클리어 시간",
        """SELECT grid_size,
              round(avgIf(clear_time_ms, mode = 'story')) as story_ms,
              round(avgIf(clear_time_ms, mode = 'time_attack')) as ta_ms
           FROM circuit_connect.game_events
           WHERE schema_version = '2' AND event_type = 'stage_clear'
             AND clear_time_ms > 0 AND user_key NOT LIKE 'user_bot%'
           GROUP BY grid_size ORDER BY grid_size""",
        {"h": 8, "w": 8, "x": 16, "y": 30}, pid, orientation="vertical")); pid += 1

    # ── Row: 퍼널 분석 ──
    panels.append(row_panel("🔄 퍼널 분석", {"h": 1, "w": 24, "x": 0, "y": 38}, pid)); pid += 1

    panels.append(bar_panel("스토리 모드 퍼널 (챕터별 도달 유저)",
        """SELECT chapter, users FROM (
              SELECT
                  toInt32OrZero(splitByChar('-', stage_id)[1]) as ch_num,
                  concat('Ch.', splitByChar('-', stage_id)[1]) as chapter,
                  uniqExact(user_key) as users
              FROM circuit_connect.game_events
              WHERE schema_version = '2' AND mode = 'story'
                AND event_type = 'stage_start' AND stage_id != ''
                AND user_key NOT LIKE 'user_bot%'
                AND toInt32OrZero(splitByChar('-', stage_id)[1]) BETWEEN 1 AND 5
              GROUP BY ch_num, chapter
           ) ORDER BY ch_num""",
        {"h": 8, "w": 12, "x": 0, "y": 39}, pid, orientation="vertical")); pid += 1

    panels.append(bar_panel("TA 시간제한별 평균 점수",
        """SELECT
              concat(toString(toInt32(time_limit_sec)), '초') as time_limit,
              round(avg(score)) as avg_score
           FROM circuit_connect.game_events
           WHERE schema_version = '2' AND mode = 'time_attack'
             AND event_type = 'stage_clear'
             AND user_key NOT LIKE 'user_bot%' AND score > 0
             AND time_limit_sec IN (60, 120, 180)
           GROUP BY time_limit_sec
           ORDER BY time_limit_sec""",
        {"h": 8, "w": 12, "x": 12, "y": 39}, pid, orientation="vertical")); pid += 1

    return {
        "uid": "circuit-game-v2",
        "title": "Circuit Connect - Game Analytics",
        "tags": ["circuit-connect", "game"],
        "timezone": "Asia/Seoul",
        "time": {"from": "2026-02-20T15:00:00.000Z", "to": "2026-02-28T15:00:00.000Z"},
        "panels": panels,
        "version": 3,
        "schemaVersion": 39,
    }


# ════════════════════════════════════════════════════════
# Dashboard 3: 데이터 품질 대시보드
# ════════════════════════════════════════════════════════

def build_quality_dashboard():
    panels = []
    pid = 1

    # ── Row: 파이프라인 헬스 KPI ──
    panels.append(row_panel("📊 파이프라인 헬스", {"h": 1, "w": 24, "x": 0, "y": 0}, pid)); pid += 1

    panels.append(stat_panel("Late Event 비율 (%)",
        """SELECT round(
              countIf(abs(
                  toInt64(toUnixTimestamp64Milli(timestamp))
                - toInt64(toUnixTimestamp64Milli(client_timestamp))
              ) > 30000) * 100.0 / count(), 2
           ) FROM circuit_connect.game_events WHERE schema_version = '2'""",
        {"h": 4, "w": 6, "x": 0, "y": 1}, pid, color="#FF9830")); pid += 1

    panels.append(stat_panel("이상 탐지 알림 수",
        "SELECT count() FROM circuit_connect.game_alerts",
        {"h": 4, "w": 6, "x": 6, "y": 1}, pid, color="#F2495C")); pid += 1

    panels.append(stat_panel("봇 의심 유저 수",
        "SELECT uniqExact(user_key) FROM circuit_connect.game_alerts",
        {"h": 4, "w": 6, "x": 12, "y": 1}, pid, color="#F2495C")); pid += 1

    panels.append(stat_panel("Flink 세션 수",
        "SELECT count() FROM circuit_connect.fact_sessions",
        {"h": 4, "w": 6, "x": 18, "y": 1}, pid, color="#6C9CFC")); pid += 1

    # ── Row: 이벤트 지연 분석 ──
    panels.append(row_panel("⏱ 이벤트 지연", {"h": 1, "w": 24, "x": 0, "y": 5}, pid)); pid += 1

    panels.append(timeseries_panel("일별 Late Event 비율 (>30s)",
        [sql_target("""
            SELECT toDate(timestamp) as time,
                round(countIf(abs(
                    toInt64(toUnixTimestamp64Milli(timestamp))
                  - toInt64(toUnixTimestamp64Milli(client_timestamp))
                ) > 30000) * 100.0 / count(), 2) as late_pct
            FROM circuit_connect.game_events
            WHERE schema_version = '2'
            GROUP BY time ORDER BY time
        """)],
        {"h": 8, "w": 12, "x": 0, "y": 6}, pid)); pid += 1

    panels.append(bar_panel("server-client 지연 분포",
        """SELECT bucket, cnt FROM (
              SELECT
                  multiIf(
                      abs_diff < 1000, '< 1초',
                      abs_diff < 5000, '1~5초',
                      abs_diff < 10000, '5~10초',
                      abs_diff < 30000, '10~30초',
                      '30초 이상'
                  ) as bucket,
                  multiIf(
                      abs_diff < 1000, 1,
                      abs_diff < 5000, 2,
                      abs_diff < 10000, 3,
                      abs_diff < 30000, 4, 5
                  ) as sort_key,
                  count() as cnt
              FROM (
                  SELECT abs(
                      toInt64(toUnixTimestamp64Milli(timestamp))
                    - toInt64(toUnixTimestamp64Milli(client_timestamp))
                  ) as abs_diff
                  FROM circuit_connect.game_events WHERE schema_version = '2'
              )
              GROUP BY bucket, sort_key
           ) ORDER BY sort_key""",
        {"h": 8, "w": 12, "x": 12, "y": 6}, pid, orientation="vertical")); pid += 1

    # ── Row: 이상 탐지 ──
    panels.append(row_panel("🚨 이상 탐지", {"h": 1, "w": 24, "x": 0, "y": 14}, pid)); pid += 1

    panels.append(pie_panel("Alert 유형 분포",
        """SELECT alert_type, count() as cnt
           FROM circuit_connect.game_alerts GROUP BY alert_type""",
        {"h": 8, "w": 8, "x": 0, "y": 15}, pid)); pid += 1

    panels.append(table_panel("Alert 상세 (최근 50건)",
        """SELECT
              toString(toDateTime(detected_at / 1000)) as detected,
              alert_type,
              user_key,
              stage_id,
              score,
              clear_time_ms,
              description
           FROM circuit_connect.game_alerts
           ORDER BY detected_at DESC
           LIMIT 50""",
        {"h": 8, "w": 16, "x": 8, "y": 15}, pid)); pid += 1

    # ── Row: 데이터 완정성 ──
    panels.append(row_panel("📋 데이터 완정성", {"h": 1, "w": 24, "x": 0, "y": 23}, pid)); pid += 1

    panels.append(table_panel("이벤트 타입별 필드 채움률 (%)",
        """SELECT event_type,
              count() as total,
              round(countIf(mode != '') * 100.0 / count()) as mode,
              round(countIf(stage_id != '') * 100.0 / count()) as stage_id,
              round(countIf(grid_size != '') * 100.0 / count()) as grid,
              round(countIf(score > 0) * 100.0 / count()) as score,
              round(countIf(clear_time_ms > 0) * 100.0 / count()) as clear_time
           FROM circuit_connect.game_events WHERE schema_version = '2'
           GROUP BY event_type ORDER BY total DESC""",
        {"h": 8, "w": 14, "x": 0, "y": 24}, pid)); pid += 1

    # Flink 세션 요약 stat (수정된 쿼리)
    panels.append(stat_panel("평균 세션 시간",
        """SELECT concat(toString(round(avg(duration_ms) / 1000 / 60, 1)), ' 분')
           FROM circuit_connect.fact_sessions
           WHERE duration_ms > 0 AND duration_ms < 7200000""",
        {"h": 4, "w": 5, "x": 14, "y": 24}, pid, color="#73BF69")); pid += 1

    panels.append(stat_panel("평균 세션 클리어",
        """SELECT round(avg(stage_clears), 1)
           FROM circuit_connect.fact_sessions
           WHERE stage_clears > 0 AND stage_clears < 100""",
        {"h": 4, "w": 5, "x": 19, "y": 24}, pid, color="#B877D9")); pid += 1

    panels.append(stat_panel("평균 세션 이벤트",
        """SELECT round(avg(total_events), 1)
           FROM circuit_connect.fact_sessions
           WHERE total_events > 0 AND total_events < 500""",
        {"h": 4, "w": 5, "x": 14, "y": 28}, pid, color="#FF9830")); pid += 1

    panels.append(stat_panel("일 평균 이벤트 처리량",
        """SELECT round(avg(cnt))
           FROM (
              SELECT toDate(timestamp) as day, count() as cnt
              FROM circuit_connect.game_events WHERE schema_version = '2'
              GROUP BY day
           )""",
        {"h": 4, "w": 5, "x": 19, "y": 28}, pid, color="#6C9CFC")); pid += 1

    return {
        "uid": "circuit-quality-v2",
        "title": "Circuit Connect - Data Quality",
        "tags": ["circuit-connect", "quality"],
        "timezone": "Asia/Seoul",
        "time": {"from": "2026-02-20T15:00:00.000Z", "to": "2026-02-28T15:00:00.000Z"},
        "panels": panels,
        "version": 4,
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
        "message": "Phase D v2: fixes applied"
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
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
    parser = argparse.ArgumentParser(description="Circuit Connect Grafana 대시보드 v2")
    parser.add_argument("--grafana-url", default=GRAFANA_URL)
    parser.add_argument("--user", default="admin")
    parser.add_argument("--password", default="admin")
    args = parser.parse_args()

    dashboards = [
        ("Operations", build_ops_dashboard()),
        ("Game Analytics", build_game_dashboard()),
        ("Data Quality", build_quality_dashboard()),
    ]

    print("=" * 60)
    print("📊 Circuit Connect — Grafana 대시보드 v2 배포")
    print("=" * 60)

    for name, model in dashboards:
        print(f"\n  배포 중: {name} ({model['uid']})...", end=" ")
        ok, result = deploy_dashboard(model, args.grafana_url, args.user, args.password)
        if ok:
            print(f"✅ {result.get('url', '')}")
        else:
            print(f"❌ {result}")

    print("\n" + "=" * 60)
    print("✅ 수정사항:")
    print("  - Ops: 이벤트 타입 파이→바 차트")
    print("  - Game: 스테이지 클리어율/시간 가로 바, 퍼널 정렬, 봇 제외")
    print("  - Quality: Late event 계산식, 지연 버킷, 세션 시간 단위")
    print("=" * 60)


if __name__ == "__main__":
    main()