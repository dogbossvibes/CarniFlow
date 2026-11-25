import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as Crypto from 'expo-crypto';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useTrackRecorder } from '@/features/tracking/hooks/useTrackRecorder';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { reopenTarget } from '@/features/tracking/store/activeFaehrtenModel';
import { isLaySessionWarmupReady } from '@/features/tracking/utils/layStartLock';
import { BackgroundLocationDisclosure } from '@/features/tracking/components/BackgroundLocationDisclosure';
import { HoldToStopButton } from '@/features/tracking/components/HoldToStopButton';
import { TrackingMap } from '@/features/tracking/components/TrackingMap';
import { hapticSuccess, hapticTap, hapticWarning } from '@/features/tracking/utils/haptics';
import { claimNewbieQuota, quotaBlock } from '@/services/quotaService';
import { handleQuotaBlock } from '@/features/subscription/quotaUx';
import { fetchCurrentWeather } from '@/services/weatherService';
import {
  emptyMantrailData, SCENT_ARTICLES, TRAIL_ENVIRONMENTS, type MantrailData, type ScentArticle, type TrailEnvironment, type TrailSource,
} from '@/features/mantrailing/model';
import { windFromConditions } from '@/features/mantrailing/session';
import { Chip, Stat, Toggle, MANTRAIL_ACCENT as ACCENT } from '@/features/mantrailing/ui/controls';
import { createLocalMantrailSession } from '@/features/mantrailing/localRepository';
import { loadMantrailLayResume } from '@/features/mantrailing/recovery';
import { persistMantrailDetails, readMantrailDetails, saveMantrailDraft } from '@/features/mantrailing/draft';

// «Trail legen» (Spec 02, PR B1). Der Trailer zeichnet seine Spur mit dem BESTEHENDEN
// Fährten-Recorder auf (gleiche GPS-Qualität, Hintergrund-GPS, Wiederherstellung);
// einziger Unterschied ist der Sitzungstyp 'mantrail'. Keine Winkel, keine Gegenstände.
// Alternativ: Trail ohne Aufzeichnung (fremder Trailer ohne App).

type Phase = 'setup' | 'recording' | 'leaving';

const fmtTime = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export default function MantrailLayScreen() {
  useKeepAwake();
  const { t } = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ dogId?: string; id?: string }>();
  const { session } = useSession();
  const { dogs } = useDogs();
  const { isPro, loading: capsLoading } = useCapabilities();
  const rec = useTrackRecorder({ autoDetect: false });
  const { trackPoints, currentPosition, gpsAccuracy, distanceMeters, durationSeconds } = useTrackingStore();

  const [chosenDogId, setDogId] = useState<string | null>(typeof params.dogId === 'string' ? params.dogId : null);
  const [data, setData] = useState<MantrailData>(() => ({ ...emptyMantrailData(), trailSource: 'self' }));
  const [phase, setPhase] = useState<Phase>('setup');
  const [busy, setBusy] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [warmupStarted, setWarmupStarted] = useState(false);
  const [wantStart, setWantStart] = useState(false);
  const [exitTo, setExitTo] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const claimRef = useRef<string | null>(null);
  const beganRef = useRef(false);
  const resumeId = typeof params.id === 'string' ? params.id : null;

  // Genau ein Hund → vorgewählt (abgeleitet, kein zusätzlicher Zustand).
  const dogId = chosenDogId ?? (dogs.length === 1 ? dogs[0].id : null);
  const { stopAll } = rec;
  useEffect(() => () => { stopAll(); }, [stopAll]);

  // Fortsetzen: gespeicherte Angaben des unterbrochenen Trails übernehmen.
  useEffect(() => {
    if (!resumeId) return;
    let alive = true;
    void readMantrailDetails(resumeId).then(d => { if (alive && d) setData(d); });
    return () => { alive = false; };
  }, [resumeId]);

  // Wind beim Legen aus dem bestehenden Wetterdienst (einmal, sobald eine Position da ist).
  const windFetchedRef = useRef(false);
  useEffect(() => {
    if (windFetchedRef.current || !currentPosition || data.windLay) return;
    windFetchedRef.current = true;
    void fetchCurrentWeather(currentPosition.lat, currentPosition.lng).then(w => {
      const wind = w ? windFromConditions({ windSpeed: w.windSpeed, windDir: w.windDirection ?? null }) : null;
      if (wind) setData(d => (d.windLay ? d : { ...d, windLay: wind }));
    });
  }, [currentPosition, data.windLay]);

  const gpsReady = isLaySessionWarmupReady(gpsAccuracy);
  const dog = dogs.find(d => d.id === dogId) ?? null;

  // Eigenes NEWBIE-Kontingent 'mantrail' (1 Trail/Monat). Premium fragt nicht.
  const claimQuota = useCallback(async (): Promise<boolean> => {
    if (isPro) return true;
    if (!claimRef.current) claimRef.current = Crypto.randomUUID();
    const block = quotaBlock((await claimNewbieQuota('mantrail', claimRef.current)).status);
    if (!block) return true;
    hapticWarning();
    handleQuotaBlock(block, 'mantrail', t, () => router.push('/premium' as never));
    return false;
  }, [isPro, t, router]);

  const begin = useCallback(async () => {
    if (beganRef.current || !dogId) return;
    const uid = session?.user?.id;
    if (!uid) { Alert.alert(t('common.error'), t('mantrail.signInFirst')); return; }
    beganRef.current = true;
    const resumed = resumeId ? await loadMantrailLayResume({ sessionId: resumeId, dogId, userId: uid }).catch(() => null) : null;
    if (resumeId && !resumed) { beganRef.current = false; Alert.alert(t('common.error'), t('mantrail.resumeFailed')); return; }
    if (!resumed && !(await claimQuota())) { beganRef.current = false; return; }
    const localId = resumeId ?? claimRef.current ?? Crypto.randomUUID();
    const start: MantrailData = { ...data, trailSource: 'self' };
    const r = await rec.beginRecording({
      localId, ownerId: uid, dogId, sessionKind: 'mantrail', resume: resumed ?? undefined,
      onSessionStarted: () => {
        sessionIdRef.current = localId;
        setPhase('recording');
        hapticSuccess();
        useActiveFaehrten.getState().upsert(dogId, {
          status: 'laying', sessionId: localId, kind: 'mantrail',
          startedAt: resumed ? Date.parse(resumed.startedAt) : Date.now(),
          gpsAccuracy: useTrackingStore.getState().gpsAccuracy,
        });
        void persistMantrailDetails(localId, start);
      },
      meta: {
        latitude: currentPosition?.lat ?? null, longitude: currentPosition?.lng ?? null,
        windSpeed: start.windLay?.speedKmh ?? null,
      },
    });
    if (r.error) {
      beganRef.current = false;
      if (r.error !== 'cancelled') Alert.alert(t('common.error'), r.error === 'gps_not_ready' ? t('mantrail.gpsWaiting') : r.error);
    }
  }, [dogId, session, resumeId, claimQuota, data, rec, currentPosition, t]);

  // Start erst, wenn der Hinweis zum Hintergrundstandort bestätigt ist und GPS bereit ist.
  useEffect(() => {
    if (!warmupStarted) return;
    void rec.startWarmup().then(r => { if (r.error) Alert.alert(t('common.error'), r.error); });
  }, [warmupStarted, rec, t]);
  useEffect(() => {
    if (!(wantStart && gpsReady && phase === 'setup')) return;
    void Promise.resolve().then(() => { setWantStart(false); return begin(); });
  }, [wantStart, gpsReady, phase, begin]);

  const onStartPress = () => {
    if (!dogId) { Alert.alert(t('mantrail.chooseDog')); return; }
    const entry = useActiveFaehrten.getState().get(dogId);
    if (entry && entry.sessionId !== resumeId) {
      // Pro Hund höchstens EINE offene Aufnahme (gleiche Regel wie bei der Fährte).
      Alert.alert(t('mantrail.conflictTitle'), t('mantrail.conflictText'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('mantrail.conflictOpen'), onPress: () => router.replace(reopenTarget(entry) as never) },
      ]);
      return;
    }
    hapticTap();
    if (!warmupStarted) { setShowDisclosure(true); return; }
    setWantStart(true);
  };

  // Trail ohne Aufzeichnung: Sitzung sofort anlegen, weiter zu «Hund arbeitet».
  const startWithoutRecording = async () => {
    if (!dogId || busy) return;
    const uid = session?.user?.id;
    if (!uid) { Alert.alert(t('common.error'), t('mantrail.signInFirst')); return; }
    const entry = useActiveFaehrten.getState().get(dogId);
    if (entry) { Alert.alert(t('mantrail.conflictTitle'), t('mantrail.conflictText')); return; }
    setBusy(true);
    try {
      if (!(await claimQuota())) return;
      const localId = claimRef.current ?? Crypto.randomUUID();
      const now = new Date().toISOString();
      const next: MantrailData = { ...data, trailSource: 'none' as TrailSource };
      await saveMantrailDraft(localId, next);
      await createLocalMantrailSession({ local_id: localId, user_id: uid, dog_id: dogId, status: 'completed', started_at: now }, next);
      useActiveFaehrten.getState().upsert(dogId, { status: 'resting', sessionId: localId, kind: 'mantrail', startedAt: Date.now(), layStartedAt: null });
      setPhase('leaving');
      setExitTo(`/mantrail/run?id=${localId}&dogId=${dogId}`);
    } catch (e) {
      Alert.alert(t('common.error'), (e as Error)?.message ?? t('mantrail.saveFailed'));
    } finally { setBusy(false); }
  };

  const finishTrail = () => {
    const id = sessionIdRef.current;
    if (!id || !dogId || phase !== 'recording') return;
    hapticSuccess();
    rec.finish();   // stoppt synchron, sichert lokal und reiht den Upload ein (wie bei der Fährte)
    useActiveFaehrten.getState().upsert(dogId, {
      status: 'resting', sessionId: id, kind: 'mantrail', layStartedAt: Date.now(), distanceMeters: Math.round(distanceMeters),
    });
    void persistMantrailDetails(id, { ...data, trailSource: 'self' });
    setPhase('leaving');
    setExitTo(`/mantrail/run?id=${id}&dogId=${dogId}`);
  };

  usePreventRemove(phase === 'recording', useCallback(() => {
    Alert.alert(t('mantrail.recordingRunsTitle'), t('mantrail.recordingRunsText'), [{ text: t('common.ok'), style: 'cancel' }]);
  }, [t]));
  useEffect(() => { if (exitTo && phase === 'leaving') router.replace(exitTo as never); }, [exitTo, phase, router]);

  const set = (patch: Partial<MantrailData>) => setData(d => ({ ...d, ...patch }));

  if (phase === 'recording' || phase === 'leaving') {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.mapWrap}>
          <TrackingMap
            layPoints={trackPoints.map(p => ({ lat: p.lat, lng: p.lng, ...(p.breakBefore ? { breakBefore: true } : {}) }))}
            currentPosition={currentPosition} smartFollow follow hideControls
          />
          <View style={s.statsBar} accessibilityLiveRegion="polite">
            <Stat label={t('mantrail.time')} value={fmtTime(durationSeconds)} />
            <Stat label={t('mantrail.distance')} value={`${Math.round(distanceMeters)} m`} />
            <Stat label={t('mantrail.gps')} value={gpsAccuracy != null ? `±${Math.round(gpsAccuracy)} m` : '–'} />
          </View>
        </View>
        <View style={s.bottom}>
          <Text style={s.hint}>{t('mantrail.layingHint')}</Text>
          <HoldToStopButton onStop={finishTrail} disabled={phase !== 'recording'} label={t('mantrail.endTrail')}
            accessibilityLabel={t('mantrail.endTrail')} containerClassName="h-[60px] rounded-[18px]" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.title}>{resumeId ? t('mantrail.resumeTitle') : t('mantrail.layTitle')}</Text>
        <View style={s.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>{t('mantrail.dog')}</Text>
        <View style={s.chips}>
          {dogs.map(d => <Chip key={d.id} label={d.name} active={d.id === dogId} onPress={() => !resumeId && setDogId(d.id)} />)}
        </View>

        <Text style={s.label}>{t('mantrail.scentArticle')}</Text>
        <View style={s.chips}>
          {SCENT_ARTICLES.map(a => <Chip key={a} label={t(`mantrail.scent.${a}` as TranslationKey)} active={data.scentArticle === a}
            onPress={() => set({ scentArticle: data.scentArticle === a ? null : a as ScentArticle })} />)}
        </View>
        {data.scentArticle === 'other' && (
          <TextInput style={s.input} value={data.scentArticleLabel ?? ''} maxLength={60} placeholder={t('mantrail.scentOtherPlaceholder')}
            placeholderTextColor={C.muted} onChangeText={v => set({ scentArticleLabel: v })} accessibilityLabel={t('mantrail.scentOtherPlaceholder')} />
        )}
        <Toggle label={t('mantrail.scentContaminated')} value={data.scentContaminated} onChange={v => set({ scentContaminated: v })} />

        <Text style={s.label}>{t('mantrail.environment')}</Text>
        <View style={s.chips}>
          {TRAIL_ENVIRONMENTS.map(e => <Chip key={e} label={t(`mantrail.env.${e}` as TranslationKey)} active={data.environment === e}
            onPress={() => set({ environment: data.environment === e ? null : e as TrailEnvironment })} />)}
        </View>
        <TextInput style={s.input} value={data.surface ?? ''} maxLength={60} placeholder={t('mantrail.surfacePlaceholder')}
          placeholderTextColor={C.muted} onChangeText={v => set({ surface: v })} accessibilityLabel={t('mantrail.surfacePlaceholder')} />

        <Toggle label={t('mantrail.negative')} hint={t('mantrail.negativeHint')} value={data.negative} onChange={v => set({ negative: v })} />
        <Toggle label={t('mantrail.doubleBlind')} hint={t('mantrail.doubleBlindHint')} value={data.doubleBlind} onChange={v => set({ doubleBlind: v })} />

        {data.windLay && (
          <Text style={s.meta}>{t('mantrail.windLay', { speed: data.windLay.speedKmh != null ? Math.round(data.windLay.speedKmh) : '–' })}</Text>
        )}
        {warmupStarted && (
          <Text style={s.meta}>{gpsAccuracy == null ? t('mantrail.gpsPreparing') : gpsReady
            ? t('mantrail.gpsReady', { accuracy: Math.round(gpsAccuracy) }) : t('mantrail.gpsWaitingAccuracy', { accuracy: Math.round(gpsAccuracy) })}</Text>
        )}
      </ScrollView>
      <View style={s.bottom}>
        <TouchableOpacity accessibilityRole="button" style={[s.primary, (!dog || capsLoading) && s.disabled]} disabled={!dog || capsLoading || wantStart}
          onPress={onStartPress} testID="mantrail-start-recording">
          {wantStart ? <ActivityIndicator color={C.bg} /> : <Text style={s.primaryText}>{resumeId ? t('mantrail.resumeRecording') : t('mantrail.startRecording')}</Text>}
        </TouchableOpacity>
        {!resumeId && (
          <TouchableOpacity accessibilityRole="button" style={s.secondary} disabled={!dog || capsLoading || busy} onPress={() => void startWithoutRecording()}
            testID="mantrail-start-without-recording">
            <Text style={s.secondaryText}>{t('mantrail.withoutRecording')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <BackgroundLocationDisclosure
        visible={showDisclosure}
        onCancel={() => setShowDisclosure(false)}
        onContinue={() => { setShowDisclosure(false); setWarmupStarted(true); setWantStart(true); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  title: { color: C.white, fontSize: 18, fontWeight: '800' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { marginTop: 10, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, color: C.white, paddingHorizontal: 12 },
  meta: { color: C.muted, fontSize: 13, marginTop: 14 },
  bottom: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8, gap: 10 },
  hint: { color: C.muted, fontSize: 13, textAlign: 'center' },
  primary: { minHeight: 56, borderRadius: 18, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: C.bg, fontSize: 16, fontWeight: '800' },
  secondary: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: C.white, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  mapWrap: { flex: 1 },
  statsBar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#000000CC', borderRadius: 16, paddingVertical: 10 },
});
