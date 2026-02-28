package com.circuit.flink.function;

import com.circuit.flink.model.GameEvent;
import com.circuit.flink.model.SessionSummary;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 세션 윈도우 집계 — 유저별 세션 요약 생성.
 *
 * ── 포트폴리오 가치 ──
 * "Flink Session Window(5분 gap)로 유저별 세션을 자동 감지하고 실시간 집계."
 * - 세션 경계를 명시적 이벤트(session_start/end) 없이도 자동 판별
 * - 스토리/타임어택 혼합 세션 감지 → primaryMode 자동 결정
 */
public class SessionAggregator
        extends ProcessWindowFunction<GameEvent, SessionSummary, String, TimeWindow> {

    @Override
    public void process(String userKey,
                        ProcessWindowFunction<GameEvent, SessionSummary, String, TimeWindow>.Context context,
                        Iterable<GameEvent> events,
                        Collector<SessionSummary> out) {

        SessionSummary summary = new SessionSummary();
        summary.setUserKey(userKey);

        long minTs = Long.MAX_VALUE;
        long maxTs = Long.MIN_VALUE;
        int totalEvents = 0;
        int clears = 0;
        int fails = 0;
        int totalScore = 0;
        int universalUsed = 0;
        int navigations = 0;
        long totalClearTime = 0;
        int clearCount = 0;
        Set<String> stages = new HashSet<>();
        Map<String, Integer> modeCounts = new HashMap<>();
        String sessionId = null;

        for (GameEvent e : events) {
            totalEvents++;

            // 시간 범위
            if (e.getTimestamp() < minTs) minTs = e.getTimestamp();
            if (e.getTimestamp() > maxTs) maxTs = e.getTimestamp();

            // 세션 ID (첫 이벤트에서 가져옴)
            if (sessionId == null && e.getSessionId() != null) {
                sessionId = e.getSessionId();
            }

            // 이벤트 타입별 집계
            String type = e.getEventType();
            if ("stage_clear".equals(type)) {
                clears++;
                totalScore += e.getScore();
                universalUsed += e.getUniversalUsed();
                if (e.getClearTimeMs() > 0) {
                    totalClearTime += e.getClearTimeMs();
                    clearCount++;
                }
            } else if ("stage_fail".equals(type)) {
                fails++;
            } else if ("navigation".equals(type)) {
                navigations++;
            }

            // 스테이지 추적
            if (e.getStageId() != null && !e.getStageId().isEmpty()) {
                stages.add(e.getStageId());
            }

            // 모드 카운트 (primaryMode 결정용)
            if (e.getMode() != null && !e.getMode().isEmpty()) {
                modeCounts.merge(e.getMode(), 1, Integer::sum);
            }
        }

        // primaryMode: 가장 많이 등장한 모드
        String primaryMode = modeCounts.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("unknown");

        summary.setSessionId(sessionId != null ? sessionId : "unknown");
        summary.setSessionStart(minTs);
        summary.setSessionEnd(maxTs);
        summary.setDurationMs(maxTs - minTs);
        summary.setTotalEvents(totalEvents);
        summary.setStageClears(clears);
        summary.setStageFails(fails);
        summary.setTotalScore(totalScore);
        summary.setPrimaryMode(primaryMode);
        summary.setDistinctStages(stages.size());
        summary.setAvgClearTimeMs(clearCount > 0 ? (double) totalClearTime / clearCount : 0);
        summary.setUniversalUsed(universalUsed);
        summary.setNavigations(navigations);

        out.collect(summary);
    }
}
