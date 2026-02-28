// src/App.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { registerUser, trackEvent, markSessionStart } from './api';
import { recordStoryClear, recordTimeAttackEnd, loadStats, isTutorialDone } from './lib/stats';
import type { Stage, GameScreen } from './types/game';
import { getNextStage } from './game/stages';
import { STAGES } from './game/stages';
import TitleScreen from './components/TitleScreen';
import StageSelect from './components/StageSelect';
import GameBoard from './components/GameBoard';
import type { ClearResult } from './components/GameBoard';
import TimeAttack from './components/TimeAttack';
import type { TimeAttackResult } from './components/TimeAttack';
import TimeAttackResultScreen from './components/TimeAttackResult';
import Leaderboard from './components/Leaderboard';
import './styles/global.css';

// 화면 타입 확장
type Screen = GameScreen | 'timeAttackSelect' | 'timeAttack' | 'timeAttackResult' | 'leaderboard';

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
   if (!isTutorialDone()) return 'game';
   return 'title';
 });

  // 퍼널 추적: 이전 화면을 ref로 관리
  const screenRef = useRef<Screen>(screen);

  /** 화면 전환 + navigation 이벤트 발사 */
  const navigateTo = useCallback((to: Screen, context?: Record<string, unknown>) => {
    const from = screenRef.current;
    if (from !== to) {
      trackEvent("navigation", { from, to, ...context });
    }
    screenRef.current = to;
    setScreen(to);
  }, []);

  useEffect(() => {
    registerUser();
    markSessionStart();
    trackEvent("session_start", {
      device_info: {
        platform: /android/i.test(navigator.userAgent) ? "android" : /iphone|ipad/i.test(navigator.userAgent) ? "ios" : "web",
        screen_width: window.innerWidth,
        screen_height: window.innerHeight,
      }
    });
  }, []);

  const [currentStage, setCurrentStage] = useState<Stage | null>(() => {
   if (!isTutorialDone()) return STAGES[0];
   return null;
 })
  const [universalNodes, setUniversalNodes] = useState(5);
  const [score, setScore] = useState(0);
  const [taResult, setTaResult] = useState<TimeAttackResult | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [taKey, setTaKey] = useState(0);

const [taTimeLimit, setTaTimeLimit] = useState(180);

const handleStoryMode = useCallback(() => {
    navigateTo('stageSelect', { mode: 'story' });
  }, [navigateTo]);

  const handleTimeAttack = useCallback(() => {
    navigateTo('timeAttackSelect', { mode: 'time_attack' });
  }, [navigateTo]);

  const handleTimeSelect = useCallback((sec: number) => {
    setTaTimeLimit(sec);
    setTaKey(k => k + 1)
    navigateTo('timeAttack', { mode: 'time_attack', time_limit_sec: sec });
  }, [navigateTo]);



  const handleStageSelect = useCallback((stage: Stage) => {
    setCurrentStage(stage);
    setGameKey(k => k + 1)
    navigateTo('game', { mode: 'story', stage_id: String(stage.id) });
  }, [navigateTo]);

  const handleClear = useCallback((result: ClearResult) => {
    const bonus = result.bonusCollected * 50;
    setTimeout(() => setScore(s => s + 100 + bonus), 0);
    // 사용한 만큼만 차감 (자동 회복 없음)
    setUniversalNodes(n => n - result.universalNodesUsed);
    if (currentStage) {
      recordStoryClear(currentStage.id as number);
    }
  }, [currentStage]);

  /** 만능블럭 구매: 200점 차감, 최대 5개 */
  const handleBuyUniversal = useCallback(() => {
    if (score < 200 || universalNodes >= 5) return false;
    setScore(s => s - 200);
    setUniversalNodes(n => Math.min(n + 1, 5));
    trackEvent("item_use", {
      action: "purchase",
      item_type: "universal_block",
      mode: "story",
      cost: 200,
      remaining: Math.min(universalNodes + 1, 5),
    });
    return true;
  }, [score, universalNodes]);

  const handleNextStage = useCallback(() => {
    if (!currentStage) return;
    const next = getNextStage(currentStage.id as number);
    if (next) {
      setCurrentStage(next);
      setGameKey(k => k + 1)
      // 같은 game 화면 내 스테이지 전환 — navigation 불필요
    } else {
      navigateTo('stageSelect', { mode: 'story' });
    }
  }, [currentStage, navigateTo]);

  const handleStageList = useCallback(() => {
    navigateTo('stageSelect', { mode: 'story' });
  }, [navigateTo]);

  const handleExit = useCallback(() => {
    navigateTo('title');
  }, [navigateTo]);

  const handleLeaderboard = useCallback(() => {
    navigateTo('leaderboard');
  }, [navigateTo]);

  // 타임어택 종료 → 고정 별 보상 (랭킹 점수와 분리)
  const handleTimeAttackFinish = useCallback((result: TimeAttackResult) => {
    setTaResult(result);
    // 시간대별 고정 별 보상
    const starReward = result.timeLimitSec <= 60 ? 200 : result.timeLimitSec <= 120 ? 300 : 400;
    setScore(s => s + starReward);
    recordTimeAttackEnd(
     taTimeLimit as 60 | 120 | 180,
     result.totalScore,
     result.stagesCleared
   );
    navigateTo('timeAttackResult', { mode: 'time_attack', time_limit_sec: result.timeLimitSec });
  }, [taTimeLimit, navigateTo]);

  // 타임어택 재시도
  const handleTimeAttackRetry = useCallback(() => {
    setTaKey(k => k + 1)
    navigateTo('timeAttack', { mode: 'time_attack', time_limit_sec: taTimeLimit });
  }, [navigateTo, taTimeLimit]);

  switch (screen) {
    case 'title':
      return (
        <TitleScreen
          universalNodes={universalNodes}
          score={score}
          onStoryMode={handleStoryMode}
          onTimeAttack={handleTimeAttack}
          onLeaderboard={handleLeaderboard}
          onBuyUniversal={handleBuyUniversal}
        />
      );

    case 'stageSelect':
      return (
        <StageSelect
          onSelect={handleStageSelect}
          onBack={handleExit}
        />
      );

    case 'game':
      if (!currentStage) return null;
      return (
        <GameBoard
          key={gameKey}
          stage={currentStage}
          universalNodes={universalNodes}
          score={score}
          onExit={handleExit}
          onClear={handleClear}
          onNextStage={handleNextStage}
          onStageList={handleStageList}
          onBuyUniversal={handleBuyUniversal}
        />
      );

case 'timeAttackSelect': {
      const modes = [
        { sec: 60, label: '스프린트', emoji: '⚡', star: 200, desc: '빠른 판단력 테스트', grid: '3×3 → 4×4', color: ['#F59E0B', '#D97706'] },
        { sec: 120, label: '스탠다드', emoji: '🔥', star: 300, desc: '밸런스형 도전', grid: '3×3 → 5×5', color: ['#8B5CF6', '#7C3AED'] },
        { sec: 180, label: '마라톤', emoji: '🏔️', star: 400, desc: '극한 난이도 도전', grid: '3×3 → 5×5 하드', color: ['#10B981', '#059669'] },
      ];
      const taBests: Record<number, number | null> = {};
      const s = loadStats();
      [60, 120, 180].forEach(t => {
        const b = s.timeAttackBest[t as 60 | 120 | 180];
        taBests[t] = b ? b.score : null;
      });
      return (
        <div style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #F0F9FF 0%, #E0F2FE 30%, #F8FAFC 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'SF Pro Display', -apple-system, sans-serif", padding: '20px',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 20 }}>⏱ 타임어택</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
            {modes.map(m => (
              <button key={m.sec} onClick={() => handleTimeSelect(m.sec)} style={{
                padding: '16px 20px', border: 'none', borderRadius: 16, cursor: 'pointer',
                background: `linear-gradient(135deg, ${m.color[0]}, ${m.color[1]})`,
                color: 'white', textAlign: 'left',
                boxShadow: `0 6px 20px ${m.color[1]}40`,
                transition: 'transform .15s',
              }}
                onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{m.sec}초 {m.emoji} {m.label}</span>
                  <span style={{ fontSize: 12, opacity: 0.8, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 8 }}>⭐ +{m.star}</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{m.desc} · {m.grid}</div>
                {taBests[m.sec] !== null && (
                  <div style={{ fontSize: 11, opacity: 0.7 }}>🏆 최고 {taBests[m.sec]!.toLocaleString()}점</div>
                )}
              </button>
            ))}
          </div>
          <button onClick={handleExit} style={{
            marginTop: 16, background: 'none', border: 'none', color: '#94A3B8', fontSize: 14, cursor: 'pointer',
          }}>← 돌아가기</button>
        </div>
      );
    }
    case 'timeAttack':
      return (
        <TimeAttack
          key={taKey}
          universalNodes={universalNodes}
          timeLimitSec={taTimeLimit}
          onExit={handleExit}
          onFinish={handleTimeAttackFinish}
        />
      );

    case 'timeAttackResult':
      if (!taResult) return null;
      return (
        <TimeAttackResultScreen
          result={taResult}
          onExit={handleExit}
          onRetry={handleTimeAttackRetry}
          onLeaderboard={() => navigateTo('leaderboard', { mode: 'time_attack' })}
        />
      );
    case 'leaderboard':
      return <Leaderboard onBack={handleExit} defaultTimeLimitSec={taTimeLimit} />;

    default:
      return null;
  }
}
