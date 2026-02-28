package com.circuit.flink.model;

/**
 * 실시간 이상 탐지 알림.
 * 비현실적 플레이, 자동화 의심, 비정상 점수를 감지.
 */
public class AnomalyAlert implements java.io.Serializable {

    public enum AlertType {
        IMPOSSIBLE_CLEAR,    // clear_time_ms < 500ms (비현실적 클리어)
        RAPID_FIRE,          // 1분 내 10+ stage_clear (자동화 의심)
        SCORE_OVERFLOW,      // score가 이론적 최대값 초과
        SUSPICIOUS_PATTERN   // 기타 의심 패턴
    }

    private String userKey;
    private String sessionId;
    private AlertType alertType;
    private String description;
    private long detectedAt;       // 탐지 시각 (ms)
    private String eventId;        // 원인 이벤트 ID
    private String stageId;
    private int score;
    private long clearTimeMs;
    private int eventCount;        // RAPID_FIRE 시 1분 내 이벤트 수

    public AnomalyAlert() {}

    public AnomalyAlert(String userKey, AlertType alertType, String description, long detectedAt) {
        this.userKey = userKey;
        this.alertType = alertType;
        this.description = description;
        this.detectedAt = detectedAt;
    }

    // Getters & Setters
    public String getUserKey()         { return userKey; }
    public void setUserKey(String v)   { this.userKey = v; }

    public String getSessionId()         { return sessionId; }
    public void setSessionId(String v)   { this.sessionId = v; }

    public AlertType getAlertType()         { return alertType; }
    public void setAlertType(AlertType v)   { this.alertType = v; }

    public String getDescription()         { return description; }
    public void setDescription(String v)   { this.description = v; }

    public long getDetectedAt()         { return detectedAt; }
    public void setDetectedAt(long v)   { this.detectedAt = v; }

    public String getEventId()         { return eventId; }
    public void setEventId(String v)   { this.eventId = v; }

    public String getStageId()         { return stageId; }
    public void setStageId(String v)   { this.stageId = v; }

    public int getScore()         { return score; }
    public void setScore(int v)   { this.score = v; }

    public long getClearTimeMs()         { return clearTimeMs; }
    public void setClearTimeMs(long v)   { this.clearTimeMs = v; }

    public int getEventCount()         { return eventCount; }
    public void setEventCount(int v)   { this.eventCount = v; }

    @Override
    public String toString() {
        return String.format("ALERT{type=%s, user=%s, desc=%s}", alertType, userKey, description);
    }
}
