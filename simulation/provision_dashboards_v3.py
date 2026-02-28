#!/usr/bin/env python3
"""
Phase F: Grafana 대시보드 프로비저닝 (v3.1 — 색상 체계 + 버그 수정)

색상 체계:
  Story    = #FADE2A (금색)
  TA       = #5794F2 (파란색)
  Clears   = #73BF69 (초록)
  Fails    = #F2495C (빨강)
  Total    = #B877D9 (보라)
  Warning  = #FF9830 (주황)
  Info     = #56A8C7 (청록)

Usage:
    python3 provision_dashboards_v3.py --password YOUR_GRAFANA_PASSWORD
"""

import json
import argparse
import urllib.request
import urllib.error
import base64

DATASOURCE_UID = "ffedbair9vbb4b"
GRAFANA_URL = "http://localhost:3000"

C_STORY   = "#FADE2A"
C_TA      = "#5794F2"
C_CLEAR   = "#73BF69"
C_FAIL    = "#F2495C"
C_TOTAL   = "#B877D9"
C_WARN    = "#FF9830"
C_INFO    = "#56A8C7"
C_LIGHT   = "#8AB8FF"


def ds(uid=DATASOURCE_UID):
    return {"type": "grafana-clickhouse-datasource", "uid": uid}

def sql_target(raw_sql, ref_id="A", fmt=1):
    return {"datasource": ds(), "rawSql": raw_sql, "format": fmt, "queryType": "sql", "refId": ref_id}

def color_override(field_name, color):
    return {"matcher": {"id": "byName", "options": field_name},
            "properties": [{"id": "color", "value": {"fixedColor": color, "mode": "fixed"}}]}

def panel(title, panel_type, targets, grid_pos, panel_id, field_config=None, options=None):
    p = {"id": panel_id, "title": title, "type": panel_type, "datasource": ds(),
         "targets": targets if isinstance(targets, list) else [targets],
         "gridPos": grid_pos, "fieldConfig": field_config or {"defaults": {}, "overrides": []}}
    if options: p["options"] = options
    return p

def stat_panel(title, sql, grid_pos, pid, color=C_CLEAR, unit=None, decimals=None):
    fc = {"defaults": {"color": {"fixedColor": color, "mode": "fixed"},
          "thresholds": {"mode": "absolute", "steps": [{"color": "green", "value": None}]}}, "overrides": []}
    if unit: fc["defaults"]["unit"] = unit
    if decimals is not None: fc["defaults"]["decimals"] = decimals
    return panel(title, "stat", sql_target(sql), grid_pos, pid, field_config=fc,
                 options={"colorMode": "value", "graphMode": "none", "textMode": "value"})

def timeseries_panel(title, targets, grid_pos, pid, overrides=None, unit=None):
    fc = {"defaults": {}, "overrides": overrides or []}
    if unit: fc["defaults"]["unit"] = unit
    return panel(title, "timeseries", targets, grid_pos, pid, field_config=fc)

def bar_panel(title, sql, grid_pos, pid, orientation="horizontal", overrides=None):
    fc = {"defaults": {}, "overrides": overrides or []}
    return panel(title, "barchart", sql_target(sql), grid_pos, pid, field_config=fc,
                 options={"orientation": orientation, "xTickLabelRotation": -45 if orientation == "vertical" else 0})

def pie_panel(title, sql, grid_pos, pid, overrides=None):
    fc = {"defaults": {}, "overrides": overrides or []}
    return panel(title, "piechart", sql_target(sql), grid_pos, pid, field_config=fc,
                 options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": True},
                          "legend": {"displayMode": "table", "placement": "right", "values": ["value", "percent"]}})

def table_panel(title, sql, grid_pos, pid, overrides=None):
    fc = {"defaults": {}, "overrides": overrides or []}
    return panel(title, "table", sql_target(sql), grid_pos, pid, field_config=fc,
                 options={"showHeader": True, "sortBy": []})

def row_panel(title, grid_pos, pid):
    return {"id": pid, "title": title, "type": "row", "gridPos": grid_pos, "collapsed": False}


def build_pipeline_ops_dashboard():
    panels = []; pid = 1

    panels.append(row_panel("📊 파이프라인 핵심 지표", {"h": 1, "w": 24, "x": 0, "y": 0}, pid)); pid += 1
    panels.append(stat_panel("총 이벤트",
        "SELECT count() FROM circuit_connect.game_events WHERE schema_version = '2'",
        {"h": 4, "w": 4, "x": 0, "y": 1}, pid, color=C_LIGHT)); pid += 1
    panels.append(stat_panel("총 유저",
        "SELECT uniqExact(user_key) FROM circuit_connect.game_events WHERE schema_version = '2'",
        {"h": 4, "w": 4, "x": 4, "y": 1}, pid, color=C_TOTAL)); pid += 1
    panels.append(stat_panel("최근 DAU",
        "SELECT uniqExact(user_key) FROM circuit_connect.mv_daily_user_summary WHERE day = (SELECT max(day) FROM circuit_connect.mv_daily_user_summary)",
        {"h": 4, "w": 4, "x": 8, "y": 1}, pid, color=C_CLEAR)); pid += 1
    panels.append(stat_panel("Late Event 비율",
        "SELECT round(countIf(abs(toInt64(toUnixTimestamp64Milli(timestamp)) - toInt64(toUnixTimestamp64Milli(client_timestamp))) > 30000) * 100.0 / count(), 2) FROM circuit_connect.game_events WHERE schema_version = '2'",
        {"h": 4, "w": 4, "x": 12, "y": 1}, pid, color=C_WARN, unit="percent")); pid += 1
    panels.append(stat_panel("🚨 이상 탐지",
        "SELECT count() FROM circuit_connect.game_alerts",
        {"h": 4, "w": 4, "x": 16, "y": 1}, pid, color=C_FAIL)); pid += 1
    panels.append(stat_panel("Flink 세션 수",
        "SELECT count() FROM circuit_connect.fact_sessions",
        {"h": 4, "w": 4, "x": 20, "y": 1}, pid, color=C_INFO)); pid += 1

    panels.append(row_panel("📈 처리량 & 트렌드", {"h": 1, "w": 24, "x": 0, "y": 5}, pid)); pid += 1
    panels.append(timeseries_panel("DAU 추이",
        [sql_target("SELECT day as time, uniqExact(user_key) as DAU FROM circuit_connect.mv_daily_user_summary GROUP BY day ORDER BY day")],
        {"h": 8, "w": 8, "x": 0, "y": 6}, pid, overrides=[color_override("DAU", C_TOTAL)])); pid += 1
    panels.append(timeseries_panel("일별 이벤트 처리량",
        [sql_target("SELECT toDate(timestamp) as time, count() as total_events, countIf(event_type = 'stage_clear') as clears, countIf(event_type = 'stage_fail') as fails FROM circuit_connect.game_events WHERE schema_version = '2' GROUP BY time ORDER BY time")],
        {"h": 8, "w": 8, "x": 8, "y": 6}, pid,
        overrides=[color_override("total_events", C_LIGHT), color_override("clears", C_CLEAR), color_override("fails", C_FAIL)])); pid += 1
    panels.append(table_panel("이벤트 타입 분포",
        "SELECT event_type, count() as cnt, round(count() * 100.0 / (SELECT count() FROM circuit_connect.game_events WHERE schema_version = '2'), 1) as pct FROM circuit_connect.game_events WHERE schema_version = '2' GROUP BY event_type ORDER BY cnt DESC",
        {"h": 8, "w": 8, "x": 16, "y": 6}, pid)); pid += 1

    panels.append(row_panel("🔍 데이터 품질", {"h": 1, "w": 24, "x": 0, "y": 14}, pid)); pid += 1
    panels.append(timeseries_panel("일별 Late Event 비율 (>30s)",
        [sql_target("SELECT toDate(timestamp) as time, round(countIf(abs(toInt64(toUnixTimestamp64Milli(timestamp)) - toInt64(toUnixTimestamp64Milli(client_timestamp))) > 30000) * 100.0 / count(), 2) as late_pct FROM circuit_connect.game_events WHERE schema_version = '2' GROUP BY time ORDER BY time")],
        {"h": 8, "w": 8, "x": 0, "y": 15}, pid, overrides=[color_override("late_pct", C_WARN)])); pid += 1
    panels.append(table_panel("server-client 지연 분포",
        "SELECT bucket, cnt, round(cnt * 100.0 / sm, 2) as pct FROM (SELECT multiIf(abs_diff < 1000, '< 1s', abs_diff < 5000, '1-5s', abs_diff < 10000, '5-10s', abs_diff < 30000, '10-30s', '30s+') as bucket, multiIf(abs_diff < 1000, 1, abs_diff < 5000, 2, abs_diff < 10000, 3, abs_diff < 30000, 4, 5) as sort_key, count() as cnt, sum(count()) OVER () as sm FROM (SELECT abs(toInt64(toUnixTimestamp64Milli(timestamp)) - toInt64(toUnixTimestamp64Milli(client_timestamp))) as abs_diff FROM circuit_connect.game_events WHERE schema_version = '2') GROUP BY bucket, sort_key) ORDER BY sort_key",
        {"h": 8, "w": 16, "x": 8, "y": 15}, pid)); pid += 1
    panels.append(table_panel("이벤트 타입별 필드 채움률 (%)",
        "SELECT event_type, count() as total, round(countIf(mode != '') * 100.0 / count()) as mode_pct, round(countIf(stage_id != '') * 100.0 / count()) as stage_id_pct, round(countIf(grid_size != '') * 100.0 / count()) as grid_pct, round(countIf(score > 0) * 100.0 / count()) as score_pct, round(countIf(clear_time_ms > 0) * 100.0 / count()) as clear_time_pct, round(countIf(seq > 0) * 100.0 / count()) as seq_pct FROM circuit_connect.game_events WHERE schema_version = '2' GROUP BY event_type ORDER BY total DESC",
        {"h": 8, "w": 24, "x": 0, "y": 23}, pid)); pid += 1

    panels.append(row_panel("🚨 이상 탐지 (Flink)", {"h": 1, "w": 24, "x": 0, "y": 31}, pid)); pid += 1
    panels.append(pie_panel("Alert 유형 분포",
        "SELECT alert_type, count() as cnt FROM circuit_connect.game_alerts GROUP BY alert_type",
        {"h": 8, "w": 12, "x": 0, "y": 32}, pid,
        overrides=[color_override("IMPOSSIBLE_CLEAR", "#FF80AB"), color_override("RAPID_FIRE", "#00BCD4"), color_override("SCORE_OVERFLOW", "#CE93D8")])); pid += 1
    panels.append(table_panel("🚨 이상 탐지 현황 (요약)",
        "SELECT alert_type, count() as cnt, uniqExact(user_key) as users, toString(max(toDateTime(detected_at / 1000))) as last_detected FROM circuit_connect.game_alerts GROUP BY alert_type ORDER BY cnt DESC",
        {"h": 8, "w": 12, "x": 12, "y": 32}, pid)); pid += 1
    panels.append(table_panel("Alert 상세 (최근 50건)",
        "SELECT toString(toDateTime(detected_at / 1000)) as detected, alert_type, user_key, stage_id, score, clear_time_ms, description FROM circuit_connect.game_alerts ORDER BY detected_at DESC LIMIT 50",
        {"h": 8, "w": 24, "x": 0, "y": 40}, pid)); pid += 1

    panels.append(row_panel("⚙️ Flink 처리 통계", {"h": 1, "w": 24, "x": 0, "y": 48}, pid)); pid += 1
    panels.append(stat_panel("평균 세션 시간",
        "SELECT round(avg(duration_ms) / 1000 / 60, 1) FROM circuit_connect.fact_sessions WHERE duration_ms > 0 AND duration_ms < 7200000",
        {"h": 4, "w": 6, "x": 0, "y": 49}, pid, color=C_CLEAR, unit="min")); pid += 1
    panels.append(stat_panel("평균 세션 이벤트",
        "SELECT round(avg(total_events), 1) FROM circuit_connect.fact_sessions WHERE total_events > 0 AND total_events < 500",
        {"h": 4, "w": 6, "x": 6, "y": 49}, pid, color=C_WARN)); pid += 1
    panels.append(stat_panel("일 평균 이벤트 처리량",
        "SELECT round(avg(cnt)) FROM (SELECT toDate(timestamp) as day, count() as cnt FROM circuit_connect.game_events WHERE schema_version = '2' GROUP BY day)",
        {"h": 4, "w": 6, "x": 12, "y": 49}, pid, color=C_LIGHT)); pid += 1
    panels.append(stat_panel("🤖 봇 의심 유저",
        "SELECT uniqExact(user_key) FROM circuit_connect.game_alerts",
        {"h": 4, "w": 6, "x": 18, "y": 49}, pid, color=C_FAIL)); pid += 1

    return {"uid": "circuit-pipeline-v3", "title": "Circuit Connect - Pipeline Operations",
            "tags": ["circuit-connect", "pipeline", "ops"], "timezone": "Asia/Seoul",
            "time": {"from": "2026-02-20T15:00:00.000Z", "to": "2026-02-28T15:00:00.000Z"},
            "panels": panels, "version": 1, "schemaVersion": 39}


def build_game_dashboard():
    panels = []; pid = 1

    panels.append(row_panel("🎮 모드별 분석", {"h": 1, "w": 24, "x": 0, "y": 0}, pid)); pid += 1
    panels.append(pie_panel("모드별 플레이 비율",
        "SELECT mode, count() as cnt FROM circuit_connect.game_events WHERE schema_version = '2' AND mode IN ('story', 'time_attack') AND event_type IN ('stage_clear', 'stage_fail') GROUP BY mode",
        {"h": 8, "w": 8, "x": 0, "y": 1}, pid, overrides=[color_override("story", C_STORY), color_override("time_attack", C_TA)])); pid += 1
    panels.append(timeseries_panel("일별 모드별 플레이 수",
        [sql_target("SELECT day as time, sumIf(clears + fails, mode = 'story') as story, sumIf(clears + fails, mode = 'time_attack') as time_attack FROM circuit_connect.mv_daily_user_summary GROUP BY day ORDER BY day")],
        {"h": 8, "w": 8, "x": 8, "y": 1}, pid, overrides=[color_override("story", C_STORY), color_override("time_attack", C_TA)])); pid += 1
    panels.append(timeseries_panel("일별 클리어 vs 실패",
        [sql_target("SELECT day as time, sum(clears) as clears, sum(fails) as fails FROM circuit_connect.mv_daily_user_summary GROUP BY day ORDER BY day")],
        {"h": 8, "w": 8, "x": 16, "y": 1}, pid, overrides=[color_override("clears", C_CLEAR), color_override("fails", C_FAIL)])); pid += 1

    # ★ 타임어택 경쟁 분석
    panels.append(row_panel("🏆 타임어택 경쟁 분석", {"h": 1, "w": 24, "x": 0, "y": 9}, pid)); pid += 1
    panels.append(timeseries_panel("전체 DAU vs TA DAU",
        [sql_target("SELECT day as time, uniqExact(user_key) as total_DAU, uniqExactIf(user_key, mode = 'time_attack') as TA_DAU FROM circuit_connect.mv_daily_user_summary GROUP BY day ORDER BY day")],
        {"h": 8, "w": 8, "x": 0, "y": 10}, pid, overrides=[color_override("total_DAU", C_TOTAL), color_override("TA_DAU", C_TA)])); pid += 1
    panels.append(pie_panel("시간제한 선호도",
        "SELECT concat(toString(toInt32(time_limit_sec)), '초') as time_limit, count() as cnt FROM circuit_connect.game_events WHERE schema_version = '2' AND mode = 'time_attack' AND event_type = 'stage_start' AND time_limit_sec IN (60, 120, 180) AND user_key NOT LIKE 'user_bot%' GROUP BY time_limit_sec, time_limit ORDER BY time_limit_sec",
        {"h": 8, "w": 8, "x": 8, "y": 10}, pid, overrides=[color_override("60초", C_WARN), color_override("120초", C_TOTAL), color_override("180초", C_CLEAR)])); pid += 1
    panels.append(table_panel("시간제한별 점수 분석",
        "SELECT concat(toString(toInt32(time_limit_sec)), 's') as time_limit, round(avg(score)) as avg_score, max(score) as max_score, round(max(score) - avg(score)) as gap, count() as total_clears FROM circuit_connect.game_events WHERE schema_version = '2' AND mode = 'time_attack' AND event_type = 'stage_clear' AND user_key NOT LIKE 'user_bot%' AND score > 0 AND time_limit_sec IN (60, 120, 180) GROUP BY time_limit_sec ORDER BY time_limit_sec",
        {"h": 8, "w": 8, "x": 16, "y": 10}, pid)); pid += 1

    panels.append(stat_panel("TA DAU 비율",
        "SELECT round(uniqExactIf(user_key, mode = 'time_attack') * 100.0 / greatest(uniqExact(user_key), 1), 1) FROM circuit_connect.mv_daily_user_summary",
        {"h": 4, "w": 6, "x": 0, "y": 18}, pid, color=C_TA, unit="percent")); pid += 1
    panels.append(stat_panel("유저당 일 평균 TA 라운드",
        "SELECT round(avg(daily_rounds), 1) FROM (SELECT user_key, toDate(timestamp) as day, countIf(stage_id = 'ta-1') as daily_rounds FROM circuit_connect.game_events WHERE schema_version = '2' AND mode = 'time_attack' AND event_type = 'stage_start' AND user_key NOT LIKE 'user_bot%' GROUP BY user_key, day HAVING daily_rounds > 0)",
        {"h": 4, "w": 6, "x": 6, "y": 18}, pid, color=C_LIGHT)); pid += 1
    panels.append(stat_panel("TA 평균 클리어 스테이지",
        "SELECT round(avg(clears), 1) FROM (SELECT session_id, count() as clears FROM circuit_connect.game_events WHERE schema_version = '2' AND mode = 'time_attack' AND event_type = 'stage_clear' AND user_key NOT LIKE 'user_bot%' GROUP BY session_id)",
        {"h": 4, "w": 6, "x": 12, "y": 18}, pid, color=C_CLEAR)); pid += 1
    panels.append(stat_panel("TA 리피터 (2일+)",
        "SELECT count() FROM (SELECT user_key, uniqExact(toDate(timestamp)) as active_days FROM circuit_connect.game_events WHERE schema_version = '2' AND mode = 'time_attack' AND event_type = 'stage_start' AND user_key NOT LIKE 'user_bot%' GROUP BY user_key HAVING active_days >= 2)",
        {"h": 4, "w": 6, "x": 18, "y": 18}, pid, color=C_TOTAL)); pid += 1

    # 게임 핵심 지표
    panels.append(row_panel("📊 게임 핵심 지표", {"h": 1, "w": 24, "x": 0, "y": 22}, pid)); pid += 1
    panels.append(stat_panel("일 평균 클리어",
        "SELECT round(avg(daily_clears)) FROM (SELECT toDate(timestamp) as day, count() as daily_clears FROM circuit_connect.game_events WHERE schema_version = '2' AND event_type = 'stage_clear' AND user_key NOT LIKE 'user_bot%' GROUP BY day)",
        {"h": 4, "w": 6, "x": 0, "y": 23}, pid, color=C_CLEAR)); pid += 1
    panels.append(stat_panel("평균 세션 클리어",
        "SELECT round(avg(stage_clears), 1) FROM circuit_connect.fact_sessions WHERE stage_clears > 0 AND stage_clears < 100",
        {"h": 4, "w": 6, "x": 6, "y": 23}, pid, color=C_WARN)); pid += 1
    panels.append(pie_panel("플랫폼 분포",
        "SELECT platform, count() as cnt FROM circuit_connect.game_events WHERE schema_version = '2' AND event_type = 'session_start' AND platform != '' GROUP BY platform",
        {"h": 4, "w": 6, "x": 12, "y": 23}, pid, overrides=[color_override("android", C_CLEAR), color_override("ios", C_LIGHT)])); pid += 1
    panels.append(stat_panel("평균 실패 진행률",
        "SELECT round(avg(completion_pct), 1) FROM circuit_connect.game_events WHERE schema_version = '2' AND event_type = 'stage_fail' AND completion_pct > 0 AND user_key NOT LIKE 'user_bot%'",
        {"h": 4, "w": 6, "x": 18, "y": 23}, pid, color=C_INFO, unit="percent")); pid += 1

    # 스테이지 클리어율
    panels.append(row_panel("🧩 스테이지 클리어율", {"h": 1, "w": 24, "x": 0, "y": 27}, pid)); pid += 1
    def ch_sql(ch):
        return f"WITH stage_nums AS (SELECT arrayJoin(range(1, 11)) as num), stage_data AS (SELECT stage_id, round(countIfMerge(clear_count) * 100.0 / greatest(countMerge(attempt_count), 1), 1) as clear_pct FROM circuit_connect.mv_stage_difficulty WHERE mode = 'story' AND stage_id LIKE '{ch}-%' GROUP BY stage_id) SELECT concat('{ch}-', toString(s.num)) as stage, coalesce(d.clear_pct, 0) as \"클리어율\" FROM stage_nums s LEFT JOIN stage_data d ON d.stage_id = concat('{ch}-', toString(s.num)) ORDER BY s.num"
    ch_fc = {"defaults": {"color": {"mode": "thresholds"}, "max": 100, "min": 0, "unit": "percent", "decimals": 1,
             "thresholds": {"mode": "absolute", "steps": [{"color": C_FAIL, "value": None}, {"color": C_WARN, "value": 30}, {"color": C_STORY, "value": 60}, {"color": C_CLEAR, "value": 80}]}}, "overrides": []}
    ch_opts = {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": True}, "colorMode": "background", "graphMode": "none", "textMode": "value_and_name", "justifyMode": "center"}
    for i, (x, y) in enumerate([(0,28),(8,28),(16,28),(0,33),(8,33)]):
        panels.append(panel(f"Chapter {i+1}", "stat", sql_target(ch_sql(i+1)), {"h": 5, "w": 8, "x": x, "y": y}, pid, field_config=ch_fc, options=ch_opts)); pid += 1

    # 실패 분석
    panels.append(row_panel("💀 실패 분석", {"h": 1, "w": 24, "x": 0, "y": 38}, pid)); pid += 1
    panels.append(bar_panel("실패 시 진행률 분포",
        "SELECT progress_bucket, cnt FROM (SELECT multiIf(completion_pct < 25, '0~25%', completion_pct < 50, '25~50%', completion_pct < 75, '50~75%', '75~100%') as progress_bucket, multiIf(completion_pct < 25, 1, completion_pct < 50, 2, completion_pct < 75, 3, 4) as sort_key, count() as cnt FROM circuit_connect.game_events WHERE schema_version = '2' AND event_type = 'stage_fail' AND completion_pct > 0 AND user_key NOT LIKE 'user_bot%' GROUP BY progress_bucket, sort_key) ORDER BY sort_key",
        {"h": 8, "w": 12, "x": 0, "y": 39}, pid, orientation="vertical", overrides=[color_override("cnt", C_FAIL)])); pid += 1
    panels.append(bar_panel("챕터별 평균 실패 진행률",
        "SELECT chapter, avg_completion FROM (SELECT concat('Ch.', splitByChar('-', stage_id)[1]) as chapter, toInt32OrZero(splitByChar('-', stage_id)[1]) as ch_num, round(avg(completion_pct), 1) as avg_completion FROM circuit_connect.game_events WHERE schema_version = '2' AND event_type = 'stage_fail' AND completion_pct > 0 AND mode = 'story' AND user_key NOT LIKE 'user_bot%' AND toInt32OrZero(splitByChar('-', stage_id)[1]) BETWEEN 1 AND 5 GROUP BY chapter, ch_num) ORDER BY ch_num",
        {"h": 8, "w": 12, "x": 12, "y": 39}, pid, orientation="vertical", overrides=[color_override("avg_completion", C_WARN)])); pid += 1

    # 유저 & 세션
    panels.append(row_panel("👤 유저 & 세션", {"h": 1, "w": 24, "x": 0, "y": 47}, pid)); pid += 1
    panels.append(table_panel("유저 리텐션 (D1/D3/D7)",
        "WITH first_seen AS (SELECT user_key, min(toDate(timestamp)) as first_day FROM circuit_connect.game_events WHERE schema_version = '2' AND user_key NOT LIKE 'user_bot%' GROUP BY user_key), daily_active AS (SELECT DISTINCT user_key, toDate(timestamp) as active_day FROM circuit_connect.game_events WHERE schema_version = '2' AND user_key NOT LIKE 'user_bot%') SELECT toString(fs.first_day) as cohort, count(DISTINCT fs.user_key) as cohort_size, round(countDistinctIf(da.user_key, da.active_day = fs.first_day + 1) * 100.0 / count(DISTINCT fs.user_key), 1) as D1_pct, round(countDistinctIf(da.user_key, da.active_day = fs.first_day + 3) * 100.0 / count(DISTINCT fs.user_key), 1) as D3_pct, round(countDistinctIf(da.user_key, da.active_day = fs.first_day + 7) * 100.0 / count(DISTINCT fs.user_key), 1) as D7_pct FROM first_seen fs LEFT JOIN daily_active da ON fs.user_key = da.user_key GROUP BY fs.first_day ORDER BY fs.first_day",
        {"h": 8, "w": 12, "x": 0, "y": 48}, pid)); pid += 1
    panels.append(bar_panel("플레이 시간대 분포 (KST)",
        "SELECT concat(lpad(toString(toHour(toTimezone(timestamp, 'Asia/Seoul'))), 2, '0'), ':00') as hour_kst, count() as events FROM circuit_connect.game_events WHERE schema_version = '2' AND event_type IN ('stage_clear', 'stage_fail') GROUP BY hour_kst ORDER BY hour_kst",
        {"h": 8, "w": 12, "x": 12, "y": 48}, pid, orientation="vertical", overrides=[color_override("events", C_TOTAL)])); pid += 1

    # 점수 & 만능블럭
    panels.append(row_panel("⭐ 아이템 & 퍼널", {"h": 1, "w": 24, "x": 0, "y": 56}, pid)); pid += 1
    panels.append(bar_panel("스토리 퍼널 (챕터별 도달 유저)",
        "SELECT chapter, users FROM (SELECT toInt32OrZero(splitByChar('-', stage_id)[1]) as ch_num, concat('Ch.', splitByChar('-', stage_id)[1]) as chapter, uniqExact(user_key) as users FROM circuit_connect.game_events WHERE schema_version = '2' AND mode = 'story' AND event_type = 'stage_start' AND stage_id != '' AND user_key NOT LIKE 'user_bot%' AND toInt32OrZero(splitByChar('-', stage_id)[1]) BETWEEN 1 AND 5 GROUP BY ch_num, chapter) ORDER BY ch_num",
        {"h": 8, "w": 8, "x": 0, "y": 57}, pid, orientation="vertical", overrides=[color_override("users", C_STORY)])); pid += 1
    panels.append(pie_panel("만능블럭 사용 vs 구매",
        "SELECT action, count() as cnt FROM circuit_connect.game_events WHERE schema_version = '2' AND event_type = 'item_use' GROUP BY action",
        {"h": 8, "w": 8, "x": 8, "y": 57}, pid, overrides=[color_override("use", "#FF6D00"), color_override("purchase", C_INFO)])); pid += 1
    panels.append(bar_panel("그리드별 평균 클리어 시간",
        "SELECT grid_size, round(avgIf(clear_time_ms, mode = 'story')) as story_ms, round(avgIf(clear_time_ms, mode = 'time_attack')) as ta_ms FROM circuit_connect.game_events WHERE schema_version = '2' AND event_type = 'stage_clear' AND clear_time_ms > 0 AND user_key NOT LIKE 'user_bot%' GROUP BY grid_size ORDER BY grid_size",
        {"h": 8, "w": 8, "x": 16, "y": 57}, pid, orientation="vertical",
        overrides=[color_override("story_ms", C_STORY), color_override("ta_ms", C_TA)])); pid += 1


    return {"uid": "circuit-game-v3", "title": "Circuit Connect - Game Analytics",
            "tags": ["circuit-connect", "game"], "timezone": "Asia/Seoul",
            "time": {"from": "2026-02-20T15:00:00.000Z", "to": "2026-02-28T15:00:00.000Z"},
            "panels": panels, "version": 1, "schemaVersion": 39}


def delete_dashboard(uid, grafana_url, user, passwd):
    url = f"{grafana_url}/api/dashboards/uid/{uid}"
    req = urllib.request.Request(url, method="DELETE")
    creds = base64.b64encode(f"{user}:{passwd}".encode()).decode()
    req.add_header("Authorization", f"Basic {creds}")
    try:
        with urllib.request.urlopen(req) as resp: return True
    except urllib.error.HTTPError: return False

def deploy_dashboard(dashboard_model, grafana_url, user, passwd):
    url = f"{grafana_url}/api/dashboards/db"
    payload = json.dumps({"dashboard": dashboard_model, "overwrite": True, "message": "Phase F v3.1"}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    creds = base64.b64encode(f"{user}:{passwd}".encode()).decode()
    req.add_header("Authorization", f"Basic {creds}")
    try:
        with urllib.request.urlopen(req) as resp:
            return True, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return False, {"status": e.code, "error": e.read().decode()}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--grafana-url", default=GRAFANA_URL)
    parser.add_argument("--user", default="admin")
    parser.add_argument("--password", default="admin")
    args = parser.parse_args()

    print("=" * 60)
    print("📊 Circuit Connect — Grafana v3.1 배포")
    print("=" * 60)

    for uid in ["circuit-ops-v2", "circuit-game-v2", "circuit-quality-v2", "circuit-pipeline-v3", "circuit-game-v3"]:
        deleted = delete_dashboard(uid, args.grafana_url, args.user, args.password)
        print(f"  {'삭제' if deleted else 'skip'}: {uid}")

    print(f"\n  🎨 Story={C_STORY} TA={C_TA} Clear={C_CLEAR} Fail={C_FAIL}")

    for name, model in [("Pipeline Operations", build_pipeline_ops_dashboard()), ("Game Analytics", build_game_dashboard())]:
        print(f"\n  배포: {name}...", end=" ")
        ok, result = deploy_dashboard(model, args.grafana_url, args.user, args.password)
        print(f"✅ {result.get('url', '')}" if ok else f"❌ {result}")

    print("\n✅ 완료: 색상 통일 + No data 수정 + avg/max→테이블")

if __name__ == "__main__":
    main()