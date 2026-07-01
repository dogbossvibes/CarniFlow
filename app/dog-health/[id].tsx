import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { useToast } from '@/components/ui/Toast';
import { addDogHealthEntry, addDogVetAppointment } from '@/services/dogHub';
import { DateField } from '@/components/ui/DateField';

type Load = 'leicht' | 'mittel' | 'hoch';
const LOADS: Load[] = ['leicht', 'mittel', 'hoch'];

// Editor: Gesundheits-/Belastungs-Eintrag (dog_health_entries) + optional
// nächster Tierarzttermin (dog_vet_appointments).
export default function DogHealthEditor() {
  const router = useRouter();
  const { id: dogId } = useLocalSearchParams<{ id: string }>();
  const { showToast, toast } = useToast();

  const [weight, setWeight] = useState('');
  const [load, setLoad]     = useState<Load | null>(null);
  const [rest, setRest]     = useState(false);
  const [intense, setInt]   = useState(false);
  const [note, setNote]     = useState('');
  const [vetDate, setVetDate] = useState<Date | null>(null);
  const [vetReason, setVetReason] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!dogId || saving) return;
    const weightNum = weight.trim() ? Number(weight.replace(',', '.')) : null;
    if (weightNum != null && Number.isNaN(weightNum)) { showToast('Gewicht ist keine Zahl.'); return; }
    const vet = vetDate;

    setSaving(true);
    const { error } = await addDogHealthEntry(dogId, {
      weight_kg: weightNum, load_level: load, is_rest_day: rest, is_intense: intense, note: note.trim() || null,
    });
    if (!error && vet) await addDogVetAppointment(dogId, vet.toISOString(), vetReason.trim() || null);
    setSaving(false);
    if (error) { showToast('Konnte nicht gespeichert werden.'); return; }
    router.back();
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity>
          <Text style={s.barTitle}>Eintrag hinzufügen</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>Gewicht (kg)</Text>
          <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="z. B. 28.5" placeholderTextColor={C.trackTextMut} style={s.input} />

          <Text style={s.label}>Belastung</Text>
          <View style={s.seg}>
            {LOADS.map(l => {
              const on = load === l;
              return (
                <TouchableOpacity key={l} style={[s.segItem, on && s.segOn]} onPress={() => setLoad(on ? null : l)} activeOpacity={0.85}>
                  <Text style={[s.segTxt, on && s.segTxtOn]}>{l.charAt(0).toUpperCase() + l.slice(1)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.toggleRow}><Text style={s.toggleLabel}>Ruhetag</Text><Switch value={rest} onValueChange={setRest} trackColor={{ false: C.trackCardAlt, true: C.trackPrimary }} thumbColor="#fff" /></View>
          <View style={s.toggleRow}><Text style={s.toggleLabel}>Intensive Einheit</Text><Switch value={intense} onValueChange={setInt} trackColor={{ false: C.trackCardAlt, true: C.trackPrimary }} thumbColor="#fff" /></View>

          <Text style={s.label}>Notiz</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="optional" placeholderTextColor={C.trackTextMut} multiline style={[s.input, s.multiline]} />

          <Text style={s.label}>Nächster Tierarzttermin (optional)</Text>
          <DateField value={vetDate} onChange={setVetDate} onClear={() => setVetDate(null)} placeholder="Kein Termin" minimumDate={new Date()} style={{ marginBottom: 8 }} />
          <TextInput value={vetReason} onChangeText={setVetReason} placeholder="Grund (optional)" placeholderTextColor={C.trackTextMut} style={s.input} />

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
  multiline:  { minHeight: 80, textAlignVertical: 'top' },
  seg:        { flexDirection: 'row', gap: 8 },
  segItem:    { flex: 1, alignItems: 'center', backgroundColor: C.trackCard, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 12 },
  segOn:      { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  segTxt:     { fontSize: 13.5, color: C.trackTextSec, fontWeight: '700' },
  segTxtOn:   { color: '#04201b', fontWeight: '800' },
  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 8, paddingHorizontal: 14, marginTop: 8 },
  toggleLabel:{ fontSize: 14.5, color: C.trackText, fontWeight: '700' },
});
