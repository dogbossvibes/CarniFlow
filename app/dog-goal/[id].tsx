import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { haptic } from '@/lib/haptics';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { useToast } from '@/components/ui/Toast';
import { getActiveDogGoal, saveDogGoal } from '@/services/dogHub';

const PART_LABELS = ['Unterordnung', 'Fährte', 'Schutzdienst'] as const;
type PartKey = (typeof PART_LABELS)[number];
const clamp = (n: number) => Math.max(0, Math.min(100, n));

// Editor: Ziel + Teil-Fortschritte (dog_goals). Lädt das aktive Ziel zum Bearbeiten.
export default function DogGoalEditor() {
  const router = useRouter();
  const { id: dogId } = useLocalSearchParams<{ id: string }>();
  const { showToast, toast } = useToast();

  const [goalId, setGoalId] = useState<string | null>(null);
  const [title, setTitle]   = useState('');
  const [parts, setParts]   = useState<Record<PartKey, number>>({ Unterordnung: 0, Fährte: 0, Schutzdienst: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dogId) return;
    getActiveDogGoal(dogId).then(g => {
      if (!g) return;
      setGoalId(g.id);
      setTitle(g.title);
      setParts(prev => {
        const next = { ...prev };
        for (const p of g.parts) if ((PART_LABELS as readonly string[]).includes(p.label)) next[p.label as PartKey] = clamp(p.pct);
        return next;
      });
    });
  }, [dogId]);

  const overall = Math.round((parts.Unterordnung + parts.Fährte + parts.Schutzdienst) / 3);

  const save = async () => {
    if (!dogId || saving) return;
    setSaving(true);
    const { error } = await saveDogGoal(dogId, goalId, {
      title: title.trim() || 'Ziel',
      overall_pct: overall,
      parts: PART_LABELS.map(l => ({ label: l, pct: parts[l] })),
    });
    setSaving(false);
    if (error) { haptic.error(); showToast('Konnte nicht gespeichert werden.'); return; }
    haptic.success();
    router.back();
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity>
          <Text style={s.barTitle}>{goalId ? 'Ziel bearbeiten' : 'Ziel hinzufügen'}</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>Ziel</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="z. B. IGP 1" placeholderTextColor={C.trackTextMut} style={s.input} />

          <Text style={s.label}>Gesamtfortschritt</Text>
          <View style={s.overallBox}><Text style={s.overallTxt}>{overall} %</Text><Text style={s.overallHint}>Durchschnitt der Teilbereiche</Text></View>

          <Text style={s.label}>Teilbereiche</Text>
          {PART_LABELS.map(l => (
            <View key={l} style={s.stepRow}>
              <Text style={s.stepLabel}>{l}</Text>
              <View style={s.stepper}>
                <TouchableOpacity style={s.stepBtn} onPress={() => setParts(p => ({ ...p, [l]: clamp(p[l] - 5) }))}><Ionicons name="remove" size={18} color={C.trackText} /></TouchableOpacity>
                <Text style={s.stepVal}>{parts[l]}%</Text>
                <TouchableOpacity style={s.stepBtn} onPress={() => setParts(p => ({ ...p, [l]: clamp(p[l] + 5) }))}><Ionicons name="add" size={18} color={C.trackText} /></TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={{ height: 16 }} />
          <AnyvoButton label="Speichern" icon="checkmark" onPress={save} loading={saving} />
        </ScrollView>
      </SafeAreaView>
      {toast}
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.trackBg },
  bar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn:    { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  barTitle:   { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  scroll:     { padding: 16, gap: 8 },
  label:      { fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 12, marginBottom: 2 },
  input:      { backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.trackText },
  overallBox: { backgroundColor: C.accentDim, borderRadius: 16, borderWidth: 1, borderColor: C.accentMid, padding: 16, alignItems: 'center' },
  overallTxt: { fontSize: 30, color: C.trackPrimary, fontWeight: '900', letterSpacing: -1 },
  overallHint:{ fontSize: 11.5, color: C.trackTextSec, marginTop: 2 },
  stepRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 10, paddingHorizontal: 14 },
  stepLabel:  { fontSize: 14, color: C.trackText, fontWeight: '700' },
  stepper:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn:    { width: 36, height: 36, borderRadius: 11, backgroundColor: C.trackCardAlt, alignItems: 'center', justifyContent: 'center' },
  stepVal:    { width: 48, textAlign: 'center', fontSize: 15, color: C.trackText, fontWeight: '800' },
});
