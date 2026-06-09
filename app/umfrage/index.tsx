import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { getMyClientConnections } from '@/services/connectionService';
import { createUmfrage } from '@/services/umfrageService';
import type { NeuerTermin } from '@/types/umfrage';

const TRAINING_ARTEN = ['IGP', 'Unterordnung', 'Schutzdienst', 'Fährte', 'Obedience', 'Agility', 'Begleithund'];

function fmtDate(t: string): string {
  const c = t.replace(/\D/g, '');
  if (c.length >= 4) return `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 8)}`;
  if (c.length >= 2) return `${c.slice(0, 2)}.${c.slice(2)}`;
  return c;
}
function fmtTime(t: string): string {
  const c = t.replace(/\D/g, '');
  return c.length >= 2 ? `${c.slice(0, 2)}:${c.slice(2, 4)}` : c;
}

export default function UmfrageErstellenScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [clients, setClients] = useState<{ id: string; name: string | null }[]>([]);
  useEffect(() => {
    if (!session?.user.id) return;
    getMyClientConnections(session.user.id).then(cs =>
      setClients(cs.filter(c => c.status === 'accepted').map(c => ({ id: c.counterpartId, name: c.counterpartName }))),
    );
  }, [session]);

  const [trainerName, setTrainerName] = useState('');
  const [arten, setArten] = useState<string[]>([]);
  const [notiz, setNotiz] = useState('');
  const [termine, setTermine] = useState<NeuerTermin[]>([{ datum: '', von: '', bis: '', ort: '' }]);
  const [kunden, setKunden] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const n = session?.user.user_metadata?.full_name;
    if (n) setTrainerName(n);
  }, [session]);

  const toggle = <T,>(a: T[], v: T) => a.includes(v) ? a.filter(x => x !== v) : [...a, v];
  const updateTermin = (i: number, field: keyof NeuerTermin, value: string) =>
    setTermine(p => p.map((t, idx) => idx === i ? { ...t, [field]: value } : t));

  const handleSend = async () => {
    if (!trainerName.trim()) { Alert.alert('Ups 🐾', 'Bitte Trainername eingeben.'); return; }
    if (arten.length === 0)  { Alert.alert('Ups 🐾', 'Bitte Training-Art wählen.'); return; }
    if (termine.some(t => !t.datum || !t.von)) { Alert.alert('Ups 🐾', 'Bitte alle Termine ausfüllen (Datum + Von).'); return; }
    if (!session?.user.id) return;

    setLoading(true);
    const { error } = await createUmfrage({
      trainerId: session.user.id, trainerName: trainerName.trim(),
      arten, notiz, termine, kundenIds: kunden,
    });
    setLoading(false);
    if (error) { Alert.alert('Ups 🐾', error); return; }
    Alert.alert('Super! 🎉', 'Umfrage wurde gesendet!', [{ text: 'OK', onPress: () => router.back() }]);
  };

  return (
    <SafeAreaView style={S.container} edges={['top']}>
      <View style={S.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={S.back} hitSlop={8}><Ionicons name="chevron-back" size={22} color="#E8E8F2" /></TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={S.header}>
          <Text style={S.title}>Terminumfrage</Text>
          <Text style={S.sub}>Erstelle eine neue Umfrage</Text>
        </View>

        <Text style={S.lbl}>Trainer Name</Text>
        <TextInput style={S.input} value={trainerName} onChangeText={setTrainerName} placeholder="Dein Name" placeholderTextColor="#525270" />

        <Text style={S.lbl}>Training-Art (Mehrfach)</Text>
        <View style={S.chipRow}>
          {TRAINING_ARTEN.map(art => (
            <TouchableOpacity key={art} style={[S.chip, arten.includes(art) && S.chipOn]} onPress={() => setArten(p => toggle(p, art))}>
              <Text style={[S.chipTxt, arten.includes(art) && S.chipTxtOn]}>{art}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={S.lbl}>Notiz an Kunden</Text>
        <TextInput style={[S.input, S.textarea]} value={notiz} onChangeText={setNotiz} placeholder="z. B. Apportierholz mitbringen…" placeholderTextColor="#525270" multiline />

        <Text style={S.lbl}>Terminvorschläge</Text>
        {termine.map((t, i) => (
          <View key={i} style={S.terminCard}>
            <View style={S.terminHeader}>
              <Text style={S.terminNr}>Termin {i + 1}</Text>
              {termine.length > 1 && (
                <TouchableOpacity onPress={() => setTermine(p => p.filter((_, idx) => idx !== i))}>
                  <Text style={{ color: '#E04040', fontSize: 12 }}>Entfernen</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput style={S.tInput} value={t.datum} onChangeText={v => updateTermin(i, 'datum', fmtDate(v))} placeholder="Datum (TT.MM.JJJJ)" placeholderTextColor="#525270" keyboardType="numeric" maxLength={10} />
            <View style={S.timeRow}>
              <TextInput style={[S.tInput, { flex: 1 }]} value={t.von} onChangeText={v => updateTermin(i, 'von', fmtTime(v))} placeholder="Von 09:00" placeholderTextColor="#525270" keyboardType="numeric" maxLength={5} />
              <Text style={S.timeSep}>–</Text>
              <TextInput style={[S.tInput, { flex: 1 }]} value={t.bis} onChangeText={v => updateTermin(i, 'bis', fmtTime(v))} placeholder="Bis 11:00" placeholderTextColor="#525270" keyboardType="numeric" maxLength={5} />
            </View>
            <TextInput style={S.tInput} value={t.ort} onChangeText={v => updateTermin(i, 'ort', v)} placeholder="Ort (optional)" placeholderTextColor="#525270" />
          </View>
        ))}
        <TouchableOpacity style={S.addTerminBtn} onPress={() => setTermine(p => [...p, { datum: '', von: '', bis: '', ort: '' }])}>
          <Text style={S.addTerminTxt}>+ Termin hinzufügen</Text>
        </TouchableOpacity>

        <Text style={S.lbl}>Kunden einladen</Text>
        {clients.length === 0 ? (
          <Text style={S.empty}>Noch keine verbundenen Kunden.</Text>
        ) : (
          <View style={S.chipRow}>
            {clients.map(k => (
              <TouchableOpacity key={k.id} style={[S.chip, kunden.includes(k.id) && S.chipOn]} onPress={() => setKunden(p => toggle(p, k.id))}>
                <Text style={[S.chipTxt, kunden.includes(k.id) && S.chipTxtOn]}>{k.name ?? 'Unbekannt'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={[S.sendBtn, loading && { opacity: 0.6 }]} onPress={handleSend} disabled={loading}>
          <Text style={S.sendBtnTxt}>{loading ? 'Wird gesendet…' : 'Umfrage senden ✓'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090F' },
  topBar:  { paddingHorizontal: 12, paddingTop: 4 },
  back:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  header:  { padding: 20, paddingBottom: 8 },
  title:   { color: '#E8E8F2', fontSize: 26, fontWeight: '800' },
  sub:     { color: '#525270', fontSize: 13, marginTop: 4 },
  lbl:     { color: '#525270', fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 8, marginTop: 18 },
  input:   { backgroundColor: '#0A1A18', borderRadius: 10, borderWidth: 1, borderColor: '#1A3A30', padding: 12, color: '#E8E8F2', fontSize: 14, marginHorizontal: 16, marginBottom: 8 },
  tInput:  { backgroundColor: '#0A1A18', borderRadius: 10, borderWidth: 1, borderColor: '#1A3A30', padding: 12, color: '#E8E8F2', fontSize: 14, marginBottom: 8 },
  textarea:{ minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 16, marginBottom: 4 },
  chip:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#1A3A30', backgroundColor: '#0A1A18' },
  chipOn:  { borderColor: '#00FFCC60', backgroundColor: 'rgba(0,255,204,0.1)' },
  chipTxt: { color: '#7A8A86', fontSize: 12, fontWeight: '600' },
  chipTxtOn:{ color: '#00FFCC' },
  empty:   { color: '#525270', fontSize: 13, marginHorizontal: 16 },
  terminCard: { backgroundColor: '#0A1A18', borderRadius: 14, borderWidth: 1, borderColor: '#1A3A30', padding: 12, marginHorizontal: 16, marginBottom: 10 },
  terminHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  terminNr: { color: '#00FFCC', fontSize: 12, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeSep: { color: '#525270', fontSize: 16, marginBottom: 8 },
  addTerminBtn: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#1A3A30', borderRadius: 12, padding: 13, marginHorizontal: 16, alignItems: 'center', marginBottom: 4 },
  addTerminTxt: { color: '#7A8A86', fontSize: 13, fontWeight: '600' },
  sendBtn:  { backgroundColor: '#00FFCC', borderRadius: 14, padding: 16, marginHorizontal: 16, alignItems: 'center', marginTop: 18, marginBottom: 40 },
  sendBtnTxt: { color: '#001210', fontSize: 15, fontWeight: '800' },
});
