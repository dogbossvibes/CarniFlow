import React from 'react';
import { View } from 'react-native';
import Svg, {
  Polygon, Line, Text as SvgText, Circle, Defs, LinearGradient, Stop,
} from 'react-native-svg';
import type { ScoredMetrics } from '@/types/analytics';

interface Props {
  scores: ScoredMetrics;
  size?:  number;
}

const LABELS = ['Motivation', 'Konzentration', 'Präzision', 'Ausdauer', 'Trieblage', 'Impulsk.'];
const N = 6;

function polar(angleDeg: number, r: number, cx: number, cy: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function RadarChart({ scores, size = 260 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const R  = size * 0.33;

  const values = [
    scores.motivation,
    scores.konzentration,
    scores.praezision,
    scores.ausdauer,
    scores.trieblage,
    scores.impulskontrolle,
  ];

  // Build grid rings at 25, 50, 75, 100%
  const gridRings = [0.25, 0.50, 0.75, 1.0].map(pct => {
    const pts = Array.from({ length: N }, (_, i) => {
      const p = polar((360 / N) * i, R * pct, cx, cy);
      return `${p.x},${p.y}`;
    }).join(' ');
    return { pts, pct };
  });

  // Data polygon
  const dataPoints = values.map((v, i) => {
    const ratio = v > 0 ? v / 100 : 0;
    const p     = polar((360 / N) * i, R * ratio, cx, cy);
    return `${p.x},${p.y}`;
  });

  // Axis lines from center to edge
  const axes = Array.from({ length: N }, (_, i) => {
    const end = polar((360 / N) * i, R, cx, cy);
    return { x2: end.x, y2: end.y };
  });

  // Label positions (slightly beyond ring)
  const labelPositions = LABELS.map((label, i) => {
    const p = polar((360 / N) * i, R * 1.22, cx, cy);
    return { x: p.x, y: p.y, label };
  });

  // Dot positions on data polygon
  const dots = values.map((v, i) => {
    const ratio = v > 0 ? v / 100 : 0;
    return polar((360 / N) * i, R * ratio, cx, cy);
  });

  return (
    <View>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="radarFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor="#00FFCC" stopOpacity="0.25" />
            <Stop offset="100%" stopColor="#00f0c8" stopOpacity="0.10" />
          </LinearGradient>
        </Defs>

        {/* Grid rings */}
        {gridRings.map(({ pts, pct }) => (
          <Polygon
            key={pct}
            points={pts}
            fill="none"
            stroke={pct === 1 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)'}
            strokeWidth={pct === 1 ? 1 : 0.5}
          />
        ))}

        {/* Axis spokes */}
        {axes.map((axis, i) => (
          <Line
            key={i}
            x1={cx} y1={cy}
            x2={axis.x2} y2={axis.y2}
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={1}
          />
        ))}

        {/* Data polygon */}
        <Polygon
          points={dataPoints.join(' ')}
          fill="url(#radarFill)"
          stroke="#00FFCC"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* Data points */}
        {dots.map((d, i) =>
          values[i] > 0 ? (
            <Circle key={i} cx={d.x} cy={d.y} r={3.5} fill="#00FFCC" />
          ) : null,
        )}

        {/* Labels */}
        {labelPositions.map(({ x, y, label }) => (
          <SvgText
            key={label}
            x={x} y={y}
            textAnchor="middle"
            alignmentBaseline="middle"
            fill="rgba(255,255,255,0.45)"
            fontSize={9}
            fontWeight="600"
          >
            {label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
