import { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import { createOwnEvent } from '@/services/calendarService';
import { scheduleEventReminders } from '@/lib/eventReminders';
import { AppointmentTypeGrid } from '@/components/calendar/AppointmentTypeGrid';
import { DogSelectionCards } from '@/components/calendar/DogSelectionCards';
import { LocationPickerCard } from '@/components/calendar/LocationPickerCard';
import { ReminderCard } from '@/components/calendar/ReminderCard';
import { ConnectedTrainerSelector } from '@/components/calendar/ConnectedTrainerSelector';
import { StickyCreateAppointmentButton } from '@/components/calendar/StickyCreateAppointmentButton';
import type { CalendarEvent, EventType } from '@/types/calendar';

const ACCENT = '#00F5D4';

function fmtDateInput(t: string): string {
  const c = t.replace(/\D/g, '');
  if (c.length >= 4) return `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 8)}`;
  if (c.length >= 2) return `${c.slice(0, 2)}.${c.slice(2)}`;
  return c;
}
function fmtTimeInput(t: string): string {
  const c = t.replace(/\D/g, '');
  return c.length >= 2 ? `${c.slice(0, 2)}:${c.slice(2, 4)}` : c;
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

  const [types, setTypes]   = useState<EventType[]>(['training']);
  const [title, setTitle]   = useState('');
  const [date, setDate]     = useState('');
  const [start, setStart]   = useState('');
  const [end, setEnd]       = useState('');
  const [dogIds, setDogIds] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [notes, setNotes]   = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [reminders, setReminders] = useState<number[]>([60]);
  const [pushOn, setPushOn] = useState(true);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = <T,>(arr: T[], v: T) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  const reset = () => {
    setTypes(['training']); setTitle(''); setDate(''); setStart(''); setEnd('');
    setDogIds([]); setLocation(''); setNotes(''); setNotesOpen(false);
    setReminders([60]); setPushOn(true); setTrainerId(null);
  };

  const save = async () => {
    if (!session?.user.id) return;
    if (types.length === 0) { Alert.alert('Art wählen', 'Bitte wähle mindestens eine Termin-Art.'); return; }
    if (!title.trim())      { Alert.alert('Titel fehlt', 'Bitte gib dem Termin einen Titel.'); return; }
    const startISO = toISO(date, start);
    if (!startISO)          { Alert.alert('Datum/Zeit', 'Bitte Datum (TT.MM.JJJJ) und Startzeit (HH:MM) angeben.'); return; }
    const endISO = end ? toISO(date, end) : null;

    setSaving(true);
    const { data, error } = await createOwnEvent(session.user.id, {
      type: types[0], types,
      dog_id: dogIds[0] ?? null, dog_ids: dogIds,
      trainer_id: trainerId,
      title: title.trim(), start_at: startISO, end_at: endISO,
      location: location.trim() || null, discipline: null,
      notes: notes.trim() || null,
      reminder_minutes: pushOn ? reminders : [],
      repeat: 'none',
    });
    setSaving(false);
    if (error || !data) { Alert.alert('Fehler', error?.message ?? 'Konnte nicht gespeichert werden.'); return; }

    scheduleEventReminders(data as CalendarEvent);
    // Trainer-Termin ist eine Anfrage → Trainer:in per Push benachrichtigen (best-effort).
    if (trainerId) supabase.functions.invoke('notify-appointment', { body: { eventId: (data as CalendarEvent).id } }).catch(() => {});
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
            <Text style={s.label}>ART  ·  Mehrfachauswahl</Text>
            <AppointmentTypeGrid selected={types} onToggle={t => setTypes(p => toggle(p, t))} />

            {types.includes('trainer') && (
              <>
                <Text style={[s.label, { marginTop: 18 }]}>TRAINER</Text>
                <ConnectedTrainerSelector value={trainerId} onChange={setTrainerId} />
              </>
            )}

            <Text style={[s.label, { marginTop: 18 }]}>TITEL</Text>
            <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="z. B. Fährtentraining" placeholderTextColor={C.subtle} />

            <View style={s.timeRow}>
              <GlassField label="DATUM" flex={1.3}><TextInput style={s.glassInput} value={date} onChangeText={t => setDate(fmtDateInput(t))} placeholder="TT.MM.JJJJ" placeholderTextColor={C.subtle} keyboardType="numeric" maxLength={10} /></GlassField>
              <GlassField label="START" flex={1}><TextInput style={s.glassInput} value={start} onChangeText={t => setStart(fmtTimeInput(t))} placeholder="HH:MM" placeholderTextColor={C.subtle} keyboardType="numeric" maxLength={5} /></GlassField>
              <GlassField label="ENDE" flex={1}><TextInput style={s.glassInput} value={end} onChangeText={t => setEnd(fmtTimeInput(t))} placeholder="HH:MM" placeholderTextColor={C.subtle} keyboardType="numeric" maxLength={5} /></GlassField>
            </View>

            <Text style={[s.label, { marginTop: 18 }]}>HUND</Text>
            <DogSelectionCards selected={dogIds} onToggle={id => setDogIds(p => toggle(p, id))} />

            <Text style={[s.label, { marginTop: 18 }]}>ORT</Text>
            <LocationPickerCard value={location} onChange={setLocation} />

            {/* Notizen – einklappbar */}
            <TouchableOpacity
              style={[s.notesHead, { marginTop: 18 }]}
              onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setNotesOpen(o => !o); }}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={18} color={ACCENT} />
              <Text style={s.notesHeadTxt}>Notizen</Text>
              <Ionicons name={notesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
            </TouchableOpacity>
            {notesOpen && (
              <TextInput style={[s.input, { minHeight: 90, textAlignVertical: 'top', marginTop: 10 }]} value={notes} onChangeText={setNotes} placeholder="Notizen zum Termin…" placeholderTextColor={C.subtle} multiline />
            )}

            <View style={{ marginTop: 18 }}>
              <ReminderCard selected={reminders} onToggle={m => setReminders(p => toggle(p, m))} pushOn={pushOn} setPushOn={setPushOn} />
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        <StickyCreateAppointmentButton onPress={save} loading={saving} />
      </SafeAreaView>
    </Modal>
  );
}

function GlassField({ label, children, flex }: { label: string; children: React.ReactNode; flex: number }) {
  return (
    <View style={[s.glassCard, { flex }]}>
      <Text style={s.glassLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontSize: 20, color: C.white, fontWeight: '900' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  body:   { paddingHorizontal: 20, paddingTop: 6 },
  label:  { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  input:  { backgroundColor: C.input, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, color: C.white, fontSize: 15 },
  timeRow:{ flexDirection: 'row', gap: 10, marginTop: 18 },
  glassCard:  { backgroundColor: 'rgba(20,20,20,0.6)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 12 },
  glassLabel: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  glassInput: { color: C.white, fontSize: 15, fontWeight: '700', padding: 0 },
  notesHead:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 },
  notesHeadTxt: { flex: 1, fontSize: 15, color: C.white, fontWeight: '600' },
});
