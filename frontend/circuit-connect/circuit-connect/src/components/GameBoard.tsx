// src/components/GameBoard.tsx
import { useState, useCallback, useEffect} from 'react';
import { trackEvent } from '../api';
import type { CellData, Stage } from '../types/game';
import { generatePuzzle } from '../game/puzzle';
import { checkPowered, isTargetPowered} from '../game/power';
import { useTimer } from '../hooks/useTimer';
import { useLongPress } from '../hooks/useLongPress';
import { formatRunning} from '../utils/format';
import { isTutorialDone, markTutorialDone } from '../lib/stats';
import { getChapterTheme } from '../game/stages';
import PieceSVG from './PieceSVG';
import ClearOverlay from './ClearOverlay';

interface GameBoardProps {
  stage: Stage;
  universalNodes: number;
  score: number;
  onExit: () => void;
  onClear: (result: ClearResult) => void;
  onNextStage: () => void;
  onStageList: () => void;
  onBuyUniversal: () => boolean;
}

export interface ClearResult {
  taps: number;
  timeMs: number;
  bonusCollected: number;  // 수집한 보너스 셀 수
  universalNodesUsed: number;
}

const TUTORIAL_STEPS = [
  { title: '⚡ 전원', message: '여기서 전기가 시작돼요', highlight: 'source' as const, showFinger: false },
  { title: '💡 전구', message: '여기까지 전기를 연결하면 클리어!', highlight: 'target' as const, showFinger: false },
  { title: '👆 회전', message: '회로 조각을 탭하면 회전해요\n전원에서 전구까지 길을 이어보세요!', highlight: 'any' as const, showFinger: false },
  { title: '⭐ 보너스', message: '초록별을 경유하면 보너스 +50점!\n안 먹어도 클리어는 돼요', highlight: 'bonus' as const, showFinger: false },
  { title: '🔮 만능블럭', message: '셀을 꾹 길게 누르면\n모든 방향 연결 블럭이 배치돼요!', highlight: 'any' as const, showFinger: true },
];

export default function GameBoard({
  stage, universalNodes: initialNodes, score, onExit, onClear, onNextStage, onStageList, onBuyUniversal,
}: GameBoardProps) {
  const [grid, setGrid] = useState<CellData[][] | null>(null);
  const [powered, setPowered] = useState<boolean[][] | null>(null);
  const [cleared, setCleared] = useState(false);
  const [taps, setTaps] = useState(0);
  const [universalNodes, setUniversalNodes] = useState(initialNodes);
  const [universalUsed, setUniversalUsed] = useState(0);
  const [longPressTarget, setLongPressTarget] = useState<{ r: number; c: number } | null>(null);
  const [clearPhase, setClearPhase] = useState(0);
  const [finalMs, setFinalMs] = useState(0);
  const [showShop, setShowShop] = useState(false);
  const timer = useTimer();

  // 부모에서 universalNodes 변경 시 (구매 등) 로컬 동기화
  useEffect(() => {
    setUniversalNodes(initialNodes);
  }, [initialNodes]);

  const [tutorialStep, setTutorialStep] = useState(-1);
  const [showTutorial, setShowTutorial] = useState(false);

  // 챕터별 클리어 테마
  const theme = getChapterTheme(stage.chapter);

  /** 챕터별 보너스 셀 수 결정 */
  const getBonusCells = (chapter: number): number => {
    switch (chapter) {
      case 1: return Math.random() < 0.5 ? 0 : 1;   // 0~1개
      case 2: return 1;                               // 1개
      case 3: return Math.random() < 0.5 ? 1 : 2;    // 1~2개
      case 4: return 2;                               // 2개
      case 5: return Math.random() < 0.3 ? 2 : 3;    // 2~3개
      default: return 1;
    }
  };

  useEffect(() => {
    const g = generatePuzzle(stage.rows, stage.cols, stage.difficulty, getBonusCells(stage.chapter));
    setGrid(g);
    setPowered(checkPowered(g));
    setCleared(false);
    setTaps(0);
    setUniversalUsed(0);
    setClearPhase(0);
    setFinalMs(0);
    if (stage.id === 1 && !isTutorialDone()) {
      setShowTutorial(true);
      setTutorialStep(0);
    } else {
      setShowTutorial(false);
      setTutorialStep(-1);
      timer.start();
    }
    trackEvent("stage_start", {
      mode: "story", stage_id: String(stage.id),
      grid_size: `${stage.rows}x${stage.cols}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const advanceTutorial = useCallback(() => {
    const next = tutorialStep + 1;
    if (next >= TUTORIAL_STEPS.length) {
      setShowTutorial(false);
      setTutorialStep(-1);
      markTutorialDone();
      timer.start();
    } else {
      setTutorialStep(next);
    }
  }, [tutorialStep, timer]);

  const handleWin = useCallback((g: CellData[][], p: boolean[][]) => {
    if (!isTargetPowered(g, p)) return;
    const time = timer.stop();
    setFinalMs(time);
    setCleared(true);
    // 수집한 보너스 셀 개수 계산
    let bonusCount = 0;
    g.forEach((row, r) => row.forEach((cell, c) => {
      if (cell.isBonus && p[r][c]) bonusCount++;
    }));
    // bonus_collected 별도 이벤트 제거됨 (v2: stage_clear에 통합)
    setClearPhase(1);
    setTimeout(() => setClearPhase(2), 600);
    const stageScore = 100 + bonusCount * 50;
    trackEvent("stage_clear", {
      mode: "story", stage_id: String(stage.id),
      grid_size: `${g.length}x${g[0].length}`,
      clear_time_ms: time, taps, bonus_collected: bonusCount,
      universal_used: universalUsed, score: stageScore,
    });
    onClear({ taps, timeMs: time, bonusCollected: bonusCount, universalNodesUsed: universalUsed });
  }, [timer, taps, universalUsed, onClear]);

  const handleTap = useCallback((r: number, c: number) => {
    if (cleared || !grid || showTutorial) return;
    if (grid[r][c].isFixed) return;
    const g = grid.map(row => row.map(cell => ({ ...cell })));
    g[r][c].rotation = (g[r][c].rotation + 1) % 4;
    setGrid(g);
    setTaps(t => t + 1);
    // tap_rotate 이벤트 제거됨 (v2: 볼륨 80%+, stage_clear.taps로 대체)
    const p = checkPowered(g);
    setPowered(p);
    handleWin(g, p);
  }, [grid, cleared, showTutorial, handleWin]);

  const handleLongPress = useCallback((r: number, c: number) => {
    if (universalNodes <= 0 || cleared || !grid || showTutorial) return;
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
      mode: "story", stage_id: String(stage.id),
      grid_size: `${g.length}x${g[0].length}`,
      remaining: universalNodes - 1,
    });
    const p = checkPowered(g);
    setPowered(p);
    handleWin(g, p);
    setLongPressTarget({ r, c });
    setTimeout(() => setLongPressTarget(null), 400);
  }, [grid, cleared, showTutorial, universalNodes, handleWin]);

  const { handlePointerDown, handlePointerUp, cancelLongPress } = useLongPress({ onTap: handleTap, onLongPress: handleLongPress });

  if (!grid || !powered) return null;

  const rows = grid.length;
  const cols = grid[0].length;
  const maxW = Math.min(typeof window !== 'undefined' ? window.innerWidth : 400, 420);
  const cellSize = Math.min(Math.floor((maxW - 56) / cols), 78);
  const gap = 3;
  const gridPad = 14;

  // ── 테마 색상 (챕터별 분기) ──
  const isLit = clearPhase >= 1;
  const { glowR: gR, glowG: gG, glowB: gB } = theme;

  // 페이지 배경: 어두운 남색 → 클리어 시 챕터별 밝은 톤
  const pageBg = isLit
    ? `linear-gradient(180deg, ${theme.clearBgFrom} 0%, ${theme.clearBgTo} 30%, ${theme.clearBgFrom} 100%)`
    : 'linear-gradient(160deg, #223344 0%, #2A3D52 30%, #304558 60%, #223344 100%)';

  // 그리드 컨테이너
  const gridBg = isLit ? 'rgba(255,255,255,0.9)' : '#1C2B3A';
  const gridBorder = isLit ? `1px solid rgba(${gR},${gG},${gB},0.4)` : '1px solid #334455';
  const gridShadow = isLit
    ? `0 0 0 3px rgba(${gR},${gG},${gB},0.3), 0 8px 40px rgba(${gR},${gG},${gB},0.12)`
    : '0 4px 32px rgba(0,0,0,0.3)';

  // 셀 색상 함수 (챕터별)
  const getCellBg = (cell: CellData, isPow: boolean) => {
    if (cell.isSource) return isLit ? `linear-gradient(135deg, ${theme.clearBgFrom}, ${theme.clearBgTo})` : 'linear-gradient(135deg, #2A2010, #332A14)';
    if (cell.isTarget) {
      if (isPow) return `linear-gradient(135deg, ${theme.clearBgFrom}, ${theme.clearBgTo})`;
      return isLit ? 'linear-gradient(135deg, #F1F5F9, #E2E8F0)' : 'linear-gradient(135deg, #1A2535, #1F2D3D)';
    }
    // 고정 블로커 셀: 약간 어두운 톤
    if (cell.isFixed && !cell.isSource && !cell.isTarget) {
      if (isPow) {
        if (isLit) return `linear-gradient(135deg, rgba(${gR},${gG},${gB},0.06), rgba(${gR},${gG},${gB},0.03))`;
        return `linear-gradient(135deg, rgba(${gR},${gG},${gB},0.05), rgba(${gR},${gG},${gB},0.02))`;
      }
      return isLit ? '#EFF1F3' : '#1A2636';
    }
    if (isPow) {
      if (isLit) return `linear-gradient(135deg, ${theme.clearBgFrom}, rgba(255,255,255,0.9))`;
      // 플레이 중 켜진 셀: 미세한 챕터색 틴트
      return `linear-gradient(135deg, rgba(${gR},${gG},${gB},0.08), rgba(${gR},${gG},${gB},0.04))`;
    }
    return isLit ? '#F8FAFC' : '#223040';
  };

  const getCellBorder = (cell: CellData, isPow: boolean) => {
    if (cell.isSource) return '2.5px solid #F59E0B';
    if (cell.isTarget) return `2.5px solid ${isPow ? theme.wirePowered : (isLit ? '#94A3B8' : '#4B5C6E')}`;
    // 고정 블로커 셀: 점선 스타일 대신 어두운 실선
    if (cell.isFixed && !cell.isSource && !cell.isTarget) {
      return isLit ? '1.5px solid #C8CDD3' : '1.5px solid #2A3A4A';
    }
    if (isPow) return isLit ? `1.5px solid rgba(${gR},${gG},${gB},0.3)` : `1.5px solid rgba(${gR},${gG},${gB},0.25)`;
    return isLit ? '1.5px solid #E2E8F0' : '1.5px solid #334455';
  };

  const getCellShadow = (cell: CellData, isPow: boolean) => {
    if (cell.isSource) return '0 0 16px rgba(245,158,11,0.3)';
    if (cell.isTarget && isPow) return `0 0 20px rgba(${gR},${gG},${gB},0.35)`;
    if (isPow && !isLit) return `0 0 8px rgba(${gR},${gG},${gB},0.1)`;
    return 'none';
  };

  // 튜토리얼 하이라이트
  const getHighlightCell = (): { r: number; c: number } | null => {
    if (!showTutorial || tutorialStep < 0) return null;
    const step = TUTORIAL_STEPS[tutorialStep];
    if (step.highlight === 'source') return { r: 0, c: 0 };
    if (step.highlight === 'target') return { r: rows - 1, c: cols - 1 };
    if (step.highlight === 'bonus') {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c].isBonus) return { r, c };
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      if (!grid[r][c].isFixed && !grid[r][c].isSource && !grid[r][c].isTarget) return { r, c };
    return null;
  };
  const highlightCell = getHighlightCell();
  const spotX = highlightCell ? gridPad + highlightCell.c * (cellSize + gap) : 0;
  const spotY = highlightCell ? gridPad + highlightCell.r * (cellSize + gap) : 0;

  // 상단 바/정보 바 색상 (챕터별)
  const textPrimary = isLit ? theme.textDark : '#E2E8F0';
  const textSecondary = isLit ? theme.textMid : '#94A3B8';
  const infoBg = isLit ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.06)';
  const infoBorder = isLit ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.08)';
  const timerColor = isLit ? theme.textMid : theme.wirePowered;
  const timerBg = isLit ? `rgba(${gR},${gG},${gB},0.1)` : `rgba(${gR},${gG},${gB},0.12)`;

  return (
    <div
      onClick={showTutorial ? advanceTutorial : undefined}
      style={{
        minHeight: '100vh', background: pageBg,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        fontFamily: "'SF Pro Display', -apple-system, sans-serif", padding: 16,
        transition: 'background 0.8s ease',
      }}
    >
      {/* ── 상단 바 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 400, marginBottom: 12, alignItems: 'center' }}>
        <button onClick={(e) => {
          e.stopPropagation();
          if (!cleared && grid && powered) {
            const poweredCount = powered.flat().filter(Boolean).length;
            const totalCells = grid.length * grid[0].length;
            trackEvent("stage_fail", {
              mode: "story", stage_id: String(stage.id),
              grid_size: `${grid.length}x${grid[0].length}`, reason: "quit",
              taps, elapsed_ms: timer.elapsedMs,
              completion_pct: Math.round((poweredCount / totalCells) * 100),
            });
          }
          timer.reset(); onExit();
        }}
          style={{ background: 'none', border: 'none', color: textSecondary, fontSize: 14, cursor: 'pointer', transition: 'color .5s' }}>
          ← 나가기
        </button>
        <div style={{ fontSize: 14, color: textPrimary, fontWeight: 700, transition: 'color .5s' }}>
          {stage.name}
        </div>
        <div style={{
          fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
          color: timerColor, background: timerBg,
          padding: '4px 14px', borderRadius: 20, minWidth: 72, textAlign: 'center',
          transition: 'all .5s',
        }}>
          {formatRunning(timer.elapsedMs)}
        </div>
      </div>

      {/* ── 스테이지 정보 바 ── */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 14, fontSize: 13,
        color: textSecondary, background: infoBg,
        padding: '8px 18px', borderRadius: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: infoBorder,
        transition: 'all .5s', alignItems: 'center',
      }}>
        <span>
          Stage <strong style={{ color: timerColor }}>{stage.id}</strong>
          <span style={{ opacity: 0.4 }}>/50</span>
        </span>
        <span style={{ opacity: 0.2 }}>|</span>
        <span>{stage.rows}×{stage.cols}</span>
        <span style={{ opacity: 0.2 }}>|</span>
        <span style={{ color: timerColor, fontWeight: 600 }}>⭐ {score}</span>
        <span style={{ opacity: 0.2 }}>|</span>
        <span
          onClick={(e) => { e.stopPropagation(); if (!cleared) setShowShop(true); }}
          style={{
            color: '#A78BFA', fontWeight: 600, cursor: cleared ? 'default' : 'pointer',
            background: 'rgba(167,139,250,0.1)', padding: '2px 8px', borderRadius: 8,
          }}
        >🔮 {universalNodes}/5</span>
      </div>

      {/* ── 그리드 ── */}
      <div style={{
        background: gridBg, borderRadius: 20, padding: gridPad,
        boxShadow: gridShadow, border: gridBorder,
        transition: 'all .6s ease', position: 'relative',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
          gap,
        }}>
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const isPow = powered[r]?.[c] ?? false;
              const isLP = longPressTarget?.r === r && longPressTarget?.c === c;
              const isHL = showTutorial && highlightCell?.r === r && highlightCell?.c === c;
              return (
                <div key={`${r}-${c}`}
                  onPointerDown={e => handlePointerDown(r, c, e)}
                  onPointerUp={() => handlePointerUp(r, c)}
                  onPointerLeave={cancelLongPress}
                  onContextMenu={e => e.preventDefault()}
                  style={{
                    width: cellSize, height: cellSize,
                    background: getCellBg(cell, isPow),
                    borderRadius: 10,
                    cursor: cell.isFixed ? 'default' : cleared ? 'default' : 'pointer',
                    border: getCellBorder(cell, isPow),
                    transition: 'all .4s ease',
                    userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation',
                    transform: isLP ? 'scale(0.9)' : 'scale(1)',
                    boxShadow: getCellShadow(cell, isPow),
                    position: 'relative',
                    zIndex: isHL ? 30 : 'auto',
                  }}
                >
                  <PieceSVG
                    type={cell.type} rotation={cell.rotation} powered={isPow}
                    isSource={cell.isSource} isTarget={cell.isTarget} isBonus={cell.isBonus}
                    isUniversal={cell.isUniversal} isFixed={cell.isFixed}
                    cellIdx={r * cols + c} cleared={isLit}
                    theme={theme}
                  />
                </div>
              );
            })
          )}
        </div>

        {/* ══ 튜토리얼 스포트라이트 ══ */}
        {showTutorial && tutorialStep >= 0 && highlightCell && (
          <>
            <svg style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              borderRadius: 20, zIndex: 25, cursor: 'pointer',
            }}>
              <defs>
                <mask id="spotMask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect x={spotX - 2} y={spotY - 2} width={cellSize + 4} height={cellSize + 4} rx={12} ry={12} fill="black" />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#spotMask)" rx={20} ry={20} />
            </svg>
            <div style={{
              position: 'absolute', zIndex: 28, left: spotX - 4, top: spotY - 4,
              width: cellSize + 8, height: cellSize + 8, borderRadius: 14,
              border: `2.5px solid rgba(${gR},${gG},${gB},0.8)`,
              boxShadow: `0 0 24px rgba(${gR},${gG},${gB},0.5), 0 0 8px rgba(${gR},${gG},${gB},0.3)`,
              animation: 'tutorialPulse 1.5s ease-in-out infinite',
              pointerEvents: 'none',
            }} />
            {TUTORIAL_STEPS[tutorialStep].showFinger && (
              <div style={{
                position: 'absolute', zIndex: 29,
                left: spotX + cellSize / 2 - 16, top: spotY + cellSize + 4,
                fontSize: 32, animation: 'fingerPress 2s ease-in-out infinite',
                transformOrigin: 'center top',
                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))', pointerEvents: 'none',
              }}>👆</div>
            )}
          </>
        )}
      </div>

      {/* ══ 튜토리얼 안내 (그리드 아래) ══ */}
      {showTutorial && tutorialStep >= 0 && tutorialStep < TUTORIAL_STEPS.length && (
        <div style={{
          marginTop: 16, width: '100%', maxWidth: 320,
          background: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: '16px 22px',
          textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          border: '1px solid rgba(255,255,255,0.8)', cursor: 'pointer',
          animation: 'fadeUp .3s ease-out',
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>{TUTORIAL_STEPS[tutorialStep].title}</div>
          <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {TUTORIAL_STEPS[tutorialStep].message}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>탭하여 계속</span>
            <span style={{ display: 'flex', gap: 4 }}>
              {TUTORIAL_STEPS.map((_, i) => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: 3,
                  background: i === tutorialStep ? '#FBBF24' : '#E2E8F0',
                  transition: 'background .2s',
                }} />
              ))}
            </span>
          </div>
        </div>
      )}

      {/* ── 만능블럭 상점 팝업 ── */}
      {showShop && (
        <div
          onClick={(e) => { e.stopPropagation(); setShowShop(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, animation: 'fadeUp .2s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 20, padding: '24px 28px',
              maxWidth: 300, width: '85%', textAlign: 'center',
              boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔮</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
              만능블럭 상점
            </div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
              보유: {universalNodes}/5 · 점수: ⭐ {score}
            </div>

            {universalNodes >= 5 ? (
              <div style={{ fontSize: 14, color: '#94A3B8', marginBottom: 16 }}>
                이미 최대 보유 중이에요!
              </div>
            ) : score < 200 ? (
              <div style={{ fontSize: 14, color: '#94A3B8', marginBottom: 16 }}>
                점수가 부족해요 (200점 필요)
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const success = onBuyUniversal();
                  if (success) {
                    setUniversalNodes(n => Math.min(n + 1, 5));
                  }
                }}
                style={{
                  width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 700,
                  background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
                  color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(139,92,246,0.3)',
                  marginBottom: 16,
                }}
              >
                200점으로 구매
              </button>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); setShowShop(false); }}
              style={{
                background: 'none', border: 'none', color: '#94A3B8',
                fontSize: 14, cursor: 'pointer',
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* ── 클리어 오버레이 ── */}
      {clearPhase >= 2 && (
        <ClearOverlay taps={taps} finalMs={finalMs} onStageList={onStageList} onNextStage={onNextStage} />
      )}

      <style>{`
        @keyframes tutorialPulse {
          0%, 100% { box-shadow: 0 0 24px rgba(${gR},${gG},${gB},0.5), 0 0 8px rgba(${gR},${gG},${gB},0.3); transform: scale(1); }
          50% { box-shadow: 0 0 32px rgba(${gR},${gG},${gB},0.7), 0 0 12px rgba(${gR},${gG},${gB},0.4); transform: scale(1.03); }
        }
        @keyframes fingerPress {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.9; }
          15% { transform: translateY(-10px) scale(1); opacity: 1; }
          30% { transform: translateY(-3px) scale(0.82); opacity: 1; }
          60% { transform: translateY(-3px) scale(0.82); opacity: 1; }
          80% { transform: translateY(-10px) scale(1); opacity: 0.9; }
        }
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(180px) rotate(720deg); opacity: 0; }
        }
        @keyframes clearBounce {
          0% { transform: scale(0.3); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
