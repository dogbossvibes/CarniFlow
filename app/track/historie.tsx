import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { getUserTrackSessions, deleteTrackSession } from '@/features/tracking/services/trackService';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { FaehrtenHeader, fmtAge, relDate } from '@/features/tracking/components/FaehrtenChrome';
import { trackScore } from '@/features/tracking/utils/trackScore';
import { SwipeableTrainingItem } from '@/components/training/SwipeableTrainingItem';
import { useToast } from '@/components/ui/Toast';

const FILTERS = ['Alle', 'Acker', 'Wiese', 'Wald'] as const;

const DEL_TITLE = 'Fährte löschen?';
const DEL_MSG   = 'Möchtest du diese Fährte wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.';

export default function TrackHistorieScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { dogs } = useDogs();

  const [dogId, setDogId]   = useState<string | null>(null);
  const [rows, setRows]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Alle');
  const { showToast, toast } = useToast();

  // Fährte löschen: optimistisch aus der Liste, dann Supabase (RLS = nur eigene).
  const handleDelete = useCallback(async (id: string) => {
    const prev = rows;
    setRows(rs => rs.filter(r => r.id !== id));
    const { error } = await deleteTrackSession(id);
    if (error) { setRows(prev); showToast('Training konnte nicht gelöscht werden.'); }
    else showToast('Training gelöscht');
  }, [rows, showToast]);

  // Long-Press: erst bestätigen, dann löschen (Swipe löscht weiterhin direkt).
  const confirmDelete = useCallback((id: string) => {
    Alert.alert(DEL_TITLE, DEL_MSG, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => handleDelete(id) },
    ]);
  }, [handleDelete]);

  const activeDog = dogs.find(d => d.id === dogId) ?? dogs[0] ?? null;
  const effectiveDogId = activeDog?.id ?? null;

  const load = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    const { data } = await getUserTrackSessions(uid);
    const all = (data ?? []).filter(r => r.status === 'completed');
    setRows(effectiveDogId ? all.filter(r => r.dog_id === effectiveDogId) : all);
    setLoading(false);
  }, [session?.user.id, effectiveDogId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = useMemo(
    () => rows.filter(r => filter === 'Alle' || (r.surface_types ?? []).some((sfc: string) => sfc.toLowerCase().includes(filter.toLowerCase()))),
    [rows, filter],
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <FaehrtenHeader title="LOGBUCH" onBack={() => (router.canGoBack() ? router.back() : router.replace('/track' as never))} dog={activeDog} dogs={dogs} onDog={setDogId} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.filters}>
          {FILTERS.map(f => {
            const on = filter === f;
            return (
              <TouchableOpacity key={f} style={[s.chip, on && s.chipOn]} onPress={() => setFilter(f)} activeOpacity={0.8}>
                <Text style={[s.chipTxt, on && s.chipTxtOn]}>{f}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={C.trackPrimary} style={{ marginTop: 30 }} />
        ) : visible.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="git-branch-outline" size={30} color={C.trackTextMut} />
            <Text style={s.emptyTxt}>Keine Fährten in dieser Auswahl.</Text>
          </View>
        ) : (
          <View style={{ gap: 11 }}>
            {visible.map(r => {
              const score = trackScore(r);
              const angles = r.corners_total ?? 0;
              const objects = r.articles_total ?? 0;
              return (
                <SwipeableTrainingItem key={r.id} trainingId={r.id} onDelete={handleDelete} bottomGap={0} confirmTitle={DEL_TITLE} confirmMessage={DEL_MSG}>
                <TouchableOpacity style={s.row} activeOpacity={0.85}
                  onPress={() => router.push(`/track/${r.id}` as never)}
                  onLongPress={() => confirmDelete(r.id)} delayLongPress={350}>
                  <View style={s.sketch}>
                    <TrackSketch legs={angles} objects={objects} size={64} progress={1} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={s.titleLine}>
                      <Text style={s.surface}>{r.surface_types?.[0] ?? 'Fährte'}</Text>
                      <Text style={s.date}> · {relDate(r.session_date ?? r.created_at)}</Text>
                    </View>
                    <Text style={s.meta} numberOfLines={1}>
                      {r.distance_meters != null ? `${Math.round(r.distance_meters)} m` : '—'} · {angles} Winkel · {objects} Gegenst. · {fmtAge(r.lying_time_minutes)}
                    </Text>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${score ?? 0}%`, backgroundColor: score != null && score >= 90 ? C.trackPrimary : '#7fe6b0' }]} />
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.score, { color: score != null && score >= 90 ? C.trackPrimary : C.trackText }]}>{score ?? '—'}</Text>
                    <Text style={s.scoreLabel}>PUNKTE</Text>
                  </View>
                </TouchableOpacity>
                </SwipeableTrainingItem>
              );
            })}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
      {toast}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.trackBg },
  content: { paddingHorizontal: 18, paddingBottom: 16 },

  filters: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip:    { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder },
  chipOn:  { backgroundColor: C.trackPrimaryDk + '22', borderColor: C.trackPrimary },
  chipTxt: { fontSize: 13, color: C.trackTextSec, fontWeight: '600' },
  chipTxtOn:{ color: C.trackPrimary, fontWeight: '700' },

  row:     { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, borderRadius: 20, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder },
  sketch:  { width: 64, height: 64, borderRadius: 14, overflow: 'hidden', backgroundColor: '#0a1310', borderWidth: 1, borderColor: C.trackBorder },
  titleLine:{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  surface: { fontSize: 14.5, color: C.trackText, fontWeight: '800' },
  date:    { fontSize: 11, color: C.trackTextMut },
  meta:    { fontSize: 11.5, color: C.trackTextSec },
  barTrack:{ marginTop: 7, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  score:   { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  scoreLabel:{ fontSize: 8, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1 },

  empty:   { alignItems: 'center', gap: 10, marginTop: 50 },
  emptyTxt:{ fontSize: 13, color: C.trackTextMut },
});
