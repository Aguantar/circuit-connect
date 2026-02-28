// src/components/TitleScreen.tsx
import { useState, useEffect } from 'react';
import { loadStats, recordSessionStart, type PersonalStats } from '../lib/stats';
import { STAGES } from '../game/stages';

interface TitleScreenProps {
  universalNodes: number;
  score: number;
  onStoryMode: () => void;
  onTimeAttack: () => void;
  onLeaderboard: () => void;
  onBuyUniversal: () => boolean;
}

function getGreeting(stats: PersonalStats): string {
  const cleared = stats.clearedStages.length;
  if (stats.totalPlays === 0) return '첫 회로를 연결해보세요!';
  if (stats.streakDays >= 3) return `${stats.streakDays}일 연속 접속! 대단해요 🔥`;
  if (cleared >= 40) return '마스터 엔지니어의 귀환!';
  if (cleared >= 20) return '숙련된 기술자, 다시 오셨군요!';
  return '다시 도전할 준비 되셨나요?';
}

function getStoryProgress(clearedCount: number): number {
  return Math.round((clearedCount / STAGES.length) * 100);
}

export default function TitleScreen({ universalNodes, score, onStoryMode, onTimeAttack, onLeaderboard, onBuyUniversal }: TitleScreenProps) {
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const [showShop, setShowShop] = useState(false);

  useEffect(() => {
    const s = recordSessionStart();
    setStats(s);
  }, []);

  const displayStats = stats ?? loadStats();
  const clearedCount = displayStats.clearedStages.length;
  const progress = getStoryProgress(clearedCount);

  const bestTA = [60, 120, 180]
    .map(t => displayStats.timeAttackBest[t as 60 | 120 | 180])
    .filter(Boolean)
    .sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))[0];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #223344 0%, #2A3D52 30%, #304558 60%, #223344 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      position: 'relative', overflow: 'hidden', padding: '0 20px',
    }}>
      {/* 배경 데코 */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {/* 그리드 라인 */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(251,191,36,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px', animation: 'gridDrift 30s linear infinite',
        }} />
        {/* 떠다니는 회로 도형 */}
        <div style={{
          position: 'absolute', top: '10%', left: '5%', width: 70, height: 70,
          border: '1.5px solid rgba(251,191,36,0.1)', borderRadius: 16,
          animation: 'logoFloat 6s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', bottom: '25%', right: '8%', width: 50, height: 50,
          border: '1.5px solid rgba(167,139,250,0.1)', borderRadius: 12,
          animation: 'logoFloat 5s ease-in-out infinite 0.5s',
        }} />
        {/* 글로우 */}
        <div style={{
          position: 'absolute', top: '-10%', right: '-15%', width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(251,191,36,0.06), transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-5%', left: '-10%', width: 220, height: 220, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(167,139,250,0.05), transparent 70%)',
        }} />
      </div>

      {/* ── 상단 바 ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        width: '100%', maxWidth: 360,
        marginTop: 'max(env(safe-area-inset-top, 12px), 16px)',
        position: 'relative', zIndex: 2,
        animation: 'fadeUp .5s ease-out both',
      }}>
        {/* 좌측: 랭킹 */}
        <button onClick={onLeaderboard} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '7px 12px', borderRadius: 10,
          background: 'rgba(251,191,36,0.1)',
          border: '1px solid rgba(251,191,36,0.2)',
          cursor: 'pointer', transition: 'transform .15s',
          fontSize: 13, fontWeight: 600, color: '#FBBF24',
        }}
          onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.95)')}
          onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <span style={{ fontSize: 14 }}>🏆</span>
          랭킹
        </button>

        {/* 우측: 포인트 + 만능블럭 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '7px 12px', borderRadius: 10,
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.15)',
          }}>
            <span style={{ fontSize: 12 }}>⭐</span>
            <span style={{ color: '#FBBF24', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {score.toLocaleString()}
            </span>
          </div>
          <div
            onClick={() => setShowShop(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '7px 12px', borderRadius: 10,
              background: 'rgba(167,139,250,0.12)',
              border: '1px solid rgba(167,139,250,0.25)',
              cursor: 'pointer', transition: 'transform .15s',
            }}
            onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.95)')}
            onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <span style={{ fontSize: 12 }}>🔮</span>
            <span style={{ color: '#A78BFA', fontSize: 13, fontWeight: 700 }}>{universalNodes}/5</span>
          </div>
        </div>
      </div>

      {/* ── 로고 ── */}
      <div style={{
        position: 'relative', zIndex: 1, textAlign: 'center',
        marginTop: 28, animation: 'fadeUp .6s ease-out .1s both',
      }}>
        <div style={{
          width: 68, height: 68, margin: '0 auto 10px',
          background: 'linear-gradient(135deg, #FBBF24 0%, #F59E0B 50%, #FBBF24 100%)',
          borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(251,191,36,0.3), 0 0 0 1px rgba(255,255,255,0.1) inset',
          animation: 'logoFloat 3s ease-in-out infinite',
        }}>
          <span style={{ fontSize: 34, filter: 'brightness(1.1)' }}>⚡</span>
        </div>
        <h1 style={{
          fontSize: 'clamp(26px, 7vw, 36px)', fontWeight: 800, letterSpacing: -0.5,
          color: '#FBBF24',
          textShadow: '0 0 30px rgba(251,191,36,0.3)',
          margin: '0 0 4px',
        }}>
          불을 켜줘!
        </h1>
        <p style={{ fontSize: 13, color: '#7A8BA0', letterSpacing: 1, margin: 0 }}>
          {getGreeting(displayStats)}
        </p>
      </div>

      {/* ── 내 기록 카드 ── */}
      <div style={{
        position: 'relative', zIndex: 1, marginTop: 22, width: '100%', maxWidth: 340,
        animation: 'fadeUp .6s ease-out .2s both',
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 18, padding: '16px 18px',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}>
          {/* 스토리 진행률 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8' }}>📖 스토리 진행</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#FBBF24' }}>
                {clearedCount > 0
                  ? `${clearedCount} / ${STAGES.length}`
                  : '시작 전'}
              </span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                width: `${Math.max(progress, 2)}%`,
                background: progress > 0 ? 'linear-gradient(90deg, #FBBF24, #F59E0B)' : 'rgba(255,255,255,0.1)',
                transition: 'width .8s ease',
                boxShadow: progress > 0 ? '0 0 10px rgba(251,191,36,0.5)' : 'none',
              }} />
            </div>
          </div>

          {/* 기록 수치 3칸 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{
              background: 'rgba(255,255,255,0.06)', borderRadius: 11, padding: '10px 6px', textAlign: 'center',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#F1F5F9', lineHeight: 1.2 }}>
                {displayStats.totalPlays}
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, marginTop: 2 }}>총 플레이</div>
            </div>
            <div style={{
              background: 'rgba(251,191,36,0.06)', borderRadius: 11, padding: '10px 6px', textAlign: 'center',
              border: '1px solid rgba(251,191,36,0.1)',
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#FBBF24', lineHeight: 1.2 }}>
                {bestTA ? bestTA.score.toLocaleString() : '-'}
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, marginTop: 2 }}>TA 최고점</div>
            </div>
            <div style={{
              background: 'rgba(251,146,60,0.06)', borderRadius: 11, padding: '10px 6px', textAlign: 'center',
              border: '1px solid rgba(251,146,60,0.1)',
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#FB923C', lineHeight: 1.2 }}>
                {displayStats.streakDays > 0 ? `${displayStats.streakDays}일` : '-'}
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, marginTop: 2 }}>연속 접속</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 모드 버튼 ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        width: '100%', maxWidth: 340, marginTop: 20,
        zIndex: 1, animation: 'fadeUp .6s ease-out .3s both',
      }}>
        {/* 스토리 모드 */}
        <button onClick={onStoryMode} style={{
          padding: '16px 20px', border: 'none', borderRadius: 16, cursor: 'pointer',
          background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
          color: '#78350F', display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 6px 24px rgba(251,191,36,0.3)',
          transition: 'transform .15s, box-shadow .15s',
        }}
          onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
          onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 19,
          }}>📖</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>스토리 모드</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 1 }}>
              {clearedCount > 0
                ? `${clearedCount}개 클리어 · 계속하기`
                : '5챕터 50스테이지 도전'}
            </div>
          </div>
        </button>

        {/* 타임어택 */}
        <button onClick={onTimeAttack} style={{
          padding: '16px 20px', border: 'none', borderRadius: 16, cursor: 'pointer',
          background: 'linear-gradient(135deg, #38BDF8, #0EA5E9)',
          color: '#0C4A6E', display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 6px 24px rgba(14,165,233,0.3)',
          transition: 'transform .15s, box-shadow .15s',
          width: '100%',
        }}
          onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
          onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 19, flexShrink: 0,
          }}>⏱</div>
          <div style={{ textAlign: 'left', flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: bestTA ? 6 : 1 }}>타임어택</div>
            {bestTA ? (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {([
                  { t: 60 as const, bg: 'rgba(245,158,11,0.35)', dim: 'rgba(245,158,11,0.12)' },
                  { t: 120 as const, bg: 'rgba(139,92,246,0.35)', dim: 'rgba(139,92,246,0.12)' },
                  { t: 180 as const, bg: 'rgba(16,185,129,0.35)', dim: 'rgba(16,185,129,0.12)' },
                ]).map(({ t, bg, dim }) => {
                  const b = displayStats.timeAttackBest[t];
                  return (
                    <div key={t} style={{
                      fontSize: 10, fontWeight: 600,
                      padding: '2px 7px', borderRadius: 6,
                      background: b ? bg : dim,
                      color: b ? 'white' : 'rgba(255,255,255,0.35)',
                    }}>
                      {t}초 {b ? b.score.toLocaleString() : '-'}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 11, opacity: 0.7 }}>60 / 120 / 180초 도전</div>
            )}
          </div>
        </button>
      </div>

      {/* ── 만능블럭 상점 팝업 ── */}
      {showShop && (
        <div
          onClick={() => setShowShop(false)}
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
                  onBuyUniversal();
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
              onClick={() => setShowShop(false)}
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

      <div style={{ height: 24 }} />
    </div>
  );
}
