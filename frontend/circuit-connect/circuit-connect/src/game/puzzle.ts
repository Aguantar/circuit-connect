// src/game/puzzle.ts
import type { CellData, PieceType, Difficulty } from '../types/game';

/** 기본 난이도 (타임어택 등에서 difficulty 미지정 시 사용) */
const DEFAULT_DIFFICULTY: Difficulty = {
  pathWindiness: 0.3,
  distractorLevel: 2,
  hintCount: 0,
  fixedBlockerCount: 0,
};

/** 연결 배열을 times만큼 시계방향 90° 회전 */
export function rotateConnections(connections: number[], times: number): number[] {
  const c = [...connections];
  for (let i = 0; i < times; i++) c.unshift(c.pop()!);
  return c;
}

/** 경로 위의 셀에 적합한 피스 타입과 회전값을 결정 */
function determinePiece(needs: boolean[]): { type: PieceType; rotation: number } {
  const cnt = needs.filter(Boolean).length;

  if (cnt <= 1) {
    return {
      type: 'straight',
      rotation: needs[0] || needs[2] ? 0 : 1,
    };
  }

  if (cnt === 2) {
    if ((needs[0] && needs[2]) || (needs[1] && needs[3])) {
      return { type: 'straight', rotation: needs[0] ? 0 : 1 };
    }
    if (needs[0] && needs[1]) return { type: 'L', rotation: 0 };
    if (needs[1] && needs[2]) return { type: 'L', rotation: 1 };
    if (needs[2] && needs[3]) return { type: 'L', rotation: 2 };
    return { type: 'L', rotation: 3 };
  }

  if (cnt === 3) {
    if (!needs[2]) return { type: 'T', rotation: 0 };
    if (!needs[3]) return { type: 'T', rotation: 1 };
    if (!needs[0]) return { type: 'T', rotation: 2 };
    return { type: 'T', rotation: 3 };
  }

  return { type: 'cross', rotation: 0 };
}

/**
 * 난이도 기반 경로 생성
 * windiness가 높을수록 경로가 지그재그로 꼬임
 */
function generatePath(rows: number, cols: number, windiness: number): [number, number][] {
  const path: [number, number][] = [];
  let r = 0, c = 0;
  path.push([r, c]);

  while (r < rows - 1 || c < cols - 1) {
    // 목표까지 남은 거리
    const remainR = rows - 1 - r;
    const remainC = cols - 1 - c;

    if (remainR === 0) {
      c++; // 아래 끝 → 오른쪽만
    } else if (remainC === 0) {
      r++; // 오른쪽 끝 → 아래만
    } else {
      // windiness에 따라 "비효율적인 방향" 선택 확률 증가
      // 높은 windiness → 진행 방향을 자주 바꿈 (지그재그)
      const preferDown = remainR >= remainC;

      if (windiness > 0 && Math.random() < windiness * 0.6) {
        // 지그재그: 덜 효율적인 방향 선택
        if (preferDown) c++;
        else r++;
      } else {
        // 기본: 더 먼 방향 우선
        if (preferDown) r++;
        else c++;
      }
    }
    path.push([r, c]);
  }

  // windiness가 높으면 경로 중간에 우회로 삽입
  if (windiness >= 0.5 && path.length > 4) {
    return addDetours(path, rows, cols, windiness);
  }

  return path;
}

/**
 * 경로에 우회 구간을 삽입하여 복잡도 증가
 */
function addDetours(
  basePath: [number, number][],
  rows: number,
  cols: number,
  windiness: number
): [number, number][] {
  const detourCount = windiness >= 0.8 ? 2 : 1;
  let path = [...basePath];

  for (let d = 0; d < detourCount; d++) {
    // 우회 삽입 지점 (전체의 30~70% 사이)
    const insertIdx = Math.floor(path.length * (0.3 + Math.random() * 0.4));
    if (insertIdx <= 0 || insertIdx >= path.length - 1) continue;

    const [pr, pc] = path[insertIdx];

    // 우회 방향 탐색 (경로에 없는 인접 셀)
    const dirs: [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    const shuffled = dirs.sort(() => Math.random() - 0.5);

    for (const [dr, dc] of shuffled) {
      const nr = pr + dr;
      const nc = pc + dc;

      // 범위 내 + 이미 경로에 없는 셀
      if (
        nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
        !path.some(([r, c]) => r === nr && c === nc)
      ) {
        // 삽입: ...→ (pr,pc) → (nr,nc) → (pr,pc) → ... (갔다 돌아오기)
        path.splice(insertIdx + 1, 0, [nr, nc], [pr, pc]);
        break;
      }
    }
  }

  return path;
}

/**
 * 방해 피스 타입 선택 (distractorLevel에 따라)
 */
function pickDistractorType(level: 1 | 2 | 3): PieceType {
  const rand = Math.random();

  switch (level) {
    case 1: // 쉬움: straight 70%, L 25%, T 5%
      if (rand < 0.70) return 'straight';
      if (rand < 0.95) return 'L';
      return 'T';

    case 2: // 보통: straight 40%, L 35%, T 20%, cross 5%
      if (rand < 0.40) return 'straight';
      if (rand < 0.75) return 'L';
      if (rand < 0.95) return 'T';
      return 'cross';

    case 3: // 어려움: straight 15%, L 25%, T 40%, cross 20%
      if (rand < 0.15) return 'straight';
      if (rand < 0.40) return 'L';
      if (rand < 0.80) return 'T';
      return 'cross';
  }
}

/** N×M 퍼즐 그리드 생성 (난이도 지원) */
export function generatePuzzle(
  rows: number,
  cols: number,
  difficulty?: Difficulty,
  bonusCells?: number
): CellData[][] {
  const diff = difficulty ?? DEFAULT_DIFFICULTY;

  // 빈 그리드 초기화
  const grid: CellData[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      type: 'straight' as PieceType,
      rotation: 0,
      isSource: false,
      isTarget: false,
      isBonus: false,
      isUniversal: false,
      isFixed: false,
    }))
  );

  // 시작점 / 종점 설정 (고정)
  grid[0][0].isSource = true;
  grid[0][0].isFixed = true;
  grid[rows - 1][cols - 1].isTarget = true;
  grid[rows - 1][cols - 1].isFixed = true;

  // ── 1. 난이도 기반 경로 생성 ──
  const path = generatePath(rows, cols, diff.pathWindiness);

  // ── 2. 경로 위 셀에 적합한 피스 배치 ──
  const pathSet = new Set(path.map(([r, c]) => `${r},${c}`));

  for (let i = 0; i < path.length; i++) {
    const [pr, pc] = path[i];
    const needs = [false, false, false, false];

    if (i > 0) {
      const [prevR, prevC] = path[i - 1];
      if (prevR < pr) needs[0] = true;
      if (prevR > pr) needs[2] = true;
      if (prevC < pc) needs[3] = true;
      if (prevC > pc) needs[1] = true;
    }
    if (i < path.length - 1) {
      const [nextR, nextC] = path[i + 1];
      if (nextR < pr) needs[0] = true;
      if (nextR > pr) needs[2] = true;
      if (nextC < pc) needs[3] = true;
      if (nextC > pc) needs[1] = true;
    }

    const { type, rotation } = determinePiece(needs);
    grid[pr][pc].type = type;
    grid[pr][pc].rotation = rotation;
  }

  // ── 3. 경로 밖 셀에 방해 피스 배치 (distractorLevel 기반) ──
  const nonPathCells: [number, number][] = [];
  for (let r2 = 0; r2 < rows; r2++) {
    for (let c2 = 0; c2 < cols; c2++) {
      if (!pathSet.has(`${r2},${c2}`)) {
        grid[r2][c2].type = pickDistractorType(diff.distractorLevel);
        grid[r2][c2].rotation = Math.floor(Math.random() * 4);
        nonPathCells.push([r2, c2]);
      }
    }
  }

  // ── 4. 보너스 포인트 배치 (경로 위 균등 분배) ──
  const bonusCount = bonusCells ?? (path.length > 3 ? 1 : 0);
  if (bonusCount > 0 && path.length > 3) {
    // 시작/끝 제외한 경로 인덱스 범위: 1 ~ path.length-2
    const available = path.length - 2; // 배치 가능 슬롯
    const count = Math.min(bonusCount, available);
    if (count === 1) {
      // 1개: 경로 중간
      const bi = Math.floor(path.length / 2);
      grid[path[bi][0]][path[bi][1]].isBonus = true;
    } else {
      // 2개 이상: 균등 분배
      const step = (available + 1) / (count + 1);
      for (let i = 1; i <= count; i++) {
        const idx = Math.min(Math.round(step * i), path.length - 2);
        grid[path[idx][0]][path[idx][1]].isBonus = true;
      }
    }
  }

  // ── 5. 스크램블: 경로 셀 회전 섞기 ──
  for (let i = 0; i < path.length; i++) {
    const [pr, pc] = path[i];
    if (!grid[pr][pc].isFixed) {
      grid[pr][pc].rotation = (grid[pr][pc].rotation + Math.floor(Math.random() * 3) + 1) % 4;
    }
  }

  // ── 6. 고정 방해 셀 (fixedBlockerCount) ──
  if (diff.fixedBlockerCount > 0 && nonPathCells.length > 0) {
    const shuffled = [...nonPathCells].sort(() => Math.random() - 0.5);
    const count = Math.min(diff.fixedBlockerCount, shuffled.length);
    for (let i = 0; i < count; i++) {
      const [br, bc] = shuffled[i];
      grid[br][bc].isFixed = true;
      // T나 cross 타입으로 고정 → 시각적 혼란 극대화
      grid[br][bc].type = Math.random() < 0.6 ? 'T' : 'cross';
      grid[br][bc].rotation = Math.floor(Math.random() * 4);
    }
  }

  // ── 7. 힌트 셀 (hintCount): 일부 경로 밖 셀을 덜 꼬이게 ──
  if (diff.hintCount > 0 && nonPathCells.length > 0) {
    const available = nonPathCells.filter(([r, c]) => !grid[r][c].isFixed);
    const shuffled = available.sort(() => Math.random() - 0.5);
    const count = Math.min(diff.hintCount, shuffled.length);
    for (let i = 0; i < count; i++) {
      const [hr, hc] = shuffled[i];
      // straight로 바꾸고 0 또는 1 회전 → 눈에 띄게 정돈된 느낌
      grid[hr][hc].type = 'straight';
      grid[hr][hc].rotation = Math.random() < 0.5 ? 0 : 1;
    }
  }

  return grid;
}