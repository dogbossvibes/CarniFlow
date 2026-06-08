import { useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, Switch, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ACCENT = '#00F5D4';
const OPTIONS = [
  { l: '15 Min', v: 15 }, { l: '30 Min', v: 30 }, { l: '1 Std', v: 60 },
  { l: '3 Std', v: 180 }, { l: '24 Std', v: 1440 },
];

export function ReminderCard({
  selected, onToggle, pushOn, setPushOn,
}: {
  selected: number[]; onToggle: (m: number) => void; pushOn: boolean; setPushOn: (b: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggleOpen = () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpen(o => !o); };

  const summary = selected.length === 0 ? 'Aus' : `${selected.length} aktiv`;

  return (
    <View style={s.card}>
      <TouchableOpacity style={s.head} onPress={toggleOpen} activeOpacity={0.7}>
        <Ionicons name="notifications-outline" size={18} color={ACCENT} />
        <Text style={s.headTxt}>Erinnerung</Text>
        <Text style={s.summary}>{summary}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
      </TouchableOpacity>

      {open && (
        <View style={s.body}>
          <View style={s.chips}>
            {OPTIONS.map(o => {
              const active = selected.includes(o.v);
              return (
                <TouchableOpacity key={o.v} style={[s.chip, active && s.chipOn]} onPress={() => { tapHaptic(); onToggle(o.v); }} activeOpacity={0.8}>
                  <Text style={[s.chipTxt, active && s.chipTxtOn]}>{o.l}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.pushRow}>
            <Text style={s.pushTxt}>Push-Benachrichtigung</Text>
            <Switch value={pushOn} onValueChange={setPushOn} trackColor={{ false: C.cardAlt, true: ACCENT }} thumbColor={C.white} />
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card:    { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  head:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  headTxt: { flex: 1, fontSize: 15, color: C.white, fontWeight: '600' },
  summary: { fontSize: 13, color: C.muted, fontWeight: '600' },
  body:    { paddingHorizontal: 16, paddingBottom: 14, gap: 14, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14 },
  chips:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:    { borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.cardAlt, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn:  { borderColor: ACCENT, backgroundColor: 'rgba(0,245,212,0.12)' },
  chipTxt: { fontSize: 13, color: C.muted, fontWeight: '600' },
  chipTxtOn:{ color: ACCENT, fontWeight: '700' },
  pushRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pushTxt: { fontSize: 14, color: C.white, fontWeight: '500' },
});
