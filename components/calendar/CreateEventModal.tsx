import { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { createOwnEvent } from '@/services/calendarService';
import { scheduleEventReminders } from '@/lib/eventReminders';
import { addEventToDeviceCalendar, DEVICE_CALENDAR_AVAILABLE } from '@/lib/deviceCalendar';
import { AppointmentTypeGrid } from '@/components/calendar/AppointmentTypeGrid';
import { DogSelectionCards } from '@/components/calendar/DogSelectionCards';
import { LocationPickerCard } from '@/components/calendar/LocationPickerCard';
import { ReminderCard } from '@/components/calendar/ReminderCard';
import { ConnectedTrainerSelector } from '@/components/calendar/ConnectedTrainerSelector';
import { StickyCreateAppointmentButton } from '@/components/calendar/StickyCreateAppointmentButton';
import { DateField } from '@/components/ui/DateField';
import type { CalendarEvent, EventType } from '@/types/calendar';

const ACCENT = '#00F5D4';

// Datum (nur Tag) + Zeit (nur Stunde/Minute) zu einem lokalen ISO-Zeitstempel.
function combineISO(date: Date, time: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes()).toISOString();
}

export function CreateEventModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (e: CalendarEvent) => void }) {
  const { session } = useSession();

  const [types, setTypes]   = useState<EventType[]>(['training']);
  const [title, setTitle]   = useState('');
  const [date, setDate]         = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime]     = useState<Date | null>(null);
  const [dogIds, setDogIds] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [notes, setNotes]   = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [reminders, setReminders] = useState<number[]>([60]);
  const [pushOn, setPushOn] = useState(true);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [syncDevice, setSyncDevice] = useState(false);   // zusätzlich in Apple/Google-Kalender
  const [saving, setSaving] = useState(false);

  const toggle = <T,>(arr: T[], v: T) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  const reset = () => {
    setTypes(['training']); setTitle(''); setDate(null); setStartTime(null); setEndTime(null);
    setDogIds([]); setLocation(''); setNotes(''); setNotesOpen(false);
    setReminders([60]); setPushOn(true); setTrainerId(null); setSyncDevice(false);
  };

  const save = async () => {
    if (!session?.user.id) return;
    if (types.length === 0) { Alert.alert('Art wählen', 'Bitte wähle mindestens eine Termin-Art.'); return; }
    if (!title.trim())      { Alert.alert('Titel fehlt', 'Bitte gib dem Termin einen Titel.'); return; }
    if (!date || !startTime) { Alert.alert('Datum/Zeit', 'Bitte Datum und Startzeit wählen.'); return; }
    const startISO = combineISO(date, startTime);
    const endISO = endTime ? combineISO(date, endTime) : null;

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
    // Optional zusätzlich in den Geräte-Kalender (Apple/iCloud & verbundene Google-
    // Kalender). Blockiert den Flow nicht — bei Fehler nur ein Hinweis.
    if (syncDevice) {
      const cal = await addEventToDeviceCalendar(data as CalendarEvent);
      if (!cal.ok) Alert.alert('Kalender', cal.error ?? 'Konnte nicht in den Geräte-Kalender übernommen werden.');
    }
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
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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

            <DateField label="DATUM" mode="date" value={date} onChange={setDate} placeholder="TT.MM.JJJJ" style={{ marginTop: 18 }} />
            <View style={s.timeRow}>
              <DateField label="START" mode="time" value={startTime} onChange={setStartTime} placeholder="HH:MM" style={{ flex: 1 }} />
              <DateField label="ENDE" mode="time" value={endTime} onChange={setEndTime} onClear={() => setEndTime(null)} placeholder="HH:MM" style={{ flex: 1 }} />
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

            {/* In Apple/Google-Kalender übernehmen (Geräte-Kalender). Nur wenn das
                native Modul im Build vorhanden ist. */}
            {DEVICE_CALENDAR_AVAILABLE && (
              <View style={[s.notesHead, { marginTop: 18 }]}>
                <Ionicons name="calendar-outline" size={18} color={ACCENT} />
                <View style={{ flex: 1 }}>
                  <Text style={s.notesHeadTxt}>In Apple/Google Kalender</Text>
                  <Text style={s.syncSub}>Termin zusätzlich im Geräte-Kalender speichern</Text>
                </View>
                <Switch value={syncDevice} onValueChange={setSyncDevice} trackColor={{ false: C.cardAlt, true: ACCENT }} thumbColor={C.white} />
              </View>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>
          <StickyCreateAppointmentButton onPress={save} loading={saving} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
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
  timeRow:{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18 },
  notesHead:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 },
  notesHeadTxt: { flex: 1, fontSize: 15, color: C.white, fontWeight: '600' },
  syncSub:      { fontSize: 11.5, color: C.muted, marginTop: 2 },
});
