package com.circuit.flink.function;

import com.circuit.flink.model.AnomalyAlert;
import com.circuit.flink.model.AnomalyAlert.AlertType;
import com.circuit.flink.model.GameEvent;
import org.apache.flink.api.common.state.ListState;
import org.apache.flink.api.common.state.ListStateDescriptor;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

/**
 * 실시간 어뷰징/이상 탐지.
 *
 * ── 면접 포인트 ──
 * Q: "실시간 이상 탐지는?"
 * A: "Flink KeyedProcessFunction에서 유저별 State를 관리하며 3가지 규칙을 실시간 검사:
 *     ① 비현실적 클리어(< 500ms) — 봇/치트 의심
 *     ② 1분 내 10+ stage_clear — 자동화 의심
 *     ③ score 이론적 최대값 초과 — 메모리 해킹 의심
 *     FDS 파이프라인 경험에서 Rule Engine 패턴을 Flink에 적용했습니다."
 *
 * 탐지 규칙:
 * Rule 1: IMPOSSIBLE_CLEAR  — clear_time_ms < 500ms
 * Rule 2: RAPID_FIRE        — 1분 내 stage_clear 10회 이상
 * Rule 3: SCORE_OVERFLOW    — score > 이론적 최대값 (그리드별)
 */
public class AnomalyDetector extends KeyedProcessFunction<String, GameEvent, AnomalyAlert> {

    private static final Logger LOG = LoggerFactory.getLogger(AnomalyDetector.class);

    /** Rule 1: 최소 클리어 시간 임계값 (ms) */
    private static final long MIN_CLEAR_TIME_MS = 500;

    /** Rule 2: 시간 윈도우 (1분) 내 최대 클리어 수 */
    private static final int MAX_CLEARS_PER_MINUTE = 20;
    private static final long ONE_MINUTE_MS = 60_000;

    /** Rule 3: 그리드별 이론적 최대 점수 */
    private static final int MAX_SCORE_3X3 = 500;
    private static final int MAX_SCORE_4X4 = 600;
    private static final int MAX_SCORE_5X5 = 700;

    /** 최근 클리어 시각 리스트 (RAPID_FIRE 탐지용) */
    private transient ListState<Long> recentClearTimestamps;

    /** 총 알림 수 (통계용) */
    private transient ValueState<Long> alertCount;

    @Override
    public void open(Configuration parameters) {
        recentClearTimestamps = getRuntimeContext().getListState(
                new ListStateDescriptor<>("recent-clears", Types.LONG));
        alertCount = getRuntimeContext().getState(
                new ValueStateDescriptor<>("alert-count", Types.LONG));
    }

    @Override
    public void processElement(GameEvent event, Context ctx, Collector<AnomalyAlert> out)
            throws Exception {

        // stage_clear 이벤트만 검사
        if (!"stage_clear".equals(event.getEventType())) {
            return;
        }

        long now = event.getTimestamp();

        // ── Rule 1: IMPOSSIBLE_CLEAR ──
        if (event.getClearTimeMs() > 0 && event.getClearTimeMs() < MIN_CLEAR_TIME_MS) {
            AnomalyAlert alert = new AnomalyAlert(
                    event.getUserKey(),
                    AlertType.IMPOSSIBLE_CLEAR,
                    String.format("Cleared stage %s in %dms (< %dms threshold)",
                            event.getStageId(), event.getClearTimeMs(), MIN_CLEAR_TIME_MS),
                    now
            );
            alert.setSessionId(event.getSessionId());
            alert.setEventId(event.getEventId());
            alert.setStageId(event.getStageId());
            alert.setClearTimeMs(event.getClearTimeMs());
            alert.setScore(event.getScore());

            LOG.warn("ANOMALY | {}", alert);
            out.collect(alert);
            incrementAlertCount();
        }

        // ── Rule 2: RAPID_FIRE ──
        // 1분 윈도우 밖의 타임스탬프 제거
        List<Long> validTimestamps = new ArrayList<>();
        for (Long ts : recentClearTimestamps.get()) {
            if (now - ts <= ONE_MINUTE_MS) {
                validTimestamps.add(ts);
            }
        }
        validTimestamps.add(now);
        recentClearTimestamps.update(validTimestamps);

        if (validTimestamps.size() >= MAX_CLEARS_PER_MINUTE) {
            AnomalyAlert alert = new AnomalyAlert(
                    event.getUserKey(),
                    AlertType.RAPID_FIRE,
                    String.format("%d stage clears in 1 minute (threshold: %d)",
                            validTimestamps.size(), MAX_CLEARS_PER_MINUTE),
                    now
            );
            alert.setSessionId(event.getSessionId());
            alert.setEventId(event.getEventId());
            alert.setEventCount(validTimestamps.size());

            LOG.warn("ANOMALY | {}", alert);
            out.collect(alert);
            incrementAlertCount();
        }

        // ── Rule 3: SCORE_OVERFLOW ──
        int maxScore = getMaxScoreForGrid(event.getGridSize());
        if (event.getScore() > maxScore && maxScore > 0) {
            AnomalyAlert alert = new AnomalyAlert(
                    event.getUserKey(),
                    AlertType.SCORE_OVERFLOW,
                    String.format("Score %d exceeds max %d for grid %s",
                            event.getScore(), maxScore, event.getGridSize()),
                    now
            );
            alert.setSessionId(event.getSessionId());
            alert.setEventId(event.getEventId());
            alert.setStageId(event.getStageId());
            alert.setScore(event.getScore());

            LOG.warn("ANOMALY | {}", alert);
            out.collect(alert);
            incrementAlertCount();
        }
    }

    private int getMaxScoreForGrid(String gridSize) {
        if (gridSize == null) return 0;
        switch (gridSize) {
            case "3x3": return MAX_SCORE_3X3;
            case "3x4": case "4x3": return MAX_SCORE_4X4;
            case "4x4": return MAX_SCORE_4X4;
            case "5x5": return MAX_SCORE_5X5;
            default: return MAX_SCORE_5X5; // 보수적
        }
    }

    private void incrementAlertCount() throws Exception {
        Long count = alertCount.value();
        alertCount.update(count == null ? 1 : count + 1);
    }
}
