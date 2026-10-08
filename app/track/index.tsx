import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { deleteTrackSession } from '@/features/tracking/services/trackService';
import { getTrackHistory } from '@/features/tracking/services/trackHistoryService';
import { markTrainingAsDeleted } from '@/features/training/repositories/localTrainingRepository';
import { retryFailedSync } from '@/features/sync/services/syncEngine';
import { getRecentTrackPreviews } from '@/features/tracking/services/trackPreviewService';
import { projectTrackSketch } from '@/features/tracking/utils/trackSketchGeometry';
import { resolveTrackOverlayColorKey, trackOverlayColor } from '@/features/tracking/utils/trackOverlayColors';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import {
  FaehrtenHeader, SectionLabel, StatTriple, TrackRow, fmtAge, relDate, type TrackRowData,
} from '@/features/tracking/components/FaehrtenChrome';
import { averageScore, dayStreak, trackScore } from '@/features/tracking/utils/trackScore';
import { GlobalActiveFaehrtenBar } from '@/features/tracking/components/GlobalActiveFaehrtenBar';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { resolveAutoResume } from '@/features/tracking/store/activeFaehrtenModel';
import { useToast } from '@/components/ui/Toast';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function toRow(r: any, syncLabel: (state: 'pending' | 'failed') => string): TrackRowData {
  const syncState: 'synced' | 'pending' | 'failed' = r.syncState ?? 'synced';
  return {
    id:        r.id,
    surface:   r.surface_types?.[0] ?? 'Fährte',
    date:      relDate(r.session_date ?? r.created_at),
    distanceM: r.distance_meters ?? null,
    angles:    r.corners_total ?? null,
    objects:   r.articles_total ?? null,
    age:       fmtAge(r.lying_time_minutes),
    score:     trackScore(r),
    syncState,
    syncLabel: syncState !== 'synced' ? syncLabel(syncState) : undefined,
  };
}

// Loop-Schutz: Auto-Resume wird pro App-Start GENAU EINMAL ausgewertet. Danach
// steuert der Nutzer die Übersicht selbst (Bar/Card bieten Ein-Tap-Resume). Ein
// neuer App-Start re-initialisiert das Modul → erneute Auswertung.
let autoResumeConsumed = false;

export default function TrackOverviewScreen() {
  const router = useRouter();
  const { t } = useT();
  const { session } = useSession();
  const faehrtenHydrated = useActiveFaehrten(s => s.hydrated);

  // Auto-Resume: existiert beim App-Start eine aktiv LAUFENDE Fährte (laying/searching),
  // direkt in die Live-Ansicht springen (reopenTarget). Genau einmal pro App-Start,
  // ohne Router-Loop; keine neue Session. Sonst bleibt die Übersicht.
  useEffect(() => {
    if (autoResumeConsumed || !faehrtenHydrated) return;
    autoResumeConsumed = true;
    const { target } = resolveAutoResume(useActiveFaehrten.getState().list());
    if (target) router.replace(target as never);
  }, [faehrtenHydrated, router]);
  const { dogs, refresh: refreshDogs } = useDogs();
  useFocusEffect(useCallback(() => { void refreshDogs(); }, [refreshDogs]));

  const [dogId, setDogId]   = useState<string | null>(null);
  const [storedRows, setRows]     = useState<any[]>([]);
  const [previews, setPreviews] = useState<Awaited<ReturnType<typeof getRecentTrackPreviews>>>({});
  const loadVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const { showToast, toast } = useToast();

  const [loadedScope, setLoadedScope] = useState('');
  const activeDog = dogs.find(d => d.id === dogId) ?? dogs[0] ?? null;
  const effectiveDogId = activeDog?.id ?? null;
  const scope = `${session?.user.id ?? ''}:${effectiveDogId ?? ''}`;
  const rows = useMemo(() => loadedScope === scope ? storedRows : [], [loadedScope, scope, storedRows]);
  const scopedPreviews = loadedScope === scope ? previews : {};
  const scopedHero = rows[0] ? scopedPreviews[rows[0].id] ?? null : null;

  const load = useCallback(async () => {
    const generation = ++loadVersion.current;
    const uid = session?.user.id;
    setRows([]); setPreviews({});
    if (!uid || !effectiveDogId) { setLoading(false); return; }
    setLoading(true);
    try {
      const mine = (await getTrackHistory(uid)).filter(r => r.status === 'completed' && r.dog_id === effectiveDogId);
      if (generation !== loadVersion.current) return;
      setLoadedScope(`${uid}:${effectiveDogId}`);
      setRows(mine);
      const details = await getRecentTrackPreviews(mine, effectiveDogId, uid);
      if (generation === loadVersion.current) setPreviews(details);
    } finally { if (generation === loadVersion.current) setLoading(false); }
  }, [session?.user.id, effectiveDogId]);

  useFocusEffect(useCallback(() => {
    void load().catch(() => {});
    return () => { loadVersion.current++; };
  }, [load]));

  // Fährte per Long-Press löschen: erst bestätigen, dann optimistisch entfernen.
  // Auch die LOKALE Kopie ausblenden (markTrainingAsDeleted), sonst würde die Fährte
  // beim nächsten Merge aus SQLite wieder auftauchen. Lokal-only → kein Remote-Delete
  // nötig (funktioniert offline).
  const confirmDelete = useCallback((id: string) => {
    const version = loadVersion.current;
    const localOnly = !!rows.find(r => r.id === id)?.isLocalOnly;
    Alert.alert('Fährte löschen?', 'Möchtest du diese Fährte wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive',
        onPress: async () => {
          if (version !== loadVersion.current) return;
          const prev = rows;
          const wasHero = rows[0]?.id === id;
          setRows(rs => rs.filter(r => r.id !== id));
          if (!localOnly) {
            const { error } = await deleteTrackSession(id);
            if (error) { if (version === loadVersion.current) setRows(prev); showToast('Fährte konnte nicht gelöscht werden.'); return; }
          }
          await markTrainingAsDeleted(id).catch(() => {});   // lokale Kopie ausblenden
          showToast('Fährte gelöscht');
          if (wasHero) load();
        },
      },
    ]);
  }, [rows, showToast, load]);

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

  const layColor = activeDog ? trackOverlayColor(resolveTrackOverlayColorKey(activeDog.id, activeDog.track_overlay_color_key)) : C.trackPrimary;
  const geometry = useMemo(() => projectTrackSketch(scopedHero?.lay ?? [], 344, 200), [scopedHero]);
  const sketchAngles = useMemo(() => (scopedHero?.markers ?? []).filter(m => m.type === 'winkel').map(m => ({ lat: m.lat!, lng: m.lng! })), [scopedHero]);
  const sketchObjects = useMemo(() => (scopedHero?.markers ?? []).filter(m => m.type === 'gegenstand').map(m => ({ lat: m.lat!, lng: m.lng! })), [scopedHero]);

  const startHref = (effectiveDogId ? `/track/legen?dogId=${effectiveDogId}` : '/track/legen') as never;
  const actions: { icon: IconName; label: string; go: () => void; primary?: boolean }[] = [
    { icon: 'play',          label: t('track.lay'), go: () => router.push(startHref), primary: true },
    { icon: 'stats-chart',   label: 'Auswertung',   go: () => router.push((last ? `/track/${last.id}` : startHref) as never) },
    { icon: 'layers',        label: 'Logbuch',      go: () => router.push('/track/historie' as never) },
    { icon: 'sparkles',      label: 'Insights',     go: () => router.push('/analyse/insights' as never) },
  ];

  // NEWBIE hat 1 Fährte/Kalendermonat (serverautoritative Quota, siehe
  // app/track/legen.tsx begin()); dieser Tab ist für alle Pläne erreichbar.
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
              <TouchableOpacity onPress={() => openTrack(last)} accessibilityRole="button" accessibilityLabel={t('track.preview.open')} activeOpacity={0.85}>
                <View style={s.previewHeader}>
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={s.ovCap}>{t('track.preview.latest')}</Text>
                    <Text style={s.ovTitle}>{last.surface}</Text>
                    <Text style={s.mapEmptyTxt}>{last.date} · {last.distanceM != null && Number.isFinite(last.distanceM) ? `${Math.round(last.distanceM)} m` : '—'}</Text>
                  </View>
                  {lastScore != null && <View style={s.scoreBox}><Text style={s.ovScore}>{lastScore}</Text><Text style={s.ovCap}>{t('track.preview.points')}</Text></View>}
                  <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
                </View>
                {geometry ? <View style={s.mapInner}>
                  <TrackSketch points={scopedHero?.lay} angleMarkers={sketchAngles} objectMarkers={sketchObjects} accent={layColor} w={344} h={200} />
                </View> : <View style={s.noGeometry}><Ionicons name="map-outline" size={28} color={C.trackTextMut} /><Text style={s.mapEmptyTxt}>{t('track.preview.noGps')}</Text></View>}
                <Text style={s.previewCaption}>{t(geometry?.hasLine ? 'track.preview.recorded' : geometry ? 'track.preview.singlePoint' : 'track.preview.noGpsHint')}</Text>
              </TouchableOpacity>
              <View style={s.statsPanel}><StatTriple total={stats.total} avg={stats.avg} streak={stats.streak} /></View>
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
              <TrackRow key={h.id} h={h} points={scopedPreviews[h.id]?.lay} accent={layColor} onPress={() => openTrack(h)} onLongPress={() => confirmDelete(h.id)} />
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
  mapCard: { minHeight: 200, borderRadius: 26, overflow: 'hidden', marginBottom: 14, backgroundColor: C.trackSurface, borderWidth: 1, borderColor: C.trackPrimaryDk + '2A' },
  mapInner:{ height: 200, marginHorizontal: 12 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18 },
  scoreBox: { alignItems: 'center', gap: 3 },
  noGeometry: { minHeight: 110, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 12 },
  previewCaption: { color: C.trackTextMut, fontSize: 11, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 18, lineHeight: 16 },
  statsPanel: { borderTopWidth: 1, borderTopColor: C.trackBorder, padding: 14, backgroundColor: C.trackCard },
  mapEmpty:{ minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  mapEmptyTxt:{ fontSize: 13, color: C.trackTextMut, textAlign: 'center' },

  ovCap:     { fontSize: 10, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1.4 },
  ovTitle:   { fontSize: 20, color: C.trackText, fontWeight: '800', marginTop: 1 },
  ovScore:   { fontSize: 24, color: C.trackPrimary, fontWeight: '900', letterSpacing: -0.5 },

  actionsGrid:{ flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginBottom: 16 },
  action:    { width: '47.5%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 16, borderRadius: 20, overflow: 'hidden' },
  actionCard:{ backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder },
  actionPrimary: { shadowColor: C.trackPrimary, shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  actionLabel:{ fontSize: 14.5, fontWeight: '900' },

  emptyTxt:  { fontSize: 13, color: C.trackTextMut, marginTop: 4 },
});
