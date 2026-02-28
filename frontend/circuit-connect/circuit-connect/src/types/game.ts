export interface CellData {
  type: PieceType;
  rotation: number;
  isSource: boolean;
  isTarget: boolean;
  isBonus: boolean;
  isUniversal: boolean;
  isFixed: boolean;
}

/** 난이도 설정 */
export interface Difficulty {
  /** 경로 꼬임 정도 (0.0 ~ 1.0). 높을수록 지그재그가 심함 */
  pathWindiness: number;
  /** 방해 피스 수준 (1~3). 1=straight 위주, 2=mixed, 3=T/cross 많음 */
  distractorLevel: 1 | 2 | 3;
  /** 힌트 셀 개수. 경로 밖 셀 중 정답 회전에 가까운 상태로 남겨두는 수 */
  hintCount: number;
  /** 고정 방해 셀 개수. 경로 밖 셀을 잘못된 회전으로 고정 (isFixed) */
  fixedBlockerCount: number;
}

export interface Stage {
  id: number | string;
  name: string;
  rows: number;
  cols: number;
  chapter: number;
  difficulty?: Difficulty;
}

export type GameScreen = 'title' | 'stageSelect' | 'game';

export type PieceType = 'straight' | 'L' | 'T' | 'cross';

export const PIECE_CONNECTIONS: Record<PieceType, number[]> = {
  straight: [1, 0, 1, 0],
  L:        [1, 1, 0, 0],
  T:        [1, 1, 0, 1],
  cross:    [1, 1, 1, 1],
};

export const DIR_OFFSETS: [number, number][] = [
  [-1, 0], [0, 1], [1, 0], [0, -1],
];

export const OPPOSITE_DIR = [2, 3, 0, 1];