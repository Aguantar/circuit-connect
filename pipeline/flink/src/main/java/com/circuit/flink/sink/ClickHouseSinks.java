package com.circuit.flink.sink;

import com.circuit.flink.model.AnomalyAlert;
import com.circuit.flink.model.SessionSummary;
import org.apache.flink.connector.jdbc.JdbcConnectionOptions;
import org.apache.flink.connector.jdbc.JdbcExecutionOptions;
import org.apache.flink.connector.jdbc.JdbcSink;
import org.apache.flink.streaming.api.functions.sink.SinkFunction;

/**
 * ClickHouse JDBC Sink 팩토리.
 * 세션 집계, 이상 탐지 알림을 ClickHouse에 저장.
 */
public class ClickHouseSinks {

    private static final int BATCH_SIZE = 500;
    private static final int BATCH_INTERVAL_MS = 5000;
    private static final int MAX_RETRIES = 3;

    private static JdbcExecutionOptions executionOptions() {
        return JdbcExecutionOptions.builder()
                .withBatchSize(BATCH_SIZE)
                .withBatchIntervalMs(BATCH_INTERVAL_MS)
                .withMaxRetries(MAX_RETRIES)
                .build();
    }

    private static JdbcConnectionOptions connectionOptions(String url) {
        return new JdbcConnectionOptions.JdbcConnectionOptionsBuilder()
                .withUrl(url)
                .withDriverName("com.clickhouse.jdbc.ClickHouseDriver")
                .build();
    }

    /**
     * 세션 집계 결과 → circuit_connect.fact_sessions
     */
    public static SinkFunction<SessionSummary> sessionSink(String clickhouseUrl) {
        return JdbcSink.sink(
                "INSERT INTO circuit_connect.fact_sessions " +
                        "(user_key, session_id, session_start, session_end, duration_ms, " +
                        "total_events, stage_clears, stage_fails, total_score, primary_mode, " +
                        "distinct_stages, avg_clear_time_ms, universal_used, navigations) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (ps, s) -> {
                    ps.setString(1, s.getUserKey());
                    ps.setString(2, s.getSessionId());
                    ps.setLong(3, s.getSessionStart());
                    ps.setLong(4, s.getSessionEnd());
                    ps.setLong(5, s.getDurationMs());
                    ps.setInt(6, s.getTotalEvents());
                    ps.setInt(7, s.getStageClears());
                    ps.setInt(8, s.getStageFails());
                    ps.setInt(9, s.getTotalScore());
                    ps.setString(10, s.getPrimaryMode());
                    ps.setInt(11, s.getDistinctStages());
                    ps.setDouble(12, s.getAvgClearTimeMs());
                    ps.setInt(13, s.getUniversalUsed());
                    ps.setInt(14, s.getNavigations());
                },
                executionOptions(),
                connectionOptions(clickhouseUrl)
        );
    }

    /**
     * 이상 탐지 알림 → circuit_connect.game_alerts
     */
    public static SinkFunction<AnomalyAlert> alertSink(String clickhouseUrl) {
        return JdbcSink.sink(
                "INSERT INTO circuit_connect.game_alerts " +
                        "(user_key, session_id, alert_type, description, detected_at, " +
                        "event_id, stage_id, score, clear_time_ms, event_count) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (ps, a) -> {
                    ps.setString(1, a.getUserKey());
                    ps.setString(2, a.getSessionId() != null ? a.getSessionId() : "");
                    ps.setString(3, a.getAlertType().name());
                    ps.setString(4, a.getDescription());
                    ps.setLong(5, a.getDetectedAt());
                    ps.setString(6, a.getEventId() != null ? a.getEventId() : "");
                    ps.setString(7, a.getStageId() != null ? a.getStageId() : "");
                    ps.setInt(8, a.getScore());
                    ps.setLong(9, a.getClearTimeMs());
                    ps.setInt(10, a.getEventCount());
                },
                executionOptions(),
                connectionOptions(clickhouseUrl)
        );
    }
}
