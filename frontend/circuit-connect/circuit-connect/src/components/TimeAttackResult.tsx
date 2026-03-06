// src/components/TimeAttackResult.tsx
import { useState, useEffect, useRef } from 'react';
import type { TimeAttackResult } from './TimeAttack';
import { submitScore, getMyRank, flushEvents } from '../api';

interface TimeAttackResultProps {
  result: TimeAttackResult;
  onExit: () => void;
  onRetry: () => void;
  onLeaderboard: () => void;
}

export default function TimeAttackResultScreen({ result, onExit, onRetry, onLeaderboard }: TimeAttackResultProps) {
  const [myRank, setMyRank] = useState<number | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    flushEvents();
    submitScore({
      mode: "time_attack",
      time_limit_sec: result.timeLimitSec,
      score: result.totalScore,
      stages_cleared: result.stagesCleared,
      avg_clear_ms: result.avgClearTimeMs,
      universal_used: result.universalNodesUsed,
    })
      .then(() => getMyRank("time_attack", result.timeLimitSec))
      .then(r => { if (r) setMyRank(r.rank); })
      .catch(() => {});
  }, [result]);

  const starReward = result.timeLimitSec <= 60 ? 200 : result.timeLimitSec <= 120 ? 300 : 400;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FDF2F8 0%, #FCE7F3 30%, #FDF2F8 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'SF Pro Display', -apple-system, sans-serif", padding: '64px 20px 20px',
    }}>
      {/* 결과 배너 */}
      <div style={{
        fontSize: 16, fontWeight: 700, color: '#BE185D',
        background: 'rgba(190,24,93,0.08)', padding: '8px 24px', borderRadius: 20,
        marginBottom: 24, letterSpacing: 1, textTransform: 'uppercase',
      }}>
        ⏱ TIME'S UP! ({result.timeLimitSec}초)
      </div>

      {/* 메인 점수 */}
      <div style={{
        fontSize: 64, fontWeight: 900, fontVariantNumeric: 'tabular-nums', marginBottom: 4,
        background: 'linear-gradient(135deg, #EC4899, #8B5CF6, #3B82F6)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        textShadow: 'none', letterSpacing: -2,
        animation: 'scorePopIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        {result.totalScore.toLocaleString()}
      </div>
      <style>{`
        @keyframes scorePopIn {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
      <div style={{
        fontSize: 13, fontWeight: 600, color: '#94A3B8', marginBottom: 8,
        letterSpacing: 2, textTransform: 'uppercase',
      }}>랭킹 점수</div>

      {/* 내 순위 */}
      {myRank !== null && (
        <div style={{
          fontSize: 15, fontWeight: 700, color: '#BE185D',
          background: 'rgba(190,24,93,0.06)', padding: '6px 18px', borderRadius: 12,
          marginBottom: 8,
        }}>
          🏆 {result.timeLimitSec}초 {myRank}위
        </div>
      )}

      {/* 획득 별 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(251,191,36,0.1)', padding: '6px 18px', borderRadius: 12,
        marginBottom: 28,
      }}>
        <span style={{ fontSize: 14 }}>⭐</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B' }}>
          +{starReward} 획득
        </span>
      </div>

      {/* 상세 스탯 */}
      <div style={{
        background: 'white', borderRadius: 20, padding: '16px 24px', width: 'min(300px, 85vw)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #F1F5F9',
        marginBottom: 28,
      }}>
        <StatRow label="클리어 스테이지" value={`${result.stagesCleared}개`} color="#059669" />
        <StatRow label="평균 클리어 시간" value={result.stagesCleared > 0 ? `${(result.avgClearTimeMs / 1000).toFixed(2)}초` : '-'} color="#8B5CF6" />
        <StatRow label="만능블럭 사용" value={`${result.universalNodesUsed}개`} color="#F59E0B" last />
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onExit} style={{
            padding: '14px 28px', background: 'white', border: '1px solid #E2E8F0',
            borderRadius: 14, color: '#475569', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>홈으로</button>
          <button onClick={onRetry} style={{
            padding: '14px 28px', background: 'linear-gradient(135deg, #EC4899, #BE185D)',
            border: 'none', borderRadius: 14, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(236,72,153,0.25)',
          }}>다시 도전</button>
        </div>
        <button onClick={onLeaderboard} style={{
          padding: '10px 24px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 12, color: '#D97706', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>🏆 랭킹 보기</button>
      </div>
    </div>
  );
}

function StatRow({ label, value, color, last = false }: { label: string; value: string; color: string; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0',
      borderBottom: last ? 'none' : '1px solid #F1F5F9',
    }}>
      <span style={{ fontSize: 14, color: '#64748B' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
