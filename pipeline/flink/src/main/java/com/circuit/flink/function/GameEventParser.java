package com.circuit.flink.function;

import com.circuit.flink.model.GameEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.api.common.functions.FlatMapFunction;
import org.apache.flink.util.Collector;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Kafka JSON 메시지 → GameEvent 파싱.
 * 파싱 실패 시 로그 남기고 스킵 (파이프라인 중단 방지).
 */
public class GameEventParser implements FlatMapFunction<String, GameEvent> {

    private static final Logger LOG = LoggerFactory.getLogger(GameEventParser.class);
    private transient ObjectMapper mapper;

    @Override
    public void flatMap(String value, Collector<GameEvent> out) {
        if (mapper == null) {
            mapper = new ObjectMapper();
        }
        try {
            GameEvent event = mapper.readValue(value, GameEvent.class);

            // v2 이벤트만 처리
            if (!"2".equals(event.getSchemaVersion())) {
                return;
            }

            // 필수 필드 검증
            if (event.getEventId() == null || event.getEventType() == null
                    || event.getUserKey() == null) {
                LOG.warn("Missing required fields: {}", value.substring(0, Math.min(200, value.length())));
                return;
            }

            out.collect(event);
        } catch (Exception e) {
            LOG.error("Parse error: {} | raw: {}", e.getMessage(),
                    value.substring(0, Math.min(200, value.length())));
        }
    }
}
