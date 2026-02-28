// src/hooks/useLongPress.ts
import { useRef, useCallback } from 'react';

interface UseLongPressOptions {
  onTap: (row: number, col: number) => void;
  onLongPress: (row: number, col: number) => void;
  duration?: number; // ms, 기본 500
}

interface UseLongPressReturn {
  handlePointerDown: (row: number, col: number, e: React.PointerEvent) => void;
  handlePointerUp: (row: number, col: number) => void;
  cancelLongPress: () => void;
}

/** 탭(짧게) vs 길게 누르기 구분 훅 */
export function useLongPress({
  onTap,
  onLongPress,
  duration = 500,
}: UseLongPressOptions): UseLongPressReturn {
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);

  const handlePointerDown = useCallback(
    (row: number, col: number, e: React.PointerEvent) => {
      e.preventDefault();
      didLongPressRef.current = false;

      longPressRef.current = setTimeout(() => {
        didLongPressRef.current = true;
        onLongPress(row, col);
      }, duration);
    },
    [onLongPress, duration]
  );

  const handlePointerUp = useCallback(
    (row: number, col: number) => {
      if (longPressRef.current !== null) {
        clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }
      if (!didLongPressRef.current) {
        onTap(row, col);
      }
    },
    [onTap]
  );

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  return { handlePointerDown, handlePointerUp, cancelLongPress };
}
