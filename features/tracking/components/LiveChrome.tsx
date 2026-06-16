import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type LiveView = 'map' | 'sketch';

export function fmtClock(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// blinkender REC-Punkt (Port von @keyframes anyvoRec)
function RecDot() {
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(op, { toValue: 0.25, duration: 600, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [op]);
  return <Animated.View style={[s.recDot, { opacity: op }]} />;
}

export function LiveTopBar({
  onBack, paused, view, onView,
}: {
  onBack: () => void;
  paused?: boolean;
  view?: LiveView;
  onView?: (v: LiveView) => void;
}) {
  return (
    <View style={s.topBar}>
      <TouchableOpacity style={s.backBtn} onPress={onBack} hitSlop={8} activeOpacity={0.8}>
        <Ionicons name="chevron-back" size={17} color={C.trackText} />
      </TouchableOpacity>
      <View style={[s.livePill, paused && s.livePillPaused]}>
        {paused ? <View style={[s.recDot, { opacity: 0.5 }]} /> : <RecDot />}
        <Text style={[s.liveTxt, paused && { color: C.trackTextSec }]}>{paused ? 'PAUSE' : 'LIVE'}</Text>
      </View>
      <View style={{ flex: 1 }} />
      {view && onView && (
        <View style={s.segment}>
          {([['map', 'Karte'], ['sketch', 'Skizze']] as [LiveView, string][]).map(([k, l]) => {
            const on = view === k;
            return (
              <TouchableOpacity key={k} onPress={() => onView(k)} activeOpacity={0.85}
                style={[s.segBtn, on && s.segBtnOn]}>
                <Text style={[s.segTxt, on ? s.segTxtOn : null]}>{l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function LiveTimer({ seconds, label = 'Laufzeit' }: { seconds: number; label?: string }) {
  return (
    <View style={[s.glass, s.timer]}>
      <Text style={s.timerVal}>{fmtClock(seconds)}</Text>
      <Text style={s.cap}>{label}</Text>
    </View>
  );
}

export function LiveDogPill({ name }: { name: string }) {
  return (
    <View style={[s.glass, s.dogPill]}>
      <View style={s.dogAvatar}><Text style={s.dogInitial}>{(name?.[0] ?? '?').toUpperCase()}</Text></View>
      <Text style={s.dogName}>{name}</Text>
    </View>
  );
}

export function LiveMetricBar({ items }: { items: { value: string; label: string; warn?: boolean }[] }) {
  return (
    <View style={[s.glass, s.metricBar]}>
      {items.map((m, i) => (
        <View key={i} style={[s.metricCell, i > 0 && s.metricDivider]}>
          <Text style={[s.metricVal, m.warn && { color: C.trackWarning }]} numberOfLines={1}>{m.value}</Text>
          <Text style={s.cap}>{m.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function LiveButton({
  icon, label, onPress, variant = 'ghost', flex = 1, disabled, active,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: 'ghost' | 'danger' | 'accent';
  flex?: number;
  disabled?: boolean;
  active?: boolean;
}) {
  const bg: StyleProp<ViewStyle> =
    variant === 'danger' ? s.btnDanger :
    variant === 'accent' ? s.btnAccent :
    active ? s.btnActive : s.btnGhost;
  const color =
    variant === 'danger' ? '#2a060a' :
    variant === 'accent' ? '#04201b' :
    active ? '#04201b' : C.trackText;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85}
      style={[s.liveBtn, bg, { flex }, disabled && { opacity: 0.45 }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[s.liveBtnTxt, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  topBar:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 10 },
  backBtn:  { width: 36, height: 36, borderRadius: 11, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },

  livePill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,93,108,0.14)', borderWidth: 1, borderColor: 'rgba(255,93,108,0.3)' },
  livePillPaused: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: C.trackBorder },
  recDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: C.trackDanger },
  liveTxt:  { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: '#ff8a94' },

  segment:  { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 11, padding: 3, gap: 2 },
  segBtn:   { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8 },
  segBtnOn: { backgroundColor: C.trackPrimary },
  segTxt:   { fontSize: 11.5, fontWeight: '700', color: C.trackTextSec },
  segTxtOn: { color: '#04201b' },

  glass:    { backgroundColor: 'rgba(20,22,25,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  cap:      { fontSize: 8.5, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 1 },

  timer:    { position: 'absolute', top: 14, left: 14, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10 },
  timerVal: { fontSize: 30, color: C.trackText, fontWeight: '900', letterSpacing: 0.5 },

  dogPill:  { position: 'absolute', top: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingVertical: 6, paddingLeft: 6, paddingRight: 12 },
  dogAvatar:{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center' },
  dogInitial:{ fontSize: 12, fontWeight: '800', color: '#05231d' },
  dogName:  { fontSize: 12.5, fontWeight: '700', color: C.trackText },

  metricBar:{ position: 'absolute', left: 14, right: 14, bottom: 14, flexDirection: 'row', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 8 },
  metricCell:{ flex: 1, alignItems: 'center' },
  metricDivider: { borderLeftWidth: 1, borderLeftColor: C.trackBorder },
  metricVal:{ fontSize: 15, fontWeight: '900', color: C.trackText },

  liveBtn:  { height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 3 },
  btnGhost: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: C.trackBorder },
  btnActive:{ backgroundColor: C.trackPrimary },
  btnAccent:{ backgroundColor: C.trackPrimary },
  btnDanger:{ backgroundColor: C.trackDanger },
  liveBtnTxt:{ fontSize: 10.5, fontWeight: '800' },
});
