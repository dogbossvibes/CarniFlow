import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as Crypto from 'expo-crypto';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { useSession } from '@/hooks/useSession';
import { useSearchRecorder, type SearchResult } from '@/features/tracking/hooks/useSearchRecorder';
import { flushSearchPoints } from '@/features/tracking/store/searchPersist';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { clearPending, loadPending } from '@/features/tracking/store/trackPersist';
import { TrackingMap } from '@/features/tracking/components/TrackingMap';
import { HoldToStopButton } from '@/features/tracking/components/HoldToStopButton';
import { hapticSuccess, hapticTap } from '@/features/tracking/utils/haptics';
import { buildRunResultPayload } from '@/features/tracking/utils/localTrackRun';
import { finalizeLocalTrackRun } from '@/features/training/repositories/localTrainingRepository';
import { enqueueSyncOperation } from '@/features/sync/repositories/syncQueueRepository';
import { syncNow } from '@/features/sync/services/syncEngine';
import { fetchCurrentWeather } from '@/services/weatherService';
import { emptyMantrailData, trailAgeMinutes, type MantrailData, type TrailResult } from '@/features/mantrailing/model';
import { applyRunResult, resultOptions, trailerLineVisible, windFromConditions } from '@/features/mantrailing/session';
import { loadMantrailRunSource, type MantrailRunSource } from '@/features/mantrailing/recovery';
import { clearMantrailDraft, persistMantrailDetails, readMantrailDetails, saveMantrailDraft } from '@/features/mantrailing/draft';
import { setLocalMantrailDetails } from '@/features/mantrailing/localRepository';
import { Chip, MANTRAIL_ACCENT as ACCENT, Stat, Toggle } from '@/features/mantrailing/ui/controls';

// «Hund arbeitet» (Spec 02, PR B1). Die Hundespur zeichnet der BESTEHENDE Absuche-
// Recorder auf (ohne Gegenstände, ohne Wertung); die Trailer-Spur liegt als Linie auf
// derselben Karte. Doppelblind: Trailer-Spur und Abweichung sind bis «Ende» verborgen;
// «Spur zeigen» ist für die Sicherheit jederzeit möglich und wird im Trail vermerkt.

type Phase = 'loading' | 'ready' | 'running' | 'result' | 'saving' | 'leaving' | 'missing';
const fmtTime = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const NO_OBJECTS: never[] = [];
// Uhr ausserhalb des Renderns (nur in Handlern genutzt).
const clock = () => Date.now();

export default function MantrailRunScreen() {
  useKeepAwake();
  const { t } = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; dogId?: string }>();
  const id = typeof params.id === 'string' ? params.id : null;
  const dogId = typeof params.dogId === 'string' ? params.dogId : null;
  const { session } = useSession();
  const uid = session?.user?.id ?? null;

  const [phase, setPhase] = useState<Phase>('loading');
  const [source, setSource] = useState<MantrailRunSource | null>(null);
  const [data, setData] = useState<MantrailData>(emptyMantrailData);
  const [now, setNow] = useState(clock);
  const [manualAge, setManualAge] = useState<string>('');
  const [result, setResult] = useState<TrailResult | null>(null);
  const [indication, setIndication] = useState('');
  const [runResult, setRunResult] = useState<SearchResult | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const runIdRef = useRef<string>(Crypto.randomUUID());

  useEffect(() => {
    if (!id || !uid) return;
    let alive = true;
    void Promise.all([loadMantrailRunSource(id, uid), readMantrailDetails(id)]).then(([src, details]) => {
      if (!alive) return;
      if (!src || src.hasRun) { setPhase('missing'); return; }
      setSource(src);
      if (details) {
        setData(details);
        if (details.trailAgeManual && details.trailAgeMinutes != null) setManualAge(String(details.trailAgeMinutes));
      }
      setPhase('ready');
    }).catch(() => { if (alive) setPhase('missing'); });
    return () => { alive = false; };
  }, [id, uid]);

  // Trail-Alter läuft bis zum Start des Hundes weiter.
  useEffect(() => {
    if (phase !== 'ready') return;
    const iv = setInterval(() => setNow(clock()), 30_000);
    return () => clearInterval(iv);
  }, [phase]);

  const s = useSearchRecorder({
    laidPoints: source?.laidPoints ?? NO_OBJECTS, laidObjects: NO_OBJECTS, level: 'training', sessionId: id,
  });

  // Wind beim Start des Hundes (einmal, sobald eine Position da ist).
  const windFetchedRef = useRef(false);
  useEffect(() => {
    const fix = s.liveFix;
    if (windFetchedRef.current || !fix || data.windRun) return;
    windFetchedRef.current = true;
    void fetchCurrentWeather(fix.lat, fix.lng).then(w => {
      const wind = w ? windFromConditions({ windSpeed: w.windSpeed, windDir: w.windDirection ?? null }) : null;
      if (wind) setData(d => (d.windRun ? d : { ...d, windRun: wind }));
    });
  }, [s.liveFix, data.windRun]);

  const autoAge = trailAgeMinutes(source?.trailerEndMs ?? null, now);
  const parsedManual = manualAge.trim() === '' ? null : Number(manualAge.replace(',', '.'));
  const manualValid = parsedManual != null && Number.isFinite(parsedManual) && parsedManual >= 0 && parsedManual <= 60 * 24 * 14;
  const finished = phase === 'result' || phase === 'saving' || phase === 'leaving';
  const showTrailer = trailerLineVisible({ doubleBlind: data.doubleBlind, revealedEarly: data.revealedEarly, finished });
  const layLine = useMemo(() => (source?.laidPoints ?? []).map(p => ({ lat: p.latitude, lng: p.longitude, ...(p.breakBefore ? { breakBefore: true } : {}) })), [source]);
  const runLine = useMemo(() => s.points.map(p => ({ lat: p.latitude, lng: p.longitude, ...(p.breakBefore ? { breakBefore: true } : {}) })), [s.points]);

  const startDog = () => {
    if (!id || !dogId || !s.ready || phase !== 'ready') return;
    hapticSuccess();
    const entry = useActiveFaehrten.getState().get(dogId);
    const resume = entry?.status === 'searching' && entry.sessionId === id && source && source.searchPoints.length > 0 && entry.searchStartedAt
      ? { points: source.searchPoints, startedAtMs: entry.searchStartedAt } : undefined;
    const startedAt = resume?.startedAtMs ?? clock();
    startedAtRef.current = startedAt;
    const ageAtStart = trailAgeMinutes(source?.trailerEndMs ?? null, startedAt);
    const next: MantrailData = manualValid
      ? { ...data, trailAgeMinutes: Math.round(parsedManual as number), trailAgeManual: true }
      : { ...data, trailAgeMinutes: ageAtStart, trailAgeManual: false };
    setData(next);
    void persistMantrailDetails(id, next, 3);
    s.start(resume);
    useActiveFaehrten.getState().upsert(dogId, { status: 'searching', sessionId: id, kind: 'mantrail', searchStartedAt: startedAt });
    setPhase('running');
  };

  const revealTrail = () => {
    Alert.alert(t('mantrail.revealTitle'), t('mantrail.revealText'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('mantrail.revealConfirm'), style: 'destructive', onPress: () => {
        hapticTap();
        setData(d => {
          const next = { ...d, revealedEarly: true };
          if (id) void saveMantrailDraft(id, next);
          return next;
        });
      } },
    ]);
  };

  const endDog = () => {
    if (phase !== 'running') return;
    hapticSuccess();
    setRunResult(s.stop());
    setPhase('result');
  };

  const save = async () => {
    if (!id || !dogId || !result || phase !== 'result') return;
    const res = runResult;
    setPhase('saving');
    if (!(await flushSearchPoints(id).catch(() => false))) {
      setPhase('result');
      Alert.alert(t('common.error'), t('mantrail.saveFailed'));
      return;
    }
    const final = applyRunResult(data, { result, indication, autoTrailAgeMinutes: data.trailAgeMinutes, windRun: data.windRun });
    try {
      await saveMantrailDraft(id, final);
      if (res) {
        await finalizeLocalTrackRun(id, buildRunResultPayload({
          runId: runIdRef.current, sessionId: id,
          startedAtMs: startedAtRef.current ?? (clock() - res.durationS * 1000), endedAtMs: clock(),
          result: { durationS: res.durationS, score: 0, deviationAvgM: res.deviationAvgM, foundObjects: 0, totalObjects: 0,
            distanceM: res.distanceM, breaks: [], points: res.points },
          referenceHasGaps: (source?.laidPoints ?? []).some(p => p.breakBefore),
          pointsTimeSec: res.pointsTimeSec,
        }));
      }
      // finalizeLocalTrackRun ersetzt payload_json nicht (read-merge-write); Angaben danach setzen.
      if (!(await setLocalMantrailDetails(id, final))) throw new Error('mantrail_details');
    } catch {
      setPhase('result');
      Alert.alert(t('common.error'), t('mantrail.saveFailed'));
      return;   // nichts zurücksetzen: Spur und Angaben bleiben lokal erhalten
    }
    // Lokal sicher → offene Aufnahme dieses Hundes schliessen (nur wenn sie zu diesem Trail gehört).
    const st = useTrackingStore.getState();
    if (st.dogId === dogId) { st.setSessionStatus('completed'); st.reset(); }
    else {
      const pending = await loadPending(dogId).catch(() => null);
      if (pending && (pending.sessionId === id || pending.sessionId == null)) await clearPending(dogId);
    }
    if (useActiveFaehrten.getState().get(dogId)?.sessionId === id) useActiveFaehrten.getState().remove(dogId);
    void clearMantrailDraft(id);
    try { await enqueueSyncOperation({ entityType: 'training_session', entityLocalId: id, operation: 'create', priority: 1 }); }
    catch { /* bleibt lokal; der nächste Sync nimmt die Sitzung mit */ }
    void syncNow().catch(() => undefined);
    setPhase('leaving');
  };

  usePreventRemove(phase === 'running' || phase === 'result' || phase === 'saving', useCallback(() => {
    Alert.alert(t('mantrail.runOpenTitle'), t('mantrail.runOpenText'), [{ text: t('common.ok'), style: 'cancel' }]);
  }, [t]));
  useEffect(() => {
    if (phase !== 'leaving') return;
    Alert.alert(t('mantrail.savedTitle'), t('mantrail.savedText'));
    router.replace('/(tabs)/training' as never);
  }, [phase, router, t]);

  if (phase === 'loading') return <SafeAreaView style={st.safe}><ActivityIndicator style={{ marginTop: 80 }} color={ACCENT} /></SafeAreaView>;
  if (phase === 'missing' || !id || !dogId) {
    return (
      <SafeAreaView style={st.safe}>
        <Text style={[st.meta, { margin: 24 }]}>{t('mantrail.notFound')}</Text>
        <TouchableOpacity accessibilityRole="button" style={[st.secondary, { marginHorizontal: 24 }]} onPress={() => router.replace('/(tabs)/training' as never)}>
          <Text style={st.secondaryText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (phase === 'result' || phase === 'saving' || phase === 'leaving') {
    const res = runResult;
    return (
      <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
        <View style={{ height: 260 }}>
          <TrackingMap layPoints={layLine} runPoints={runLine} currentPosition={null} follow={false} hideControls fitToPoints={[...layLine, ...runLine]} />
        </View>
        <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
          <View style={st.statsRow}>
            <Stat label={t('mantrail.time')} value={fmtTime(res?.durationS ?? 0)} />
            <Stat label={t('mantrail.distance')} value={`${Math.round(res?.distanceM ?? 0)} m`} />
            <Stat label={t('mantrail.trailAge')} value={data.trailAgeMinutes != null ? t('mantrail.minutes', { n: data.trailAgeMinutes }) : '–'} />
          </View>
          <Text style={st.label}>{t('mantrail.result')}</Text>
          <View style={st.chips}>
            {resultOptions(data.negative).map(r => (
              <Chip key={r} label={t(`mantrail.res.${r}` as TranslationKey)} active={result === r} onPress={() => setResult(r)} />
            ))}
          </View>
          <Text style={st.label}>{t('mantrail.indication')}</Text>
          <TextInput style={st.input} value={indication} onChangeText={setIndication} maxLength={60}
            placeholder={t('mantrail.indicationPlaceholder')} placeholderTextColor={C.muted} accessibilityLabel={t('mantrail.indication')} />
          {data.revealedEarly && <Text style={st.meta}>{t('mantrail.revealedNote')}</Text>}
        </ScrollView>
        <View style={st.bottom}>
          <TouchableOpacity accessibilityRole="button" testID="mantrail-save" style={[st.primary, (!result || phase !== 'result') && st.disabled]}
            disabled={!result || phase !== 'result'} onPress={() => void save()}>
            {phase === 'saving' ? <ActivityIndicator color={C.bg} /> : <Text style={st.primaryText}>{t('mantrail.save')}</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'running') {
    return (
      <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
        <View style={{ flex: 1 }}>
          <TrackingMap layPoints={showTrailer ? layLine : []} runPoints={runLine}
            currentPosition={s.position ? { lat: s.position.latitude, lng: s.position.longitude } : null} smartFollow follow hideControls />
          <View style={st.statsBar} accessibilityLiveRegion="polite">
            <Stat label={t('mantrail.time')} value={fmtTime(s.elapsedS)} />
            <Stat label={t('mantrail.distance')} value={`${Math.round(s.distanceM)} m`} />
            <Stat label={t('mantrail.gps')} value={s.accuracy != null ? `±${Math.round(s.accuracy)} m` : '–'} />
          </View>
          {!showTrailer && (
            <View style={st.blindPill}>
              <Ionicons name="eye-off-outline" size={16} color={C.white} />
              <Text style={st.blindText}>{t('mantrail.trailerHidden')}</Text>
            </View>
          )}
        </View>
        <View style={st.bottom}>
          {!showTrailer && (source?.laidPoints.length ?? 0) > 1 && (
            <TouchableOpacity accessibilityRole="button" style={st.secondary} onPress={revealTrail} testID="mantrail-reveal">
              <Text style={st.secondaryText}>{t('mantrail.reveal')}</Text>
            </TouchableOpacity>
          )}
          <HoldToStopButton onStop={endDog} label={t('mantrail.endRun')} accessibilityLabel={t('mantrail.endRun')} containerClassName="h-[60px] rounded-[18px]" />
        </View>
      </SafeAreaView>
    );
  }

  // ready
  return (
    <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
      <View style={st.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={st.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={st.title}>{t('mantrail.runTitle')}</Text>
        <View style={st.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <Text style={st.label}>{t('mantrail.trailAge')}</Text>
        <Text style={st.big}>{autoAge != null ? t('mantrail.minutes', { n: autoAge }) : t('mantrail.trailAgeUnknown')}</Text>
        <TextInput style={st.input} value={manualAge} onChangeText={setManualAge} keyboardType="number-pad" maxLength={5}
          placeholder={t('mantrail.trailAgeManualPlaceholder')} placeholderTextColor={C.muted} accessibilityLabel={t('mantrail.trailAgeManualPlaceholder')} />
        {manualAge.trim() !== '' && !manualValid && <Text style={st.warn}>{t('mantrail.trailAgeInvalid')}</Text>}
        <Text style={st.meta}>
          {source && source.laidPoints.length > 1
            ? (data.doubleBlind ? t('mantrail.trailerHiddenUntilEnd') : t('mantrail.trailerShown'))
            : t('mantrail.noTrailerTrack')}
        </Text>
        {data.negative && <Text style={st.meta}>{t('mantrail.negativeActive')}</Text>}
        <Toggle label={t('mantrail.doubleBlind')} hint={t('mantrail.doubleBlindHint')} value={data.doubleBlind}
          onChange={v => setData(d => ({ ...d, doubleBlind: v }))} />
        <Text style={st.meta}>{s.ready ? (s.accuracy != null ? t('mantrail.gpsReady', { accuracy: Math.round(s.accuracy) }) : t('mantrail.gpsPreparing')) : t('mantrail.gpsPreparing')}</Text>
      </ScrollView>
      <View style={st.bottom}>
        <TouchableOpacity accessibilityRole="button" testID="mantrail-start-dog" style={[st.primary, !s.ready && st.disabled]} disabled={!s.ready} onPress={startDog}>
          <Text style={st.primaryText}>{t('mantrail.startDog')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  title: { color: C.white, fontSize: 18, fontWeight: '800' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  big: { color: C.white, fontSize: 28, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { marginTop: 10, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, color: C.white, paddingHorizontal: 12 },
  meta: { color: C.muted, fontSize: 13, marginTop: 14 },
  warn: { color: '#F59E0B', fontSize: 13, marginTop: 6 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16 },
  statsBar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#000000CC', borderRadius: 16, paddingVertical: 10 },
  blindPill: { position: 'absolute', top: 84, alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#000000CC', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  blindText: { color: C.white, fontSize: 13 },
  bottom: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8, gap: 10 },
  primary: { minHeight: 56, borderRadius: 18, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: C.bg, fontSize: 16, fontWeight: '800' },
  secondary: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: C.white, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
