// src/game/power.ts
import type { CellData } from '../types/game';
import { PIECE_CONNECTIONS, DIR_OFFSETS, OPPOSITE_DIR } from '../types/game';
import { rotateConnections } from './puzzle';

/** BFS로 전원에서 도달 가능한 셀을 계산 */
export function checkPowered(grid: CellData[][]): boolean[][] {
  const rows = grid.length;
  const cols = grid[0].length;
  const powered: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const queue: [number, number][] = [];

  // 전원(source) 셀을 시작점으로
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].isSource) {
        powered[r][c] = true;
        queue.push([r, c]);
      }
    }
  }

  // BFS 탐색
  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const conns = rotateConnections(
      PIECE_CONNECTIONS[grid[r][c].type],
      grid[r][c].rotation
    );

    for (let d = 0; d < 4; d++) {
      if (!conns[d]) continue; // 이 방향으로 연결 없음

      const nr = r + DIR_OFFSETS[d][0];
      const nc = c + DIR_OFFSETS[d][1];

      // 범위 밖이거나 이미 방문
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || powered[nr][nc]) continue;

      // 상대 셀이 반대 방향으로 연결되어 있는지 확인
      const neighborConns = rotateConnections(
        PIECE_CONNECTIONS[grid[nr][nc].type],
        grid[nr][nc].rotation
      );
      if (neighborConns[OPPOSITE_DIR[d]]) {
        powered[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }

  return powered;
}

/** 타겟(전구)에 전류가 도달했는지 확인 */
export function isTargetPowered(grid: CellData[][], powered: boolean[][]): boolean {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[r][c].isTarget && powered[r][c]) return true;
    }
  }
  return false;
}

/** 전체 연결 완성도(%) 계산 — stage_fail 시 completion_pct 산출용 */
export function getCompletionPercentage(grid: CellData[][], powered: boolean[][]): number {
  let total = 0;
  let poweredCount = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      total++;
      if (powered[r][c]) poweredCount++;
    }
  }
  return total > 0 ? Math.round((poweredCount / total) * 1000) / 10 : 0;
}
