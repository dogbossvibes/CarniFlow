import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { useCapabilities } from '@/hooks/useCapabilities';
import { getTrackSessionById, deleteTrackSession } from '@/features/tracking/services/trackService';
import { getTrackHistory } from '@/features/tracking/services/trackHistoryService';
import { markTrainingAsDeleted } from '@/features/training/repositories/localTrainingRepository';
import { retryFailedSync } from '@/features/sync/services/syncEngine';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import {
  FaehrtenHeader, SectionLabel, StatTriple, TrackRow, fmtAge, relDate, type TrackRowData,
} from '@/features/tracking/components/FaehrtenChrome';
import { averageScore, dayStreak, trackScore } from '@/features/tracking/utils/trackScore';
import { GlobalActiveFaehrtenBar } from '@/features/tracking/components/GlobalActiveFaehrtenBar';
import { useToast } from '@/components/ui/Toast';
import type { LatLng } from '@/features/tracking/utils/gpsFilter';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function toRow(r: any, syncLabel: (state: 'pending' | 'failed') => string): TrackRowData {
  const syncState: 'synced' | 'pending' | 'failed' = r.syncState ?? 'synced';
  return {
    id:        r.id,
    surface:   r.surface_types?.[0] ?? 'Fährte',
    date:      relDate(r.session_date ?? r.created_at),
    distanceM: r.distance_meters ?? null,
    angles:    r.corners_total ?? 0,
    objects:   r.articles_total ?? 0,
    age:       fmtAge(r.lying_time_minutes),
    score:     trackScore(r),
    syncState,
    syncLabel: syncState !== 'synced' ? syncLabel(syncState) : undefined,
  };
}

export default function TrackOverviewScreen() {
  const router = useRouter();
  const { t } = useT();
  const { session } = useSession();
  const { dogs } = useDogs();
  const { isPro, loading: capLoading } = useCapabilities();

  const [dogId, setDogId]   = useState<string | null>(null);
  const [rows, setRows]     = useState<any[]>([]);
  const [hero, setHero]     = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast, toast } = useToast();

  const activeDog = dogs.find(d => d.id === dogId) ?? dogs[0] ?? null;
  const effectiveDogId = activeDog?.id ?? null;

  const load = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    // Remote + lokale (SQLite) Fährten zusammenführen → lokale pending/failed sind
    // sofort sichtbar; ein Remote-Fehler verdeckt sie nicht (getTrackHistory-Fallback).
    const merged = (await getTrackHistory(uid)).filter(r => r.status === 'completed');
    const mine = effectiveDogId ? merged.filter(r => r.dog_id === effectiveDogId) : merged;
    setRows(mine);
    // Hero-Detail (echte GPS-Spur) nur für eine bereits synchronisierte Fährte laden
    // (lokal-only hat noch keine Remote-Zeile → Skizzen-Fallback der Karte).
    const last = mine[0];
    if (last && !last.isLocalOnly) { const { data: detail } = await getTrackSessionById(last.id); setHero(detail); }
    else setHero(null);
    setLoading(false);
  }, [session?.user.id, effectiveDogId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Fährte per Long-Press löschen: erst bestätigen, dann optimistisch entfernen.
  // Auch die LOKALE Kopie ausblenden (markTrainingAsDeleted), sonst würde die Fährte
  // beim nächsten Merge aus SQLite wieder auftauchen. Lokal-only → kein Remote-Delete
  // nötig (funktioniert offline).
  const confirmDelete = useCallback((id: string) => {
    const localOnly = !!rows.find(r => r.id === id)?.isLocalOnly;
    Alert.alert('Fährte löschen?', 'Möchtest du diese Fährte wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive',
        onPress: async () => {
          const prev = rows;
          const wasHero = hero?.id === id;
          setRows(rs => rs.filter(r => r.id !== id));
          if (!localOnly) {
            const { error } = await deleteTrackSession(id);
            if (error) { setRows(prev); showToast('Fährte konnte nicht gelöscht werden.'); return; }
          }
          await markTrainingAsDeleted(id).catch(() => {});   // lokale Kopie ausblenden
          showToast('Fährte gelöscht');
          if (wasHero) load();
        },
      },
    ]);
  }, [rows, hero, showToast, load]);

  const syncLabel = useCallback(
    (state: 'pending' | 'failed') => t(state === 'failed' ? 'track.syncFailed' : 'track.syncPending'),
    [t],
  );
  const history = useMemo(() => rows.map(r => toRow(r, syncLabel)), [rows, syncLabel]);

  // Navigation ins Detail ist IMMER möglich — auch pending/failed (der Detail-Screen hat
  // einen lokalen Fallback). Bei nicht synchronisierten Fährten wird der bestehende
  // Queue-Retry zusätzlich (nicht blockierend) angestossen.
  const openTrack = useCallback((h: TrackRowData) => {
    if (h.syncState && h.syncState !== 'synced') void retryFailedSync().catch(() => {});
    router.push(`/track/${h.id}` as never);
  }, [router]);
  const stats = useMemo(() => ({
    total:  rows.length,
    avg:    averageScore(rows),
    streak: dayStreak(rows.map(r => r.session_date ?? r.created_at)),
  }), [rows]);

  const last = history[0];
  const lastScore = last?.score ?? null;

  // Hero-Karte: echte Punkte aus der letzten Fährte.
  const heroMap = useMemo(() => {
    if (!hero) return null;
    const lay: LatLng[]  = (hero.points ?? []).filter((p: any) => (p.point_type ?? 'lay') === 'lay').map((p: any) => ({ lat: p.latitude, lng: p.longitude }));
    const run: LatLng[]  = ((hero.runs ?? [])[0]?.run_points ?? []).map((p: any) => ({ lat: p.lat, lng: p.lng }));
    const markers: MapMarker[] = (hero.markers ?? []).map((m: any) => ({ id: m.id, type: m.marker_type, lat: m.latitude, lng: m.longitude, angleKind: m.angle_kind, material: m.material }));
    const center = lay[Math.floor(lay.length / 2)] ?? null;
    return { lay, run, markers, center, hasGps: lay.length > 1 };
  }, [hero]);

  const startHref = (effectiveDogId ? `/track/legen?dogId=${effectiveDogId}` : '/track/legen') as never;
  const actions: { icon: IconName; label: string; go: () => void; primary?: boolean }[] = [
    { icon: 'play',          label: t('track.lay'), go: () => router.push(startHref), primary: true },
    { icon: 'stats-chart',   label: 'Auswertung',   go: () => router.push((last ? `/track/${last.id}` : startHref) as never) },
    { icon: 'layers',        label: 'Logbuch',      go: () => router.push('/track/historie' as never) },
    { icon: 'sparkles',      label: 'Insights',     go: () => router.push('/analyse/insights' as never) },
  ];

  // NEWBIE (Nicht-Pro) hat keine Fährtenfunktion mehr: Fährten-Tab sperren und auf
  // die bestehende Upgrade-Ansicht (Active) leiten. Nutzt das bestehende isPro-Gate.
  if (!capLoading && !isPro) return <Redirect href={'/premium' as never} />;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <FaehrtenHeader
        title="FÄHRTEN"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/training' as never))}
        dog={activeDog} dogs={dogs} onDog={setDogId}
      />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Globaler Status: offene Fährten (mehrere Hunde) → Logbuch-Liste */}
        <GlobalActiveFaehrtenBar style={s.globalBar} />

        {/* ── grosse Karten-Card (letzte Fährte) ── */}
        <View style={s.mapCard}>
          {loading ? (
            <View style={s.mapEmpty}><ActivityIndicator color={C.trackPrimary} /></View>
          ) : !last ? (
            <View style={s.mapEmpty}>
              <Ionicons name="git-branch-outline" size={30} color={C.trackTextMut} />
              <Text style={s.mapEmptyTxt}>{t('empty.noTracks')}</Text>
            </View>
          ) : (
            <>
              <View style={s.mapInner}>
                {heroMap?.hasGps ? (
                  <TrackingMap
                    layPoints={heroMap.lay} runPoints={heroMap.run} markers={heroMap.markers}
                    currentPosition={heroMap.center} follow={false} mapType="hybrid"
                  />
                ) : (
                  // Kein GPS aufgezeichnet → abstrakte Skizze als Fallback.
                  <TrackSketch legs={last.angles} objects={last.objects} w={344} h={248} progress={1} />
                )}
              </View>

              {/* Overlays */}
              <View style={[s.glass, s.ovTopLeft]}>
                <Text style={s.ovCap}>LETZTE FÄHRTE</Text>
                <Text style={s.ovTitle}>{last.surface}{last.distanceM != null ? ` · ${Math.round(last.distanceM)} m` : ''}</Text>
              </View>
              {lastScore != null && (
                <View style={[s.glass, s.ovTopRight]}>
                  <Text style={s.ovScore}>{lastScore}</Text>
                  <Text style={s.ovCap}>PUNKTE</Text>
                </View>
              )}
              <View style={[s.glass, s.ovBottom]}>
                <StatTriple total={stats.total} avg={stats.avg} streak={stats.streak} />
              </View>
            </>
          )}
        </View>

        {/* ── Schnellaktionen 2×2 ── */}
        <View style={s.actionsGrid}>
          {actions.map((a, i) => (
            <TouchableOpacity
              key={i} onPress={a.go} activeOpacity={0.85}
              style={[s.action, a.primary ? s.actionPrimary : s.actionCard]}
            >
              {a.primary && (
                <LinearGradient
                  colors={[C.trackPrimary, C.trackPrimaryDk]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <Ionicons name={a.icon} size={22} color={a.primary ? '#04201b' : C.trackText} />
              <Text style={[s.actionLabel, { color: a.primary ? '#04201b' : C.trackText }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Verlauf ── */}
        <SectionLabel action="Logbuch" onAction={() => router.push('/track/historie' as never)}>Verlauf</SectionLabel>
        {loading ? (
          <ActivityIndicator color={C.trackPrimary} style={{ marginTop: 20 }} />
        ) : history.length === 0 ? (
          <Text style={s.emptyTxt}>Deine abgeschlossenen Fährten erscheinen hier.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {history.slice(0, 2).map(h => (
              <TrackRow key={h.id} h={h} onPress={() => openTrack(h)} onLongPress={() => confirmDelete(h.id)} />
            ))}
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

  globalBar:{ marginBottom: 14 },
  mapCard: { height: 248, borderRadius: 26, overflow: 'hidden', marginBottom: 14, backgroundColor: C.trackSurface, borderWidth: 1, borderColor: C.trackPrimaryDk + '2A' },
  mapInner:{ ...StyleSheet.absoluteFillObject },
  mapEmpty:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  mapEmptyTxt:{ fontSize: 13, color: C.trackTextMut, textAlign: 'center' },

  glass:     { position: 'absolute', backgroundColor: 'rgba(20,22,25,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  ovTopLeft: { top: 13, left: 13, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 7 },
  ovTopRight:{ top: 13, right: 13, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  ovBottom:  { left: 13, right: 13, bottom: 13, borderRadius: 14, paddingHorizontal: 6, paddingVertical: 10 },
  ovCap:     { fontSize: 8, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1.4 },
  ovTitle:   { fontSize: 13, color: C.trackText, fontWeight: '800', marginTop: 1 },
  ovScore:   { fontSize: 24, color: C.trackPrimary, fontWeight: '900', letterSpacing: -0.5 },

  actionsGrid:{ flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginBottom: 16 },
  action:    { width: '47.5%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 16, borderRadius: 20, overflow: 'hidden' },
  actionCard:{ backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder },
  actionPrimary: { shadowColor: C.trackPrimary, shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  actionLabel:{ fontSize: 14.5, fontWeight: '900' },

  emptyTxt:  { fontSize: 13, color: C.trackTextMut, marginTop: 4 },
});
