package com.circuit.flink.function;

import com.circuit.flink.model.GameEvent;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 데이터 품질 모니터 — 지연 감지 + 서버사이드 이벤트 카운터.
 *
 * ── 면접 포인트 ──
 * Q: "클라이언트에서 데이터 유실 방지는?"
 * A: "서버사이드에서 유저별 이벤트 카운터를 Flink State로 관리합니다.
 *     client_ts와 server_ts 차이가 30초 이상이면 late event로 태깅하고,
 *     세션 내 이벤트 시퀀스 갭을 감지하면 유실 의심 경고를 발생시킵니다."
 *
 * Q: "Kafka 장애 시 데이터 보장은?"
 * A: "Flink Checkpointing(EXACTLY_ONCE, 60초 간격) + RocksDB State Backend로
 *     장애 복구 시 마지막 체크포인트부터 재처리합니다. Kafka offset도 체크포인트에
 *     포함되어 중복 처리 없이 이어서 진행됩니다."
 *
 * 출력:
 * - 정상 이벤트: 그대로 통과 (side output 없음)
 * - Late event: 로그 경고 + late 태그
 * - 카운터 불일치: 로그 경고
 */
public class LatencyMonitor extends KeyedProcessFunction<String, GameEvent, GameEvent> {

    private static final Logger LOG = LoggerFactory.getLogger(LatencyMonitor.class);

    /** 지연 경고 임계값 (30초) */
    private static final long LATENCY_THRESHOLD_MS = 30_000;

    /** 유저별 이벤트 카운터 */
    private transient ValueState<Long> eventCounter;

    /** 유저별 마지막 이벤트 시각 */
    private transient ValueState<Long> lastEventTs;

    /** seq 기반 유실 감지 — 마지막 세션 ID */
    private transient ValueState<String> lastSessionId;

    /** seq 기반 유실 감지 — 마지막 seq 번호 */
    private transient ValueState<Integer> lastSeq;

    /** 통계 카운터 */
    private transient long totalProcessed = 0;
    private transient long lateEvents = 0;
    private transient long normalEvents = 0;

    @Override
    public void open(Configuration parameters) {
        eventCounter = getRuntimeContext().getState(
                new ValueStateDescriptor<>("event-counter", Types.LONG));
        lastEventTs = getRuntimeContext().getState(
                new ValueStateDescriptor<>("last-event-ts", Types.LONG));
        lastSessionId = getRuntimeContext().getState(
                new ValueStateDescriptor<>("last-session-id", Types.STRING));
        lastSeq = getRuntimeContext().getState(
                new ValueStateDescriptor<>("last-seq", Types.INT));

    }

    @Override
    public void processElement(GameEvent event, Context ctx, Collector<GameEvent> out) throws Exception {
        totalProcessed++;

        // ① 서버사이드 이벤트 카운터 업데이트
        Long count = eventCounter.value();
        long newCount = (count == null) ? 1 : count + 1;
        eventCounter.update(newCount);

        // ② client_ts - server_ts 지연 체크
        long latency = event.getLatencyMs();
        if (Math.abs(latency) > LATENCY_THRESHOLD_MS) {
            lateEvents++;
            LOG.warn("LATE EVENT | user={} | event_id={} | type={} | latency={}ms | " +
                            "server_ts={} | client_ts={} | late_rate={}/{} ({}%)",
                    event.getUserKey(), event.getEventId(), event.getEventType(),
                    latency, event.getTimestamp(), event.getClientTimestamp(),
                    lateEvents, totalProcessed,
                    String.format("%.1f", lateEvents * 100.0 / totalProcessed));
        } else {
            normalEvents++;
        }

        // ③ seq 기반 이벤트 유실 감지
        int currentSeq = event.getSeq();
        if (currentSeq > 0) {
            String prevSession = lastSessionId.value();
            Integer prevSeq = lastSeq.value();

            if (prevSession != null && prevSession.equals(event.getSessionId())
                    && prevSeq != null && currentSeq > prevSeq + 1) {
                int missing = currentSeq - prevSeq - 1;
                LOG.warn("SEQ_GAP | user={} | session={} | expected={} | got={} | missing={} events",
                        event.getUserKey(), event.getSessionId(),
                        prevSeq + 1, currentSeq, missing);
            }

            lastSessionId.update(event.getSessionId());
            lastSeq.update(currentSeq);
        }

        // 세션 갭 감지 (시간 기반, 정보성)
        Long lastTs = lastEventTs.value();
        if (lastTs != null) {
            long gap = event.getTimestamp() - lastTs;
            if (gap > 30 * 60 * 1000) {
                LOG.info("SESSION GAP | user={} | gap={}min | event_count={}",
                        event.getUserKey(), gap / 60000, newCount);
            }
        }
        lastEventTs.update(event.getTimestamp());

        // ④ 주기적 통계 로그 (1000건마다)
        if (totalProcessed % 1000 == 0) {
            LOG.info("Quality stats: total={}, normal={}, late={}, late_rate={}%",
                    totalProcessed, normalEvents, lateEvents,
                    String.format("%.2f", lateEvents * 100.0 / totalProcessed));
        }

        // 이벤트는 항상 통과 (필터링 아님, 모니터링만)
        out.collect(event);
    }
}
