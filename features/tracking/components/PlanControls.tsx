import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import type { LiveConditions } from '@/services/weatherService';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Bausteine für "Fährte planen" — Port aus flow.jsx (Field, Stepper, Toggle) und
// chrome.jsx (WeatherStrip).

export function Field({ icon, label, hint, children }: { icon: IconName; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <View style={s.fieldIcon}><Ionicons name={icon} size={20} color={C.trackPrimary} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.fieldLabel}>{label}</Text>
        {hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function Stepper({ value, set, min = 0, max = 6 }: { value: number; set: (v: number) => void; min?: number; max?: number }) {
  const Btn = ({ txt, onPress, dis }: { txt: string; onPress: () => void; dis: boolean }) => (
    <TouchableOpacity onPress={onPress} disabled={dis} activeOpacity={0.8}
      style={[s.stepBtn, dis && s.stepBtnOff]}>
      <Text style={[s.stepBtnTxt, dis && { color: C.trackTextMut }]}>{txt}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={s.stepper}>
      <Btn txt="−" onPress={() => set(Math.max(min, value - 1))} dis={value <= min} />
      <Text style={s.stepVal}>{value}</Text>
      <Btn txt="+" onPress={() => set(Math.min(max, value + 1))} dis={value >= max} />
    </View>
  );
}

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.85}
      style={[s.toggle, { backgroundColor: on ? C.trackPrimary : 'rgba(255,255,255,0.12)' }]}>
      <View style={[s.knob, { left: on ? 23 : 3 }]} />
    </TouchableOpacity>
  );
}

const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
export function compassDir(deg: number | null): string {
  if (deg == null) return '—';
  return DIRS[Math.round(deg / 45) % 8];
}

export function WeatherStrip({ wx }: { wx: LiveConditions | null }) {
  const items: { icon: IconName; value: string; label: string }[] = [
    { icon: 'thermometer-outline', value: wx?.temp != null ? `${wx.temp}°` : '—',            label: 'Temp' },
    { icon: 'navigate-outline',    value: wx?.windSpeed != null ? `${wx.windSpeed}` : '—',    label: compassDir(wx?.windDir ?? null) },
    { icon: 'speedometer-outline', value: wx?.windGusts != null ? `${wx.windGusts}` : '—',    label: 'Böen' },
    { icon: 'water-outline',       value: wx?.humidity != null ? `${wx.humidity}%` : '—',     label: 'Luft' },
  ];
  return (
    <View style={s.wxRow}>
      {items.map((it, i) => (
        <View key={i} style={s.wxCell}>
          <Ionicons name={it.icon} size={16} color={C.trackPrimary} style={{ opacity: 0.85 }} />
          <Text style={s.wxVal}>{it.value}</Text>
          <Text style={s.wxLabel}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  field:     { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 15, borderRadius: 20, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder },
  fieldIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: C.trackPrimaryDk + '24', alignItems: 'center', justifyContent: 'center' },
  fieldLabel:{ fontSize: 14, color: C.trackText, fontWeight: '700' },
  fieldHint: { fontSize: 11, color: C.trackTextSec, marginTop: 1 },

  stepper:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn:   { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  stepBtnOff:{ backgroundColor: 'rgba(255,255,255,0.03)' },
  stepBtnTxt:{ fontSize: 18, fontWeight: '700', color: C.trackText },
  stepVal:   { fontSize: 19, fontWeight: '800', color: C.trackText, minWidth: 22, textAlign: 'center' },

  toggle:    { width: 50, height: 30, borderRadius: 999, justifyContent: 'center' },
  knob:      { position: 'absolute', top: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },

  wxRow:     { flexDirection: 'row', gap: 10 },
  wxCell:    { flex: 1, alignItems: 'flex-start', gap: 4 },
  wxVal:     { fontSize: 16, fontWeight: '800', color: C.trackText },
  wxLabel:   { fontSize: 8.5, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
});
