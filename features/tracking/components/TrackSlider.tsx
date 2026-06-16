import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';

// Leichtgewichtiger Slider ohne native Dependency (PanResponder).
// Snappt auf `step`. Port des <input type="range"> aus flow.jsx (Planen · Länge).

interface Props {
  value:    number;
  min:      number;
  max:      number;
  step?:    number;
  onChange: (v: number) => void;
  accent?:  string;
  minLabel?: string;
  maxLabel?: string;
}

export function TrackSlider({
  value, min, max, step = 1, onChange, accent = C.trackPrimary, minLabel, maxLabel,
}: Props) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const snap = (raw: number) => {
    const clamped = Math.max(min, Math.min(max, raw));
    return Math.round((clamped - min) / step) * step + min;
  };

  const fromX = (x: number) => {
    const w = widthRef.current;
    if (w <= 0) return value;
    return snap(min + (x / w) * (max - min));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => onChange(fromX(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => onChange(fromX(e.nativeEvent.locationX)),
    }),
  ).current;

  const pct = max > min ? (value - min) / (max - min) : 0;

  return (
    <View>
      <View
        style={s.hit}
        onLayout={(e) => { const w = e.nativeEvent.layout.width; widthRef.current = w; setWidth(w); }}
        {...responder.panHandlers}
      >
        <View style={s.track}>
          <View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: accent }]} />
        </View>
        <View style={[s.thumb, { left: Math.max(0, Math.min(width - 22, pct * width - 11)), borderColor: accent }]} />
      </View>
      {(minLabel || maxLabel) && (
        <View style={s.labels}>
          <Text style={s.label}>{minLabel}</Text>
          <Text style={s.label}>{maxLabel}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  hit:    { height: 28, justifyContent: 'center' },
  track:  { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  fill:   { height: '100%', borderRadius: 2 },
  thumb:  { position: 'absolute', top: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', borderWidth: 3, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  label:  { fontSize: 10, color: C.trackTextMut },
});
