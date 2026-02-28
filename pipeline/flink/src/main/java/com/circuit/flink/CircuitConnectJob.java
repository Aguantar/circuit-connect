package com.circuit.flink;

import com.circuit.flink.function.*;
import com.circuit.flink.model.AnomalyAlert;
import com.circuit.flink.model.GameEvent;
import com.circuit.flink.model.SessionSummary;
import com.circuit.flink.sink.ClickHouseSinks;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.assigners.ProcessingTimeSessionWindows;
import org.apache.flink.streaming.api.windowing.time.Time;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;

/**
 * Circuit Connect "불을 켜줘!" — Flink 실시간 스트림 처리 Job.
 *
 * ┌──────────────┐
 * │ Kafka:       │
 * │ game-events  │
 * └──────┬───────┘
 *        │
 *   GameEventParser (JSON → GameEvent, v2 필터)
 *        │
 *   DuplicateFilter (event_id 기반 중복 제거)
 *        │
 *   LatencyMonitor (지연 감지 + 이벤트 카운터)
 *        │
 *   ┌────┴──────────────────┐
 *   │                       │
 * Stream 1               Stream 2
 * SessionAggregator      AnomalyDetector
 * (5min gap window)      (3 rules)
 *   │                       │
 *   ▼                       ▼
 * fact_sessions          game_alerts
 * (ClickHouse)           (ClickHouse)
 *
 * ── 면접 질문 커버 ──
 * ✅ "이벤트 중복/유실은 어떻게 처리하나?" → DuplicateFilter (event_id + Keyed State + TTL)
 * ✅ "Kafka 장애 시 데이터 보장은?"       → Checkpointing (EXACTLY_ONCE) + RocksDB
 * ✅ "클라이언트에서 데이터 유실 방지는?" → LatencyMonitor (서버사이드 카운터 + 지연 경고)
 * ✅ "실시간 이상 탐지는?"               → AnomalyDetector (3 rules: impossible/rapid/overflow)
 */
public class CircuitConnectJob {

    private static final Logger LOG = LoggerFactory.getLogger(CircuitConnectJob.class);

    public static void main(String[] args) throws Exception {

        // ── 1. 실행 환경 설정 ──
        final StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setParallelism(1);  // 미니PC 리소스 절약 (slot 1개)

        // ── 2. 환경변수에서 설정 읽기 ──
        String bootstrapServers = System.getenv().getOrDefault(
                "KAFKA_BOOTSTRAP_SERVERS",
                "kafka-1:29092,kafka-2:29093,kafka-3:29094"
        );
        String clickhouseUrl = System.getenv().getOrDefault(
                "CLICKHOUSE_URL",
                "jdbc:clickhouse://clickhouse:8123/circuit_connect"
        );

        // ── 3. Kafka Source ──
        KafkaSource<String> kafkaSource = KafkaSource.<String>builder()
                .setBootstrapServers(bootstrapServers)
                .setTopics("game-events")
                .setGroupId("flink-circuit-connect")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        // ── 4. Source → 파싱 → 중복 제거 → 품질 모니터링 ──
        // 4a. JSON 파싱 (v2만 통과)
        DataStream<GameEvent> parsedEvents = env
                .fromSource(kafkaSource, WatermarkStrategy.noWatermarks(), "Kafka game-events")
                .flatMap(new GameEventParser())
                .name("v2 Event Parser");

        // 4b. 중복 제거 (event_id 기반)
        DataStream<GameEvent> deduplicated = parsedEvents
                .keyBy(GameEvent::getEventId)
                .filter(new DuplicateFilter())
                .name("Dedup Filter");

        // 4c. 데이터 품질 모니터링 (지연 감지 + 이벤트 카운터)
        SingleOutputStreamOperator<GameEvent> qualityChecked = deduplicated
                .keyBy(GameEvent::getUserKey)
                .process(new LatencyMonitor())
                .name("Quality Monitor");

        // ── 5. Stream 1: 세션 윈도우 집계 → ClickHouse ──
        DataStream<SessionSummary> sessions = qualityChecked
                .keyBy(GameEvent::getUserKey)
                .window(ProcessingTimeSessionWindows.withGap(Time.minutes(5)))
                .process(new SessionAggregator())
                .name("Session Aggregator");

        sessions.print("SESSION");
        sessions.addSink(ClickHouseSinks.sessionSink(clickhouseUrl))
                .name("ClickHouse Session Sink");

        // ── 6. Stream 2: 이상 탐지 → ClickHouse ──
        DataStream<AnomalyAlert> alerts = qualityChecked
                .keyBy(GameEvent::getUserKey)
                .process(new AnomalyDetector())
                .name("Anomaly Detector");

        alerts.print("ALERT");
        alerts.addSink(ClickHouseSinks.alertSink(clickhouseUrl))
                .name("ClickHouse Alert Sink");

        // ── 7. 실행 ──
        LOG.info("=== Circuit Connect Flink Job Started ===");
        LOG.info("Kafka: {}", bootstrapServers);
        LOG.info("ClickHouse: {}", clickhouseUrl);
        LOG.info("Topic: game-events");
        LOG.info("Parallelism: {}", env.getParallelism());
        LOG.info("Session Window Gap: 5 minutes");
        LOG.info("Dedup TTL: 1 hour");
        LOG.info("Latency Threshold: 30 seconds");
        LOG.info("Anomaly Rules: IMPOSSIBLE_CLEAR(<500ms), RAPID_FIRE(10/min), SCORE_OVERFLOW");

        env.execute("Circuit Connect Stream Processing");
    }
}
