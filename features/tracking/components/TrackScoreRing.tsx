import { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { C } from '@/constants/colors';

// Score-Ring — Port von design_handoff_faehrten/viz.jsx (ScoreRing).
// Großer Wert in der Mitte, Gradient-Bogen (acc → acc-2), optionales Label/Sub.

interface Props {
  value:   number;        // 0..max
  max?:    number;
  size?:   number;
  stroke?: number;
  label?:  string;
  sub?:    string;
  accent?: string;
}

export function TrackScoreRing({
  value, max = 100, size = 118, stroke = 11, label, sub, accent = C.trackPrimary,
}: Props) {
  const gid = useId();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value / max));
  const offset = circ * (1 - clamped);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={accent} />
            <Stop offset="1" stopColor={C.trackPrimaryDk} />
          </LinearGradient>
        </Defs>
        <Circle cx={center} cy={center} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <Circle
          cx={center} cy={center} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={s.center}>
        <Text style={[s.value, { fontSize: size * 0.32 }]}>{Math.round(value)}</Text>
        {label ? <Text style={s.label}>{label}</Text> : null}
        {sub ? <Text style={[s.sub, { color: accent }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  value:  { color: C.trackText, fontWeight: '900', letterSpacing: -1, lineHeight: undefined },
  label:  { fontSize: 10, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1.4, marginTop: 5, textTransform: 'uppercase' },
  sub:    { fontSize: 11, fontWeight: '700', marginTop: 2 },
});
