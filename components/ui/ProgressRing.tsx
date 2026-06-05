import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// Fortschrittsring für das Hundeprofil (Fährte / Schutzdienst / Unterordnung).
export function ProgressRing({
  progress,
  color,
  label,
  size = 88,
  stroke = 8,
}: {
  progress: number;        // 0..1
  color: string;
  label: string;
  size?: number;
  stroke?: number;
}) {
  const r       = (size - stroke) / 2;
  const circ    = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset  = circ * (1 - clamped);
  const center  = size / 2;

  return (
    <View style={s.wrap}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle
            cx={center} cy={center} r={r}
            stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none"
          />
          <Circle
            cx={center} cy={center} r={r}
            stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
          />
        </Svg>
        <Text style={s.value}>{Math.round(clamped * 100)}%</Text>
      </View>
      <Text style={s.label} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { alignItems: 'center', gap: 10 },
  value: { fontSize: 18, color: '#FFFFFF', fontWeight: '900', letterSpacing: -0.5 },
  label: { fontSize: 11, color: '#8A8A8F', fontWeight: '700' },
});
