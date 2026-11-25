import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline } from 'react-native-svg';
import { C } from '@/constants/colors';
import type { SectionPoint } from '../model';

// Punkteverlauf je Abteilung (z. B. A/B/C) – einfache Linien, ohne Bibliothek.
// Farbe UND Strichart unterscheiden die Abteilungen (nicht nur Farbe).

const STYLES = [
  { color: C.trackPrimary, dash: undefined },
  { color: C.trackBlue, dash: '6 4' },
  { color: C.trackPurple, dash: '2 4' },
  { color: C.trackWarning, dash: '8 3 2 3' },
] as const;

const W = 300; const H = 120; const PAD = 10;

export function chartGeometry(series: Record<string, SectionPoint[]>) {
  const keys = Object.keys(series).sort();
  const dates = [...new Set(keys.flatMap(k => series[k].map(p => p.date)))].sort();
  const max = Math.max(100, ...keys.flatMap(k => series[k].map(p => p.maxPoints ?? p.points)));
  const x = (date: string) => dates.length <= 1 ? W / 2 : PAD + (dates.indexOf(date) / (dates.length - 1)) * (W - 2 * PAD);
  const y = (points: number) => H - PAD - (Math.min(points, max) / max) * (H - 2 * PAD);
  return { keys, dates, max, x, y };
}

export function ExamPointsChart({ series, labels }: { series: Record<string, SectionPoint[]>; labels: Record<string, string> }) {
  const { keys, x, y, max } = chartGeometry(series);
  const summary = keys.map(k => {
    const pts = series[k];
    return `${labels[k] ?? k}: ${pts.map(p => p.points).join(', ')}`;
  }).join('; ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} stroke={C.trackBorder} strokeWidth={1} />
        <Line x1={PAD} y1={y(max * 0.7)} x2={W - PAD} y2={y(max * 0.7)} stroke={C.trackBorder} strokeWidth={1} strokeDasharray="2 4" />
        {keys.map((k, i) => {
          const st = STYLES[i % STYLES.length];
          const pts = series[k];
          return (
            <G key={k}>
              {pts.length > 1 ? (
                <Polyline points={pts.map(p => `${x(p.date)},${y(p.points)}`).join(' ')} fill="none" stroke={st.color} strokeWidth={2.5} strokeDasharray={st.dash} />
              ) : null}
              {pts.map(p => <Circle key={`${k}-${p.examId}`} cx={x(p.date)} cy={y(p.points)} r={3.5} fill={st.color} />)}
            </G>
          );
        })}
      </Svg>
      <View style={s.legend}>
        {keys.map((k, i) => (
          <View key={k} style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: STYLES[i % STYLES.length].color }]} />
            <Text style={s.legendText}>{`${k} ${labels[k] ?? ''}`.trim()}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  legend:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch:     { width: 14, height: 4, borderRadius: 2 },
  legendText: { fontSize: 13, color: C.trackTextSec },
});
