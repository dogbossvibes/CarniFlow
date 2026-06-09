import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import { useClients } from '@/hooks/useTrainer';
import { createPlan } from '@/services/trainingPlanService';
import { successHaptic, tapHaptic } from '@/lib/haptics';

export default function PlanNeuScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { profile } = useProfile();
  const { clients } = useClients();

  const [title, setTitle]           = useState('');
  const [discipline, setDiscipline] = useState('');
  const [notes, setNotes]           = useState('');
  const [stepsText, setStepsText]   = useState('');
  const [shared, setShared]         = useState<string[]>([]);
  const [saving, setSaving]         = useState(false);

  const active = clients.filter(c => c.status === 'active');
  const toggleShare = (id: string) => setShared(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const save = async () => {
    if (!session?.user.id) return;
    if (!title.trim()) { Alert.alert('Titel fehlt', 'Bitte gib dem Plan einen Titel.'); return; }
    const steps = stepsText.split('\n').map(s => s.trim()).filter(Boolean);
    if (!steps.length) { Alert.alert('Schritte fehlen', 'Bitte trage mindestens einen Schritt ein (eine Zeile pro Schritt).'); return; }

    setSaving(true);
    const { error } = await createPlan(session.user.id, profile?.trainer_name ?? profile?.full_name ?? 'Trainer', {
      title:       title.trim(),
      discipline:  discipline.trim() || null,
      notes:       notes.trim() || null,
      steps,
      shared_with: shared,
    });
    setSaving(false);
    if (error) { Alert.alert('Fehler', error); return; }
    successHaptic();
    router.back();
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={22} color={C.white} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>TRAINER</Text>
          <Text style={s.title}>Neuer Plan</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={s.label}>TITEL</Text>
          <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="z. B. Aufbau Fährte 6 Wochen" placeholderTextColor={C.subtle} />

          <Text style={[s.label, { marginTop: 18 }]}>DISZIPLIN  ·  optional</Text>
          <TextInput style={s.input} value={discipline} onChangeText={setDiscipline} placeholder="z. B. Fährte" placeholderTextColor={C.subtle} />

          <Text style={[s.label, { marginTop: 18 }]}>SCHRITTE  ·  eine Zeile pro Schritt</Text>
          <TextInput
            style={[s.input, { minHeight: 140, textAlignVertical: 'top' }]}
            value={stepsText} onChangeText={setStepsText} multiline
            placeholder={'Woche 1: Geruchsdifferenzierung\nWoche 2: Winkel üben\n…'}
            placeholderTextColor={C.subtle}
          />

          <Text style={[s.label, { marginTop: 18 }]}>NOTIZEN  ·  optional</Text>
          <TextInput
            style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
            value={notes} onChangeText={setNotes} multiline
            placeholder="Hinweise für die Kund:in…" placeholderTextColor={C.subtle}
          />

          <Text style={[s.label, { marginTop: 18 }]}>TEILEN MIT</Text>
          {active.length === 0 ? (
            <Text style={s.noClients}>Noch keine verbundenen Kund:innen.</Text>
          ) : (
            active.map(c => {
              const on = shared.includes(c.clientId);
              return (
                <TouchableOpacity key={c.clientId} style={[s.clientRow, on && s.clientRowOn]} onPress={() => { tapHaptic(); toggleShare(c.clientId); }} activeOpacity={0.8}>
                  <View style={[s.checkbox, on && s.checkboxOn]}>{on && <Ionicons name="checkmark" size={14} color={C.accentText} />}</View>
                  <Text style={s.clientName}>{c.name ?? 'Kunde'}</Text>
                  {c.dogNames.length > 0 && <Text style={s.clientDogs}>🐾 {c.dogNames.join(', ')}</Text>}
                </TouchableOpacity>
              );
            })
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} activeOpacity={0.9}>
        {saving ? <ActivityIndicator color={C.accentText} /> : <Text style={s.saveTxt}>Plan speichern</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, color: '#00F5D4', fontWeight: '800', letterSpacing: 2 },
  title:   { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  body:    { paddingHorizontal: 20, paddingTop: 4 },
  label:   { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  input:   { backgroundColor: C.input, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, color: C.white, fontSize: 15 },
  noClients: { fontSize: 13, color: C.subtle, paddingVertical: 6 },
  clientRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 8 },
  clientRowOn: { borderColor: C.accentMid, backgroundColor: C.accentDim },
  checkbox:    { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  checkboxOn:  { backgroundColor: C.accent, borderColor: C.accent },
  clientName:  { flex: 1, fontSize: 15, color: C.white, fontWeight: '700' },
  clientDogs:  { fontSize: 12, color: C.muted },
  saveBtn: { margin: 20, backgroundColor: C.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  saveTxt: { fontSize: 16, color: C.accentText, fontWeight: '800' },
});
