import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Text as SvgText, Circle } from 'react-native-svg';
import type { TrendPoint } from '@/types/analytics';

interface Props {
  points: TrendPoint[];
  width?:  number;
  height?: number;
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpX  = (prev.x + curr.x) / 2;
    d += ` C ${cpX} ${prev.y} ${cpX} ${curr.y} ${curr.x} ${curr.y}`;
  }
  return d;
}

export function TrendLine({ points, width = 320, height = 110 }: Props) {
  const pad = { top: 12, right: 16, bottom: 28, left: 32 };
  const W   = width  - pad.left - pad.right;
  const H   = height - pad.top  - pad.bottom;

  if (!points.length) {
    return (
      <View style={[st.empty, { width, height }]}>
        <Text style={st.emptyTxt}>Sammle mehr Trainings für deinen Verlauf 📈</Text>
      </View>
    );
  }

  const scores  = points.map(p => p.score);
  const minVal  = Math.max(0,   Math.min(...scores) - 10);
  const maxVal  = Math.min(100, Math.max(...scores) + 10);
  const valRange = maxVal - minVal || 1;

  const toX = (i: number) => pad.left + (i / Math.max(points.length - 1, 1)) * W;
  const toY = (v: number) => pad.top  + H - ((v - minVal) / valRange) * H;

  const svgPts = points.map((p, i) => ({ x: toX(i), y: toY(p.score) }));
  const linePath = smoothPath(svgPts);

  // Fill path (close at bottom)
  const fillPath = linePath +
    ` L ${toX(points.length - 1)} ${pad.top + H}` +
    ` L ${toX(0)} ${pad.top + H} Z`;

  // Y grid lines at 25/50/75/100
  const gridValues = [25, 50, 75, 100].filter(v => v >= minVal && v <= maxVal);

  // X label — show first, middle, last
  const xLabels = points.length > 1
    ? [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i)
    : [0];

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor="#00FFCC" stopOpacity="0.18" />
          <Stop offset="100%" stopColor="#00FFCC" stopOpacity="0"    />
        </LinearGradient>
      </Defs>

      {/* Horizontal grid */}
      {gridValues.map(v => (
        <React.Fragment key={v}>
          <Line
            x1={pad.left} y1={toY(v)}
            x2={pad.left + W} y2={toY(v)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <SvgText
            x={pad.left - 4} y={toY(v) + 1}
            textAnchor="end"
            alignmentBaseline="middle"
            fill="rgba(255,255,255,0.25)"
            fontSize={8}
          >
            {v}
          </SvgText>
        </React.Fragment>
      ))}

      {/* Fill under curve */}
      <Path d={fillPath} fill="url(#lineGrad)" />

      {/* Line */}
      <Path d={linePath} fill="none" stroke="#00FFCC" strokeWidth={2} strokeLinejoin="round" />

      {/* Data dots */}
      {svgPts.map((p, i) => (
        <React.Fragment key={i}>
          <Line x1={p.x} y1={p.y} x2={p.x} y2={pad.top + H}
            stroke="rgba(0,255,204,0.08)" strokeWidth={1} />
          <Circle cx={p.x} cy={p.y} r={2.5} fill="#00FFCC" />
        </React.Fragment>
      ))}

      {/* X labels */}
      {xLabels.map(i => {
        const d = new Date(points[i].date);
        const lbl = `${d.getDate()}.${d.getMonth() + 1}`;
        return (
          <SvgText
            key={i}
            x={toX(i)} y={pad.top + H + 14}
            textAnchor="middle"
            fill="rgba(255,255,255,0.30)"
            fontSize={9}
          >
            {lbl}
          </SvgText>
        );
      })}
    </Svg>
  );
}

const st = StyleSheet.create({
  empty:    { alignItems: 'center', justifyContent: 'center' },
  emptyTxt: { color: 'rgba(255,255,255,0.2)', fontSize: 12 },
});
