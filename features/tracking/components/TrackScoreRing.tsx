import { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { C } from '@/constants/colors';

// Score-Ring — Port von design_handoff_faehrten/viz.jsx (ScoreRing).
// Grosser Wert in der Mitte, Gradient-Bogen (acc → acc-2), optionales Label/Sub.
//
// Innenraum ist klein (Ring-Ø minus Strich): `label`/`sub` sind für KURZE
// Wörter gedacht. Längere Beschriftungen (z. B. „Manuelle Bewertung", uppercase)
// laufen über den Bogen — die gehören als eigener Text NEBEN/UNTER den Ring
// (siehe app/track/[id].tsx Hero). `showMax` zeigt stattdessen nur „/max" klein
// unter der Zahl.

interface Props {
  value:   number;        // 0..max
  max?:    number;
  size?:   number;
  stroke?: number;
  label?:  string;
  sub?:    string;
  accent?: string;
  /** „/max" klein unter der Zahl (kurz genug für den Innenraum). */
  showMax?: boolean;
}

export function TrackScoreRing({
  value, max = 100, size = 118, stroke = 11, label, sub, accent = C.trackPrimary, showMax = false,
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
        {showMax ? <Text style={s.max}>/{max}</Text> : null}
        {label ? <Text style={s.label}>{label}</Text> : null}
        {sub ? <Text style={[s.sub, { color: accent }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  value:  { color: C.trackText, fontWeight: '900', letterSpacing: -1, lineHeight: undefined },
  max:    { fontSize: 11, color: C.trackTextMut, fontWeight: '700', marginTop: -2 },
  label:  { fontSize: 10, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1.4, marginTop: 5, textTransform: 'uppercase' },
  sub:    { fontSize: 11, fontWeight: '700', marginTop: 2 },
});
