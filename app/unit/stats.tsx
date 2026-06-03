import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { ScoreRing } from '@/components/analytics/ScoreRing';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';
import { useTrackStats } from '@/hooks/useTrackStats';
import { computeUnitStats, type WeekBucket, type DisciplineStat, type CalendarDay } from '@/services/trainingUnitStats';

function formatDur(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

function formatMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function WeeklyBars({ weekly }: { weekly: WeekBucket[] }) {
  const max = Math.max(1, ...weekly.map(w => w.count));
  return (
    <View style={s.bars}>
      {weekly.map((w, i) => (
        <View key={i} style={s.barCol}>
          <Text style={s.barCount}>{w.count > 0 ? w.count : ''}</Text>
          <View style={s.barTrack}>
            <View style={[s.barFill, { height: `${(w.count / max) * 100}%` }]} />
          </View>
          <Text style={s.barLabel}>{w.label}</Text>
        </View>
      ))}
    </View>
  );
}

function ActivityCalendar({ calendar }: { calendar: CalendarDay[] }) {
  // 84 Tage → 12 Spalten (Wochen) × 7 Zeilen.
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < calendar.length; i += 7) weeks.push(calendar.slice(i, i + 7));
  return (
    <View style={s.calRow}>
      {weeks.map((week, wi) => (
        <View key={wi} style={s.calCol}>
          {week.map(day => (
            <View key={day.date} style={[s.calCell, day.active && s.calCellActive]} />
          ))}
        </View>
      ))}
    </View>
  );
}

export default function StatsScreen() {
  const router = useRouter();
  const { feed, loading, refresh } = useTrainingFeed();
  const { meters: trackMeters, count: trackCount, refresh: refreshTrack } = useTrackStats();

  useFocusEffect(useCallback(() => { refresh(); refreshTrack(); }, [refresh, refreshTrack]));

  const stats = computeUnitStats(feed);
  const maxDisc = Math.max(1, ...stats.byDiscipline.map(d => d.count));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View>
          <Text style={s.eyebrow}>ANALYSE</Text>
          <Text style={s.title}>Statistiken</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : stats.total === 0 ? (
          <View style={s.empty}>
            <Ionicons name="stats-chart-outline" size={32} color={C.subtle} />
            <Text style={s.emptyTitle}>Noch keine Daten</Text>
            <Text style={s.emptyTxt}>Schließe deine erste Einheit ab, um Statistiken zu sehen.</Text>
          </View>
        ) : (
          <>
            {/* Erfolgsring */}
            <View style={s.ringCard}>
              <ScoreRing score={stats.successRate} size={150} label="Erfolg" />
              <Text style={s.ringSub}>
                {stats.ratedCount > 0 ? `Ø Bewertung aus ${stats.ratedCount} Einheiten` : 'Noch keine Bewertungen'}
              </Text>
            </View>

            {/* Kennzahlen */}
            <View style={s.statGrid}>
              <View style={s.statCard}><Text style={s.statVal}>{stats.total}</Text><Text style={s.statLabel}>EINHEITEN</Text></View>
              <View style={s.statCard}><Text style={s.statVal}>{formatDur(stats.totalDurationSec)}</Text><Text style={s.statLabel}>GESAMTZEIT</Text></View>
              <View style={s.statCard}><Text style={s.statVal}>{stats.thisWeek}</Text><Text style={s.statLabel}>DIESE WOCHE</Text></View>
              <View style={s.statCard}>
                <Text style={[s.statVal, stats.streak > 0 && { color: C.accent }]}>{stats.streak}</Text>
                <Text style={s.statLabel}>TAGE-SERIE</Text>
              </View>
            </View>

            {/* Trainings pro Woche */}
            <Text style={s.label}>TRAININGS PRO WOCHE</Text>
            <View style={s.panel}><WeeklyBars weekly={stats.weekly} /></View>

            {/* Nach Sparte */}
            <Text style={s.label}>NACH SPARTE</Text>
            <View style={s.panel}>
              {stats.byDiscipline.length === 0 ? (
                <Text style={s.muted}>Noch keine Übungen erfasst.</Text>
              ) : stats.byDiscipline.map((d: DisciplineStat) => (
                <View key={d.discipline} style={s.discRow}>
                  <Text style={s.discName}>{d.discipline}</Text>
                  <View style={s.discTrack}>
                    <View style={[s.discFill, { width: `${(d.count / maxDisc) * 100}%`, backgroundColor: d.color }]} />
                  </View>
                  <Text style={s.discCount}>{d.count}</Text>
                </View>
              ))}
            </View>

            {/* Fährtenarbeit (GPS) */}
            {trackCount > 0 && (
              <>
                <Text style={s.label}>FÄHRTENARBEIT (GPS)</Text>
                <View style={s.panel}>
                  <View style={s.faRow}>
                    <View style={s.faItem}>
                      <Text style={s.faVal}>{formatMeters(trackMeters)}</Text>
                      <Text style={s.faLabel}>FÄHRTENMETER</Text>
                    </View>
                    <View style={s.faDivider} />
                    <View style={s.faItem}>
                      <Text style={s.faVal}>{trackCount}</Text>
                      <Text style={s.faLabel}>FÄHRTEN</Text>
                    </View>
                  </View>
                  <Text style={s.faNote}>Aus dem GPS-Fährtenmodul</Text>
                </View>
              </>
            )}

            {/* Aktivitätskalender */}
            <Text style={s.label}>AKTIVITÄT (12 WOCHEN)</Text>
            <View style={s.panel}>
              <ActivityCalendar calendar={stats.calendar} />
              <View style={s.legend}>
                <View style={[s.calCell, { marginRight: 6 }]} />
                <Text style={s.legendTxt}>kein Training</Text>
                <View style={[s.calCell, s.calCellActive, { marginLeft: 14, marginRight: 6 }]} />
                <Text style={s.legendTxt}>Training</Text>
              </View>
            </View>

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const CELL = 12;

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn:{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:  { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  ringCard: { alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, paddingVertical: 26, marginTop: 8 },
  ringSub:  { fontSize: 13, color: C.muted, fontWeight: '500' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  statCard: { width: '47.5%', backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingVertical: 18, alignItems: 'center', gap: 6 },
  statVal:  { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  statLabel:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1 },

  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12, marginTop: 26 },
  panel: { backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 18 },
  muted: { fontSize: 13, color: C.subtle },

  // Weekly bars
  bars:     { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140 },
  barCol:   { flex: 1, alignItems: 'center', gap: 6 },
  barCount: { fontSize: 11, color: C.white, fontWeight: '700', height: 14 },
  barTrack: { width: 14, flex: 1, backgroundColor: C.cardAlt, borderRadius: 7, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill:  { width: '100%', backgroundColor: C.accent, borderRadius: 7, minHeight: 3 },
  barLabel: { fontSize: 9, color: C.muted, fontWeight: '600' },

  // Discipline bars
  discRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  discName:  { fontSize: 13, color: C.white, fontWeight: '600', width: 96 },
  discTrack: { flex: 1, height: 10, backgroundColor: C.cardAlt, borderRadius: 5, overflow: 'hidden' },
  discFill:  { height: '100%', borderRadius: 5, minWidth: 6 },
  discCount: { fontSize: 13, color: C.muted, fontWeight: '700', width: 24, textAlign: 'right' },

  // Fährtenarbeit
  faRow:     { flexDirection: 'row', alignItems: 'center' },
  faItem:    { flex: 1, alignItems: 'center', gap: 6 },
  faVal:     { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  faLabel:   { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1 },
  faDivider: { width: 1, height: 36, backgroundColor: C.border },
  faNote:    { fontSize: 11, color: C.subtle, fontWeight: '500', textAlign: 'center', marginTop: 14 },

  // Calendar
  calRow:       { flexDirection: 'row', justifyContent: 'space-between' },
  calCol:       { gap: 4 },
  calCell:      { width: CELL, height: CELL, borderRadius: 3, backgroundColor: C.cardAlt },
  calCellActive:{ backgroundColor: C.accent },
  legend:       { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  legendTxt:    { fontSize: 11, color: C.muted, fontWeight: '500' },

  empty:      { alignItems: 'center', gap: 8, marginTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, color: C.white, fontWeight: '700', marginTop: 6 },
  emptyTxt:   { fontSize: 13, color: C.subtle, textAlign: 'center' },
});
