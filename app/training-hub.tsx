import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
import { CreateEventModal } from '@/components/calendar/CreateEventModal';
import { deleteCalendarEvent, updateCalendarEvent } from '@/services/calendarService';
import { useSession } from '@/hooks/useSession';
import { cancelEventReminders } from '@/lib/eventReminders';
import { addEventToDeviceCalendar, DEVICE_CALENDAR_AVAILABLE } from '@/lib/deviceCalendar';
import type { CalendarEvent } from '@/types/calendar';

type Tab = 'timeline' | 'week' | 'month';
const ACCENT = '#00F5D4';

export default function TrainingHubScreen() {
  const router = useRouter();
  const { session } = useSession();
  const uid = session?.user.id;
  const { events, loading, refresh } = useTrainingCalendar();
  const { pending, incoming, accept, decline } = useTrainerAppointments();
  const [tab, setTab] = useState<Tab>('timeline');
  const [createOpen, setCreateOpen] = useState(false);
  const [reschedule, setReschedule] = useState<CalendarEvent | null>(null);

  // Trainer schlägt neue Zeit vor → Zeit aktualisieren, created_by auf den
  // Trainer setzen (Anfrage geht zur Bestätigung an die Kund:in zurück).
  const submitReschedule = async (startISO: string, endISO: string | null) => {
    if (!reschedule || !uid) return;
    await updateCalendarEvent(reschedule.id, { start_at: startISO, end_at: endISO, created_by: uid });
    setReschedule(null);
    refresh();
  };

  const onEventPress = (e: CalendarEvent) => {
    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    options.push({
      text: 'Zum Geräte-Kalender',
      onPress: async () => {
        const res = await addEventToDeviceCalendar(e);
        Alert.alert(res.ok ? 'Hinzugefügt' : 'Hinweis', res.ok ? 'Termin wurde in deinen Kalender übernommen.' : (res.error ?? 'Fehler'));
      },
    });
    options.push({
      text: 'Löschen', style: 'destructive',
      onPress: async () => { await deleteCalendarEvent(e.id); await cancelEventReminders(e.id); refresh(); },
    });
    options.push({ text: 'Abbrechen', style: 'cancel' });
    Alert.alert(e.title, undefined, options);
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
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20 }}>
          <NextAppointmentCard event={nextEvent(events)} />
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

      <TouchableOpacity style={s.fab} onPress={() => setCreateOpen(true)} activeOpacity={0.9}>
        <Ionicons name="add" size={30} color="#001210" />
      </TouchableOpacity>

      <CreateEventModal visible={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => refresh()} />
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
  tabRow:  { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 4, marginHorizontal: 20, marginTop: 22 },
  tab:     { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  tabOn:   { backgroundColor: 'rgba(0,245,212,0.14)' },
  tabTxt:  { fontSize: 14, color: C.muted, fontWeight: '700' },
  tabTxtOn:{ color: ACCENT },
  fab:     { position: 'absolute', right: 20, bottom: 32, width: 64, height: 64, borderRadius: 32, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
});
