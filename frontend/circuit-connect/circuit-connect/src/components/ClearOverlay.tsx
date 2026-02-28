// src/components/ClearOverlay.tsx
import { useState } from 'react';
import { formatTime } from '../utils/format';

interface ClearOverlayProps {
  taps: number;
  finalMs: number;
  onStageList: () => void;
  onNextStage: () => void;
}

/** 컨페티 파티클 생성 */
function generateConfetti(count: number) {
  const colors = ['#FBBF24', '#F59E0B', '#34D399', '#60A5FA', '#A78BFA', '#FB7185', '#FCD34D'];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 0.8,
    duration: 1.5 + Math.random() * 1.5,
    size: 4 + Math.random() * 6,
    rotation: Math.random() * 360,
    shape: Math.random() > 0.5 ? 'circle' : 'rect',
  }));
}

export default function ClearOverlay({ taps, finalMs, onStageList, onNextStage }: ClearOverlayProps) {
  const [confetti] = useState(() => generateConfetti(40));

  return (
    <div style={{
      marginTop: 24, textAlign: 'center', animation: 'slideIn .4s ease-out',
      position: 'relative', width: '100%', maxWidth: 360,
    }}>
      {/* 컨페티 파티클 */}
      <div style={{
        position: 'absolute', top: -60, left: 0, right: 0, height: 200,
        overflow: 'hidden', pointerEvents: 'none',
      }}>
        {confetti.map(c => (
          <div key={c.id} style={{
            position: 'absolute',
            left: `${c.x}%`,
            top: -10,
            width: c.shape === 'circle' ? c.size : c.size * 0.7,
            height: c.size,
            background: c.color,
            borderRadius: c.shape === 'circle' ? '50%' : 2,
            animation: `confettiFall ${c.duration}s ease-in ${c.delay}s both`,
            transform: `rotate(${c.rotation}deg)`,
            opacity: 0,
          }} />
        ))}
      </div>

      {/* 클리어 배너 */}
      <div style={{
        display: 'inline-block', padding: '12px 36px', borderRadius: 20,
        background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
        color: 'white', fontSize: 20, fontWeight: 800,
        boxShadow: '0 4px 24px rgba(251,191,36,0.4), 0 0 40px rgba(251,191,36,0.15)',
        marginBottom: 12,
        animation: 'clearBounce .6s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      }}>
        STAGE CLEAR ⚡
      </div>

      {/* 클리어 시간 */}
      <div style={{
        fontSize: 36, fontWeight: 800, color: '#92400E',
        fontVariantNumeric: 'tabular-nums', marginBottom: 4, letterSpacing: -1,
      }}>
        {formatTime(finalMs)}
      </div>

      <div style={{ fontSize: 13, color: '#B45309', marginBottom: 20 }}>
        {taps} taps · +100점
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button onClick={onStageList} style={{
          padding: '12px 24px', background: 'rgba(255,255,255,0.9)', border: '1px solid #FDE68A',
          borderRadius: 12, color: '#92400E', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          backdropFilter: 'blur(8px)',
        }}>스테이지 목록</button>
        <button onClick={onNextStage} style={{
          padding: '12px 24px', background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
          border: 'none', borderRadius: 12, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(251,191,36,0.3)',
        }}>다음 스테이지 →</button>
      </div>
    </div>
  );
}
