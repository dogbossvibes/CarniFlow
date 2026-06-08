import { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { createOwnEvent } from '@/services/calendarService';
import { scheduleEventReminders } from '@/lib/eventReminders';
import { EVENT_TYPES, type EventType, type EventRepeat, type CalendarEvent } from '@/types/calendar';

const TYPE_ORDER: EventType[] = ['training', 'tracking', 'trainer', 'video', 'seminar', 'competition', 'reminder', 'custom'];
const REMINDERS = [{ l: '15 Min', v: 15 }, { l: '1 Std', v: 60 }, { l: '1 Tag', v: 1440 }];
const REPEATS: { l: string; v: EventRepeat }[] = [{ l: 'Einmalig', v: 'none' }, { l: 'Täglich', v: 'daily' }, { l: 'Wöchentlich', v: 'weekly' }, { l: 'Monatlich', v: 'monthly' }];

function fmtDateInput(text: string): string {
  const c = text.replace(/\D/g, '');
  if (c.length >= 4) return `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 8)}`;
  if (c.length >= 2) return `${c.slice(0, 2)}.${c.slice(2)}`;
  return c;
}
function fmtTimeInput(text: string): string {
  const c = text.replace(/\D/g, '');
  if (c.length >= 2) return `${c.slice(0, 2)}:${c.slice(2, 4)}`;
  return c;
}
function toISO(dateCH: string, timeHM: string): string | null {
  const dm = dateCH.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const tm = timeHM.match(/^(\d{2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const d = new Date(+dm[3], +dm[2] - 1, +dm[1], +tm[1], +tm[2]);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function CreateEventModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (e: CalendarEvent) => void }) {
  const { session } = useSession();
  const { dogs } = useDogs();

  const [type, setType]   = useState<EventType>('training');
  const [title, setTitle] = useState('');
  const [date, setDate]   = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd]     = useState('');
  const [dogId, setDogId] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [notes, setNotes] = useState('');
  const [reminders, setReminders] = useState<number[]>([60]);
  const [repeat, setRepeat] = useState<EventRepeat>('none');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType('training'); setTitle(''); setDate(''); setStart(''); setEnd('');
    setDogId(null); setLocation(''); setDiscipline(''); setNotes(''); setReminders([60]); setRepeat('none');
  };

  const toggleReminder = (v: number) => setReminders(r => r.includes(v) ? r.filter(x => x !== v) : [...r, v]);

  const save = async () => {
    if (!session?.user.id) return;
    if (!title.trim())   { Alert.alert('Titel fehlt', 'Bitte gib dem Termin einen Titel.'); return; }
    const startISO = toISO(date, start);
    if (!startISO)       { Alert.alert('Datum/Zeit', 'Bitte Datum (TT.MM.JJJJ) und Startzeit (HH:MM) angeben.'); return; }
    const endISO = end ? toISO(date, end) : null;

    setSaving(true);
    const { data, error } = await createOwnEvent(session.user.id, {
      dog_id: dogId, trainer_id: null, type, title: title.trim(),
      start_at: startISO, end_at: endISO,
      location: location.trim() || null, discipline: discipline.trim() || null,
      notes: notes.trim() || null, reminder_minutes: reminders, repeat,
    });
    setSaving(false);
    if (error || !data) { Alert.alert('Fehler', error?.message ?? 'Konnte nicht gespeichert werden.'); return; }

    scheduleEventReminders(data as CalendarEvent);
    onCreated(data as CalendarEvent);
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Neuer Termin</Text>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={8}><Ionicons name="close" size={20} color={C.white} /></TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={s.label}>ART</Text>
            <View style={s.chipsWrap}>
              {TYPE_ORDER.map(t => {
                const m = EVENT_TYPES[t]; const aktiv = type === t;
                return (
                  <TouchableOpacity key={t} style={[s.typeChip, aktiv && { borderColor: m.color, backgroundColor: `${m.color}1A` }]} onPress={() => setType(t)} activeOpacity={0.8}>
                    <Text style={{ fontSize: 14 }}>{m.emoji}</Text>
                    <Text style={[s.typeChipTxt, aktiv && { color: m.color }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Field label="TITEL"><TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="z. B. Fährtentraining" placeholderTextColor={C.subtle} /></Field>

            <View style={s.row3}>
              <Field label="DATUM" flex={1.3}><TextInput style={s.input} value={date} onChangeText={t => setDate(fmtDateInput(t))} placeholder="TT.MM.JJJJ" placeholderTextColor={C.subtle} keyboardType="numeric" maxLength={10} /></Field>
              <Field label="START" flex={1}><TextInput style={s.input} value={start} onChangeText={t => setStart(fmtTimeInput(t))} placeholder="HH:MM" placeholderTextColor={C.subtle} keyboardType="numeric" maxLength={5} /></Field>
              <Field label="ENDE" flex={1}><TextInput style={s.input} value={end} onChangeText={t => setEnd(fmtTimeInput(t))} placeholder="HH:MM" placeholderTextColor={C.subtle} keyboardType="numeric" maxLength={5} /></Field>
            </View>

            {dogs.length > 0 && (
              <>
                <Text style={s.label}>HUND</Text>
                <View style={s.chipsWrap}>
                  {dogs.map(d => {
                    const aktiv = dogId === d.id;
                    return (
                      <TouchableOpacity key={d.id} style={[s.chip, aktiv && s.chipOn]} onPress={() => setDogId(aktiv ? null : d.id)} activeOpacity={0.8}>
                        <Text style={[s.chipTxt, aktiv && s.chipTxtOn]}>🐕 {d.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Field label="ORT"><TextInput style={s.input} value={location} onChangeText={setLocation} placeholder="z. B. Grenchen" placeholderTextColor={C.subtle} /></Field>
            <Field label="DISZIPLIN"><TextInput style={s.input} value={discipline} onChangeText={setDiscipline} placeholder="optional" placeholderTextColor={C.subtle} /></Field>
            <Field label="NOTIZEN"><TextInput style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} placeholder="optional" placeholderTextColor={C.subtle} multiline /></Field>

            <Text style={s.label}>ERINNERUNG</Text>
            <View style={s.chipsWrap}>
              {REMINDERS.map(r => {
                const aktiv = reminders.includes(r.v);
                return <TouchableOpacity key={r.v} style={[s.chip, aktiv && s.chipOn]} onPress={() => toggleReminder(r.v)} activeOpacity={0.8}><Text style={[s.chipTxt, aktiv && s.chipTxtOn]}>{r.l}</Text></TouchableOpacity>;
              })}
            </View>

            <Text style={s.label}>WIEDERHOLUNG</Text>
            <View style={s.chipsWrap}>
              {REPEATS.map(r => {
                const aktiv = repeat === r.v;
                return <TouchableOpacity key={r.v} style={[s.chip, aktiv && s.chipOn]} onPress={() => setRepeat(r.v)} activeOpacity={0.8}><Text style={[s.chipTxt, aktiv && s.chipTxtOn]}>{r.l}</Text></TouchableOpacity>;
              })}
            </View>

            <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving} activeOpacity={0.85}>
              <Text style={s.saveTxt}>{saving ? 'Speichert…' : 'Termin erstellen'}</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return <View style={[{ marginBottom: 14 }, flex != null && { flex }]}><Text style={s.label}>{label}</Text>{children}</View>;
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontSize: 20, color: C.white, fontWeight: '900' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  body:   { paddingHorizontal: 20, paddingTop: 6 },
  label:  { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  input:  { backgroundColor: C.input, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, color: C.white, fontSize: 15 },
  row3:   { flexDirection: 'row', gap: 10 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 9 },
  typeChipTxt: { fontSize: 13, color: C.muted, fontWeight: '600' },
  chip:    { borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn:  { borderColor: '#00F5D4', backgroundColor: 'rgba(0,245,212,0.12)' },
  chipTxt: { fontSize: 13, color: C.muted, fontWeight: '600' },
  chipTxtOn: { color: '#00F5D4', fontWeight: '700' },
  saveBtn: { backgroundColor: '#00F5D4', borderRadius: 16, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveTxt: { fontSize: 16, color: '#001210', fontWeight: '900' },
});
