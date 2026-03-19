# ⚡ Circuit Connect — "불을 켜줘!"

> **실시간 데이터 파이프라인이 내장된 퍼즐 게임**  
> 토스 앱인토스 미니앱 + 데이터 엔지니어링 포트폴리오

<br>

## 🔗 라이브 데모

| | URL |
|---|---|
| **🎮 게임 플레이** | [circuit.calmee.store](https://circuit.calmee.store) |
| **📊 파이프라인 대시보드** | [grafana.calmee.store](https://grafana.calmee.store) |
| **📱 원스토어** | 검색: "Circuit Connect" (전체이용가, 판매중) |
| **📱 앱인토스** | 등록완료 / 게임 -> 신규 탭 '불을 켜줘' |

<br>

## 📌 프로젝트 요약

| 항목 | 내용 |
|------|------|
| **한 줄 요약** | 퍼즐 게임의 유저 행동 이벤트를 실시간으로 수집·처리·분석하는 End-to-End 데이터 파이프라인 |
| **게임** | 전선을 연결해 전구에 불을 켜는 논리 퍼즐 (스토리 5챕터 × 10스테이지 + 타임어택) |
| **핵심 스택** | React · FastAPI · Kafka · Flink · ClickHouse · Grafana |
| **인프라** | 미니PC 홈서버 24/7 운영 (Intel N100, 16GB RAM, Ubuntu 24.04) |
| **현재 상태** | 실서비스 운영 중 (원스토어 판매중, 앱인토스 검수 대기) |

<br>

## 🏗️ 아키텍처

<p align="center">
  <img src="./docs/architecture.svg" alt="Architecture Diagram" width="100%"/>
</p>

<details>
<summary>Mermaid 소스 (클릭하여 펼치기)</summary>

```mermaid
flowchart TB
    subgraph CLIENT["🎮 Client"]
        FE["React + TypeScript<br/>(Vite)"]
    end

    subgraph BACKEND["⚙️ Backend"]
        API["FastAPI<br/>POST /api/v1/events"]
    end

    subgraph KAFKA["📨 Kafka Cluster (3-broker)"]
        GE_TOPIC["game-events"]
        CDC_TOPIC["circuit-connect.public.*"]
    end

    subgraph STREAM["🔄 Stream Processing"]
        FLINK["Flink 1.18 (Java)"]
        DP["DuplicateFilter<br/>event_id 기반 중복 제거"]
        LM["LatencyMonitor<br/>서버-클라이언트 지연 감지"]
        SA["SessionAggregator<br/>5분 gap 세션 윈도우"]
        AD["AnomalyDetector<br/>3-Rule 이상 탐지"]
    end

    subgraph STORAGE["💾 ClickHouse (Star Schema)"]
        FACT["game_events<br/>(MergeTree, 31 컬럼)"]
        MV1["mv_daily_user_summary<br/>(SummingMergeTree)"]
        MV2["mv_stage_difficulty<br/>(AggregatingMergeTree)"]
        FS["fact_sessions"]
        GA["game_alerts"]
        DIM["dim_users / dim_leaderboard<br/>(ReplacingMergeTree)"]
    end

    subgraph CDC["🔁 CDC"]
        PG["PostgreSQL 15"]
        DBZ["Debezium 2.5"]
    end

    subgraph VIZ["📊 Grafana Dashboards"]
        D1["Pipeline Operations<br/>운영+품질"]
        D2["Game Analytics<br/>밸런싱·리텐션"]
    end

    subgraph BACKUP["📁 일일 백업"]
        N8N["n8n 워크플로우<br/>매일 01:00 KST"]
        GS["Google Sheets"]
        ALERT["Slack + Gmail 알림"]
    end

    FE -- "v2 이벤트 (8종)" --> API
    API -- "aiokafka produce" --> GE_TOPIC

    GE_TOPIC -- "group: clickhouse-*" --> FACT
    GE_TOPIC -- "group: flink-*" --> FLINK

    FLINK --> DP --> LM
    LM --> SA --> FS
    LM --> AD --> GA

    FACT --> MV1
    FACT --> MV2

    PG -- "WAL" --> DBZ --> CDC_TOPIC --> DIM

    FACT --> D1 & D2
    MV1 --> D1 & D2
    MV2 --> D2
    FS --> D1
    GA --> D1
    DIM --> D2

    FACT --> N8N --> GS
    N8N --> ALERT

    classDef client fill:#1a1a2e,stroke:#e94560,color:#fff
    classDef backend fill:#16213e,stroke:#0f3460,color:#fff
    classDef kafka fill:#1a1a2e,stroke:#f39c12,color:#fff
    classDef flink fill:#0d1b2a,stroke:#00b4d8,color:#fff
    classDef storage fill:#1b2838,stroke:#48cae4,color:#fff
    classDef viz fill:#1a1a2e,stroke:#06d6a0,color:#fff
```

</details>

<br>

## 📸 대시보드 스크린샷

### Pipeline Operations — 운영 현황 + 데이터 품질 모니터링
<p align="center">
  <img src="./docs/screenshots/dashboard-pipeline.png" alt="Pipeline Operations Dashboard" width="90%"/>
</p>

> 핵심 지표(오늘), DAU 추이(7일), 이벤트 처리량, 이상 탐지 현황, Late Event 비율, 지연 분포, 필드 채움률을 통합 모니터링.

### Game Analytics — 밸런싱 · 리텐션 · TA 경쟁 분석
<p align="center">
  <img src="./docs/screenshots/dashboard-game.png" alt="Game Analytics Dashboard" width="90%"/>
</p>

> 챕터별 클리어율 히트맵, 모드별 플레이 비율, D1/D3/D7 리텐션, 타임어택 스코어보드, 스토리 퍼널 분석.

<br>

## 🔧 기술 스택

| 레이어 | 기술 | 선택 이유 |
|--------|------|----------|
| **프론트엔드** | React + TypeScript (Vite) | 토스 앱인토스 미니앱 호환, 빠른 HMR |
| **백엔드** | FastAPI + aiokafka | 비동기 이벤트 프로듀싱, 자동 API 문서화 |
| **메시지 브로커** | Apache Kafka (3-broker) | Consumer Group 기반 다중 소비, 내구성 보장 |
| **스트림 처리** | Apache Flink 1.18 (Java) | Keyed State 기반 중복 제거, 세션 윈도우, 이상 탐지 |
| **분석 DB** | ClickHouse | 컬럼 지향 OLAP, MergeTree 기반 실시간 집계 |
| **CDC** | Debezium 2.5 | PostgreSQL WAL → Kafka, 유저/리더보드 실시간 동기화 |
| **시각화** | Grafana | API 프로비저닝, 대시보드 2종 자동 배포 |
| **일일 백업** | n8n → Google Sheets | 31개 컬럼 KST 변환 적재, 시트 자동 전환, Slack/Gmail 알림 |
| **인프라** | Docker Compose · Caddy · Ubuntu 24.04 | 미니PC 홈서버 24/7 운영 |

<br>

## 📦 프로젝트 구조

```
circuit-connect/
├── frontend/                          # React 프론트엔드
│   └── circuit-connect/
│       └── src/
│           ├── api/events.ts          # 이벤트 전송 (trackEvent, sendBeacon)
│           ├── components/            # 게임 UI 컴포넌트
│           └── App.tsx
├── circuit-connect-backend/           # FastAPI 백엔드
│   └── app/
│       ├── routers/events.py          # POST /api/v1/events
│       ├── services/event_service.py  # v2 정형 필드 추출 + Kafka produce
│       └── core/kafka.py              # aiokafka 프로듀서
├── pipeline/
│   └── flink/                         # Flink 스트림 처리 (Java)
│       ├── pom.xml
│       ├── Dockerfile                 # Multi-stage 빌드 (44MB fat JAR)
│       └── src/main/java/com/circuit/flink/
│           ├── CircuitConnectJob.java # 메인 Job
│           ├── model/                 # GameEvent, SessionSummary, AnomalyAlert
│           ├── function/              # 4개 처리 함수
│           └── sink/                  # ClickHouse JDBC Sink
├── simulation/
│   ├── simulate_game_events.py        # 시뮬레이션 데이터 생성기
│   └── provision_dashboards_v3.py     # Grafana 대시보드 자동 프로비저닝
└── infra/                             # Caddy, DNS 설정
```

<br>

## 🎯 핵심 구현 상세

### 1. 이벤트 스키마 정형화 (Phase A)

이벤트를 8종으로 통합하고, `schema_version: "2"` 적용.

| 이벤트 | 설명 |
|--------|------|
| `session_start` / `session_end` | 세션 라이프사이클 |
| `stage_start` / `stage_clear` / `stage_fail` | 스테이지 플레이 결과 |
| `item_use` | 만능블럭 구매/사용 |
| `navigation` | 화면 이동 퍼널 |
| `time_attack_end` | 타임어택 세션 종료 |

비정형 JSON payload → **31개 정형 컬럼**으로 추출하여 ClickHouse에서 바로 분석 쿼리 가능.

v1 → v2 전환 시 `tap_rotate` 이벤트를 제거했습니다. 셀 탭마다 로그가 찍혀 데이터 볼륨은 가장 많았지만, 분석적 가치가 낮았기 때문입니다. 탭 횟수는 `stage_clear`의 `taps` 필드 하나로 충분했습니다.

> 📄 전체 31개 컬럼 명세: [docs/event-schema-v2.md](./docs/event-schema-v2.md)

### 2. ClickHouse Star Schema (Phase B)

```
┌─ Fact ─────────────────────────────────────────┐
│  game_events (MergeTree, 31 컬럼)              │
│  → PARTITION BY toYYYYMM(event_date)           │
│  → ORDER BY (event_type, user_key, timestamp)  │
│  → TTL 6 MONTH                                 │
└─────┬───────────────┬──────────────────────────┘
      │               │
      ▼               ▼
mv_daily_user_summary  mv_stage_difficulty
(SummingMergeTree)     (AggregatingMergeTree)
```

설계 포인트:
- **LowCardinality**: 카디널리티 낮은 필드(mode, event_type 등) → 딕셔너리 인코딩으로 압축률 극대화
- **Sparse Column**: 모든 이벤트가 31개 컬럼을 채울 필요 없음 → DEFAULT 값으로 효율적 저장
- **MV 자동 집계**: INSERT 시점에 일별 요약/스테이지 난이도가 자동 갱신

### 3. Flink 실시간 스트림 처리 (Phase C)

4개 처리 함수가 **면접에서 자주 나오는 질문에 직접 대응**:

| 면접 질문 | Flink 해결 | 구현체 |
|-----------|-----------|--------|
| "이벤트 중복은 어떻게 처리?" | event_id 기반 Keyed State + TTL 1시간 | `DuplicateFilter` |
| "Kafka 장애 시 데이터 보장?" | EXACTLY_ONCE Checkpointing + RocksDB | Flink 설정 |
| "클라이언트 데이터 유실 방지?" | 서버사이드 이벤트 카운터 + 지연 경고 | `LatencyMonitor` |
| "실시간 이상 탐지?" | 3가지 Rule 기반 탐지 | `AnomalyDetector` |

#### 이상 탐지 규칙 (AnomalyDetector)

| Rule | 조건 | 의미 |
|------|------|------|
| `IMPOSSIBLE_CLEAR` | clear_time < 500ms | 비정상적으로 빠른 클리어 (봇 의심) |
| `RAPID_FIRE` | 1분 내 20+ stage_clear | 매크로/자동화 의심 |
| `SCORE_OVERFLOW` | score > 그리드별 max_score | 점수 조작 의심 |

#### 세션 윈도우 집계 (SessionAggregator)

5분 gap 기반 세션 윈도우로 유저별 세션을 자동 분할하고, `fact_sessions` 테이블에 세션 요약(소요시간, 클리어 수, 실패 수, 총 이벤트 수)을 적재.

### 4. CDC 파이프라인 (Debezium)

PostgreSQL의 유저 정보와 리더보드 데이터를 **WAL 기반 CDC**로 ClickHouse에 실시간 동기화.

```
PostgreSQL → Debezium 2.5 → Kafka → ClickHouse
(dim_users, dim_leaderboard — ReplacingMergeTree)
```

Consumer Group 분리로 기존 암호화폐 CDC 파이프라인과 **간섭 없이 공존**.

### 5. Grafana 대시보드 (Phase D/F)

Python 스크립트로 **Grafana API 자동 프로비저닝** — 코드 기반 대시보드 관리.

| 대시보드 | 목적 | 주요 패널 |
|----------|------|-----------|
| **Pipeline Operations** | 운영 현황 + 데이터 품질 | 핵심 지표(오늘), DAU 추이(7일), 이벤트 처리량, 이상 탐지, Late Event 비율, 지연 분포, 필드 채움률, Flink 세션 통계 |
| **Game Analytics** | 밸런싱 · 리텐션 · TA 경쟁 | 오늘 현황(활성유저/이벤트/스토리/TA), 챕터별 클리어율, 퍼널, D1/D3/D7 리텐션, TA 스코어보드 |

각 패널에 **(오늘)**, **(최근 7일)**, **(전체)** 라벨을 표기하여 시간 범위를 명확하게 구분.

### 6. n8n 일일 백업 워크플로우

매일 새벽 1시(KST) 자동 실행되는 Google Sheets 적재 + 알림 워크플로우.

```
Schedule Trigger (01:00 KST)
  → HTTP Request (ClickHouse 쿼리)
  → Code (파싱 + 시트 선택)
  → Google Sheets (Append)
  → Code (알림 메시지)
    ├→ Slack
    └→ Gmail
```

- 31개 컬럼, `toTimeZone(timestamp, 'Asia/Seoul')` KST 변환 적용
- Google Sheets 90만 행 도달 시 다음 시트로 자동 전환 (3개 시트 준비)
- `$getWorkflowStaticData('global')`로 현재 시트 번호 및 누적 행 수 추적
- Slack + Gmail 이중 알림으로 매일 적재 결과 확인

### 7. 시뮬레이션 E2E 검증 (Phase E)

실서비스 배포 전 파이프라인 전 구간을 검증하기 위해, 5가지 유저 페르소나(헤비/일반/캐주얼/이탈/봇)로 시뮬레이션 데이터를 생성하여 Kafka에 직접 produce했습니다. E2E 검증 완료 후 시뮬레이션 데이터는 정리했으며, 현재는 실제 유저 데이터로 운영 중입니다.

<br>

## 🗄️ 인프라 구성

| 컨테이너 | 역할 | 비고 |
|----------|------|------|
| `circuit-connect-api` | FastAPI 백엔드 | aiokafka produce |
| `cdc-kafka-1/2/3` | Kafka 3-broker 클러스터 | Consumer Group 기반 다중 소비 |
| `cdc-clickhouse` | ClickHouse | Star Schema + MV |
| `cdc-flink-jobmanager` | Flink JobManager | Web UI 제공 |
| `cdc-flink-taskmanager` | Flink TaskManager (3 slots) | 2개: CDC, 1개: Circuit Connect |
| `cdc-kafka-connect` | Debezium 2.5 | PostgreSQL CDC |
| `cdc-grafana` | Grafana | 대시보드 2종 |
| `my-postgres` | PostgreSQL 15 | 유저 · 리더보드 원본 |

### 메모리 사용량 (16GB 미니 PC)

| 컨테이너 | 메모리 |
|----------|--------|
| Kafka 브로커 ×3 | ~2.5GB |
| ClickHouse | ~940MB |
| Flink TaskManager | ~470MB |
| Flink JobManager | ~440MB |
| Kafka Connect | ~660MB |
| n8n + worker | ~550MB |
| FastAPI (게임 서버) | ~120MB |
| PostgreSQL ×2 | ~140MB |
| 기타 (Grafana, Zookeeper 등) | ~500MB |
| **합계** | **~6.3GB** |

16GB 중 40% 사용. OS와 기타 프로세스를 고려해도 24시간 안정 운영에 충분한 여유.

Flink TaskManager 3 slot 중 2개는 기존 암호화폐 CDC Job이 사용하고, 1개를 Circuit Connect 전용으로 운영 — **한정된 리소스에서의 멀티 Job 공존 설계**.

<br>

## 🚀 배포

### 원스토어 (판매중 ✅)
- WebView 래퍼 앱 (패키지: `store.calmee.circuit`)
- IARC 등급: **전체이용가 (3+)**
- 등급분류번호: `ONIA-SG-260302-0008`
- 아이콘 반려 → Adaptive Icon 규격 재제작 → 재제출 → 판매중

### 앱인토스 (검수 대기 중 🔄)
- 토스 SDK dynamic import (일반 브라우저 호환)
- 앱인토스 기본 UI(닫기/공유 버튼)와의 겹침 → 상단 패딩 추가
- 앱 정보 등록 완료, 게임 등급 정보 입력 대기

### 배포 명령어

```bash
# 빌드
cd ~/circuit-connect/frontend/circuit-connect/circuit-connect
npm run build

# 정적 파일 배포 (Caddy)
sudo cp -r dist/web/* /srv/www/circuit/
sudo systemctl reload caddy
```

빌드된 정적 파일을 Caddy가 서빙하는 디렉토리에 복사하면, `circuit.calmee.store`에서 접근 가능합니다. 원스토어 앱과 앱인토스 미니앱 모두 이 URL을 바라보기 때문에, 한 번의 배포로 모든 플랫폼에 반영됩니다.

<br>

## 🔑 설계 의사결정 기록

| 결정 | 이유 |
|------|------|
| **Kafka Consumer Group 분리** | ClickHouse(raw 저장)와 Flink(스트림 처리)가 같은 토픽을 독립적으로 소비 |
| **RAPID_FIRE threshold 10→20** | 시뮬레이션 E2E 검증 시 burst 특성으로 false positive 발생 → 실환경 기준으로 조정 |
| **seq 필드 도입 (전 레이어)** | 프론트→백엔드→Flink→ClickHouse 전 구간에서 이벤트 순서 보장 및 유실 감지 |
| **봇 필터링 (쿼리 레벨)** | 봇 데이터를 삭제하지 않고 보존하되, 분석 쿼리에서 `user_key NOT LIKE 'user_bot%'`로 제외 — 이상 탐지 대시보드에서는 활용 |
| **Grafana API 프로비저닝** | 수동 대시보드 관리 대신 Python 스크립트로 코드화 → 버전 관리, 재현 가능성 확보 |
| **Star Schema + MV** | INSERT 시점에 자동 집계로 쿼리 시점 부하 감소, 미니PC 리소스 제약 대응 |
| **v1→v2 스키마 전환** | JSON 중첩 파싱 비용 제거, tap_rotate 제거로 볼륨 절감, 31개 독립 컬럼으로 분석 효율 향상 |
| **n8n 백업 시각 01:00 KST** | ClickHouse `yesterday()` 함수가 UTC 기준이므로, KST 자정 직후 실행 시 날짜 경계 문제 방지 |

<br>

## 🚀 실행 방법

### 사전 요구사항
- Docker & Docker Compose
- Python 3.10+
- Node.js 18+
- Java 11 (Flink 빌드 시)

### 1. 인프라 실행

```bash
# Kafka, ClickHouse, Flink, Grafana, PostgreSQL
cd ~/cdc-realtime-pipeline
docker compose up -d

# 백엔드
cd ~/circuit-connect/circuit-connect-backend
docker compose up -d
```

### 2. Flink Job 배포

```bash
cd ~/circuit-connect/pipeline/flink
./build.sh  # Docker Multi-stage 빌드 → fat JAR 생성
# Flink Web UI에서 JAR 업로드 및 실행
```

### 3. 프론트엔드 실행

```bash
cd ~/circuit-connect/frontend/circuit-connect/circuit-connect
npm install && npm run dev
```

<br>

## 📈 개발 과정 (Phase별)

```
Phase A  이벤트 스키마 정형화      v1→v2 전환, 8종 이벤트, 31 컬럼
   ↓
Phase B  ClickHouse Star Schema    Fact + MV + CDC (Debezium → dim 테이블)
   ↓
Phase C  Flink 실시간 처리         중복제거·지연감지·세션집계·이상탐지
   ↓
Phase D  Grafana 대시보드           Pipeline Operations + Game Analytics
   ↓
Phase E  시뮬레이션 E2E 검증       5 페르소나로 파이프라인 전 구간 검증 → 정리 후 실서비스 전환
   ↓
Phase F  대시보드 고도화            패널별 시간 필터, (오늘)/(7일)/(전체) 라벨, 오늘 현황 패널 추가
   ↓
배포     원스토어 출시 + 앱인토스   IARC 등급, AAB 빌드, 토스 SDK 연동, n8n 백업 워크플로우
```

<br>

## 📝 블로그 시리즈

프로젝트 전 과정을 회고록으로 기록하고 있습니다.

| 편 | 제목 | 내용 |
|----|------|------|
| 1편 | 계획 | 왜 이 프로젝트를 시작하는가, 게임 설계, 파이프라인 아키텍처 |
| 2편 | 개발 | 게임 구현, 미니PC 인프라, Caddy+DNS, n8n 백업 |
| 3편 | 파이프라인 완성 | Flink 도입 배경, 세션 집계, 이상 탐지, 중복 제거, 지연 감지 |
| 4편 | 배포 직전 다듬기 | 스키마 v1→v2 전환, Grafana 더미 정리, n8n v2 재구축 |
| 5편 | 배포 | 원스토어 출시, 앱인토스 등록, 토스 SDK 연동 |

👉 [calme.tistory.com](https://calme.tistory.com)

<br>

## 📝 License

This project is for portfolio and educational purposes.

---

*Built by 이준서 — 데이터 엔지니어링 포트폴리오 프로젝트*
