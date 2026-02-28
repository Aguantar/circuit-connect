// src/hooks/useTimer.ts
import { useState, useRef, useCallback } from 'react';

interface UseTimerReturn {
  elapsedMs: number;
  isRunning: boolean;
  start: () => void;
  stop: () => number;   // 정지 시 최종 시간 반환
  reset: () => void;
}

/** requestAnimationFrame 기반 정밀 타이머 (센티초 단위) */
export function useTimer(): UseTimerReturn {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    if (startTimeRef.current !== null) {
      setElapsedMs(Date.now() - startTimeRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    setIsRunning(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const stop = useCallback((): number => {
    const finalTime = startTimeRef.current !== null
      ? Date.now() - startTimeRef.current
      : elapsedMs;

    startTimeRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setElapsedMs(finalTime);
    setIsRunning(false);
    return finalTime;
  }, [elapsedMs]);

  const reset = useCallback(() => {
    startTimeRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setElapsedMs(0);
    setIsRunning(false);
  }, []);

  return { elapsedMs, isRunning, start, stop, reset };
}
