import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFabBottom } from '@/hooks/useFabBottom';
import { haptic } from '@/lib/haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useTrainingCalendar, nextEvent } from '@/hooks/useTrainingCalendar';
import { useTrainerAppointments } from '@/hooks/useTrainerAppointments';
import { NextAppointmentCard } from '@/components/calendar/NextAppointmentCard';
import { TrainingRecommendationCard } from '@/components/calendar/TrainingRecommendationCard';
import { TrainerAppointmentCard } from '@/components/calendar/TrainerAppointmentCard';
import { TrainerAppointmentRequest } from '@/components/calendar/TrainerAppointmentRequest';
import { RescheduleModal } from '@/components/calendar/RescheduleModal';
import { TimelineView } from '@/components/calendar/TimelineView';
import { WeekView } from '@/components/calendar/WeekView';
import { MonthView } from '@/components/calendar/MonthView';
import { canDeleteOwnEvent, canEditOwnEvent } from '@/features/calendar/eventEditing';
import { EventActionsSheet } from '@/components/calendar/EventActionsSheet';
import { useT } from '@/i18n';
import { CreateEventModal } from '@/components/calendar/CreateEventModal';
import { deleteOwnCalendarEvent, updateCalendarEvent, finishOwnCalendarEvent } from '@/services/calendarService';
import { useSession } from '@/hooks/useSession';
import { useCapabilities } from '@/hooks/useCapabilities';
import { getMyInvitations } from '@/services/umfrageService';
import type { TrainerUmfrage } from '@/types/umfrage';
import { cancelEventReminders } from '@/lib/eventReminders';
import { addEventToDeviceCalendar, DEVICE_CALENDAR_AVAILABLE } from '@/lib/deviceCalendar';
import type { CalendarEvent } from '@/types/calendar';

type Tab = 'timeline' | 'week' | 'month';
const ACCENT = '#00F5D4';

export default function TrainingHubScreen() {
  const { session } = useSession();
  return <TrainingHubContent key={session?.user.id ?? 'signed-out'} />;
}

function TrainingHubContent() {
  const { t } = useT();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const consumedEntry = useRef<string | null>(null);
  const fabBottom = useFabBottom();
  const { session } = useSession();
  const uid = session?.user.id;
  const { events, loading, refresh, upsert, remove } = useTrainingCalendar();
  const { pending, incoming, accept, decline } = useTrainerAppointments();
  const [tab, setTab] = useState<Tab>('timeline');
  const [createOpen, setCreateOpen] = useState(false);
  const pendingEdit = useRef<CalendarEvent | null>(null);
  const pendingSource = useRef<string | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const statusBusy = useRef(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [reschedule, setReschedule] = useState<CalendarEvent | null>(null);
  const { isTrainerModule } = useCapabilities();
  const [umfragen, setUmfragen] = useState<TrainerUmfrage[]>([]);
  useEffect(() => { if (uid) getMyInvitations(uid).then(setUmfragen); }, [uid]);

  // Resolve only within this account's already authorized calendar query.
  useFocusEffect(useCallback(() => {
    if (!eventId) { consumedEntry.current = null; return; }
    if (!uid || loading || typeof eventId !== 'string' || consumedEntry.current === eventId) return;
    consumedEntry.current = eventId;
    router.setParams({ eventId: undefined });
    const event = events.find(item => item.id === eventId);
    if (event) { setSelected(event); setActionsVisible(true); }
    else Alert.alert(t('common.error'), t('calendar.entryUnavailable'));
  }, [eventId, uid, loading, events, router, t]));

  // Trainer schlägt neue Zeit vor → Zeit aktualisieren, created_by auf den
  // Trainer setzen (Anfrage geht zur Bestätigung an die Kund:in zurück).
  const submitReschedule = async (startISO: string, endISO: string | null) => {
    if (!reschedule || !uid) return;
    await updateCalendarEvent(reschedule.id, { start_at: startISO, end_at: endISO, created_by: uid });
    setReschedule(null);
    refresh();
  };

  const onEventPress = (event: CalendarEvent) => { if (!statusBusy.current) { setSelected(event); setActionsVisible(true); } };
  const finishActions = () => {
    setSelected(null);
    if (pendingSource.current) { const path = pendingSource.current; pendingSource.current = null; router.push(path as never); return; }
    if (pendingEdit.current) { setEditing(pendingEdit.current); pendingEdit.current = null; setCreateOpen(true); }
  };
  const closeActions = () => { setActionsVisible(false); if (Platform.OS !== 'ios') finishActions(); };
  const exportSelected = async () => {
    if (!selected || !DEVICE_CALENDAR_AVAILABLE) return;
    const result = await addEventToDeviceCalendar(selected);
    if (alive.current && !result.ok) Alert.alert(t('common.error'), result.error ?? t('calendar.deviceCalendarFailed'));
  };
  const finishSelected = (status: 'completed' | 'cancelled') => {
    const event = selected;
    if (!uid || !event || !canEditOwnEvent(event, uid) || statusBusy.current) return;
    const ownerId = uid;
    const label = t(status === 'completed' ? 'calendar.markCompleted' : 'calendar.cancelAppointment');
    Alert.alert(label, event.title, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: label, onPress: async () => {
        if (!alive.current || statusBusy.current) return;
        statusBusy.current = true; setStatusSaving(true);
        try {
          const result = await finishOwnCalendarEvent(ownerId, event, status);
          if (!alive.current) return;
          if (result.error || !result.data) { Alert.alert(t('common.error'), t('calendar.editFailed')); return; }
          upsert(result.data);
          await cancelEventReminders(event.id);
          if (!alive.current) return;
          closeActions(); void refresh();
        } catch { if (alive.current) Alert.alert(t('common.error'), t('calendar.editFailed')); }
        finally { statusBusy.current = false; if (alive.current) setStatusSaving(false); }
      } },
    ]);
  };
  const deleteSelected = () => {
    const event = selected;
    if (!uid || !event || !canDeleteOwnEvent(event, uid) || statusBusy.current) return;
    const ownerId = uid;
    Alert.alert(t('calendar.deleteEvent'), `${event.title}\n\n${t('calendar.deleteConfirm')}`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        if (!alive.current || statusBusy.current) return;
        statusBusy.current = true; setStatusSaving(true);
        try {
          const result = await deleteOwnCalendarEvent(ownerId, event);
          if (result.error || !result.data) throw result.error ?? new Error('CALENDAR_CONFLICT');
          if (alive.current) remove(event.id);
          // A confirmed deletion still needs event-bound notification cleanup
          // after navigation/account change; never touch the new account's UI.
          await cancelEventReminders(event.id);
          if (!alive.current) return;
          closeActions(); void refresh();
        } catch { if (alive.current) Alert.alert(t('common.error'), t('calendar.deleteFailed')); }
        finally { statusBusy.current = false; if (alive.current) setStatusSaving(false); }
      } },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>PLANUNG</Text>
          <Text style={s.title}>Training Hub</Text>
        </View>
        {isTrainerModule && (
          <TouchableOpacity style={s.backBtn} onPress={() => router.push('/umfrage')} activeOpacity={0.7}>
            <Ionicons name="megaphone-outline" size={18} color={ACCENT} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20 }}>
          <NextAppointmentCard event={nextEvent(events)} onPress={onEventPress} />
        </View>

        <View style={{ marginTop: 20 }}>
          <TrainingRecommendationCard events={events} />
        </View>

        {incoming.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 10 }}>
            <Text style={s.sectionLbl}>TERMIN-ANFRAGEN AN DICH</Text>
            {incoming.map(e => (
              <TrainerAppointmentRequest key={e.id} event={e} onAccept={() => accept(e.id)} onDecline={() => decline(e.id)} onSuggest={() => setReschedule(e)} />
            ))}
          </View>
        )}

        {umfragen.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 10 }}>
            <Text style={s.sectionLbl}>TERMINUMFRAGEN</Text>
            {umfragen.map(u => (
              <TouchableOpacity key={u.id} style={s.umfrageCard} onPress={() => router.push(`/umfrage/${u.id}`)} activeOpacity={0.8}>
                <View style={s.umfrageIcon}><Ionicons name="megaphone" size={18} color={ACCENT} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.umfrageTitle} numberOfLines={1}>{u.trainer_name}</Text>
                  <Text style={s.umfrageSub} numberOfLines={1}>{u.training_arten.join(' · ') || 'Terminumfrage'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.subtle} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {pending.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 10 }}>
            <Text style={s.sectionLbl}>OFFENE TRAINER-TERMINE</Text>
            {pending.map(e => (
              <TrainerAppointmentCard key={e.id} event={e} onAccept={() => accept(e.id)} onDecline={() => decline(e.id)} />
            ))}
          </View>
        )}

        {/* Tabs */}
        <View style={s.tabRow}>
          {(['timeline', 'week', 'month'] as Tab[]).map(t => (
            <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabOn]} onPress={() => setTab(t)} activeOpacity={0.8}>
              <Text style={[s.tabTxt, tab === t && s.tabTxtOn]}>{t === 'timeline' ? 'Timeline' : t === 'week' ? 'Woche' : 'Monat'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ marginVertical: 30 }} />
          ) : tab === 'timeline' ? (
            <TimelineView events={events} onEventPress={onEventPress} />
          ) : tab === 'week' ? (
            <WeekView events={events} onEventPress={onEventPress} />
          ) : (
            <MonthView events={events} onEventPress={onEventPress} />
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <TouchableOpacity style={[s.fab, { bottom: fabBottom }]} onPress={() => { haptic.light(); setEditing(null); setCreateOpen(true); }} activeOpacity={0.9}>
        <Ionicons name="add" size={30} color="#001210" />
      </TouchableOpacity>

      {selected && uid ? <EventActionsSheet visible={actionsVisible} event={selected} userId={uid} onClose={() => { if (!statusBusy.current) closeActions(); }} onDismiss={finishActions}
        onEdit={() => { pendingEdit.current = selected; closeActions(); }}
        onDelete={deleteSelected} onExport={exportSelected} busy={statusSaving}
        onComplete={() => finishSelected('completed')} onCancelEvent={() => finishSelected('cancelled')}
        onOpenSource={selected.source_type?.startsWith('health_') && selected.dog_id ? () => {
          pendingSource.current = `/dog-health-record/${selected.dog_id}`; closeActions();
        } : undefined} /> : null}
      <CreateEventModal visible={createOpen} event={editing} onClose={() => { setCreateOpen(false); setEditing(null); }} onCreated={event => { upsert(event); refresh(); }} />
      <RescheduleModal visible={!!reschedule} event={reschedule} onClose={() => setReschedule(null)} onSubmit={submitReschedule} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, color: ACCENT, fontWeight: '800', letterSpacing: 2 },
  title:   { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  content: { paddingBottom: 20 },
  sectionLbl: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5 },
  umfrageCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: `${ACCENT}33`, padding: 14 },
  umfrageIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,245,212,0.12)' },
  umfrageTitle: { fontSize: 15, color: C.white, fontWeight: '700' },
  umfrageSub:   { fontSize: 12, color: C.muted, marginTop: 2 },
  tabRow:  { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 4, marginHorizontal: 20, marginTop: 22 },
  tab:     { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  tabOn:   { backgroundColor: 'rgba(0,245,212,0.14)' },
  tabTxt:  { fontSize: 14, color: C.muted, fontWeight: '700' },
  tabTxtOn:{ color: ACCENT },
  fab:     { position: 'absolute', right: 20, bottom: 32, width: 64, height: 64, borderRadius: 32, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
});
