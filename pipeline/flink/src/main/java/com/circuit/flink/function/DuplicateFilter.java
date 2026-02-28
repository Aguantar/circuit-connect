package com.circuit.flink.function;

import com.circuit.flink.model.GameEvent;
import org.apache.flink.api.common.functions.RichFilterFunction;
import org.apache.flink.api.common.state.StateTtlConfig;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.time.Time;
import org.apache.flink.configuration.Configuration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * event_id 기반 Exactly-Once 중복 제거.
 *
 * ── 면접 포인트 ──
 * Q: "이벤트 중복은 어떻게 처리하나?"
 * A: "Flink의 Keyed State에 event_id를 저장하고, 이미 처리된 이벤트는 필터링합니다.
 *     TTL 1시간으로 메모리를 관리하고, RocksDB State Backend + Checkpointing으로
 *     장애 복구 시에도 정확히 한 번(exactly-once) 처리를 보장합니다."
 *
 * 동작 원리:
 * 1. event_id를 key로 사용하여 Keyed State 조회
 * 2. State에 있으면 → 중복 → 필터링
 * 3. State에 없으면 → 신규 → State에 저장 + 통과
 * 4. TTL 1시간 후 자동 만료 (메모리 절약)
 */
public class DuplicateFilter extends RichFilterFunction<GameEvent> {

    private static final Logger LOG = LoggerFactory.getLogger(DuplicateFilter.class);

    /** event_id 존재 여부를 저장하는 State. true면 이미 처리됨 */
    private transient ValueState<Boolean> seenState;

    /** 중복 제거 통계 (로그용) */
    private transient long totalEvents = 0;
    private transient long duplicateEvents = 0;

    @Override
    public void open(Configuration parameters) {
        // TTL 설정: 1시간 후 자동 만료 → 메모리 관리
        StateTtlConfig ttlConfig = StateTtlConfig.newBuilder(Time.hours(1))
                .setUpdateType(StateTtlConfig.UpdateType.OnCreateAndWrite)
                .setStateVisibility(StateTtlConfig.StateVisibility.NeverReturnExpired)
                .cleanupFullSnapshot()
                .build();

        ValueStateDescriptor<Boolean> descriptor =
                new ValueStateDescriptor<>("seen-event", Boolean.class);
        descriptor.enableTimeToLive(ttlConfig);

        seenState = getRuntimeContext().getState(descriptor);
    }

    @Override
    public boolean filter(GameEvent event) throws Exception {
        totalEvents++;

        Boolean seen = seenState.value();
        if (seen != null && seen) {
            // 중복 이벤트 — 필터링
            duplicateEvents++;
            if (duplicateEvents % 100 == 0) {
                LOG.info("Dedup stats: total={}, duplicates={}, rate={}%",
                        totalEvents, duplicateEvents,
                        String.format("%.1f", duplicateEvents * 100.0 / totalEvents));
            }
            return false;
        }

        // 신규 이벤트 — State에 기록 후 통과
        seenState.update(true);
        return true;
    }
}
