import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { getAntworten, getTermine, getUmfrage, saveAntwort } from '@/services/umfrageService';
import type { Antwort, TrainerUmfrage, UmfrageAntwort, UmfrageTermin } from '@/types/umfrage';

const OPTIONS: { v: Antwort; label: string; color: string }[] = [
  { v: 'ja',   label: 'Ja',     color: '#00FFCC' },
  { v: 'evtl', label: 'Evtl.',  color: '#FFB800' },
  { v: 'nein', label: 'Nein',   color: '#E04040' },
];

function fmtDatum(d: string): string {
  const [y, m, day] = d.split('-');
  return y && m && day ? `${day}.${m}.${y}` : d;
}
const hm = (t: string) => t.slice(0, 5);

export default function UmfrageAntwortenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();

  const [umfrage, setUmfrage] = useState<TrainerUmfrage | null>(null);
  const [termine, setTermine] = useState<UmfrageTermin[]>([]);
  const [alle, setAlle] = useState<UmfrageAntwort[]>([]);
  const [antworten, setAntworten] = useState<Record<string, Antwort>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const uid = session?.user.id;
    const [u, t, a] = await Promise.all([getUmfrage(id), getTermine(id), getAntworten(id)]);
    setUmfrage((u.data as TrainerUmfrage) ?? null);
    setTermine((t.data as UmfrageTermin[]) ?? []);
    const all = (a.data as UmfrageAntwort[]) ?? [];
    setAlle(all);
    const mine: Record<string, Antwort> = {};
    all.filter(x => x.user_id === uid).forEach(x => { mine[x.termin_id] = x.antwort; });
    setAntworten(mine);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  const counts = (terminId: string) => {
    const c = { ja: 0, evtl: 0, nein: 0 };
    for (const a of alle) if (a.termin_id === terminId) c[a.antwort]++;
    return c;
  };

  const handleSave = async () => {
    const uid = session?.user.id;
    if (!uid) return;
    setSaving(true);
    for (const [terminId, antwort] of Object.entries(antworten)) {
      await saveAntwort(terminId, id, uid, antwort);
    }
    setSaving(false);
    Alert.alert('Danke! 🐾', 'Deine Antwort wurde gespeichert.', [{ text: 'OK', onPress: () => router.back() }]);
  };

  if (loading) return <View style={S.center}><ActivityIndicator size="large" color="#00FFCC" /></View>;
  if (!umfrage) return <View style={S.center}><Text style={S.dim}>Umfrage nicht gefunden.</Text></View>;

  return (
    <SafeAreaView style={S.container} edges={['top']}>
      <View style={S.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={S.back} hitSlop={8}><Ionicons name="chevron-back" size={22} color="#E8E8F2" /></TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={S.header}>
          <Text style={S.eyebrow}>TERMINUMFRAGE</Text>
          <Text style={S.title}>{umfrage.trainer_name}</Text>
          {umfrage.training_arten.length > 0 && (
            <View style={S.artRow}>
              {umfrage.training_arten.map(a => <View key={a} style={S.artChip}><Text style={S.artTxt}>{a}</Text></View>)}
            </View>
          )}
          {umfrage.notiz ? <Text style={S.notiz}>💬 {umfrage.notiz}</Text> : null}
        </View>

        <Text style={S.lbl}>Wähle deine Verfügbarkeit</Text>
        {termine.map(t => {
          const c = counts(t.id);
          return (
            <View key={t.id} style={S.card}>
              <View style={S.cardHead}>
                <Text style={S.datum}>{fmtDatum(t.datum)}</Text>
                <Text style={S.zeit}>{hm(t.uhrzeit_von)}–{hm(t.uhrzeit_bis)}</Text>
              </View>
              {t.ort ? <Text style={S.ort}>📍 {t.ort}</Text> : null}

              <View style={S.optRow}>
                {OPTIONS.map(o => {
                  const active = antworten[t.id] === o.v;
                  return (
                    <TouchableOpacity
                      key={o.v}
                      style={[S.opt, active && { borderColor: o.color, backgroundColor: `${o.color}1A` }]}
                      onPress={() => setAntworten(p => ({ ...p, [t.id]: o.v }))}
                      activeOpacity={0.8}
                    >
                      <Text style={[S.optTxt, active && { color: o.color }]}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={S.tally}>
                <Text style={[S.tallyTxt, { color: '#00FFCC' }]}>✓ {c.ja}</Text>
                <Text style={[S.tallyTxt, { color: '#FFB800' }]}>~ {c.evtl}</Text>
                <Text style={[S.tallyTxt, { color: '#E04040' }]}>✕ {c.nein}</Text>
              </View>
            </View>
          );
        })}

        <TouchableOpacity style={[S.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={S.saveTxt}>{saving ? 'Speichert…' : 'Antwort speichern ✓'}</Text>
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090F' },
  center:  { flex: 1, backgroundColor: '#09090F', alignItems: 'center', justifyContent: 'center' },
  dim:     { color: '#525270', fontSize: 14 },
  topBar:  { paddingHorizontal: 12, paddingTop: 4 },
  back:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  header:  { paddingHorizontal: 20, paddingBottom: 8 },
  eyebrow: { color: '#00FFCC', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  title:   { color: '#E8E8F2', fontSize: 24, fontWeight: '800', marginTop: 4 },
  artRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  artChip: { borderRadius: 20, borderWidth: 1, borderColor: '#1A3A30', backgroundColor: '#0A1A18', paddingHorizontal: 10, paddingVertical: 5 },
  artTxt:  { color: '#00FFCC', fontSize: 11, fontWeight: '700' },
  notiz:   { color: '#9AA8A4', fontSize: 13, marginTop: 12, lineHeight: 19 },
  lbl:     { color: '#525270', fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 8, marginTop: 18 },
  card:    { backgroundColor: '#0A1A18', borderRadius: 16, borderWidth: 1, borderColor: '#1A3A30', padding: 14, marginHorizontal: 16, marginBottom: 12 },
  cardHead:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datum:   { color: '#E8E8F2', fontSize: 16, fontWeight: '800' },
  zeit:    { color: '#00FFCC', fontSize: 14, fontWeight: '700' },
  ort:     { color: '#7A8A86', fontSize: 12, marginTop: 4 },
  optRow:  { flexDirection: 'row', gap: 8, marginTop: 14 },
  opt:     { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1A3A30', backgroundColor: '#09120F' },
  optTxt:  { color: '#7A8A86', fontSize: 14, fontWeight: '700' },
  tally:   { flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center' },
  tallyTxt:{ fontSize: 12, fontWeight: '700' },
  saveBtn: { backgroundColor: '#00FFCC', borderRadius: 14, padding: 16, marginHorizontal: 16, alignItems: 'center', marginTop: 8 },
  saveTxt: { color: '#001210', fontSize: 15, fontWeight: '800' },
});
