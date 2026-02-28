// src/api/events.ts — v2 이벤트 스키마 (Phase A)
import { apiFetch } from "./client";

interface GameEvent {
  event_type: string;
  session_id: string;
  client_timestamp: number;
  app_version: string;
  schema_version: string;
  payload: Record<string, unknown>;
}

interface EventResponse {
  accepted: number;
  failed: number;
}

// 이벤트 큐: 배치 전송용
let eventQueue: GameEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_INTERVAL = 3000; // 3초마다 배치 전송
const FLUSH_SIZE = 10; // 10개 모이면 즉시 전송

// 세션 시작 시각 (session_end 계산용)
let sessionStartMs: number = Date.now();
let eventSeq: number = 0;

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getUserKey(): string {
  let key = localStorage.getItem("cc_user_key");
  if (!key) {
    key = `user_${generateUUID().slice(0, 8)}`;
    localStorage.setItem("cc_user_key", key);
  }
  return key;
}

function getSessionId(): string {
  let sid = sessionStorage.getItem("cc_session_id");
  if (!sid) {
    sid = generateUUID();
    sessionStorage.setItem("cc_session_id", sid);
    eventSeq = 0;  // ★ 추가
  }
  return sid;
}

export function trackEvent(
  eventType: string,
  payload: Record<string, unknown> = {}
) {
  eventSeq++;  // ★ 추가

  const event: GameEvent = {
    event_type: eventType,
    session_id: getSessionId(),
    client_timestamp: Date.now(),
    app_version: "0.1.0",
    schema_version: "2",
    payload: { ...payload, seq: eventSeq },  // ★ seq 포함
  };
  // ... 이하 동일

  eventQueue.push(event);

  // 큐가 일정 크기 이상이면 즉시 flush
  if (eventQueue.length >= FLUSH_SIZE) {
    flushEvents();
    return;
  }

  // 타이머 없으면 시작
  if (!flushTimer) {
    flushTimer = setTimeout(flushEvents, FLUSH_INTERVAL);
  }
}

/** session_end 이벤트를 큐에 추가 (앱 종료/백그라운드 전환 시 호출) */
export function trackSessionEnd(): void {
  const durationMs = Date.now() - sessionStartMs;
  trackEvent("session_end", { duration_ms: durationMs });
}

/** 세션 시작 시각 초기화 (session_start 시 호출) */
export function markSessionStart(): void {
  sessionStartMs = Date.now();
}

export async function flushEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventQueue.length === 0) return;

  const eventsToSend = [...eventQueue];
  eventQueue = [];

  try {
    await apiFetch<EventResponse>("/api/v1/events/", {
      method: "POST",
      body: {
        user_key: getUserKey(),
        events: eventsToSend,
      },
    });
  } catch (err) {
    // 실패 시 큐에 다시 넣기
    console.warn("Event flush failed, re-queuing:", err);
    eventQueue.unshift(...eventsToSend);
  }
}

// 페이지 떠날 때: session_end + 남은 이벤트 전송
if (typeof window !== "undefined") {
  // beforeunload: 탭 닫기/새로고침
  window.addEventListener("beforeunload", () => {
    // session_end를 큐에 추가
    const durationMs = Date.now() - sessionStartMs;
    eventQueue.push({
      event_type: "session_end",
      session_id: getSessionId(),
      client_timestamp: Date.now(),
      app_version: "0.1.0",
      schema_version: "2",
      payload: { duration_ms: durationMs, seq: ++eventSeq }, 
    });

    if (eventQueue.length > 0) {
      const blob = new Blob(
        [JSON.stringify({ user_key: getUserKey(), events: eventQueue })],
        { type: "application/json" }
      );
      const url = `${import.meta.env.VITE_API_URL || "https://circuit.calmee.store"}/api/v1/events/`;
      navigator.sendBeacon(url, blob);
      eventQueue = [];
    }
  });

  // visibilitychange: 모바일 앱 백그라운드 전환 (토스 WebView 대응)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      const durationMs = Date.now() - sessionStartMs;
      eventQueue.push({
        event_type: "session_end",
        session_id: getSessionId(),
        client_timestamp: Date.now(),
        app_version: "0.1.0",
        schema_version: "2",
        payload: { duration_ms: durationMs, seq: ++eventSeq }, 
      });

      if (eventQueue.length > 0) {
        const blob = new Blob(
          [JSON.stringify({ user_key: getUserKey(), events: eventQueue })],
          { type: "application/json" }
        );
        const url = `${import.meta.env.VITE_API_URL || "https://circuit.calmee.store"}/api/v1/events/`;
        navigator.sendBeacon(url, blob);
        eventQueue = [];
      }
    }
  });
}

export { getUserKey, getSessionId };
