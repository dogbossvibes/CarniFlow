import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { getMyClientConnections } from '@/services/connectionService';
import { createUmfrage } from '@/services/umfrageService';
import type { NeuerTermin } from '@/types/umfrage';
import { DateField } from '@/components/ui/DateField';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { parseDeDate } from '@/features/dogs/dateInput';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

// Trainingsarten sind feste Fachbegriffe (Eigennamen) — bewusst nicht lokalisiert.
const TRAINING_ARTEN = ['IGP', 'Unterordnung', 'Schutzdienst', 'Fährte', 'Obedience', 'Agility', 'Begleithund'];

// Das gespeicherte Datums-/Zeitformat bleibt erhalten (TT.MM.JJJJ bzw. HH:MM).
const pad2 = (n: number) => String(n).padStart(2, '0');
const chDate = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
const fmtHM = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
// "HH:MM" → Date (Datumsteil irrelevant, nur Uhrzeit) bzw. null für leer/ungültig.
function parseHM(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return new Date(2000, 0, 1, h, min);
}

export default function UmfrageErstellenScreen() {
  const router = useRouter();
  const { t } = useT();

  // Zurück: mit History → router.back(); ohne History (Deep-Link/Dev-Reload)
  // sicher in den Trainer-Hub wechseln — kein unbehandeltes GO_BACK, kein Crash.
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/trainer-hub');
  };
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
    setTermine(p => p.map((tm, idx) => idx === i ? { ...tm, [field]: value } : tm));

  const handleSend = async () => {
    if (!trainerName.trim()) {
      Alert.alert(t('poll.validationTitle'), t('poll.errName'), [{ text: t('common.ok') }]);
      return;
    }
    if (arten.length === 0) {
      Alert.alert(t('poll.validationTitle'), t('poll.errType'), [{ text: t('common.ok') }]);
      return;
    }
    if (termine.some(tm => !tm.datum || !tm.von)) {
      Alert.alert(t('poll.validationTitle'), t('poll.errDates'), [{ text: t('common.ok') }]);
      return;
    }
    if (!session?.user.id) return;

    setLoading(true);
    const { error } = await createUmfrage({
      trainerId: session.user.id, trainerName: trainerName.trim(),
      arten, notiz, termine, kundenIds: kunden,
    });
    setLoading(false);
    if (error) {
      Alert.alert(t('common.error'), error, [{ text: t('common.ok') }]);
      return;
    }
    Alert.alert(t('poll.sentTitle'), t('poll.sentBody'), [{ text: t('common.ok'), onPress: handleBack }]);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={handleBack} style={s.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? undefined : 'height'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={s.content}
        >
          <View style={s.header}>
            <Text style={s.title}>{t('poll.title')}</Text>
            <Text style={s.sub}>{t('poll.subtitle')}</Text>
          </View>

          <Input
            label={t('poll.trainerName')}
            placeholder={t('poll.trainerNamePlaceholder')}
            value={trainerName}
            onChangeText={setTrainerName}
            autoCapitalize="words"
          />

          <Text style={s.lbl}>{t('poll.types')}</Text>
          <View style={s.chipRow}>
            {TRAINING_ARTEN.map(art => {
              const on = arten.includes(art);
              return (
                <TouchableOpacity key={art} style={[s.chip, on && s.chipOn]} onPress={() => setArten(p => toggle(p, art))}>
                  <Text style={[s.chipTxt, on && s.chipTxtOn]}>{art}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.lbl}>{t('poll.note')}</Text>
          <TextInput
            style={s.textarea}
            value={notiz}
            onChangeText={setNotiz}
            placeholder={t('poll.notePlaceholder')}
            placeholderTextColor={C.subtle}
            selectionColor={C.accent}
            multiline
          />

          <Text style={s.lbl}>{t('poll.dates')}</Text>
          {termine.map((tm, i) => (
            <View key={i} style={s.terminCard}>
              <View style={s.terminHeader}>
                <Text style={s.terminNr}>{t('poll.dateNr', { nr: i + 1 })}</Text>
                {termine.length > 1 && (
                  <TouchableOpacity onPress={() => setTermine(p => p.filter((_, idx) => idx !== i))} hitSlop={8}>
                    <Text style={s.removeTxt}>{t('poll.remove')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <DateField
                value={parseDeDate(tm.datum)}
                onChange={d => updateTermin(i, 'datum', chDate(d))}
                minimumDate={new Date()}
                style={{ marginBottom: 12 }}
              />
              <View style={s.timeRow}>
                <DateField
                  mode="time"
                  label={t('poll.from')}
                  value={parseHM(tm.von)}
                  onChange={d => updateTermin(i, 'von', fmtHM(d))}
                  style={{ flex: 1 }}
                />
                <DateField
                  mode="time"
                  label={t('poll.to')}
                  value={parseHM(tm.bis)}
                  onChange={d => updateTermin(i, 'bis', fmtHM(d))}
                  style={{ flex: 1 }}
                />
              </View>
              <Input
                placeholder={t('poll.location')}
                value={tm.ort}
                onChangeText={v => updateTermin(i, 'ort', v)}
                autoCapitalize="sentences"
                style={{ marginTop: 4 }}
              />
            </View>
          ))}
          <Button
            label={t('poll.addDate')}
            variant="outline"
            onPress={() => setTermine(p => [...p, { datum: '', von: '', bis: '', ort: '' }])}
            style={s.addBtn}
          />

          <Text style={s.lbl}>{t('poll.inviteClients')}</Text>
          {clients.length === 0 ? (
            <Text style={s.empty}>{t('poll.noClients')}</Text>
          ) : (
            <View style={s.chipRow}>
              {clients.map(k => {
                const on = kunden.includes(k.id);
                return (
                  <TouchableOpacity key={k.id} style={[s.chip, on && s.chipOn]} onPress={() => setKunden(p => toggle(p, k.id))}>
                    <Text style={[s.chipTxt, on && s.chipTxtOn]}>{k.name ?? t('poll.unknownClient')}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Button label={t('poll.send')} onPress={handleSend} loading={loading} style={s.sendBtn} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  topBar:  { paddingHorizontal: 12, paddingTop: 4 },
  back:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 48, gap: 4 },
  header:  { paddingVertical: 8, paddingBottom: 4 },
  title:   { color: C.white, fontSize: 26, fontWeight: '800' },
  sub:     { color: C.muted, fontSize: 13, marginTop: 4 },
  lbl:     { color: C.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  textarea:{ minHeight: 90, backgroundColor: C.input, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, color: C.white, fontSize: 15, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:    { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipOn:  { borderColor: C.accent, backgroundColor: 'rgba(0,255,204,0.10)' },
  chipTxt: { color: C.muted, fontSize: 12, fontWeight: '600' },
  chipTxtOn:{ color: C.accent },
  empty:   { color: C.muted, fontSize: 13 },
  terminCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  terminHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  terminNr: { color: C.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  removeTxt: { color: C.danger, fontSize: 12, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 4 },
  addBtn:  { marginTop: 4 },
  sendBtn: { marginTop: 24 },
});
