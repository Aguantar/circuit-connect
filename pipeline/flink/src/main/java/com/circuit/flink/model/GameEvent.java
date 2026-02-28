package com.circuit.flink.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Circuit Connect v2 게임 이벤트.
 * Kafka 'game-events' 토픽에서 소비되는 정형 이벤트.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class GameEvent implements java.io.Serializable {

    @JsonProperty("event_id")      private String eventId;
    @JsonProperty("event_type")    private String eventType;
    @JsonProperty("user_key")      private String userKey;
    @JsonProperty("session_id")    private String sessionId;
    @JsonProperty("timestamp")     private long timestamp;        // server_ts (ms)
    @JsonProperty("client_timestamp") private long clientTimestamp; // client_ts (ms)
    @JsonProperty("app_version")   private String appVersion;
    @JsonProperty("schema_version") private String schemaVersion;
    @JsonProperty("seq")            private int seq;

    // 게임 컨텍스트
    @JsonProperty("mode")          private String mode;
    @JsonProperty("stage_id")      private String stageId;
    @JsonProperty("grid_size")     private String gridSize;
    @JsonProperty("time_limit_sec") private int timeLimitSec;

    // 플레이 결과
    @JsonProperty("clear_time_ms") private long clearTimeMs;
    @JsonProperty("taps")          private int taps;
    @JsonProperty("score")         private int score;
    @JsonProperty("bonus_collected") private int bonusCollected;
    @JsonProperty("universal_used") private int universalUsed;
    @JsonProperty("completion_pct") private int completionPct;

    // 세션
    @JsonProperty("duration_ms")   private long durationMs;
    @JsonProperty("platform")      private String platform;

    // 퍼널
    @JsonProperty("from_screen")   private String fromScreen;
    @JsonProperty("to_screen")     private String toScreen;

    // 아이템
    @JsonProperty("action")        private String action;
    @JsonProperty("item_type")     private String itemType;
    @JsonProperty("reason")        private String reason;

    public GameEvent() {}

    // Getters
    public String getEventId()       { return eventId; }
    public String getEventType()     { return eventType; }
    public String getUserKey()       { return userKey; }
    public String getSessionId()     { return sessionId; }
    public long getTimestamp()        { return timestamp; }
    public long getClientTimestamp()  { return clientTimestamp; }
    public String getAppVersion()    { return appVersion; }
    public String getSchemaVersion() { return schemaVersion; }
    public int getSeq()              { return seq; }
    public void setSeq(int seq)      { this.seq = seq; }
    public String getMode()          { return mode; }
    public String getStageId()       { return stageId; }
    public String getGridSize()      { return gridSize; }
    public int getTimeLimitSec()     { return timeLimitSec; }
    public long getClearTimeMs()     { return clearTimeMs; }
    public int getTaps()             { return taps; }
    public int getScore()            { return score; }
    public int getBonusCollected()   { return bonusCollected; }
    public int getUniversalUsed()    { return universalUsed; }
    public int getCompletionPct()    { return completionPct; }
    public long getDurationMs()      { return durationMs; }
    public String getPlatform()      { return platform; }
    public String getFromScreen()    { return fromScreen; }
    public String getToScreen()      { return toScreen; }
    public String getAction()        { return action; }
    public String getItemType()      { return itemType; }
    public String getReason()        { return reason; }

    /** server_ts - client_ts 지연(ms). 양수면 서버가 나중에 받음 */
    public long getLatencyMs() {
        return timestamp - clientTimestamp;
    }

    @Override
    public String toString() {
        return String.format("GameEvent{type=%s, user=%s, session=%s, stage=%s, score=%d}",
                eventType, userKey, sessionId, stageId, score);
    }
}
