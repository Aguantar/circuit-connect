// src/lib/stats.ts
// 클라이언트 측 개인 기록 관리 (localStorage)

const STORAGE_KEY = 'circuit-connect-stats';

export interface PersonalStats {
  totalPlays: number;
  /** 개별 클리어한 스테이지 ID 목록 */
  clearedStages: number[];
  /** 하위 호환 — clearedStages 중 최대값 */
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
  };
}

export function loadStats(): PersonalStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultStats();
    const parsed = { ...getDefaultStats(), ...JSON.parse(raw) };

    // 마이그레이션: 기존에 clearedStages 없고 storyBestStageId만 있던 경우
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
}

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

  // 개별 클리어 기록 (중복 방지)
  if (!stats.clearedStages.includes(stageId)) {
    stats.clearedStages.push(stageId);
    stats.clearedStages.sort((a, b) => a - b);
  }

  // storyBestStageId = 최대값 (하위 호환)
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
