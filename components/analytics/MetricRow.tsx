import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { scoreColor } from '@/services/analytics/scoring';

interface Props {
  label:   string;
  value:   number; // 0-100
  delay?:  number;
}

export function MetricRow({ label, value, delay = 0 }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue:         value / 100,
      duration:        900,
      delay,
      useNativeDriver: false,
    }).start();
  }, [value, delay]);

  const color  = scoreColor(value);
  const width  = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  if (value === 0) return null;

  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <View style={s.barTrack}>
        <Animated.View style={[s.barFill, { width, backgroundColor: color }]} />
      </View>
      <Text style={[s.pct, { color }]}>{value}%</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  label:    { width: 104, fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  barTrack: { flex: 1, height: 5, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 3 },
  pct:      { width: 36, fontSize: 11, fontWeight: '700', textAlign: 'right' },
});
