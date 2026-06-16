import { useMemo } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { C } from '@/constants/colors';

// Abstrakte Fährten-Skizze — Port von design_handoff_faehrten/viz.jsx (TrackSketch)
// nach react-native-svg. Leichtgewichtige Visualisierung für Listen/Mini-Vorschauen
// (für die echte GPS-Spur nutzen wir TrackingMap).

// Normalisierte Stützpunkte der Fährte (0..1) — identisch zur Design-Referenz.
const BASE: [number, number][] = [
  [0.14, 0.86], [0.31, 0.20], [0.67, 0.27], [0.81, 0.62], [0.53, 0.83], [0.28, 0.56],
];

function track(legs: number): [number, number][] {
  return BASE.slice(0, Math.max(2, Math.min(legs + 1, BASE.length)));
}
function scale(pts: [number, number][], w: number, h: number, pad: number): [number, number][] {
  return pts.map(([x, y]) => [pad + x * (w - 2 * pad), pad + y * (h - 2 * pad)]);
}
function segments(pts: [number, number][]) {
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  return { seg, total };
}
function pointAt(pts: [number, number][], t: number): [number, number] {
  const { seg, total } = segments(pts);
  let want = t * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? want / seg[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
    }
    want -= seg[i];
  }
  return pts[pts.length - 1];
}
const poly = (pts: [number, number][]) => pts.map(p => p.join(',')).join(' ');

interface Props {
  legs?:       number;   // Anzahl Winkel (Richtungswechsel)
  objects?:    number;   // Apportiergegenstände
  size?:       number;   // quadratische Kantenlänge
  w?:          number;
  h?:          number;
  progress?:   number;   // 0..1 — gelaufener Anteil
  accent?:     string;
  showLabels?: boolean;
}

export function TrackSketch({
  legs = 3, objects = 3, size, w, h, progress = 1, accent = C.trackPrimary, showLabels = false,
}: Props) {
  const width = w ?? size ?? 100;
  const height = h ?? size ?? 100;
  const gid = useMemo(() => `ts-${Math.round(width)}-${Math.round(height)}`, [width, height]);

  const pts = useMemo(() => scale(track(legs), width, height, Math.min(26, width * 0.18)), [legs, width, height]);
  const drawn = poly(pts);
  const cur = pointAt(pts, progress);
  const objT = Array.from({ length: objects }, (_, i) => (i + 1) / (objects + 1));
  const dashFull = 1000;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor={accent} stopOpacity="0.4" />
          <Stop offset="1" stopColor={accent} stopOpacity="1" />
        </LinearGradient>
      </Defs>

      {/* schwache Gesamtroute */}
      <Polyline
        points={drawn} fill="none" stroke={accent} strokeOpacity={0.16}
        strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="2 6"
      />
      {/* zurückgelegt */}
      <Polyline
        points={drawn} fill="none" stroke={`url(#${gid})`} strokeWidth={3}
        strokeLinejoin="round" strokeLinecap="round"
        strokeDasharray={progress < 1 ? dashFull : undefined}
        strokeDashoffset={progress < 1 ? dashFull * (1 - progress) : undefined}
      />
      {/* Winkel-Marker */}
      {pts.slice(1, -1).map((p, i) => (
        <G key={`a${i}`}>
          <Circle cx={p[0]} cy={p[1]} r={9} fill="none" stroke={accent} strokeOpacity={0.5} strokeWidth={1.4} />
          {showLabels && (
            <SvgText x={p[0]} y={p[1] + 3.5} fontSize={9} fontWeight="700" fill={accent} textAnchor="middle">
              {i + 1}
            </SvgText>
          )}
        </G>
      ))}
      {/* Gegenstände */}
      {objT.map((t, i) => {
        const o = pointAt(pts, t);
        const found = progress >= t;
        return (
          <G key={`o${i}`} transform={`translate(${o[0]}, ${o[1]}) rotate(45)`}>
            <Rect
              x={-4.5} y={-4.5} width={9} height={9} rx={1.6}
              fill={found ? accent : 'none'} stroke={accent} strokeWidth={1.6} fillOpacity={found ? 1 : 0}
            />
          </G>
        );
      })}
      {/* Startflagge */}
      <G x={pts[0][0]} y={pts[0][1]}>
        <Circle r={6.5} fill={accent} />
        <Circle r={11} fill="none" stroke={accent} strokeOpacity={0.4} strokeWidth={1.4} />
      </G>
      {/* aktuelle Position */}
      {progress < 1 && (
        <G x={cur[0]} y={cur[1]}>
          <Circle r={13} fill={accent} opacity={0.18} />
          <Circle r={5.5} fill={accent} stroke="#04201b" strokeWidth={2} />
        </G>
      )}
    </Svg>
  );
}
