// src/api/users.ts
import { apiFetch } from "./client";
import { getUserKey } from "./events";

interface User {
  user_key: string;
  nickname: string;
  created_at: string;
  last_seen_at: string;
}

export async function registerUser(nickname?: string): Promise<User> {
  return apiFetch<User>("/api/v1/users/", {
    method: "POST",
    body: {
      user_key: getUserKey(),
      nickname: nickname || `Player_${getUserKey().slice(-4)}`,
    },
  });
}

export async function getUser(): Promise<User | null> {
  try {
    return await apiFetch<User>(`/api/v1/users/${getUserKey()}`);
  } catch {
    return null;
  }
}
