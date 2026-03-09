# Circuit Connect — 이벤트 스키마 v2 컬럼 명세

> `circuit_connect.game_events` 테이블 (31개 컬럼)

## 공통 필드 (모든 이벤트에 존재)

| # | 컬럼명 | 타입 | 설명 |
|---|--------|------|------|
| 1 | `event_id` | UUID | 이벤트 고유 식별자. 중복 제거(DuplicateFilter)의 기준 키 |
| 2 | `event_type` | LowCardinality(String) | 이벤트 종류. `session_start`, `session_end`, `stage_start`, `stage_clear`, `stage_fail`, `item_use`, `navigation`, `time_attack_end` 중 하나 |
| 3 | `user_key` | String | 유저 식별자 |
| 4 | `session_id` | String | 세션 식별자. SessionAggregator에서 세션 윈도우 키로 사용 |
| 5 | `timestamp` | DateTime64(3) | 서버 수신 시각 (UTC, 밀리초 정밀도) |
| 6 | `client_timestamp` | DateTime64(3) | 클라이언트 발생 시각 (UTC). `timestamp`와의 차이로 지연(LatencyMonitor) 감지 |
| 7 | `event_date` | Date | 이벤트 날짜. 파티션 키 (`PARTITION BY toYYYYMM(event_date)`), 시간 필터 조건 |
| 8 | `app_version` | LowCardinality(String) | 프론트엔드 앱 버전 |
| 9 | `schema_version` | LowCardinality(String) | 스키마 버전. 현재 `"2"`. v1/v2 혼재 시 필터링 용도 |
| 10 | `seq` | UInt16 | 클라이언트 측 이벤트 순서 번호. 전 구간(프론트→백엔드→Flink→ClickHouse) 이벤트 누락 감지 |
| 11 | `platform` | LowCardinality(String) | 접속 플랫폼. `android`, `web`, `ios` 등 |

## 스테이지 관련 필드 (stage_start / stage_clear / stage_fail)

| # | 컬럼명 | 타입 | 설명 |
|---|--------|------|------|
| 12 | `mode` | LowCardinality(String) | 게임 모드. `story` 또는 `time_attack` |
| 13 | `stage_id` | String | 스테이지 식별자. 스토리: `1`~`50`, 타임어택: `ta-1` |
| 14 | `grid_size` | LowCardinality(String) | 그리드 크기. `3x3`, `4x4`, `5x5`, `6x6` |
| 15 | `time_limit_sec` | UInt16 | 타임어택 제한 시간(초). `60`, `120`, `180`. 스토리 모드는 0 |
| 16 | `clear_time_ms` | UInt32 | 스테이지 클리어 소요 시간(밀리초). `stage_clear` 전용. AnomalyDetector의 IMPOSSIBLE_CLEAR 기준 (< 500ms) |
| 17 | `taps` | UInt16 | 셀 탭(회전) 횟수. `stage_clear` / `stage_fail` 전용 |
| 18 | `score` | UInt32 | 획득 점수. AnomalyDetector의 SCORE_OVERFLOW 기준 |
| 19 | `bonus_collected` | UInt8 | 보너스 셀 수집 개수 |
| 20 | `universal_used` | UInt8 | 만능블럭 사용 횟수 |
| 21 | `completion_pct` | UInt8 | 스테이지 진행률 (0~100). `stage_fail` 시 어디까지 진행했는지 파악 |

## 세션/시간 필드

| # | 컬럼명 | 타입 | 설명 |
|---|--------|------|------|
| 22 | `duration_ms` | UInt32 | 세션 또는 타임어택 라운드 지속 시간(밀리초) |
| 23 | `elapsed_ms` | UInt32 | 스테이지 내 경과 시간(밀리초) |

## 아이템 필드 (item_use)

| # | 컬럼명 | 타입 | 설명 |
|---|--------|------|------|
| 24 | `action` | LowCardinality(String) | 아이템 행동. `purchase` (구매) 또는 `use` (사용) |
| 25 | `item_type` | LowCardinality(String) | 아이템 종류. `universal_block` (만능블럭) |
| 26 | `reason` | LowCardinality(String) | 행동 사유 또는 부가 정보 |
| 27 | `cost` | UInt16 | 아이템 구매 비용 (포인트). 만능블럭: 200 |
| 28 | `remaining` | UInt8 | 아이템 사용/구매 후 잔여 개수 |

## 화면 이동 필드 (navigation)

| # | 컬럼명 | 타입 | 설명 |
|---|--------|------|------|
| 29 | `from_screen` | LowCardinality(String) | 출발 화면. `title`, `stageSelect`, `game`, `leaderboard`, `timeAttackSelect`, `timeAttack`, `timeAttackResult` |
| 30 | `to_screen` | LowCardinality(String) | 도착 화면 |

## 확장 필드

| # | 컬럼명 | 타입 | 설명 |
|---|--------|------|------|
| 31 | `extra` | String | 예외적 데이터를 위한 JSON 문자열. 스키마 확장 없이 임시 데이터 수용 |

---

## 이벤트 타입별 주요 사용 컬럼

| 이벤트 | 공통 11개 + 주로 사용하는 컬럼 |
|--------|------|
| `session_start` | 공통 필드만 |
| `session_end` | `duration_ms` |
| `stage_start` | `mode`, `stage_id`, `grid_size`, `time_limit_sec` |
| `stage_clear` | `mode`, `stage_id`, `grid_size`, `clear_time_ms`, `taps`, `score`, `bonus_collected`, `universal_used` |
| `stage_fail` | `mode`, `stage_id`, `grid_size`, `taps`, `completion_pct`, `elapsed_ms` |
| `item_use` | `mode`, `stage_id`, `action`, `item_type`, `cost`, `remaining` |
| `navigation` | `from_screen`, `to_screen`, `mode` |
| `time_attack_end` | `mode`, `duration_ms`, `score` |

사용하지 않는 컬럼은 DEFAULT 값(빈 문자열 또는 0)으로 저장되며, ClickHouse의 컬럼 지향 저장 방식 덕분에 저장 효율에 영향이 거의 없습니다.
