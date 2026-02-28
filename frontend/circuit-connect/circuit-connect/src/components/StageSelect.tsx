// src/components/StageSelect.tsx
import { useState } from 'react';
import { Stage } from '../types/game';
import { CHAPTERS, getStagesByChapter } from '../game/stages';
import { loadStats } from '../lib/stats';

interface StageSelectProps {
  onSelect: (stage: Stage) => void;
  onBack: () => void;
}

/** 난이도를 바 형태로 시각화 */
function DifficultyBar({ stage }: { stage: Stage; color: string }) {
  if (!stage.difficulty) return null;
  const score = Math.min(5, Math.round(
    stage.difficulty.pathWindiness * 2.5 +
    stage.difficulty.distractorLevel * 0.7 +
    stage.difficulty.fixedBlockerCount * 0.3
  ));
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          width: 4, height: i <= score ? 12 : 6,
          borderRadius: 2,
          background: i <= score
            ? (score <= 2 ? '#34D399' : score <= 3 ? '#FBBF24' : '#EF4444')
            : '#E2E8F0',
          transition: 'all .2s',
        }} />
      ))}
    </div>
  );
}

export default function StageSelect({ onSelect, onBack }: StageSelectProps) {
  const [openChapter, setOpenChapter] = useState(1);
  const stats = loadStats();
  const clearedStages = stats.clearedStages;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F0F9FF 0%, #F8FAFC 100%)',
      padding: '20px 16px',
      fontFamily: "'SF Pro Display', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{
          background: 'white', border: '1px solid #E2E8F0', borderRadius: 10,
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: 16, color: '#64748B',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>←</button>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: 0 }}>스토리 모드</h2>
          <p style={{ color: '#94A3B8', fontSize: 12, margin: 0 }}>
            {clearedStages.length > 0 ? `${clearedStages.length} / 50 클리어` : '5챕터 · 50스테이지'}
          </p>
        </div>
      </div>

      {/* Chapter Accordion */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CHAPTERS.map((chapter) => {
          const stages = getStagesByChapter(chapter.id);
          const isOpen = openChapter === chapter.id;
          const clearedInChapter = stages.filter(s => clearedStages.includes(s.id as number)).length;
          const allCleared = clearedInChapter === stages.length;

          return (
            <div key={chapter.id} style={{
              background: 'white',
              borderRadius: 16,
              border: isOpen ? `1.5px solid ${chapter.color}30` : '1px solid #E2E8F0',
              boxShadow: isOpen ? `0 4px 20px ${chapter.color}12` : '0 1px 4px rgba(0,0,0,0.03)',
              overflow: 'hidden',
              transition: 'all .3s ease',
            }}>
              {/* Chapter Header */}
              <button
                onClick={() => setOpenChapter(isOpen ? -1 : chapter.id)}
                style={{
                  width: '100%', padding: '16px 18px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 13,
                    background: allCleared
                      ? `linear-gradient(135deg, ${chapter.color}20, ${chapter.color}10)`
                      : `linear-gradient(135deg, ${chapter.color}15, ${chapter.color}08)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22,
                  }}>
                    {allCleared ? '✅' : chapter.icon}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: chapter.color, letterSpacing: 0.5 }}>
                      CHAPTER {chapter.id}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                      {chapter.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>
                      {chapter.gridLabel} · {clearedInChapter}/{stages.length} 클리어
                    </div>
                  </div>
                </div>
                <span style={{
                  color: '#CBD5E1', fontSize: 18, fontWeight: 300,
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform .25s ease',
                  display: 'inline-block',
                }}>›</span>
              </button>

              {/* Stage List */}
              <div style={{
                maxHeight: isOpen ? stages.length * 56 + 16 : 0,
                overflow: 'hidden',
                transition: 'max-height .35s ease',
              }}>
                <div style={{
                  padding: '0 12px 12px',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  {stages.map((stage, i) => {
                    const stageId = stage.id as number;
                    const isCleared = clearedStages.includes(stageId);
                    const isNext = !isCleared && stages.slice(0, i).every(s => clearedStages.includes(s.id as number));

                    return (
                      <button
                        key={stage.id}
                        onClick={() => onSelect(stage)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '11px 14px',
                          background: isCleared ? `${chapter.color}08` : '#FAFBFC',
                          border: isNext
                            ? `1.5px solid ${chapter.color}40`
                            : isCleared
                              ? `1px solid ${chapter.color}15`
                              : '1px solid #F1F5F9',
                          borderRadius: 11,
                          cursor: 'pointer',
                          transition: 'all .15s ease',
                        }}
                        onPointerEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = `${chapter.color}08`;
                          (e.currentTarget as HTMLElement).style.borderColor = `${chapter.color}25`;
                        }}
                        onPointerLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = isCleared ? `${chapter.color}08` : '#FAFBFC';
                          (e.currentTarget as HTMLElement).style.borderColor = isNext ? `${chapter.color}40` : isCleared ? `${chapter.color}15` : '#F1F5F9';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: isCleared
                              ? `linear-gradient(135deg, ${chapter.color}, ${chapter.color}CC)`
                              : 'rgba(0,0,0,0.04)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: isCleared ? 'white' : '#94A3B8',
                            fontSize: isCleared ? 14 : 12, fontWeight: 700,
                          }}>
                            {isCleared ? '✓' : i + 1}
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{stage.name}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>{stage.rows}×{stage.cols}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <DifficultyBar stage={stage} color={chapter.color} />
                          <span style={{ color: '#CBD5E1', fontSize: 16 }}>›</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 40 }} />
    </div>
  );
}
