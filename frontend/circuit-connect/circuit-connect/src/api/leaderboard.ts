// src/api/leaderboard.ts
import { apiFetch } from "./client";
import { getUserKey } from "./events";

interface LeaderboardEntry {
  rank: number;
  user_key: string;
  nickname: string;
  score: number;
  stages_cleared: number;
  avg_clear_ms: number;
  universal_used: number;
  played_at: string;
}

interface SubmitScorePayload {
  mode: string;
  time_limit_sec?: number;
  score: number;
  stages_cleared: number;
  avg_clear_ms: number;
  universal_used: number;
}

export async function getLeaderboard(
  mode: string = "time_attack",
  timeLimitSec?: number,
  limit: number = 20
): Promise<LeaderboardEntry[]> {
  const params = new URLSearchParams({ mode, limit: String(limit) });
  if (timeLimitSec) params.set("time_limit_sec", String(timeLimitSec));

  return apiFetch<LeaderboardEntry[]>(`/api/v1/leaderboard/?${params}`);
}

export async function getMyRank(
  mode: string = "time_attack",
  timeLimitSec?: number,
): Promise<LeaderboardEntry | null> {
  const params = new URLSearchParams({ mode, user_key: getUserKey() });
  if (timeLimitSec) params.set("time_limit_sec", String(timeLimitSec));

  return apiFetch<LeaderboardEntry | null>(`/api/v1/leaderboard/me?${params}`);
}

export async function submitScore(data: SubmitScorePayload): Promise<unknown> {
  return apiFetch("/api/v1/leaderboard/", {
    method: "POST",
    body: {
      user_key: getUserKey(),
      ...data,
    },
  });
}
