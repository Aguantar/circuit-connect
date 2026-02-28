// src/game/stages.ts
import type { Stage, Difficulty } from '../types/game';

/** 난이도 프리셋 헬퍼 */
function d(
  pathWindiness: number,
  distractorLevel: 1 | 2 | 3,
  hintCount: number,
  fixedBlockerCount: number
): Difficulty {
  return { pathWindiness, distractorLevel, hintCount, fixedBlockerCount };
}

export const STAGES: Stage[] = [
  // ═══ Chapter 1 — 전기의 시작 (3×3, 입문) ═══
  { id: 1,  name: '튜토리얼',       rows: 3, cols: 3, chapter: 1, difficulty: d(0.0, 1, 3, 0) },
  { id: 2,  name: '워밍업',         rows: 3, cols: 3, chapter: 1, difficulty: d(0.0, 1, 2, 0) },
  { id: 3,  name: '첫 번째 분기',   rows: 3, cols: 3, chapter: 1, difficulty: d(0.1, 1, 2, 0) },
  { id: 4,  name: '교차로',         rows: 3, cols: 3, chapter: 1, difficulty: d(0.1, 1, 1, 0) },
  { id: 5,  name: '단순 루프',      rows: 3, cols: 3, chapter: 1, difficulty: d(0.15, 1, 1, 0) },
  { id: 6,  name: '지그재그',       rows: 3, cols: 3, chapter: 1, difficulty: d(0.2, 1, 1, 0) },
  { id: 7,  name: '꺾인 길',        rows: 3, cols: 3, chapter: 1, difficulty: d(0.2, 2, 1, 0) },
  { id: 8,  name: '양갈래',         rows: 3, cols: 3, chapter: 1, difficulty: d(0.25, 2, 0, 0) },
  { id: 9,  name: '첫 시험',        rows: 3, cols: 3, chapter: 1, difficulty: d(0.3, 2, 0, 0) },
  { id: 10, name: '졸업 시험',      rows: 3, cols: 3, chapter: 1, difficulty: d(0.35, 2, 0, 0) },

  // ═══ Chapter 2 — 확장 회로 (3×4 → 4×4, 초중급) ═══
  { id: 11, name: '넓은 세계',      rows: 3, cols: 4, chapter: 2, difficulty: d(0.2, 1, 2, 0) },
  { id: 12, name: '확장 시작',      rows: 3, cols: 4, chapter: 2, difficulty: d(0.25, 2, 1, 0) },
  { id: 13, name: '직사각 미로',    rows: 4, cols: 3, chapter: 2, difficulty: d(0.25, 2, 1, 0) },
  { id: 14, name: '이중 경로',      rows: 4, cols: 3, chapter: 2, difficulty: d(0.3, 2, 1, 0) },
  { id: 15, name: '크로스오버',     rows: 4, cols: 4, chapter: 2, difficulty: d(0.3, 2, 1, 0) },
  { id: 16, name: '뱀의 길',        rows: 4, cols: 4, chapter: 2, difficulty: d(0.35, 2, 0, 0) },
  { id: 17, name: '파워 그리드',    rows: 4, cols: 4, chapter: 2, difficulty: d(0.35, 2, 0, 0) },
  { id: 18, name: '미로 탈출',      rows: 4, cols: 4, chapter: 2, difficulty: d(0.4, 2, 0, 0) },
  { id: 19, name: '꼬인 회로',      rows: 4, cols: 4, chapter: 2, difficulty: d(0.4, 2, 0, 1) },
  { id: 20, name: '전력 과부하',    rows: 4, cols: 4, chapter: 2, difficulty: d(0.45, 2, 0, 1) },

  // ═══ Chapter 3 — 복합 회로 (4×4, 중급) ═══
  { id: 21, name: '스파크',         rows: 4, cols: 4, chapter: 3, difficulty: d(0.4, 2, 0, 1) },
  { id: 22, name: '병렬 연결',      rows: 4, cols: 4, chapter: 3, difficulty: d(0.45, 2, 0, 1) },
  { id: 23, name: '나선형',         rows: 4, cols: 4, chapter: 3, difficulty: d(0.45, 2, 0, 1) },
  { id: 24, name: '대칭 회로',      rows: 4, cols: 4, chapter: 3, difficulty: d(0.5, 2, 0, 1) },
  { id: 25, name: '블랙아웃',       rows: 4, cols: 4, chapter: 3, difficulty: d(0.5, 3, 0, 1) },
  { id: 26, name: '분기점',         rows: 4, cols: 4, chapter: 3, difficulty: d(0.55, 3, 0, 2) },
  { id: 27, name: '순환 루프',      rows: 4, cols: 4, chapter: 3, difficulty: d(0.55, 3, 0, 2) },
  { id: 28, name: '미로 속 미로',   rows: 4, cols: 4, chapter: 3, difficulty: d(0.6, 3, 0, 2) },
  { id: 29, name: '퓨즈 박스',      rows: 4, cols: 4, chapter: 3, difficulty: d(0.6, 3, 0, 2) },
  { id: 30, name: '오버로드',       rows: 4, cols: 4, chapter: 3, difficulty: d(0.65, 3, 0, 3) },

  // ═══ Chapter 4 — 고급 배선 (4×5 → 5×5, 상급) ═══
  { id: 31, name: '넓은 격자',      rows: 4, cols: 5, chapter: 4, difficulty: d(0.5, 2, 0, 2) },
  { id: 32, name: '산업 단지',      rows: 5, cols: 4, chapter: 4, difficulty: d(0.5, 2, 0, 2) },
  { id: 33, name: '변전소',         rows: 5, cols: 5, chapter: 4, difficulty: d(0.55, 3, 0, 2) },
  { id: 34, name: '삼중 분기',      rows: 5, cols: 5, chapter: 4, difficulty: d(0.55, 3, 0, 2) },
  { id: 35, name: '전선 지옥',      rows: 5, cols: 5, chapter: 4, difficulty: d(0.6, 3, 0, 3) },
  { id: 36, name: '매듭',           rows: 5, cols: 5, chapter: 4, difficulty: d(0.6, 3, 0, 3) },
  { id: 37, name: '고압선',         rows: 5, cols: 5, chapter: 4, difficulty: d(0.65, 3, 0, 3) },
  { id: 38, name: '스파게티 배선',  rows: 5, cols: 5, chapter: 4, difficulty: d(0.7, 3, 0, 3) },
  { id: 39, name: '정전 복구',      rows: 5, cols: 5, chapter: 4, difficulty: d(0.7, 3, 0, 4) },
  { id: 40, name: '메가와트',       rows: 5, cols: 5, chapter: 4, difficulty: d(0.75, 3, 0, 4) },

  // ═══ Chapter 5 — 마스터 엔지니어 (5×5, 최상급) ═══
  { id: 41, name: '최종 시험',      rows: 5, cols: 5, chapter: 5, difficulty: d(0.7, 3, 0, 3) },
  { id: 42, name: '발전소',         rows: 5, cols: 5, chapter: 5, difficulty: d(0.7, 3, 0, 4) },
  { id: 43, name: '도시 전력망',    rows: 5, cols: 5, chapter: 5, difficulty: d(0.75, 3, 0, 4) },
  { id: 44, name: '해저 케이블',    rows: 5, cols: 5, chapter: 5, difficulty: d(0.75, 3, 0, 4) },
  { id: 45, name: '슈퍼그리드',     rows: 5, cols: 5, chapter: 5, difficulty: d(0.8, 3, 0, 5) },
  { id: 46, name: '퀀텀 회로',      rows: 5, cols: 5, chapter: 5, difficulty: d(0.8, 3, 0, 5) },
  { id: 47, name: '카오스 배선',    rows: 5, cols: 5, chapter: 5, difficulty: d(0.85, 3, 0, 5) },
  { id: 48, name: '핵융합로',       rows: 5, cols: 5, chapter: 5, difficulty: d(0.9, 3, 0, 5) },
  { id: 49, name: '다이슨 스피어',  rows: 5, cols: 5, chapter: 5, difficulty: d(0.95, 3, 0, 6) },
  { id: 50, name: '마스터 클리어',  rows: 5, cols: 5, chapter: 5, difficulty: d(1.0, 3, 0, 6) },
];

/** 챕터별로 스테이지 그룹핑 */
export function getStagesByChapter(chapter: number): Stage[] {
  return STAGES.filter(s => s.chapter === chapter);
}

/** 특정 스테이지의 다음 스테이지 반환 */
export function getNextStage(currentId: number | string): Stage | null {
  const idx = STAGES.findIndex(s => s.id === currentId);
  if (idx === -1 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
}

/** 챕터별 클리어 색상 테마 */
export interface ChapterClearTheme {
  /** 와이어 켜짐 색 */
  wirePowered: string;
  /** 와이어 클리어 색 (약간 밝은 톤) */
  wireClear: string;
  /** 클리어 배경 그라데이션 (밝은 톤) */
  clearBgFrom: string;
  clearBgTo: string;
  /** 글로우 rgba (투명도 없이) */
  glowR: number;
  glowG: number;
  glowB: number;
  /** 클리어 텍스트 색 (진한 톤) */
  textDark: string;
  textMid: string;
}

/** 챕터 정보 */
export const CHAPTERS: {
  id: number;
  name: string;
  description: string;
  icon: string;
  color: string;
  gridLabel: string;
  clearTheme: ChapterClearTheme;
}[] = [
  {
    id: 1, name: '전기의 시작', description: '기초를 배우세요',
    icon: '💡', color: '#FBBF24', gridLabel: '3×3',
    clearTheme: {
      wirePowered: '#FBBF24', wireClear: '#FCD34D',
      clearBgFrom: '#FFFBEB', clearBgTo: '#FEF3C7',
      glowR: 251, glowG: 191, glowB: 36,
      textDark: '#92400E', textMid: '#B45309',
    },
  },
  {
    id: 2, name: '확장 회로', description: '더 넓은 도전',
    icon: '🔌', color: '#22D3EE', gridLabel: '3×4 ~ 4×4',
    clearTheme: {
      wirePowered: '#22D3EE', wireClear: '#67E8F9',
      clearBgFrom: '#ECFEFF', clearBgTo: '#CFFAFE',
      glowR: 34, glowG: 211, glowB: 238,
      textDark: '#164E63', textMid: '#0E7490',
    },
  },
  {
    id: 3, name: '복합 회로', description: '복잡한 연결의 세계',
    icon: '⚡', color: '#FB923C', gridLabel: '4×4',
    clearTheme: {
      wirePowered: '#FB923C', wireClear: '#FDBA74',
      clearBgFrom: '#FFF7ED', clearBgTo: '#FFEDD5',
      glowR: 251, glowG: 146, glowB: 60,
      textDark: '#7C2D12', textMid: '#C2410C',
    },
  },
  {
    id: 4, name: '고급 배선', description: '프로의 영역',
    icon: '🔧', color: '#A78BFA', gridLabel: '4×5 ~ 5×5',
    clearTheme: {
      wirePowered: '#A78BFA', wireClear: '#C4B5FD',
      clearBgFrom: '#F5F3FF', clearBgTo: '#EDE9FE',
      glowR: 167, glowG: 139, glowB: 250,
      textDark: '#3B0764', textMid: '#6D28D9',
    },
  },
  {
    id: 5, name: '마스터 엔지니어', description: '최후의 도전',
    icon: '🏆', color: '#34D399', gridLabel: '5×5',
    clearTheme: {
      wirePowered: '#34D399', wireClear: '#6EE7B7',
      clearBgFrom: '#ECFDF5', clearBgTo: '#D1FAE5',
      glowR: 52, glowG: 211, glowB: 153,
      textDark: '#064E3B', textMid: '#047857',
    },
  },
];

/** 스테이지 ID로 챕터 클리어 테마 조회 */
export function getChapterTheme(chapter: number): ChapterClearTheme {
  const ch = CHAPTERS.find(c => c.id === chapter);
  return ch?.clearTheme ?? CHAPTERS[0].clearTheme;
}
