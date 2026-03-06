// src/components/Leaderboard.tsx
import { useState, useEffect } from 'react';
import { getLeaderboard, getMyRank } from '../api';

interface Props { onBack: () => void; defaultTimeLimitSec?: number; }
export default function Leaderboard({ onBack, defaultTimeLimitSec = 180 }: Props) {
  const [timeLimitSec, setTimeLimitSec] = useState(defaultTimeLimitSec);
  const [rankings, setRankings] = useState<Array<{rank:number;nickname:string;score:number;stages_cleared:number;avg_clear_ms:number;user_key:string}>>([]);
  const [myRank, setMyRank] = useState<{rank:number;nickname:string;score:number;stages_cleared:number;avg_clear_ms:number} | null>(null);
  const [loading, setLoading] = useState(true);

  const handleTabChange = (sec: number) => {
    setTimeLimitSec(sec);
    setLoading(true);
    setMyRank(null);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getLeaderboard("time_attack", timeLimitSec, 10)
        .then(r => { if (!cancelled) setRankings(r); })
        .catch(() => { if (!cancelled) setRankings([]); }),
      getMyRank("time_attack", timeLimitSec)
        .then(r => { if (!cancelled) setMyRank(r ?? null); })
        .catch(() => { if (!cancelled) setMyRank(null); }),
    ]).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [timeLimitSec]);

  const tabs = [
    { sec: 60, label: '60초', emoji: '⚡', color: '#D97706', bg: 'linear-gradient(180deg, #FFFBEB 0%, #FEF3C7 30%, #FFFBEB 100%)' },
    { sec: 120, label: '120초', emoji: '🔥', color: '#7C3AED', bg: 'linear-gradient(180deg, #F5F3FF 0%, #EDE9FE 30%, #F5F3FF 100%)' },
    { sec: 180, label: '180초', emoji: '🏔️', color: '#059669', bg: 'linear-gradient(180deg, #ECFDF5 0%, #D1FAE5 30%, #ECFDF5 100%)' },
  ];

  const activeBg = tabs.find(t => t.sec === timeLimitSec)?.bg ?? tabs[0].bg;
  

  return (
    <div style={{
      minHeight: '100vh',
      background: activeBg,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "'SF Pro Display', -apple-system, sans-serif", padding: '64px 20px 20px',
      transition: 'background 0.3s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 360, marginBottom: 20, alignItems: 'center' }}>
        <button onClick={onBack} style={{ background: 'white', border: '2px solid #3B82F6', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: '#2563EB', fontWeight: 800, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>←</button>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>🏆 랭킹</div>
        <button onClick={async () => {
          try {
            const { openGameCenterLeaderboard } = await import('@apps-in-toss/web-framework');
            await openGameCenterLeaderboard();
          } catch (e) { console.warn('[Toss Leaderboard]', e); }
        }} style={{
          background: 'linear-gradient(135deg, #3182F6, #1A6AF6)',
          border: 'none', borderRadius: 10, padding: '6px 12px',
          fontSize: 12, fontWeight: 700, color: 'white', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(49,130,246,0.3)',
        }}>토스 랭킹</button>
        <div style={{ width: 60 }} />
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.sec} onClick={() => handleTabChange(t.sec)} style={{
            padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: 'white',
            color: timeLimitSec === t.sec ? t.color : '#94A3B8',
            border: timeLimitSec === t.sec ? `2px solid ${t.color}` : '1px solid #E2E8F0',
            transition: 'all .2s',
          }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* 랭킹 리스트 */}
      <div style={{
        background: 'white', borderRadius: 20, padding: '16px 20px', width: 'min(360px, 90vw)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #F1F5F9',
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#94A3B8' }}>로딩 중...</div>
        ) : rankings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#94A3B8' }}>아직 기록이 없어요</div>
        ) : (
          <>
            <div style={{ display: 'flex', padding: '8px 0', borderBottom: '2px solid #F1F5F9', fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>
              <span style={{ width: 36 }}>#</span>
              <span style={{ flex: 1 }}>닉네임</span>
              <span style={{ width: 60, textAlign: 'right' }}>점수</span>
              <span style={{ width: 50, textAlign: 'right' }}>클리어</span>
              <span style={{ width: 60, textAlign: 'right' }}>평균</span>
            </div>
            {rankings.map((e, i) => (
              <div key={`rank-${i}`} style={{
                display: 'flex', alignItems: 'center', padding: '10px 0',
                borderBottom: '1px solid #F8FAFC', fontSize: 13,
              }}>
                <span style={{
                  width: 36, fontWeight: 700,
                  color: e.rank === 1 ? '#F59E0B' : e.rank === 2 ? '#94A3B8' : e.rank === 3 ? '#CD7F32' : '#CBD5E1',
                  fontSize: e.rank <= 3 ? 16 : 13,
                }}>
                  {e.rank <= 3 ? ['🥇','🥈','🥉'][e.rank-1] : e.rank}
                </span>
                <span style={{ flex: 1, fontWeight: 600, color: '#0F172A' }}>{e.nickname}</span>
                <span style={{ width: 60, textAlign: 'right', fontWeight: 700, color: '#F59E0B', fontVariantNumeric: 'tabular-nums' }}>{e.score.toLocaleString()}</span>
                <span style={{ width: 50, textAlign: 'right', color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{e.stages_cleared}</span>
                <span style={{ width: 60, textAlign: 'right', color: '#8B5CF6', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{(e.avg_clear_ms/1000).toFixed(1)}s</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── 내 순위 ── */}
      {myRank && (
        <div style={{
          marginTop: 14, width: 'min(360px, 90vw)',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: '#94A3B8', marginBottom: 6, paddingLeft: 4,
          }}>
            📍 내 순위
          </div>
          <div style={{
            background: 'linear-gradient(135deg, #FFFBEB, #FEF9C3)', borderRadius: 16, padding: '14px 20px',
            boxShadow: '0 4px 24px rgba(251,191,36,0.12)',
            border: '2px solid rgba(251,191,36,0.35)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', fontSize: 13,
            }}>
              <span style={{
                width: 36, fontWeight: 800, color: '#D97706', fontSize: 16,
              }}>
                {myRank.rank}
              </span>
              <span style={{ flex: 1, fontWeight: 700, color: '#78350F' }}>
                {myRank.nickname || '???'}
              </span>
              <span style={{ width: 60, textAlign: 'right', fontWeight: 700, color: '#D97706', fontVariantNumeric: 'tabular-nums' }}>{myRank.score.toLocaleString()}</span>
              <span style={{ width: 50, textAlign: 'right', color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{myRank.stages_cleared}</span>
              <span style={{ width: 60, textAlign: 'right', color: '#8B5CF6', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{((myRank.avg_clear_ms ?? 0)/1000).toFixed(1)}s</span>
            </div>
          </div>
        </div>
      )}
      {!loading && !myRank && (
        <div style={{
          marginTop: 14, width: 'min(360px, 90vw)',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: '#94A3B8', marginBottom: 6, paddingLeft: 4,
          }}>
            📍 내 순위
          </div>
          <div style={{
            background: 'white', borderRadius: 16, padding: '14px 20px',
            border: '1px solid #E2E8F0', textAlign: 'center',
            fontSize: 13, color: '#94A3B8',
          }}>
            아직 플레이 기록이 없어요
          </div>
        </div>
      )}
    </div>
  );
}