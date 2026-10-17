import { useEffect, useRef, useState } from 'react';
import {
  Alert, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { createOwnEvent, updateOwnCalendarEvent } from '@/services/calendarService';
import { scheduleEventReminders } from '@/lib/eventReminders';
import { addEventToDeviceCalendar, DEVICE_CALENDAR_AVAILABLE } from '@/lib/deviceCalendar';
import { AppointmentTypeGrid } from '@/components/calendar/AppointmentTypeGrid';
import { DogSelectionCards } from '@/components/calendar/DogSelectionCards';
import { LocationPickerCard } from '@/components/calendar/LocationPickerCard';
import { ReminderCard } from '@/components/calendar/ReminderCard';
import { ConnectedTrainerSelector } from '@/components/calendar/ConnectedTrainerSelector';
import { StickyCreateAppointmentButton } from '@/components/calendar/StickyCreateAppointmentButton';
import { DateField } from '@/components/ui/DateField';
import { useT } from '@/i18n';
import { canEditOwnEvent, eventEditPatch, eventFormInstant } from '@/features/calendar/eventEditing';
import type { CalendarEvent, EventType } from '@/types/calendar';

const ACCENT = '#00F5D4';

interface Props { visible: boolean; event?: CalendarEvent | null; onClose: () => void; onCreated: (e: CalendarEvent) => void }

export function CreateEventModal(props: Props) {
  const { session } = useSession();
  if (!props.visible || !session?.user.id) return null;
  if (props.event && !canEditOwnEvent(props.event, session.user.id)) return null;
  return <EventForm key={`${session.user.id}:${props.event?.id ?? 'new'}`} {...props} ownerId={session.user.id} />;
}

function EventForm({ visible, event, onClose, onCreated, ownerId }: Props & { ownerId: string }) {
  const { t } = useT();
  const alive = useRef(true);
  const lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [types, setTypes]   = useState<EventType[]>(event?.types?.length ? event.types : [event?.type ?? 'training']);
  const [title, setTitle]   = useState(event?.title ?? '');
  const [date, setDate]         = useState<Date | null>(event ? new Date(event.start_at) : null);
  const [startTime, setStartTime] = useState<Date | null>(event ? new Date(event.start_at) : null);
  const [endTime, setEndTime]     = useState<Date | null>(event?.end_at ? new Date(event.end_at) : null);
  const [dogIds, setDogIds] = useState<string[]>(event?.dog_ids?.length ? event.dog_ids : event?.dog_id ? [event.dog_id] : []);
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes]   = useState(event?.notes ?? '');
  const [notesOpen, setNotesOpen] = useState(!!event?.notes);
  const [reminders, setReminders] = useState<number[]>(event ? event.reminder_minutes ?? [] : [60]);
  const [pushOn, setPushOn] = useState(event ? !!event.reminder_minutes?.length : true);
  const [trainerId, setTrainerId] = useState<string | null>(event?.trainer_id ?? null);
  const [syncDevice, setSyncDevice] = useState(false);   // zusätzlich in Apple/Google-Kalender
  const [saving, setSaving] = useState(false);

  const toggle = <T,>(arr: T[], v: T) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  const close = () => { if (!lock.current) { Keyboard.dismiss(); onClose(); } };
  const save = async () => {
    if (lock.current) return;
    if (types.length === 0) { Alert.alert(t('calendar.typeRequiredTitle'), t('calendar.typeRequiredBody')); return; }
    if (!title.trim()) { Alert.alert(t('calendar.titleRequiredTitle'), t('calendar.titleRequiredBody')); return; }
    if (!date || !startTime) { Alert.alert(t('calendar.dateTimeTitle'), t('calendar.dateStartRequiredBody')); return; }
    let startISO: string, endISO: string | null;
    try {
      startISO = eventFormInstant(date, startTime, event?.start_at);
      endISO = endTime ? eventFormInstant(date, endTime, event?.end_at ?? undefined, event?.start_at) : null;
      if (endISO && new Date(endISO) <= new Date(startISO)) throw new Error('END_BEFORE_START');
    } catch { Alert.alert(t('calendar.dateTimeTitle'), t('calendar.invalidRange')); return; }
    lock.current = true;
    setSaving(true);
    Keyboard.dismiss();
    try {
      const draft = {
        type: event && JSON.stringify(types) === JSON.stringify(event.types?.length ? event.types : [event.type]) ? event.type : types[0],
        types: event && JSON.stringify(types) === JSON.stringify(event.types?.length ? event.types : [event.type]) ? event.types : types,
        dog_id: event && JSON.stringify(dogIds) === JSON.stringify(event.dog_ids?.length ? event.dog_ids : event.dog_id ? [event.dog_id] : []) ? event.dog_id : dogIds[0] ?? null,
        dog_ids: event && JSON.stringify(dogIds) === JSON.stringify(event.dog_ids?.length ? event.dog_ids : event.dog_id ? [event.dog_id] : []) ? event.dog_ids : dogIds,
        trainer_id: trainerId,
        title: event && title === event.title ? title : title.trim(), start_at: startISO, end_at: endISO,
        location: event && location === (event.location ?? '') ? event.location : location.trim() || null,
        discipline: event?.discipline ?? null,
        notes: event && notes === (event.notes ?? '') ? event.notes : notes.trim() || null,
        reminder_minutes: event && pushOn === !!event.reminder_minutes?.length && JSON.stringify(reminders) === JSON.stringify(event.reminder_minutes ?? []) ? event.reminder_minutes : pushOn ? reminders : [],
        repeat: event?.repeat ?? 'none' as const,
      };
      const result = event
        ? await updateOwnCalendarEvent(ownerId, event, eventEditPatch(event, draft))
        : await createOwnEvent(ownerId, draft);
      if (!alive.current) return;
      if (result.error || !result.data) {
        Alert.alert(t('common.error'), t(event ? 'calendar.editFailed' : 'calendar.saveFailed'));
        return;
      }
      const data = result.data as CalendarEvent;
      // A notification failure must not turn a committed update into a duplicate create.
      const reminderEvent = data.status === 'cancelled' || data.status === 'completed' ? { ...data, reminder_minutes: [] } : data;
      await scheduleEventReminders(reminderEvent).catch(() => {});
      if (!alive.current) return;
      if (syncDevice && !event) {
        const cal = await addEventToDeviceCalendar(data);
        if (!alive.current) return;
        if (!cal.ok) Alert.alert(t('calendar.title'), cal.error ?? t('calendar.deviceCalendarFailed'));
      }
      onCreated(data);
      onClose();
    } catch {
      if (alive.current) Alert.alert(t('common.error'), t(event ? 'calendar.editFailed' : 'calendar.saveFailed'));
    } finally {
      lock.current = false;
      if (alive.current) setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{t(event ? 'calendar.editEvent' : 'calendar.newEvent')}</Text>
          <TouchableOpacity style={s.closeBtn} onPress={close} disabled={saving} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8}><Ionicons name="close" size={20} color={C.white} /></TouchableOpacity>
        </View>

        <View style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={false} showsVerticalScrollIndicator={false}>
            <View pointerEvents={saving ? 'none' : 'auto'}>
            <Text style={s.label}>{t('calendar.typeMulti')}</Text>
            <AppointmentTypeGrid selected={types} onToggle={t => setTypes(p => toggle(p, t))} />

            {!event && types.includes('trainer') && (
              <>
                <Text style={[s.label, { marginTop: 18 }]}>{t('calendar.trainerUpper')}</Text>
                <ConnectedTrainerSelector value={trainerId} onChange={setTrainerId} />
              </>
            )}

            <Text style={[s.label, { marginTop: 18 }]}>{t('calendar.eventTitleUpper')}</Text>
            <TextInput style={s.input} accessibilityLabel={t('calendar.eventTitleUpper')} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} value={title} onChangeText={setTitle} placeholder={t('calendar.titlePlaceholder')} placeholderTextColor={C.subtle} />

            <DateField label={t('calendar.dateUpper')} mode="date" value={date} onChange={setDate} placeholder={t('calendar.datePlaceholder')} style={{ marginTop: 18 }} />
            <View style={s.timeRow}>
              <DateField label={t('calendar.startUpper')} mode="time" value={startTime} onChange={setStartTime} placeholder={t('calendar.timePlaceholder')} style={{ width: '100%' }} />
              <DateField label={t('calendar.endUpper')} mode="time" value={endTime} onChange={setEndTime} onClear={() => setEndTime(null)} placeholder={t('calendar.timePlaceholder')} style={{ width: '100%' }} />
            </View>

            <Text style={[s.label, { marginTop: 18 }]}>{t('calendar.dogUpper')}</Text>
            <DogSelectionCards selected={dogIds} onToggle={id => setDogIds(p => toggle(p, id))} />

            <Text style={[s.label, { marginTop: 18 }]}>{t('calendar.locationUpper')}</Text>
            <LocationPickerCard value={location} onChange={setLocation} />

            {/* Notizen – einklappbar */}
            <TouchableOpacity
              style={[s.notesHead, { marginTop: 18 }]}
              onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setNotesOpen(o => !o); }}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={18} color={ACCENT} />
              <Text style={s.notesHeadTxt}>{t('common.notes')}</Text>
              <Ionicons name={notesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
            </TouchableOpacity>
            {notesOpen && (
              <TextInput style={[s.input, { minHeight: 90, textAlignVertical: 'top', marginTop: 10 }]} accessibilityLabel={t('common.notes')} value={notes} onChangeText={setNotes} placeholder={t('calendar.notesPlaceholder')} placeholderTextColor={C.subtle} multiline />
            )}

            <View style={{ marginTop: 18 }}>
              <ReminderCard selected={reminders} onToggle={m => setReminders(p => toggle(p, m))} pushOn={pushOn} setPushOn={setPushOn} />
            </View>

            {/* In Apple/Google-Kalender übernehmen (Geräte-Kalender). Nur wenn das
                native Modul im Build vorhanden ist. */}
            {!event && DEVICE_CALENDAR_AVAILABLE && (
              <View style={[s.notesHead, { marginTop: 18 }]}>
                <Ionicons name="calendar-outline" size={18} color={ACCENT} />
                <View style={{ flex: 1 }}>
                  <Text style={s.notesHeadTxt}>{t('calendar.appleGoogleCalendar')}</Text>
                  <Text style={s.syncSub}>{t('calendar.syncDeviceCalendar')}</Text>
                </View>
                <Switch value={syncDevice} onValueChange={setSyncDevice} trackColor={{ false: C.cardAlt, true: ACCENT }} thumbColor={C.white} />
              </View>
            )}

            <View style={{ height: 20 }} />
            </View>
          </ScrollView>
          <StickyCreateAppointmentButton onPress={save} loading={saving} label={t(event ? 'training.saveChanges' : 'calendar.createEvent')} />
        </View>
      </SafeAreaView>
      </KeyboardAvoidingView>
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
  timeRow:{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginTop: 18 },
  notesHead:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16 },
  notesHeadTxt: { flex: 1, fontSize: 15, color: C.white, fontWeight: '600' },
  syncSub:      { fontSize: 11.5, color: C.muted, marginTop: 2 },
});
