// src/components/TimeAttack.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import { trackEvent } from '../api';
import type { CellData, Difficulty } from '../types/game';
import { generatePuzzle } from '../game/puzzle';
import { checkPowered, isTargetPowered } from '../game/power';
import { useLongPress } from '../hooks/useLongPress';
import PieceSVG from './PieceSVG';


/**
 * 시간 제한별 난이도 진행 테이블
 * 각 항목 = { rows, cols, difficulty }
 * 마지막 항목 이후로는 마지막 난이도가 무한 반복
 *
 * 60초 스프린트:  완만 상승 → 빠르게 많이 푸는 게 핵심
 * 120초 스탠다드: 중간 상승 → 밸런스형
 * 180초 마라톤:   가파른 상승 → 후반 극한 난이도
 */

interface StageConfig {
  rows: number;
  cols: number;
  difficulty: Difficulty;
}

const PROGRESSION_60: StageConfig[] = [
  // 1~2: 3×3 입문
  { rows: 3, cols: 3, difficulty: { pathWindiness: 0.0,  distractorLevel: 1, hintCount: 2, fixedBlockerCount: 0 } },
  { rows: 3, cols: 3, difficulty: { pathWindiness: 0.1,  distractorLevel: 1, hintCount: 1, fixedBlockerCount: 0 } },
  // 3~4: 3×3 약간 어려움
  { rows: 3, cols: 3, difficulty: { pathWindiness: 0.2,  distractorLevel: 1, hintCount: 0, fixedBlockerCount: 0 } },
  { rows: 3, cols: 3, difficulty: { pathWindiness: 0.25, distractorLevel: 2, hintCount: 0, fixedBlockerCount: 0 } },
  // 5~6: 3×4 전환
  { rows: 3, cols: 4, difficulty: { pathWindiness: 0.2,  distractorLevel: 2, hintCount: 0, fixedBlockerCount: 0 } },
  { rows: 3, cols: 4, difficulty: { pathWindiness: 0.3,  distractorLevel: 2, hintCount: 0, fixedBlockerCount: 0 } },
  // 7+: 4×4 고정 (60초라 여기까지 오기 어려움)
  { rows: 4, cols: 4, difficulty: { pathWindiness: 0.3,  distractorLevel: 2, hintCount: 0, fixedBlockerCount: 0 } },
];

const PROGRESSION_120: StageConfig[] = [
  // 1~2: 3×3 입문
  { rows: 3, cols: 3, difficulty: { pathWindiness: 0.0,  distractorLevel: 1, hintCount: 1, fixedBlockerCount: 0 } },
  { rows: 3, cols: 3, difficulty: { pathWindiness: 0.15, distractorLevel: 1, hintCount: 0, fixedBlockerCount: 0 } },
  // 3~4: 3×4 전환
  { rows: 3, cols: 4, difficulty: { pathWindiness: 0.2,  distractorLevel: 2, hintCount: 0, fixedBlockerCount: 0 } },
  { rows: 4, cols: 3, difficulty: { pathWindiness: 0.25, distractorLevel: 2, hintCount: 0, fixedBlockerCount: 0 } },
  // 5~6: 4×4 본격
  { rows: 4, cols: 4, difficulty: { pathWindiness: 0.3,  distractorLevel: 2, hintCount: 0, fixedBlockerCount: 0 } },
  { rows: 4, cols: 4, difficulty: { pathWindiness: 0.4,  distractorLevel: 2, hintCount: 0, fixedBlockerCount: 1 } },
  // 7~8: 4×5 전환
  { rows: 4, cols: 5, difficulty: { pathWindiness: 0.4,  distractorLevel: 2, hintCount: 0, fixedBlockerCount: 1 } },
  { rows: 4, cols: 5, difficulty: { pathWindiness: 0.45, distractorLevel: 3, hintCount: 0, fixedBlockerCount: 1 } },
  // 9+: 5×5 고정
  { rows: 5, cols: 5, difficulty: { pathWindiness: 0.5,  distractorLevel: 3, hintCount: 0, fixedBlockerCount: 2 } },
];

const PROGRESSION_180: StageConfig[] = [
  // 1: 3×3 워밍업 (빠르게 넘어감)
  { rows: 3, cols: 3, difficulty: { pathWindiness: 0.1,  distractorLevel: 1, hintCount: 1, fixedBlockerCount: 0 } },
  // 2~3: 3×4 빠른 전환
  { rows: 3, cols: 4, difficulty: { pathWindiness: 0.2,  distractorLevel: 2, hintCount: 0, fixedBlockerCount: 0 } },
  { rows: 4, cols: 3, difficulty: { pathWindiness: 0.25, distractorLevel: 2, hintCount: 0, fixedBlockerCount: 0 } },
  // 4~5: 4×4 본격
  { rows: 4, cols: 4, difficulty: { pathWindiness: 0.3,  distractorLevel: 2, hintCount: 0, fixedBlockerCount: 0 } },
  { rows: 4, cols: 4, difficulty: { pathWindiness: 0.4,  distractorLevel: 2, hintCount: 0, fixedBlockerCount: 1 } },
  // 6~7: 4×5 → 5×5 전환
  { rows: 4, cols: 5, difficulty: { pathWindiness: 0.45, distractorLevel: 3, hintCount: 0, fixedBlockerCount: 1 } },
  { rows: 5, cols: 5, difficulty: { pathWindiness: 0.5,  distractorLevel: 3, hintCount: 0, fixedBlockerCount: 2 } },
  // 8~9: 5×5 하드
  { rows: 5, cols: 5, difficulty: { pathWindiness: 0.6,  distractorLevel: 3, hintCount: 0, fixedBlockerCount: 2 } },
  { rows: 5, cols: 5, difficulty: { pathWindiness: 0.7,  distractorLevel: 3, hintCount: 0, fixedBlockerCount: 3 } },
  // 10+: 5×5 극한 (마라톤에서 여기까지 오면 고수)
  { rows: 5, cols: 5, difficulty: { pathWindiness: 0.8,  distractorLevel: 3, hintCount: 0, fixedBlockerCount: 4 } },
];

/** 시간 제한에 맞는 진행 테이블 반환 */
function getProgression(timeLimitSec: number): StageConfig[] {
  if (timeLimitSec <= 60) return PROGRESSION_60;
  if (timeLimitSec <= 120) return PROGRESSION_120;
  return PROGRESSION_180;
}

interface TimeAttackProps {
  universalNodes: number;
  timeLimitSec: number;
  onExit: () => void;
  onFinish: (result: TimeAttackResult) => void;
}

export interface TimeAttackResult {
  stagesCleared: number;
  totalScore: number;
  totalTimeMs: number;
  avgClearTimeMs: number;
  universalNodesUsed: number;
  timeLimitSec: number;
}

export default function TimeAttack({ universalNodes: initialNodes, timeLimitSec, onExit, onFinish }: TimeAttackProps) {
  const TIME_LIMIT_MS = timeLimitSec * 1000;
  const [grid, setGrid] = useState<CellData[][] | null>(null);
  const [powered, setPowered] = useState<boolean[][] | null>(null);
  const [stagesCleared, setStagesCleared] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [taps, setTaps] = useState(0);
  const [universalNodes, setUniversalNodes] = useState(initialNodes);
  const [universalUsed, setUniversalUsed] = useState(0);
  const [remainingMs, setRemainingMs] = useState(TIME_LIMIT_MS);
  const [isFinished, setIsFinished] = useState(false);
  const [clearFlash, setClearFlash] = useState(false);
  const [lastStageScore, setLastStageScore] = useState(0);
  const [longPressTarget, setLongPressTarget] = useState<{ r: number; c: number } | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showShopNotice, setShowShopNotice] = useState(false);

  // 토스트 자동 dismiss
  useEffect(() => {
    if (!showShopNotice) return;
    const t = setTimeout(() => setShowShopNotice(false), 1500);
    return () => clearTimeout(t);
  }, [showShopNotice]);

  const startTimeRef = useRef(Date.now());
  const rafRef = useRef<number | null>(null);
  const clearTimesRef = useRef<number[]>([]);
  const stageStartRef = useRef(Date.now());

  // 현재 스테이지 설정 (그리드 + 난이도)
  const getStageConfig = useCallback((cleared: number): StageConfig => {
    const progression = getProgression(timeLimitSec);
    const idx = Math.min(cleared, progression.length - 1);
    return progression[idx];
  }, [timeLimitSec]);

  // 새 퍼즐 생성
const spawnPuzzle = useCallback((clearedCount: number) => {
    const config = getStageConfig(clearedCount);
    const { rows, cols, difficulty } = config;
    // 보너스 셀: 클리어 수에 따라 점진 증가
    const bonusCells = clearedCount < 2 ? 0 : clearedCount < 5 ? 1 : clearedCount < 8 ? 2 : 3;
    const g = generatePuzzle(rows, cols, difficulty, bonusCells);
    setGrid(g);
    setPowered(checkPowered(g));
    setTaps(0);
    setClearFlash(false);
    stageStartRef.current = Date.now();
    trackEvent("stage_start", {
      mode: "time_attack", time_limit_sec: timeLimitSec,
      stage_id: `ta-${clearedCount + 1}`, grid_size: `${rows}x${cols}`,
    });
  }, [getStageConfig]);

  // 카운트다운 타이머
  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, TIME_LIMIT_MS - elapsed);
      setRemainingMs(remaining);

      if (remaining <= 0) {
        setIsFinished(true);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // 초기 퍼즐
  useEffect(() => { spawnPuzzle(0); }, [spawnPuzzle]);

  // 종료 처리
  useEffect(() => {
    if (!isFinished) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const totalTime = Date.now() - startTimeRef.current;
    const avg = clearTimesRef.current.length > 0
      ? clearTimesRef.current.reduce((a, b) => a + b, 0) / clearTimesRef.current.length
      : 0;

    trackEvent("time_attack_end", {
      stages_cleared: stagesCleared,
      total_score: totalScore,
      time_limit_sec: timeLimitSec,
      avg_clear_ms: Math.round(avg),
      universal_used: universalUsed,
    });
    onFinish({
      stagesCleared,
      totalScore,
      totalTimeMs: Math.min(totalTime, TIME_LIMIT_MS),
      avgClearTimeMs: Math.round(avg),
      universalNodesUsed: universalUsed,
      timeLimitSec,
    });
  }, [isFinished, stagesCleared, totalScore, universalUsed, onFinish]);

  // 클리어 판정
  const handleWin = useCallback((g: CellData[][], p: boolean[][]) => {
    if (!isTargetPowered(g, p)) return;

    const clearTime = Date.now() - stageStartRef.current;
    clearTimesRef.current.push(clearTime);

    // 빠를수록 보너스 (3초 이내 +200, 5초 이내 +150, 10초 이내 +100)
    let stageScore = 100;
    if (clearTime < 3000) stageScore += 200;
    else if (clearTime < 5000) stageScore += 150;
    else if (clearTime < 10000) stageScore += 100;

    const bonusCollected = g.reduce((count, row, r) =>
      count + row.filter((cell, c) => cell.isBonus && p[r][c]).length, 0
    );
    if (bonusCollected > 0) stageScore += 50 * bonusCollected;

    trackEvent("stage_clear", {
      mode: "time_attack",
      stage_id: `ta-${stagesCleared + 1}`,
      clear_time_ms: clearTime,
      grid_size: `${g.length}x${g[0].length}`,
      score: stageScore,
      universal_used: universalUsed,
      time_limit_sec: timeLimitSec,
      bonus_collected: bonusCollected,
    });
    setTotalScore(s => s + stageScore);
    const newCleared = stagesCleared + 1;
    setStagesCleared(newCleared);

    // 클리어 플래시 → 0.6초 후 다음 퍼즐
    setLastStageScore(stageScore);
    setClearFlash(true);
    setTimeout(() => {
      spawnPuzzle(newCleared);
    }, 600);
  }, [stagesCleared, spawnPuzzle]);

  // 탭 → 회전
  const handleTap = useCallback((r: number, c: number) => {
    if (isFinished || clearFlash || !grid) return;
    if (grid[r][c].isFixed) return;
    const g = grid.map(row => row.map(cell => ({ ...cell })));
    g[r][c].rotation = (g[r][c].rotation + 1) % 4;
    setGrid(g);
    setTaps(t => t + 1);
    // tap_rotate 이벤트 제거됨 (v2: 볼륨 80%+, stage_clear.taps로 대체)
    const p = checkPowered(g);
    setPowered(p);
    handleWin(g, p);
  }, [grid, isFinished, clearFlash, handleWin, stagesCleared, taps]);

  // 길게 누르기 → 만능블럭
  const handleLongPress = useCallback((r: number, c: number) => {
    if (universalNodes <= 0 || isFinished || clearFlash || !grid) return;
    if (grid[r][c].isSource || grid[r][c].isTarget || grid[r][c].isFixed) return;
    const g = grid.map(row => row.map(cell => ({ ...cell })));
    g[r][c].type = 'cross';
    g[r][c].rotation = 0;
    g[r][c].isUniversal = true;
    setGrid(g);
    setUniversalNodes(n => n - 1);
    setUniversalUsed(u => u + 1);
    trackEvent("item_use", {
      action: "use", item_type: "universal_block",
      mode: "time_attack", stage_id: `ta-${stagesCleared + 1}`,
      grid_size: `${g.length}x${g[0].length}`,
      remaining: universalNodes - 1,
    });
    const p = checkPowered(g);
    setPowered(p);
    handleWin(g, p);
    setLongPressTarget({ r, c });
    setTimeout(() => setLongPressTarget(null), 400);
  }, [grid, isFinished, clearFlash, universalNodes, handleWin]);

  const { handlePointerDown, handlePointerUp, cancelLongPress } = useLongPress({
    onTap: handleTap,
    onLongPress: handleLongPress,
  });

  if (!grid || !powered) return null;

  const rows = grid.length;
  const cols = grid[0].length;
  const maxW = Math.min(typeof window !== 'undefined' ? window.innerWidth : 400, 420);
  const cellSize = Math.min(Math.floor((maxW - 56) / cols), 78);

  // 타이머 색상 (30초 이하: 빨간색, 60초 이하: 주황)
  const timerSec = remainingMs / 1000;
  const timerColor = timerSec <= 30 ? '#EF4444' : timerSec <= 60 ? '#F59E0B' : '#0EA5E9';
  const timerBg = timerSec <= 30 ? 'rgba(239,68,68,0.08)' : timerSec <= 60 ? 'rgba(245,158,11,0.08)' : 'rgba(14,165,233,0.08)';

  // 모드별 배경 테마 (진한 톤)
  const modeBg = timeLimitSec <= 60
    ? { normal: 'linear-gradient(180deg, #FEF3C7 0%, #FDE68A 30%, #FFFBEB 100%)', flash: 'linear-gradient(180deg, #D1FAE5 0%, #A7F3D0 30%, #ECFDF5 100%)' }
    : timeLimitSec <= 120
    ? { normal: 'linear-gradient(180deg, #EDE9FE 0%, #DDD6FE 30%, #F5F3FF 100%)', flash: 'linear-gradient(180deg, #D1FAE5 0%, #A7F3D0 30%, #ECFDF5 100%)' }
    : { normal: 'linear-gradient(180deg, #D1FAE5 0%, #A7F3D0 30%, #ECFDF5 100%)', flash: 'linear-gradient(180deg, #FEF3C7 0%, #FDE68A 30%, #FFFBEB 100%)' };

  return (
    <div style={{
      minHeight: '100vh',
      background: clearFlash ? modeBg.flash : modeBg.normal,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "'SF Pro Display', -apple-system, sans-serif", padding: '64px 16px 16px',
      transition: 'background 0.4s ease',
    }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 400, marginBottom: 12, alignItems: 'center' }}>
        <button onClick={() => setShowExitConfirm(true)}
          style={{ background: 'white', border: '2px solid #3B82F6', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: '#2563EB', fontWeight: 800, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>←
        </button>
        <div style={{ fontSize: 18, color: '#0F172A', fontWeight: 700, flex: 1, textAlign: 'center' }}>⏱ 타임어택</div>
        <div style={{
          fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
          color: timerColor, background: timerBg,
          padding: '4px 14px', borderRadius: 20, minWidth: 80, textAlign: 'center',
          transition: 'all .3s',
          animation: timerSec <= 10 ? 'wirePulse 0.5s ease-in-out infinite' : 'none',
        }}>
          {timerSec.toFixed(1)}s
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 14, fontSize: 13, color: '#64748B',
        background: 'white', padding: '8px 20px', borderRadius: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)',
      }}>
        <span>클리어 <strong style={{ color: '#059669' }}>{stagesCleared}</strong></span>
        <span style={{ color: '#E2E8F0' }}>|</span>
        <span>점수 <strong style={{ color: '#F59E0B' }}>{totalScore}</strong></span>
        <span style={{ color: '#E2E8F0' }}>|</span>
        <span
          onClick={() => setShowShopNotice(true)}
          style={{ color: '#7C3AED', cursor: 'pointer' }}
        >🔮 {universalNodes}/5</span>
      </div>

      {/* 클리어 플래시 텍스트 */}
      {clearFlash && (
        <div style={{
          fontSize: 18, fontWeight: 800, color: '#059669', marginBottom: 8,
          animation: 'slideIn 0.3s ease-out',
        }}>
          ⚡ CLEAR! +{lastStageScore}점
        </div>
      )}

      {/* Grid */}
      <div style={{
        background: clearFlash ? 'rgba(236,253,245,0.9)' : 'white',
        borderRadius: 20, padding: 14,
        boxShadow: clearFlash
          ? '0 0 0 3px rgba(52,211,153,0.3), 0 8px 40px rgba(52,211,153,0.12)'
          : '0 4px 24px rgba(0,0,0,0.05)',
        border: clearFlash ? '1px solid rgba(52,211,153,0.4)' : '1px solid #E2E8F0',
        transition: 'all .3s ease',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
          gap: 3,
        }}>
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const isPow = powered[r]?.[c] ?? false;
              const isLP = longPressTarget?.r === r && longPressTarget?.c === c;
              return (
                <div key={`${r}-${c}`}
                  onPointerDown={e => handlePointerDown(r, c, e)}
                  onPointerUp={() => handlePointerUp(r, c)}
                  onPointerLeave={cancelLongPress}
                  onContextMenu={e => e.preventDefault()}
                  style={{
                    width: cellSize, height: cellSize,
                    background: cell.isSource ? 'linear-gradient(135deg, #FFFBEB, #FEF3C7)'
                      : cell.isTarget ? (isPow ? 'linear-gradient(135deg, #FFFBEB, #FDE68A)' : 'linear-gradient(135deg, #F1F5F9, #E2E8F0)')
                      : isPow ? 'linear-gradient(135deg, #F0F9FF, #E0F2FE)' : '#F8FAFC',
                    borderRadius: 10,
                    cursor: cell.isFixed ? 'default' : 'pointer',
                    border: cell.isSource ? '2.5px solid #F59E0B'
                      : cell.isTarget ? `2.5px solid ${isPow ? '#FBBF24' : '#94A3B8'}`
                      : isPow ? '1.5px solid rgba(14,165,233,0.2)' : '1.5px solid #E2E8F0',
                    transition: 'all .3s ease',
                    userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation',
                    transform: isLP ? 'scale(0.9)' : 'scale(1)',
                    position: 'relative',
                  }}
                >
                  <PieceSVG
                    type={cell.type} rotation={cell.rotation} powered={isPow}
                    isSource={cell.isSource} isTarget={cell.isTarget} isBonus={cell.isBonus}
                    isUniversal={cell.isUniversal} isFixed={cell.isFixed}
                    cellIdx={r * cols + c} cleared={false}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 나가기 확인 */}
      {showExitConfirm && (
        <div onClick={() => setShowExitConfirm(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: 20, padding: '24px 28px',
            maxWidth: 280, width: '85%', textAlign: 'center',
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
              정말 나가시겠어요?
            </div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>
              현재 기록은 저장되지 않아요
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowExitConfirm(false)} style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                background: '#F1F5F9', border: 'none', fontSize: 14, fontWeight: 600,
                color: '#475569', cursor: 'pointer',
              }}>계속하기</button>
              <button onClick={onExit} style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                background: '#EF4444', border: 'none', fontSize: 14, fontWeight: 600,
                color: 'white', cursor: 'pointer',
              }}>나가기</button>
            </div>
          </div>
        </div>
      )}

      {/* 만능블럭 구매 불가 토스트 */}
      {showShopNotice && (
        <div style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.85)', color: 'white',
          padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600,
          zIndex: 100, pointerEvents: 'none',
          animation: 'fadeUp .3s ease-out',
        }}>
          🔮 타임어택에서는 구매할 수 없어요
        </div>
      )}
    </div>
  );
}
