// src/utils/format.ts

/** 클리어 시간 포맷: 5.34초 또는 1:03.27 */
export function formatTime(ms: number): string {
  const totalSec = ms / 1000;
  if (totalSec < 60) return totalSec.toFixed(2) + '초';
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(2).padStart(5, '0');
  return `${min}:${sec}`;
}

/** 실시간 타이머 표시: 12.45 또는 1:03.27 */
export function formatRunning(ms: number): string {
  const totalSec = ms / 1000;
  if (totalSec < 60) return totalSec.toFixed(2);
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(2).padStart(5, '0');
  return `${min}:${sec}`;
}
