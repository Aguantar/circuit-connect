// src/components/PieceSVG.tsx
import type { PieceType } from '../types/game';
import { PIECE_CONNECTIONS } from '../types/game';
import { rotateConnections } from '../game/puzzle';
import type { ChapterClearTheme } from '../game/stages';

interface PieceSVGProps {
  type: PieceType;
  rotation: number;
  powered: boolean;
  isSource: boolean;
  isTarget: boolean;
  isBonus: boolean;
  isUniversal: boolean;
  isFixed: boolean;
  cellIdx: number;
  cleared: boolean;
  /** 챕터별 클리어 색상 테마 */
  theme?: ChapterClearTheme;
}

export default function PieceSVG({
  type, rotation, powered, isSource, isTarget,
  isBonus, isUniversal, isFixed, cellIdx, cleared,
  theme,
}: PieceSVGProps) {
  const s = 100;
  const cx = 50;
  const conns = rotateConnections(PIECE_CONNECTIONS[type], rotation);

  // ── 와이어 색상 시스템 (챕터별 분기) ──
  // 꺼짐: 어두운 슬레이트 / 켜짐: 챕터 메인색 / 클리어: 챕터 밝은색
  const chWire = theme?.wirePowered ?? '#FBBF24';
  const chClear = theme?.wireClear ?? '#FCD34D';

  const wireColor = isUniversal
    ? (powered ? '#A78BFA' : '#4C3D6E')
    : powered
      ? (cleared ? chClear : chWire)
      : '#475869';

  const wireGlow = isUniversal
    ? '#A78BFA'
    : cleared ? chClear : chWire;

  // 글로우 색상 (rgba)
  const gR = theme?.glowR ?? 251;
  const gG = theme?.glowG ?? 191;
  const gB = theme?.glowB ?? 36;

  const segs: string[] = [];
  if (conns[0]) segs.push(`M ${cx} ${cx} L ${cx} 0`);
  if (conns[1]) segs.push(`M ${cx} ${cx} L ${s} ${cx}`);
  if (conns[2]) segs.push(`M ${cx} ${cx} L ${cx} ${s}`);
  if (conns[3]) segs.push(`M ${cx} ${cx} L 0 ${cx}`);

  return (
    <svg viewBox={`0 0 ${s} ${s}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <filter id={`g${cellIdx}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* 배선 */}
      {segs.map((d, i) => (
        <g key={i}>
          {/* 켜진 와이어 글로우 */}
          {powered && (
            <path d={d} stroke={wireGlow} strokeWidth="18" strokeLinecap="round"
              opacity={cleared ? '0.25' : '0.2'} filter={`url(#g${cellIdx})`} />
          )}
          <path d={d}
            stroke={wireColor}
            strokeWidth={powered ? 6 : 4.5}
            strokeLinecap="round"
            style={powered ? {
              animation: `wirePulse 2s ease-in-out infinite`,
              animationDelay: `${cellIdx * 0.05}s`,
            } : undefined}
          />
        </g>
      ))}

      {/* 전원 노드 — 항상 밝음 */}
      {isSource && (
        <g>
          <circle cx={cx} cy={cx} r="20" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2.5"
            style={{ filter: 'drop-shadow(0 0 10px rgba(245,158,11,0.5))' }} />
          <text x={cx} y={cx + 2} textAnchor="middle" dominantBaseline="middle" fontSize="20">⚡</text>
        </g>
      )}

      {/* 전구 노드 — 챕터별 글로우 */}
      {isTarget && (
        <g>
          <circle cx={cx} cy={cx} r="20"
            fill={powered ? '#FEF9C3' : '#2E4050'}
            stroke={powered ? chWire : '#5A6B7B'}
            strokeWidth="2.5"
            style={powered ? {
              filter: `drop-shadow(0 0 14px rgba(${gR},${gG},${gB},0.6))`,
              animation: 'targetGlow 1.2s ease-in-out infinite',
            } : {
              filter: 'drop-shadow(0 0 4px rgba(75,92,110,0.3))',
            }} />
          <text x={cx} y={cx + 2} textAnchor="middle" dominantBaseline="middle"
            fontSize="20" style={{ opacity: powered ? 1 : 0.5 }}>💡</text>
        </g>
      )}

      {/* 보너스 */}
      {isBonus && !isSource && !isTarget && (
        <g>
          <circle cx={cx} cy={cx} r="10"
            fill={powered ? '#34D399' : '#1F3D2E'}
            stroke={powered ? '#059669' : '#2D5A40'} strokeWidth="1.5"
            style={powered ? { filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.5))' } : undefined}
          />
          <text x={cx} y={cx + 1} textAnchor="middle" dominantBaseline="middle"
            fontSize="11" fill={powered ? '#ECFDF5' : '#4A7A5C'} fontWeight="bold">★</text>
        </g>
      )}

      {/* 만능블럭 */}
      {isUniversal && !isSource && !isTarget && (
        <g>
          <circle cx={cx} cy={cx} r="10"
            fill={powered ? '#8B5CF6' : '#2D2547'}
            stroke={powered ? '#7C3AED' : '#4C3D6E'} strokeWidth="1.5"
            style={powered ? { filter: 'drop-shadow(0 0 6px rgba(139,92,246,0.5))' } : undefined}
          />
          <text x={cx} y={cx + 1} textAnchor="middle" dominantBaseline="middle"
            fontSize="14" fill={powered ? 'white' : '#7C6BAD'} fontWeight="bold">+</text>
        </g>
      )}

      {/* 고정 블로커 표시 (빗금 + 자물쇠 핀) */}
      {isFixed && !isSource && !isTarget && (
        <g>
          <defs>
            <pattern id={`hash${cellIdx}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke={powered ? `rgba(${gR},${gG},${gB},0.18)` : 'rgba(255,255,255,0.07)'} strokeWidth="2" />
            </pattern>
          </defs>
          <rect x="4" y="4" width="92" height="92" rx="8" ry="8" fill={`url(#hash${cellIdx})`} />
          {/* 자물쇠 핀 아이콘 (우상단) */}
          <g transform="translate(74, 6)" opacity={powered ? 0.6 : 0.35}>
            <rect x="4" y="8" width="12" height="10" rx="2" fill={powered ? `rgba(${gR},${gG},${gB},0.7)` : '#5A6B7B'} />
            <path d="M6 8V5a4 4 0 018 0v3" fill="none" stroke={powered ? `rgba(${gR},${gG},${gB},0.7)` : '#5A6B7B'} strokeWidth="2" strokeLinecap="round" />
          </g>
        </g>
      )}

      {/* 일반 중심점 */}
      {!isSource && !isTarget && !isBonus && !isUniversal && (
        <circle cx={cx} cy={cx} r={powered ? 5 : 3.5}
          fill={wireColor}
          style={powered ? { filter: `drop-shadow(0 0 5px ${wireGlow})` } : undefined}
        />
      )}
    </svg>
  );
}
