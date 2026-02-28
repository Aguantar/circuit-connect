#!/usr/bin/env python3
"""
Circuit Connect "불을 켜줘!" — Phase E: 시뮬레이션 데이터 생성기

52명 유저 × 7일간 게임 이벤트를 생성하여 Kafka에 직접 produce.
v2 스키마 8종 이벤트 (session_start, session_end, stage_start, stage_clear,
stage_fail, item_use, navigation, heartbeat)

Usage:
    # Dry run — Kafka 없이 이벤트 생성 확인
    python3 simulate_game_events.py --dry-run

    # 실제 Kafka produce
    python3 simulate_game_events.py --bootstrap-servers localhost:29092,localhost:29093,localhost:29094

    # JSON 파일로 저장 (디버깅용)
    python3 simulate_game_events.py --dry-run --output events.jsonl
"""

import argparse
import json
import random
import uuid
import sys
import time
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
from typing import Optional

# ──────────────────────────────────────────────────────
# 게임 상수
# ──────────────────────────────────────────────────────

STORY_STAGES = {
    # chapter-stage: (grid_size, base_difficulty 0.0~1.0)
    "1-1": ("3x3", 0.05), "1-2": ("3x3", 0.07), "1-3": ("3x3", 0.09),
    "1-4": ("3x3", 0.11), "1-5": ("3x3", 0.13), "1-6": ("3x3", 0.15),
    "1-7": ("3x3", 0.17), "1-8": ("3x3", 0.19), "1-9": ("3x3", 0.21),
    "1-10": ("3x3", 0.23),
    "2-1": ("4x3", 0.25), "2-2": ("4x3", 0.28), "2-3": ("3x4", 0.30),
    "2-4": ("3x4", 0.32), "2-5": ("4x3", 0.35), "2-6": ("4x3", 0.37),
    "2-7": ("3x4", 0.39), "2-8": ("3x4", 0.41), "2-9": ("4x3", 0.43),
    "2-10": ("4x3", 0.45),
    "3-1": ("4x4", 0.47), "3-2": ("4x4", 0.49), "3-3": ("4x4", 0.51),
    "3-4": ("4x4", 0.53), "3-5": ("4x4", 0.55), "3-6": ("4x4", 0.57),
    "3-7": ("4x4", 0.59), "3-8": ("4x4", 0.61), "3-9": ("4x4", 0.63),
    "3-10": ("4x4", 0.65),
    "4-1": ("4x4", 0.67), "4-2": ("4x4", 0.69), "4-3": ("5x5", 0.71),
    "4-4": ("5x5", 0.73), "4-5": ("5x5", 0.75), "4-6": ("5x5", 0.77),
    "4-7": ("5x5", 0.79), "4-8": ("5x5", 0.81), "4-9": ("5x5", 0.83),
    "4-10": ("5x5", 0.85),
    "5-1": ("5x5", 0.86), "5-2": ("5x5", 0.88), "5-3": ("5x5", 0.89),
    "5-4": ("5x5", 0.91), "5-5": ("5x5", 0.92), "5-6": ("5x5", 0.93),
    "5-7": ("5x5", 0.94), "5-8": ("5x5", 0.95), "5-9": ("5x5", 0.97),
    "5-10": ("5x5", 0.99),
}

STAGE_ORDER = list(STORY_STAGES.keys())

TA_TIME_LIMITS = [60, 120, 180]

GRID_SIZES_TA = ["3x3", "4x3", "3x4", "4x4", "5x5"]

# 그리드별 점수/클리어 시간 범위
GRID_CONFIG = {
    "3x3":  {"max_score": 500, "clear_ms": (1500, 8000),  "taps": (3, 12)},
    "4x3":  {"max_score": 600, "clear_ms": (2500, 12000), "taps": (5, 18)},
    "3x4":  {"max_score": 600, "clear_ms": (2500, 12000), "taps": (5, 18)},
    "4x4":  {"max_score": 600, "clear_ms": (3000, 18000), "taps": (8, 25)},
    "5x5":  {"max_score": 700, "clear_ms": (5000, 30000), "taps": (12, 40)},
}

SCREENS = ["home", "story", "time_attack", "leaderboard", "shop"]
PLATFORMS = ["android", "ios"]
APP_VERSION = "0.1.0"
SCHEMA_VERSION = "2"

# ──────────────────────────────────────────────────────
# 유저 페르소나 정의
# ──────────────────────────────────────────────────────

@dataclass
class Persona:
    name: str
    count: int
    # 활동 패턴
    active_days_per_week: tuple  # (min, max) 주당 활동일
    sessions_per_day: tuple      # (min, max) 일일 세션 수
    stages_per_session: tuple    # (min, max) 세션당 스테이지 수
    # 실력
    skill_level: float           # 0.0~1.0 (높을수록 클리어율↑, 클리어시간↓)
    # 모드 선호
    story_ratio: float           # 스토리 모드 비율 (나머지 = 타임어택)
    # 스토리 진행도
    max_story_chapter: int       # 최대 도달 챕터 (1~5)
    # 만능블럭 사용
    universal_use_rate: float    # 스테이지당 만능블럭 사용 확률
    # 상점 방문
    shop_visit_rate: float       # 세션당 상점 방문 확률
    # 리더보드 조회
    leaderboard_view_rate: float
    # 이탈 (churned 전용)
    churn_after_days: Optional[int] = None
    # 봇 (bot 전용)
    is_bot: bool = False

PERSONAS = [
    Persona(
        name="heavy", count=5,
        active_days_per_week=(6, 7), sessions_per_day=(2, 3),
        stages_per_session=(6, 14), skill_level=0.85,
        story_ratio=0.3, max_story_chapter=5,
        universal_use_rate=0.15, shop_visit_rate=0.4,
        leaderboard_view_rate=0.6,
    ),
    Persona(
        name="normal", count=15,
        active_days_per_week=(3, 5), sessions_per_day=(1, 2),
        stages_per_session=(5, 12), skill_level=0.60,
        story_ratio=0.5, max_story_chapter=3,
        universal_use_rate=0.10, shop_visit_rate=0.2,
        leaderboard_view_rate=0.3,
    ),
    Persona(
        name="casual", count=20,
        active_days_per_week=(1, 2), sessions_per_day=(1, 1),
        stages_per_session=(3, 6), skill_level=0.35,
        story_ratio=0.8, max_story_chapter=2,
        universal_use_rate=0.05, shop_visit_rate=0.1,
        leaderboard_view_rate=0.15,
    ),
    Persona(
        name="churned", count=10,
        active_days_per_week=(5, 7), sessions_per_day=(1, 2),
        stages_per_session=(3, 8), skill_level=0.40,
        story_ratio=0.6, max_story_chapter=2,
        universal_use_rate=0.05, shop_visit_rate=0.1,
        leaderboard_view_rate=0.2,
        churn_after_days=3,
    ),
    Persona(
        name="bot", count=2,
        active_days_per_week=(7, 7), sessions_per_day=(2, 3),
        stages_per_session=(15, 25), skill_level=0.99,
        story_ratio=0.2, max_story_chapter=5,
        universal_use_rate=0.0, shop_visit_rate=0.0,
        leaderboard_view_rate=0.0,
        is_bot=True,
    ),
]


# ──────────────────────────────────────────────────────
# 이벤트 생성기
# ──────────────────────────────────────────────────────

class EventGenerator:
    """유저 한 명의 7일간 이벤트를 생성"""

    def __init__(self, user_key: str, persona: Persona, start_date: datetime, days: int):
        self.user_key = user_key
        self.persona = persona
        self.start_date = start_date
        self.days = days
        self.platform = random.choice(PLATFORMS)
        self.screen_w = random.choice([360, 375, 390, 412, 414, 428])
        self.screen_h = random.choice([640, 667, 780, 844, 896, 926])
        # 스토리 진행 상태
        self.story_progress_idx = 0  # STAGE_ORDER에서 현재 위치
        max_stage = f"{persona.max_story_chapter}-10"
        self.max_story_idx = STAGE_ORDER.index(max_stage) if max_stage in STAGE_ORDER else len(STAGE_ORDER) - 1
        # 만능블럭 보유량
        self.universal_blocks = random.randint(3, 10)
        # 별(재화) 보유량
        self.stars = random.randint(50, 200)
        self.events = []

    def generate_all(self):
        """7일간 모든 이벤트 생성"""
        for day_offset in range(self.days):
            # 이탈 유저 체크
            if self.persona.churn_after_days and day_offset >= self.persona.churn_after_days:
                break

            # 이 날 활동할지 결정
            active_days = random.randint(*self.persona.active_days_per_week)
            if random.random() > active_days / 7.0:
                continue

            day = self.start_date + timedelta(days=day_offset)
            num_sessions = random.randint(*self.persona.sessions_per_day)

            for _ in range(num_sessions):
                # 세션 시작 시간: 오전 7시 ~ 밤 11시 사이 랜덤
                hour = random.randint(7, 23)
                minute = random.randint(0, 59)
                session_start = day.replace(hour=hour, minute=minute, second=random.randint(0, 59))
                self._generate_session(session_start)

        return self.events

    def _generate_session(self, session_start: datetime):
        """하나의 세션 이벤트 생성"""
        session_id = str(uuid.uuid4())
        ts = session_start
        cursor = TimeCursor(ts)
        self._session_seq = 0

        # session_start
        self._emit(cursor.now(), "session_start", session_id, {
            "platform": self.platform,
            "screen_width": self.screen_w,
            "screen_height": self.screen_h,
        })
        cursor.advance(1, 3)

        # 첫 화면 네비게이션
        self._emit(cursor.now(), "navigation", session_id, {"screen": "home"})
        cursor.advance(2, 5)

        # 스테이지 플레이
        num_stages = random.randint(*self.persona.stages_per_session)

        for stage_i in range(num_stages):
            # 모드 결정
            play_story = random.random() < self.persona.story_ratio

            if play_story:
                self._play_story_stage(cursor, session_id)
            else:
                self._play_time_attack(cursor, session_id)

            # heartbeat (30초마다)
            if stage_i % 3 == 0:
                self._emit(cursor.now(), "heartbeat", session_id, {})

            # 간헐적 화면 전환
            if random.random() < 0.15:
                cursor.advance(1, 3)
                screen = random.choice(["home", "story", "time_attack"])
                self._emit(cursor.now(), "navigation", session_id, {"screen": screen})
                cursor.advance(1, 2)

            # 상점 방문
            if random.random() < self.persona.shop_visit_rate:
                cursor.advance(1, 3)
                self._emit(cursor.now(), "navigation", session_id, {"screen": "shop"})
                cursor.advance(2, 5)

                # 만능블럭 구매
                if self.stars >= 30 and random.random() < 0.3:
                    self.stars -= 30
                    self.universal_blocks += 1
                    self._emit(cursor.now(), "item_use", session_id, {
                        "action": "purchase",
                        "item_type": "universal_block",
                        "cost": 30,
                        "remaining": self.universal_blocks,
                    })
                    cursor.advance(1, 2)

            # 리더보드 조회
            if random.random() < self.persona.leaderboard_view_rate:
                cursor.advance(1, 2)
                self._emit(cursor.now(), "navigation", session_id, {"screen": "leaderboard"})
                cursor.advance(3, 8)

        # session_end
        cursor.advance(1, 5)
        duration_ms = int((cursor.now() - session_start).total_seconds() * 1000)
        self._emit(cursor.now(), "session_end", session_id, {
            "duration_ms": duration_ms,
        })

    def _play_story_stage(self, cursor: 'TimeCursor', session_id: str):
        """스토리 모드 스테이지 1개 플레이"""
        # 현재 진행 스테이지 또는 이전 스테이지 리플레이
        if self.story_progress_idx > self.max_story_idx:
            # 최대 도달했으면 랜덤 리플레이
            idx = random.randint(0, self.max_story_idx)
        elif random.random() < 0.2 and self.story_progress_idx > 0:
            # 20% 확률로 이전 스테이지 리플레이
            idx = random.randint(0, self.story_progress_idx - 1)
        else:
            idx = min(self.story_progress_idx, self.max_story_idx)

        stage_id = STAGE_ORDER[idx]
        grid_size, difficulty = STORY_STAGES[stage_id]
        gc = GRID_CONFIG[grid_size]

        # 네비게이션
        cursor.advance(1, 3)
        self._emit(cursor.now(), "navigation", session_id, {"screen": "story"})
        cursor.advance(1, 2)

        # stage_start
        self._emit(cursor.now(), "stage_start", session_id, {
            "mode": "story",
            "stage_id": stage_id,
            "grid_size": grid_size,
            "time_limit_sec": 0,
        })

        # 봇 처리
        if self.persona.is_bot:
            cursor.advance(0, 0)  # 거의 즉시
            clear_time_ms = random.randint(50, 400)  # < 500ms → IMPOSSIBLE_CLEAR
            taps = random.randint(gc["taps"][0], gc["taps"][1])
            score = random.randint(100, gc["max_score"])
            # 가끔 SCORE_OVERFLOW 트리거
            if random.random() < 0.15:
                score = gc["max_score"] + random.randint(100, 5000)
            bonus = random.randint(0, 3)
            universal = 0

            self._emit(cursor.now(), "stage_clear", session_id, {
                "mode": "story", "stage_id": stage_id, "grid_size": grid_size,
                "clear_time_ms": clear_time_ms, "taps": taps, "score": score,
                "bonus_collected": bonus, "universal_used": universal,
                "time_limit_sec": 0,
            })
            if idx == self.story_progress_idx and self.story_progress_idx <= self.max_story_idx:
                self.story_progress_idx += 1
            return

        # 일반 유저 — 클리어/실패 판정
        fail_chance = difficulty * (1.0 - self.persona.skill_level)
        cleared = random.random() > fail_chance

        if cleared:
            # 실력에 따른 클리어 시간 (높을수록 빠름)
            speed_factor = 1.0 - (self.persona.skill_level * 0.6)
            min_ms = int(gc["clear_ms"][0] * speed_factor)
            max_ms = int(gc["clear_ms"][1] * speed_factor)
            clear_time_ms = random.randint(max(800, min_ms), max(1500, max_ms))

            cursor.advance_ms(clear_time_ms)
            taps = random.randint(gc["taps"][0], gc["taps"][1])
            score = random.randint(50, gc["max_score"])
            bonus = random.randint(0, 2) if random.random() < 0.4 else 0

            # 만능블럭 사용
            universal = 0
            if self.universal_blocks > 0 and random.random() < self.persona.universal_use_rate:
                universal = 1
                self.universal_blocks -= 1
                self._emit(cursor.now(), "item_use", session_id, {
                    "action": "use", "item_type": "universal_block",
                    "mode": "story", "remaining": self.universal_blocks,
                })

            self._emit(cursor.now(), "stage_clear", session_id, {
                "mode": "story", "stage_id": stage_id, "grid_size": grid_size,
                "clear_time_ms": clear_time_ms, "taps": taps, "score": score,
                "bonus_collected": bonus, "universal_used": universal,
                "time_limit_sec": 0,
            })

            # 진행도 업데이트
            if idx == self.story_progress_idx and self.story_progress_idx <= self.max_story_idx:
                self.story_progress_idx += 1
        else:
            # 실패
            elapsed_ms = random.randint(gc["clear_ms"][0], gc["clear_ms"][1])
            cursor.advance_ms(elapsed_ms)
            completion_pct = random.randint(20, 85)
            reason = random.choice(["gave_up", "stuck", "timeout"])

            self._emit(cursor.now(), "stage_fail", session_id, {
                "mode": "story", "stage_id": stage_id, "grid_size": grid_size,
                "reason": reason, "elapsed_ms": elapsed_ms,
                "completion_pct": completion_pct,
            })

    def _play_time_attack(self, cursor: 'TimeCursor', session_id: str):
        """타임어택 모드 세션 (여러 스테이지 연속 플레이)"""
        time_limit = random.choice(TA_TIME_LIMITS)

        cursor.advance(1, 3)
        self._emit(cursor.now(), "navigation", session_id, {"screen": "time_attack"})
        cursor.advance(1, 2)

        remaining_ms = time_limit * 1000
        ta_stage_num = 0
        total_score = 0
        total_clear_ms_list = []
        # 봇이라도 TA당 최대 스테이지 제한 (RAPID_FIRE 탐지에 충분한 양)
        max_ta_stages = 15 if self.persona.is_bot else 100

        while remaining_ms > 0 and ta_stage_num < max_ta_stages:
            ta_stage_num += 1
            stage_id = f"ta-{ta_stage_num}"

            # TA는 스테이지가 진행될수록 그리드가 커짐
            if ta_stage_num <= 3:
                grid_size = "3x3"
            elif ta_stage_num <= 6:
                grid_size = random.choice(["4x3", "3x4"])
            elif ta_stage_num <= 10:
                grid_size = "4x4"
            else:
                grid_size = "5x5"
            gc = GRID_CONFIG[grid_size]

            # stage_start
            self._emit(cursor.now(), "stage_start", session_id, {
                "mode": "time_attack", "stage_id": stage_id,
                "grid_size": grid_size, "time_limit_sec": time_limit,
            })

            if self.persona.is_bot:
                # 봇: 초고속 클리어
                clear_time_ms = random.randint(50, 300)
                cursor.advance_ms(clear_time_ms)
                remaining_ms -= clear_time_ms
                taps = random.randint(gc["taps"][0], gc["taps"][1])
                score = random.randint(80, gc["max_score"])
                if random.random() < 0.1:
                    score = gc["max_score"] + random.randint(500, 9000)

                self._emit(cursor.now(), "stage_clear", session_id, {
                    "mode": "time_attack", "stage_id": stage_id,
                    "grid_size": grid_size, "clear_time_ms": clear_time_ms,
                    "taps": taps, "score": score, "bonus_collected": 0,
                    "universal_used": 0, "time_limit_sec": time_limit,
                })
                total_score += score
                total_clear_ms_list.append(clear_time_ms)
                continue

            # 일반 유저 클리어/실패
            speed_factor = 1.0 - (self.persona.skill_level * 0.5)
            min_ms = int(gc["clear_ms"][0] * speed_factor)
            max_ms = int(gc["clear_ms"][1] * speed_factor * 0.6)
            clear_time_ms = random.randint(max(1000, min_ms), max(2000, max_ms))

            # 시간 초과 체크
            if clear_time_ms > remaining_ms:
                # 시간 내 못 클리어 → stage_fail로 종료
                cursor.advance_ms(remaining_ms)
                self._emit(cursor.now(), "stage_fail", session_id, {
                    "mode": "time_attack", "stage_id": stage_id,
                    "grid_size": grid_size, "reason": "timeout",
                    "elapsed_ms": remaining_ms,
                    "completion_pct": random.randint(30, 80),
                })
                remaining_ms = 0
                break

            cursor.advance_ms(clear_time_ms)
            remaining_ms -= clear_time_ms

            # 난이도에 따른 클리어 확률
            difficulty = min(0.8, 0.1 + ta_stage_num * 0.05)
            fail_chance = difficulty * (1.0 - self.persona.skill_level)

            if random.random() > fail_chance:
                taps = random.randint(gc["taps"][0], gc["taps"][1])
                score = random.randint(50, gc["max_score"])
                bonus = random.randint(0, 2) if random.random() < 0.3 else 0

                universal = 0
                if self.universal_blocks > 0 and random.random() < self.persona.universal_use_rate:
                    universal = 1
                    self.universal_blocks -= 1
                    self._emit(cursor.now(), "item_use", session_id, {
                        "action": "use", "item_type": "universal_block",
                        "mode": "time_attack", "remaining": self.universal_blocks,
                    })

                self._emit(cursor.now(), "stage_clear", session_id, {
                    "mode": "time_attack", "stage_id": stage_id,
                    "grid_size": grid_size, "clear_time_ms": clear_time_ms,
                    "taps": taps, "score": score, "bonus_collected": bonus,
                    "universal_used": universal, "time_limit_sec": time_limit,
                })
                total_score += score
                total_clear_ms_list.append(clear_time_ms)
            else:
                # TA에서 실패 = 다음 스테이지로 (시간만 소모)
                self._emit(cursor.now(), "stage_fail", session_id, {
                    "mode": "time_attack", "stage_id": stage_id,
                    "grid_size": grid_size, "reason": "stuck",
                    "elapsed_ms": clear_time_ms,
                    "completion_pct": random.randint(40, 90),
                })

        # time_attack_end는 별도 이벤트 없음 (세션에서 처리)
        # 대신 navigation으로 결과 화면 이동 표현
        if ta_stage_num > 0:
            cursor.advance(1, 3)

    def _emit(self, ts: datetime, event_type: str, session_id: str, fields: dict):
        """이벤트 하나 생성"""
        self._session_seq += 1
        # client_ts는 server_ts와 약간의 차이 (네트워크 지연 시뮬레이션)
        latency_ms = random.randint(-200, 2000)  # 대부분 0~2초 지연
        # 가끔 큰 지연 (late event)
        if random.random() < 0.02:
            latency_ms = random.randint(5000, 45000)  # 5~45초 지연

        client_ts = int(ts.timestamp() * 1000) - latency_ms
        server_ts = int(ts.timestamp() * 1000)

        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "user_key": self.user_key,
            "session_id": session_id,
            "timestamp": server_ts,
            "client_timestamp": client_ts,
            "app_version": APP_VERSION,
            "schema_version": SCHEMA_VERSION,
            "seq": self._session_seq,
            # 기본값 (v2 정형 필드)
            "mode": fields.get("mode", ""),
            "stage_id": fields.get("stage_id", ""),
            "grid_size": fields.get("grid_size", ""),
            "time_limit_sec": fields.get("time_limit_sec", 0),
            "clear_time_ms": fields.get("clear_time_ms", 0),
            "taps": fields.get("taps", 0),
            "score": fields.get("score", 0),
            "bonus_collected": fields.get("bonus_collected", 0),
            "universal_used": fields.get("universal_used", 0),
            "completion_pct": fields.get("completion_pct", 0),
            "duration_ms": fields.get("duration_ms", 0),
            "elapsed_ms": fields.get("elapsed_ms", 0),
            "platform": fields.get("platform", ""),
            "action": fields.get("action", ""),
            "item_type": fields.get("item_type", ""),
            "cost": fields.get("cost", 0),
            "remaining": fields.get("remaining", 0),
            "reason": fields.get("reason", ""),
            "screen": fields.get("screen", ""),
            "screen_width": fields.get("screen_width", 0),
            "screen_height": fields.get("screen_height", 0),
            "stages_cleared": fields.get("stages_cleared", 0),
            "total_score": fields.get("total_score", 0),
            "avg_clear_ms": fields.get("avg_clear_ms", 0),
            "extra": "",
        }
        self.events.append(event)


class TimeCursor:
    """세션 내 시간 진행 관리"""

    def __init__(self, start: datetime):
        self._ts = start

    def now(self) -> datetime:
        return self._ts

    def advance(self, min_sec: int, max_sec: int):
        """초 단위로 시간 전진"""
        delta = random.randint(min_sec, max_sec)
        self._ts += timedelta(seconds=delta)

    def advance_ms(self, ms: int):
        """밀리초 단위로 시간 전진"""
        self._ts += timedelta(milliseconds=ms)


# ──────────────────────────────────────────────────────
# 메인: 이벤트 생성 + Kafka 전송
# ──────────────────────────────────────────────────────

def generate_all_events(start_date: datetime, days: int, seed: int = 42) -> list:
    """모든 유저의 이벤트를 생성하여 시간 순 정렬 후 반환"""
    random.seed(seed)
    all_events = []
    user_count = 0

    for persona in PERSONAS:
        for i in range(persona.count):
            user_count += 1
            if persona.is_bot:
                user_key = f"user_bot_{i+1:03d}"
            else:
                # 랜덤 8자리 hex
                user_key = f"user_{uuid.uuid4().hex[:8]}"

            gen = EventGenerator(user_key, persona, start_date, days)
            events = gen.generate_all()
            all_events.extend(events)

            sys.stdout.write(f"\r  유저 생성 중: {user_count}/{sum(p.count for p in PERSONAS)} ({persona.name} #{i+1}) — 이벤트 {len(events)}건")
            sys.stdout.flush()

    print()

    # 시간 순 정렬
    all_events.sort(key=lambda e: e["timestamp"])
    return all_events


def print_summary(events: list):
    """이벤트 통계 출력"""
    print("\n" + "=" * 60)
    print("📊 시뮬레이션 데이터 요약")
    print("=" * 60)

    print(f"\n총 이벤트 수: {len(events):,}")

    # 이벤트 타입별 카운트
    type_counts = {}
    for e in events:
        t = e["event_type"]
        type_counts[t] = type_counts.get(t, 0) + 1

    print("\n이벤트 타입별 분포:")
    for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
        pct = c / len(events) * 100
        bar = "█" * int(pct / 2)
        print(f"  {t:20s} {c:6,}건 ({pct:5.1f}%) {bar}")

    # 유저별 카운트
    user_counts = {}
    for e in events:
        u = e["user_key"]
        user_counts[u] = user_counts.get(u, 0) + 1

    print(f"\n유저 수: {len(user_counts)}")
    counts = sorted(user_counts.values(), reverse=True)
    print(f"  유저당 이벤트 — 최대: {counts[0]:,}, 중앙값: {counts[len(counts)//2]:,}, 최소: {counts[-1]:,}")

    # 봇 유저 통계
    bot_events = [e for e in events if e["user_key"].startswith("user_bot")]
    if bot_events:
        impossible = sum(1 for e in bot_events if e["event_type"] == "stage_clear" and 0 < e["clear_time_ms"] < 500)
        overflow = sum(1 for e in bot_events
                      if e["event_type"] == "stage_clear"
                      and e["grid_size"] in GRID_CONFIG
                      and e["score"] > GRID_CONFIG.get(e["grid_size"], {}).get("max_score", 9999))
        print(f"\n🤖 봇 유저 이벤트: {len(bot_events):,}건")
        print(f"  IMPOSSIBLE_CLEAR 트리거 예상: {impossible}건 (clear_time < 500ms)")
        print(f"  SCORE_OVERFLOW 트리거 예상: {overflow}건")
        # RAPID_FIRE: 1분 내 10+ stage_clear
        # 간단히 추정
        print(f"  RAPID_FIRE 트리거: 봇의 빠른 클리어 패턴으로 다수 예상")

    # 날짜별 분포
    day_counts = {}
    for e in events:
        day = datetime.fromtimestamp(e["timestamp"] / 1000, tz=timezone.utc).strftime("%m/%d")
        day_counts[day] = day_counts.get(day, 0) + 1

    print("\n날짜별 이벤트 분포:")
    for day, c in sorted(day_counts.items()):
        bar = "█" * (c // 50)
        print(f"  {day}: {c:5,}건 {bar}")

    # late event 비율
    late_count = sum(1 for e in events
                    if abs(e["timestamp"] - e["client_timestamp"]) > 30000)
    print(f"\nLate event (>30s 지연): {late_count}건 ({late_count/len(events)*100:.1f}%)")

    print("=" * 60)


def produce_to_kafka(events: list, bootstrap_servers: str, topic: str, batch_size: int = 500):
    """Kafka로 이벤트 전송"""
    try:
        from kafka import KafkaProducer
    except ImportError:
        print("❌ kafka-python 패키지가 필요합니다: pip install kafka-python")
        sys.exit(1)

    producer = KafkaProducer(
        bootstrap_servers=bootstrap_servers.split(","),
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda k: k.encode("utf-8") if k else None,
        acks="all",
        retries=3,
        linger_ms=10,
        batch_size=32768,
    )

    total = len(events)
    sent = 0
    errors = 0

    print(f"\n🚀 Kafka 전송 시작 — {total:,}건 → {topic}")
    start_time = time.time()

    for i, event in enumerate(events):
        try:
            producer.send(
                topic,
                key=event["user_key"],
                value=event,
            )
            sent += 1
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"  ⚠️ 전송 실패: {e}")

        if (i + 1) % batch_size == 0:
            producer.flush()
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed
            remaining = (total - i - 1) / rate if rate > 0 else 0
            sys.stdout.write(f"\r  진행: {i+1:,}/{total:,} ({(i+1)/total*100:.1f}%) — {rate:.0f} evt/s — 남은시간: {remaining:.0f}s")
            sys.stdout.flush()

    producer.flush()
    producer.close()

    elapsed = time.time() - start_time
    print(f"\n\n✅ 전송 완료: {sent:,}건 성공, {errors}건 실패 ({elapsed:.1f}초)")


def save_to_file(events: list, filepath: str):
    """JSONL 파일로 저장"""
    with open(filepath, "w") as f:
        for event in events:
            f.write(json.dumps(event) + "\n")
    print(f"💾 {filepath}에 {len(events):,}건 저장 완료")


def main():
    parser = argparse.ArgumentParser(description="Circuit Connect 시뮬레이션 데이터 생성기")
    parser.add_argument("--bootstrap-servers", default="localhost:29092,localhost:29093,localhost:29094",
                        help="Kafka 부트스트랩 서버 (default: localhost:29092,29093,29094)")
    parser.add_argument("--topic", default="game-events",
                        help="Kafka 토픽 (default: game-events)")
    parser.add_argument("--days", type=int, default=7,
                        help="시뮬레이션 일수 (default: 7)")
    parser.add_argument("--start-date", default=None,
                        help="시작 날짜 YYYY-MM-DD (default: 오늘-days)")
    parser.add_argument("--seed", type=int, default=42,
                        help="랜덤 시드 (default: 42)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Kafka 전송 없이 통계만 출력")
    parser.add_argument("--output", default=None,
                        help="JSONL 파일로 저장 (옵션)")
    parser.add_argument("--batch-size", type=int, default=500,
                        help="Kafka flush 배치 크기 (default: 500)")

    args = parser.parse_args()

    # 시작 날짜 결정
    if args.start_date:
        start = datetime.strptime(args.start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        start = (datetime.now(timezone.utc) - timedelta(days=args.days)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

    print("=" * 60)
    print("🎮 Circuit Connect 시뮬레이션 데이터 생성기")
    print("=" * 60)
    print(f"  기간: {start.strftime('%Y-%m-%d')} ~ {(start + timedelta(days=args.days-1)).strftime('%Y-%m-%d')} ({args.days}일)")
    print(f"  유저: {sum(p.count for p in PERSONAS)}명")
    print(f"    - Heavy: {PERSONAS[0].count}명, Normal: {PERSONAS[1].count}명")
    print(f"    - Casual: {PERSONAS[2].count}명, Churned: {PERSONAS[3].count}명, Bot: {PERSONAS[4].count}명")
    print(f"  시드: {args.seed}")
    print(f"  모드: {'DRY RUN' if args.dry_run else f'Kafka → {args.bootstrap_servers}'}")
    print()

    # 이벤트 생성
    events = generate_all_events(start, args.days, args.seed)

    # 통계 출력
    print_summary(events)

    # 파일 저장
    if args.output:
        save_to_file(events, args.output)

    # Kafka 전송
    if not args.dry_run:
        produce_to_kafka(events, args.bootstrap_servers, args.topic, args.batch_size)
    else:
        print("\n🔍 DRY RUN 모드 — Kafka 전송 생략")
        print(f"   실제 전송하려면: python3 {sys.argv[0]} --bootstrap-servers <서버>")


if __name__ == "__main__":
    main()
