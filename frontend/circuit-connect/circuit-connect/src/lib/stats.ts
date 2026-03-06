// src/lib/stats.ts
// 클라이언트 기록 관리 (localStorage 캐시 + 서버 동기화)
import { apiFetch, getUserKey } from "../api";

const STORAGE_KEY = 'circuit-connect-stats';

export interface PersonalStats {
  totalPlays: number;
  clearedStages: number[];
  storyBestStageId: number;
  timeAttackBest: {
    60: { score: number; stagesCleared: number } | null;
    120: { score: number; stagesCleared: number } | null;
    180: { score: number; stagesCleared: number } | null;
  };
  lastPlayedAt: string | null;
  streakDays: number;
  lastDateStr: string | null;
  tutorialDone: boolean;
  // ── 추가: App-level state ──
  score: number;
  universalNodes: number;
}

function getDefaultStats(): PersonalStats {
  return {
    totalPlays: 0,
    clearedStages: [],
    storyBestStageId: 0,
    timeAttackBest: { 60: null, 120: null, 180: null },
    lastPlayedAt: null,
    streakDays: 0,
    lastDateStr: null,
    tutorialDone: false,
    score: 0,
    universalNodes: 5,
  };
}

// ── localStorage 읽기/쓰기 (캐시) ──

export function loadStats(): PersonalStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultStats();
    const parsed = { ...getDefaultStats(), ...JSON.parse(raw) };
    if ((!parsed.clearedStages || parsed.clearedStages.length === 0) && parsed.storyBestStageId > 0) {
      parsed.clearedStages = Array.from({ length: parsed.storyBestStageId }, (_, i) => i + 1);
    }
    return parsed;
  } catch {
    return getDefaultStats();
  }
}

function saveStats(stats: PersonalStats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {}
  // 비동기 서버 동기화 (fire-and-forget)
  syncToServer(stats);
}

// ── 서버 동기화 ──

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function syncToServer(stats: PersonalStats) {
  // 디바운스: 1초 내 여러 save가 오면 마지막만 전송
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await apiFetch("/api/v1/progress/stats", {
        method: "POST",
        body: { user_key: getUserKey(), stats },
      });
    } catch (e) {
      console.warn("[Stats] Server sync failed:", e);
    }
  }, 1000);
}

export async function loadStatsFromServer(): Promise<PersonalStats> {
  const localStats = loadStats();
  try {
    const res = await apiFetch<{ user_key: string; stats: PersonalStats | null }>(
      `/api/v1/progress/stats/${getUserKey()}`
    );
    if (res.stats) {
      // 서버 데이터와 로컬 데이터 병합 (더 진행된 쪽 우선)
      const merged = mergeStats(localStats, res.stats);
      // 로컬 캐시 업데이트 (서버 동기화 없이)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
      return merged;
    }
  } catch (e) {
    console.warn("[Stats] Server load failed, using local:", e);
  }
  return localStats;
}

function mergeStats(local: PersonalStats, server: PersonalStats): PersonalStats {
  const safe = { ...getDefaultStats(), ...server };
  // 클리어 스테이지: 합집합
  const mergedCleared = [...new Set([...local.clearedStages, ...safe.clearedStages])].sort((a, b) => a - b);
  // 타임어택: 각 초별 높은 점수 우선
  const mergedTA = { ...safe.timeAttackBest };
  for (const t of [60, 120, 180] as const) {
    const l = local.timeAttackBest[t];
    const s = safe.timeAttackBest[t];
    if (l && s) {
      mergedTA[t] = l.score > s.score ? l : s;
    } else {
      mergedTA[t] = l || s;
    }
  }
  return {
    totalPlays: Math.max(local.totalPlays, safe.totalPlays),
    clearedStages: mergedCleared,
    storyBestStageId: Math.max(...mergedCleared, 0),
    timeAttackBest: mergedTA,
    lastPlayedAt: local.lastPlayedAt && safe.lastPlayedAt
      ? (local.lastPlayedAt > safe.lastPlayedAt ? local.lastPlayedAt : safe.lastPlayedAt)
      : local.lastPlayedAt || safe.lastPlayedAt,
    streakDays: Math.max(local.streakDays, safe.streakDays),
    lastDateStr: local.lastDateStr && safe.lastDateStr
      ? (local.lastDateStr > safe.lastDateStr ? local.lastDateStr : safe.lastDateStr)
      : local.lastDateStr || safe.lastDateStr,
    tutorialDone: local.tutorialDone || safe.tutorialDone,
    score: Math.max(local.score, safe.score),
    universalNodes: Math.max(local.universalNodes, safe.universalNodes),
  };
}

// ── 기존 API (변경 없이 유지) ──

export function recordSessionStart(): PersonalStats {
  const stats = loadStats();
  const today = new Date().toISOString().slice(0, 10);
  if (stats.lastDateStr !== today) {
    if (stats.lastDateStr) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      stats.streakDays = stats.lastDateStr === yesterdayStr ? stats.streakDays + 1 : 1;
    } else {
      stats.streakDays = 1;
    }
    stats.lastDateStr = today;
  }
  stats.lastPlayedAt = new Date().toISOString();
  saveStats(stats);
  return stats;
}

export function recordStoryClear(stageId: number) {
  const stats = loadStats();
  stats.totalPlays++;
  if (!stats.clearedStages.includes(stageId)) {
    stats.clearedStages.push(stageId);
    stats.clearedStages.sort((a, b) => a - b);
  }
  stats.storyBestStageId = Math.max(...stats.clearedStages, 0);
  saveStats(stats);
}

export function recordTimeAttackEnd(
  timeLimitSec: 60 | 120 | 180,
  score: number,
  stagesCleared: number
) {
  const stats = loadStats();
  stats.totalPlays++;
  const current = stats.timeAttackBest[timeLimitSec];
  if (!current || score > current.score) {
    stats.timeAttackBest[timeLimitSec] = { score, stagesCleared };
  }
  saveStats(stats);
}

export function isTutorialDone(): boolean {
  return loadStats().tutorialDone;
}

export function markTutorialDone() {
  const stats = loadStats();
  stats.tutorialDone = true;
  saveStats(stats);
}

// ── 추가: score/universalNodes 저장 ──

export function saveScore(newScore: number) {
  const stats = loadStats();
  stats.score = newScore;
  saveStats(stats);
}

export function saveUniversalNodes(count: number) {
  const stats = loadStats();
  stats.universalNodes = count;
  saveStats(stats);
}
