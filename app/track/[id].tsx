import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoStatCard } from '@/components/ui/AnyvoStatCard';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { getTrackSessionById } from '@/features/tracking/services/trackService';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import type { LatLng } from '@/features/tracking/utils/gpsFilter';

function fmtDur(sec: number | null) { if (sec == null) return '—'; const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; }

export default function TrackCompletionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    useTrackingStore.getState().reset();  // Flow abgeschlossen → Store leeren
    if (!id) return;
    getTrackSessionById(id).then(r => { setData(r.data); setLoading(false); });
  }, [id]);

  if (loading) return <View style={s.center}><ActivityIndicator color={C.trackPrimary} size="large" /></View>;
  if (!data)   return <View style={s.center}><Text style={s.muted}>Fährte nicht gefunden.</Text></View>;

  const lay: LatLng[] = (data.points ?? []).map((p: any) => ({ lat: p.latitude, lng: p.longitude }));
  const run: LatLng[] = ((data.runs ?? [])[0]?.run_points ?? []).map((p: any) => ({ lat: p.lat, lng: p.lng }));
  const markers: MapMarker[] = (data.markers ?? []).map((m: any) => ({ type: m.marker_type, lat: m.latitude, lng: m.longitude }));
  const center = lay[Math.floor(lay.length / 2)] ?? null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>FÄHRTE ABGESCHLOSSEN</Text>
          <Text style={s.title}>{data.dog?.name ?? 'Fährte'}</Text>
        </View>
        <View style={s.check}><Ionicons name="checkmark" size={20} color="#04110F" /></View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.statGrid}>
          <AnyvoStatCard value={`${Math.round(data.distance_meters ?? 0)} m`} label="LÄNGE" accent style={s.statCell} />
          <AnyvoStatCard value={fmtDur(data.search_duration_seconds)} label="SUCHDAUER" style={s.statCell} />
          <AnyvoStatCard value={`${data.lying_time_minutes ?? '—'}`} label="LIEGEZEIT" style={s.statCell} />
          <AnyvoStatCard value={`${data.articles_found ?? 0}/${data.articles_total ?? 0}`} label="GEGENSTÄNDE" style={s.statCell} />
          <AnyvoStatCard value={data.average_deviation_meters != null ? `${data.average_deviation_meters} m` : '—'} label="Ø ABWEICHUNG" style={s.statCell} />
        </View>

        <View style={s.mapCard}>
          <TrackingMap layPoints={lay} runPoints={run} markers={markers} currentPosition={center} follow={false} mapType="hybrid" />
        </View>

        {data.notes ? (
          <View style={s.notesCard}>
            <Text style={s.notesLabel}>NOTIZEN</Text>
            <Text style={s.notesTxt}>{data.notes}</Text>
          </View>
        ) : null}

        <View style={{ gap: 10, marginTop: 16 }}>
          <AnyvoButton label="Fertig" icon="checkmark-done" onPress={() => router.replace('/(tabs)/training' as never)} big />
          <AnyvoButton label="Neue Fährte" icon="add" variant="secondary" onPress={() => router.replace('/track/setup' as never)} />
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.trackBg },
  center:  { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center' },
  muted:   { color: C.trackTextMut, fontSize: 14 },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  eyebrow: { fontSize: 9, color: C.trackPrimary, fontWeight: '800', letterSpacing: 2 },
  title:   { fontSize: 24, color: C.trackText, fontWeight: '900', letterSpacing: -0.5 },
  check:   { width: 38, height: 38, borderRadius: 19, backgroundColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  statGrid:{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: C.trackCard, borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 14 },
  statCell:{ flexBasis: '33.33%', flexGrow: 0, paddingVertical: 8 },
  mapCard: { height: 220, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.trackBorder, marginTop: 16, backgroundColor: C.trackSurface },
  notesCard:{ backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 16, marginTop: 16 },
  notesLabel:{ fontSize: 10, color: C.trackTextMut, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  notesTxt: { fontSize: 14, color: C.trackTextSec, lineHeight: 21 },
});
