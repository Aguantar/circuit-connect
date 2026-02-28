package com.circuit.flink.model;

/**
 * 세션 윈도우 집계 결과.
 * Flink Session Window(5분 gap)로 유저별 세션을 자동 감지해 집계.
 */
public class SessionSummary implements java.io.Serializable {

    private String userKey;
    private String sessionId;
    private long sessionStart;      // 세션 첫 이벤트 시각 (ms)
    private long sessionEnd;        // 세션 마지막 이벤트 시각 (ms)
    private long durationMs;        // sessionEnd - sessionStart
    private int totalEvents;        // 세션 내 이벤트 수
    private int stageClears;        // 클리어 수
    private int stageFails;         // 실패 수
    private int totalScore;         // 총 점수
    private String primaryMode;     // 주 활동 모드 (story/time_attack)
    private int distinctStages;     // 진행한 고유 스테이지 수
    private double avgClearTimeMs;  // 평균 클리어 시간
    private int universalUsed;      // 만능블럭 사용 수
    private int navigations;        // 화면 전환 수

    public SessionSummary() {}

    // Getters & Setters
    public String getUserKey()       { return userKey; }
    public void setUserKey(String v) { this.userKey = v; }

    public String getSessionId()       { return sessionId; }
    public void setSessionId(String v) { this.sessionId = v; }

    public long getSessionStart()       { return sessionStart; }
    public void setSessionStart(long v) { this.sessionStart = v; }

    public long getSessionEnd()       { return sessionEnd; }
    public void setSessionEnd(long v) { this.sessionEnd = v; }

    public long getDurationMs()       { return durationMs; }
    public void setDurationMs(long v) { this.durationMs = v; }

    public int getTotalEvents()       { return totalEvents; }
    public void setTotalEvents(int v) { this.totalEvents = v; }

    public int getStageClears()       { return stageClears; }
    public void setStageClears(int v) { this.stageClears = v; }

    public int getStageFails()       { return stageFails; }
    public void setStageFails(int v) { this.stageFails = v; }

    public int getTotalScore()       { return totalScore; }
    public void setTotalScore(int v) { this.totalScore = v; }

    public String getPrimaryMode()       { return primaryMode; }
    public void setPrimaryMode(String v) { this.primaryMode = v; }

    public int getDistinctStages()       { return distinctStages; }
    public void setDistinctStages(int v) { this.distinctStages = v; }

    public double getAvgClearTimeMs()       { return avgClearTimeMs; }
    public void setAvgClearTimeMs(double v) { this.avgClearTimeMs = v; }

    public int getUniversalUsed()       { return universalUsed; }
    public void setUniversalUsed(int v) { this.universalUsed = v; }

    public int getNavigations()       { return navigations; }
    public void setNavigations(int v) { this.navigations = v; }

    @Override
    public String toString() {
        return String.format("Session{user=%s, duration=%ds, clears=%d, score=%d, mode=%s}",
                userKey, durationMs / 1000, stageClears, totalScore, primaryMode);
    }
}
