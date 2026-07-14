import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { FT } from '@/constants/colors';
import { useT } from '@/i18n';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { fmtClock } from '@/features/tracking/components/LiveChrome';
import { useSearchRecorder, type Level } from '@/features/tracking/hooks/useSearchRecorder';
import { useTrackVoiceGuidance, type GuidanceAngle } from '@/features/tracking/hooks/useTrackVoiceGuidance';
import { useTrackHapticGuidance, type GuidanceObject } from '@/features/tracking/hooks/useTrackHapticGuidance';
import { hapticSuccess, hapticTap } from '@/features/tracking/utils/haptics';
import { useTrackingStore, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import { loadPending, type PendingTrack } from '@/features/tracking/store/trackPersist';
import { decideRecovery, dedupeSearchPoints, pathDistanceM } from '@/features/tracking/store/searchRecovery';
import { flushSearchPoints } from '@/features/tracking/store/searchPersist';
import { getSearchPointsBySession, deleteSearchPointsBySession } from '@/features/tracking/repositories/localTrackRepository';
import { metersToSteps } from '@/features/tracking/utils/steps';
import { PrecisionDebugPanel } from '@/features/tracking/components/PrecisionDebugPanel';
import type { GpsStats } from '@/features/tracking/engine/types';

// GPS-Debug-Overlay nur im Dev-Build (nur lesend, beeinflusst die Absuche nicht).
const SHOW_GPS_DEBUG = __DEV__;
import { startTrackRun, finishTrackRun, getTrackSessionDogName } from '@/features/tracking/services/trackService';

// Blinkender LIVE-Punkt.
function RecDot() {
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(op, { toValue: 0.25, duration: 600, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [op]);
  return <Animated.View className="w-2 h-2 rounded-full bg-ft-bad" style={{ opacity: op }} />;
}

// AUSARBEITEN — der Hund läuft die gelegte Fährte ab. Snapshot (laidPoints,
// laidObjects, level) wird beim Betreten aus dem Lege-Store übernommen; der
// useSearchRecorder startet genau einmal und liefert Spur, Abrisse, Abweichung,
// Metriken und Live-Score. Stop → Auswertung via s.stop().
export default function TrackRunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT();
  useKeepAwake();   // Display während der Absuche anlassen (Bildschirm nicht sperren)
  const insets = useSafeAreaInsets();   // sichere Abstände (Dynamic Island / Statusbar)

  // Snapshot der gelegten Fährte (aus dem Store — nach Recovery via restoreSearchSession
  // befüllt). Wird nach der Recovery-Entscheidung EINMAL gesetzt und bleibt stabil.
  const buildSnap = () => {
    const st = useTrackingStore.getState();
    const objs = st.markers.filter(m => m.type === 'gegenstand' && m.lat != null && m.lng != null);
    return {
      laidLatLng: st.trackPoints.map(p => ({ lat: p.lat, lng: p.lng })),
      laidPoints: st.trackPoints.map(p => ({ latitude: p.lat, longitude: p.lng })),
      laidObjects: objs.map((m, i) => ({ at: { latitude: m.lat as number, longitude: m.lng as number }, index: i, material: m.material ?? '' })),
      laidMarkers: st.markers,
      level: 'training' as Level,
    };
  };
  type Snap = ReturnType<typeof buildSnap>;

  const [phase, setPhase] = useState<'checking' | 'ready'>('checking');
  const [effectiveId, setEffectiveId] = useState<string | null>(id ?? null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [recovery, setRecovery] = useState<PendingTrack | null>(null);   // gesetzt ⇒ Recovery-Dialog offen
  const snapData: Snap = snap ?? { laidLatLng: [], laidPoints: [], laidObjects: [], laidMarkers: [], level: 'training' as Level };

  const s = useSearchRecorder({ laidPoints: snapData.laidPoints, laidObjects: snapData.laidObjects, level: snapData.level, sessionId: effectiveId });

  const [view, setView] = useState<'map' | 'sketch'>('map');
  const [follow, setFollow] = useState(true);   // Karte folgt der Live-Position; aus → frei zoombar
  const [voiceOn, setVoiceOn] = useState(true);
  const [dogName, setDogName] = useState('Hund');
  const [finishing, setFinishing] = useState(false);
  const startedRef = useRef(false);
  const runIdRef = useRef<string | null>(null);

  // 1) Beim Betreten entscheiden: frische Absuche oder unterbrochene fortsetzen (P2).
  useEffect(() => {
    let alive = true;
    (async () => {
      const pending = await loadPending();
      if (!alive) return;
      const decision = decideRecovery(pending);
      if (decision.kind === 'recovery') {
        useTrackingStore.getState().restoreSearchSession(decision.pending);   // laid + Metadaten in den (evtl. leeren) Store
        setEffectiveId(decision.pending.sessionId ?? id ?? null);
        runIdRef.current = decision.pending.runId ?? null;
        setSnap(buildSnap());
        setRecovery(decision.pending);   // → Dialog
      } else {
        setEffectiveId(id ?? null);
        setSnap(buildSnap());
      }
      setPhase('ready');
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 2) Frischer Start GENAU EINMAL — nur wenn KEIN Recovery-Dialog aussteht.
  useEffect(() => {
    if (phase !== 'ready' || startedRef.current || recovery || !snap) return;
    startedRef.current = true;
    hapticSuccess();
    const startMs = Date.now();
    s.start();
    useTrackingStore.getState().startSearchSession(null, startMs);   // Status 'searching' sofort persistieren
    if (effectiveId) {
      startTrackRun(effectiveId).then(({ data }) => {
        if (data) { runIdRef.current = data.id; useTrackingStore.getState().setSearchRunId(data.id); }
      }).catch(() => {});
    }
  }, [phase, recovery, snap, s, effectiveId]);

  useEffect(() => { if (effectiveId) getTrackSessionDogName(effectiveId).then(r => { if (r.data) setDogName(r.data); }); }, [effectiveId]);

  // Bereits gespeicherte Suchpunkte laden (SQLite autoritativ, sonst Puffer-Fallback).
  const loadSavedSearchPoints = async (pending: PendingTrack): Promise<TrackPointSample[]> => {
    const sessId = pending.sessionId ?? effectiveId;
    let saved: TrackPointSample[] = [];
    if (sessId) {
      const rows = await getSearchPointsBySession(sessId).catch(() => [] as any[]);
      saved = rows.map(r => ({
        lat: r.latitude, lng: r.longitude, accuracy: r.accuracy ?? null, altitude: r.altitude ?? null,
        speed: r.speed ?? null, heading: null, t: Date.parse(r.timestamp) || Date.now(),
      }));
    }
    if (saved.length === 0) saved = pending.searchPoints ?? [];
    return dedupeSearchPoints(saved);
  };

  // 3) Recovery-Dialog: „Laufende Absuche fortsetzen?" (Fortsetzen/Beenden/Verwerfen).
  const showRecoveryDialog = (pending: PendingTrack) => {
    Alert.alert('Laufende Absuche fortsetzen?', 'Es wurde eine unterbrochene Absuche gefunden.', [
      { text: 'Fortsetzen', onPress: () => void resumeSearch(pending) },
      { text: 'Beenden',    onPress: () => void endSearch(pending) },
      { text: 'Verwerfen', style: 'destructive', onPress: () => discardSearch(pending) },
    ], { cancelable: false });
  };
  useEffect(() => { if (recovery) showRecoveryDialog(recovery); /* eslint-disable-next-line */ }, [recovery]);

  // Fortsetzen: bestehenden Datensatz weiterverwenden (KEINE neue runId, keine Duplikate,
  // Recorder genau einmal — resume seedet Punkte/Distanz/Timer).
  const resumeSearch = async (pending: PendingTrack) => {
    const saved = await loadSavedSearchPoints(pending);
    useTrackingStore.getState().setSearchPoints(saved);
    useTrackingStore.getState().setSessionStatus('searching');
    runIdRef.current = pending.runId ?? null;
    startedRef.current = true;   // verhindert den frischen Start-Effect
    setRecovery(null);
    hapticSuccess();
    s.start({ points: saved.map(p => ({ latitude: p.lat, longitude: p.lng })), startedAtMs: pending.searchStartedAt ?? Date.now() });
  };

  // Beenden: vorhandene Suchpunkte speichern + Session sauber abschliessen.
  const endSearch = async (pending: PendingTrack) => {
    const saved = await loadSavedSearchPoints(pending);
    await flushSearchPoints().catch(() => {});
    const sessId = pending.sessionId ?? effectiveId;
    const runId = pending.runId ?? runIdRef.current;
    if (sessId && runId) {
      await finishTrackRun(runId, sessId, {
        durationSeconds: pending.searchStartedAt ? Math.max(0, Math.floor((Date.now() - pending.searchStartedAt) / 1000)) : 0,
        distanceMeters: Math.round(pathDistanceM(saved)),
        averageDeviationMeters: 0,
        articlesFound: 0,
        runPoints: saved.map(p => ({ lat: p.lat, lng: p.lng, t: p.t })),
      }).catch(() => {});
    }
    startedRef.current = true;
    setRecovery(null);
    s.stop();
    useTrackingStore.getState().setSessionStatus('completed');
    useTrackingStore.getState().reset();
    router.replace((sessId ? `/track/${sessId}` : '/track') as never);
  };

  // Verwerfen: NUR den Suchlauf löschen (gelegte Fährte bleibt), mit Bestätigung.
  const discardSearch = (pending: PendingTrack) => {
    Alert.alert('Absuche verwerfen?', 'Nur der Suchlauf wird gelöscht — die gelegte Fährte bleibt erhalten.', [
      { text: 'Abbrechen', style: 'cancel', onPress: () => showRecoveryDialog(pending) },
      { text: 'Verwerfen', style: 'destructive', onPress: async () => {
        const sessId = pending.sessionId ?? effectiveId;
        if (sessId) await deleteSearchPointsBySession(sessId).catch(() => {});
        useTrackingStore.getState().resetSearchPoints();
        useTrackingStore.getState().setSessionStatus('cancelled');
        startedRef.current = false;   // erlaubt einen frischen Start (neue Absuche, neue runId)
        setRecovery(null);
      } },
    ]);
  };

  // Hundespur / Abriss / Position → Karten-Koordinaten ({lat,lng}).
  const runPoints = useMemo(() => s.points.map(p => ({ lat: p.latitude, lng: p.longitude })), [s.points]);
  const breakPts  = useMemo(() => s.breaks.map(b => ({ lat: b.at.latitude, lng: b.at.longitude })), [s.breaks]);
  const curPos = s.position ? { lat: s.position.latitude, lng: s.position.longitude } : null;

  const mapMarkers: MapMarker[] = snapData.laidMarkers.map(m => ({ id: m.id, type: m.type, lat: m.lat, lng: m.lng, angleKind: m.angleKind }));
  const winkel = snapData.laidMarkers.filter(m => m.type === 'winkel').length;

  // Sprachführung: gelegte Winkel/Spitzwinkel/Abriss „etwas voraus" ansagen.
  const guidanceAngles = useMemo<GuidanceAngle[]>(
    () => snapData.laidMarkers
      .filter(m => m.type === 'winkel' && m.lat != null && m.lng != null)
      .map(m => ({ id: m.id, lat: m.lat as number, lng: m.lng as number, angleKind: m.angleKind })),
    [snapData.laidMarkers],
  );
  useTrackVoiceGuidance(curPos, guidanceAngles, voiceOn);

  // Haptische Führung: 1× Vibration bei Gegenstand-Nähe, 2× bei Winkel voraus.
  const guidanceObjects = useMemo<GuidanceObject[]>(
    () => snapData.laidObjects.map(o => ({ id: `obj-${o.index}`, lat: o.at.latitude, lng: o.at.longitude })),
    [snapData.laidObjects],
  );
  useTrackHapticGuidance(curPos, guidanceAngles, guidanceObjects, true);

  const hasLaid = snapData.laidPoints.length > 1;
  const devShown = hasLaid && Number.isFinite(s.deviationM) ? s.deviationM : null;
  const devOff = devShown != null && devShown > 8;

  const handleCancel = () => {
    Alert.alert(t('track.abortTitle'), t('track.abortBody'), [
      { text: t('common.next'), style: 'cancel' },
      { text: t('common.cancel'), style: 'destructive', onPress: () => { hapticTap(); s.stop(); useTrackingStore.getState().setSessionStatus('cancelled'); useTrackingStore.getState().reset(); router.replace('/track' as never); } },
    ]);
  };

  const handleFinish = () => {
    if (finishing) return;   // Doppelt-Tippen → keine doppelte Finalisierung
    Alert.alert(t('track.finishTitle'), t('track.finishBody'), [
      { text: t('track.keepSearching'), style: 'cancel' },
      { text: t('common.finish'), style: 'destructive', onPress: async () => {
        hapticSuccess();   // sofort beim Bestätigen, vor await
        setFinishing(true);
        const res = s.stop();   // ← Search-Recorder beenden (flusht letzten Puffer)
        useTrackingStore.getState().setSessionStatus('completed');   // vor Navigation → kein Recovery mehr
        const runId = runIdRef.current;
        const sessId = effectiveId;
        if (sessId && runId) {
          await finishTrackRun(runId, sessId, {
            durationSeconds:        res.durationS,
            distanceMeters:         res.distanceM,
            averageDeviationMeters: res.deviationAvgM,
            articlesFound:          res.foundObjects,
            runPoints:              res.points.map(p => ({ lat: p.latitude, lng: p.longitude, t: Date.now() })),
          }).catch(() => {});
        }
        useTrackingStore.getState().reset();   // Pending leeren → Session gilt als abgeschlossen
        setFinishing(false);
        router.replace((sessId ? `/track/${sessId}` : '/track') as never);
      } },
    ]);
  };

  const metrics: { value: string; label: string; warn?: boolean }[] = [
    { value: `${Math.round(s.distanceM)} m`, label: `${metersToSteps(s.distanceM)} Schr.` },
    { value: `${s.foundObjects}/${s.totalObjects}`, label: 'Gegenst.' },
    { value: devShown != null ? `${devOff ? '+' : ''}${devShown.toFixed(1)} m` : '—', label: 'Abweich.', warn: devOff },
    { value: s.accuracy != null ? `${Math.round(s.accuracy)} m` : '—', label: 'GPS' },
  ];

  // GPS-Debug (nur Dev): schlankes gpsDebug → GpsStats fürs PrecisionDebugPanel (nur lesend).
  const dbg = s.gpsDebug;
  const rej = dbg?.rejectedCount ?? 0;
  const gpsDebugStats: GpsStats = {
    rawCount:      s.points.length + rej,
    filteredCount: s.points.length,
    rejectedCount: rej,
    rejectionRate: (s.points.length + rej) > 0 ? rej / (s.points.length + rej) : 0,
    lastAccuracy:  s.accuracy ?? null,
    bestAccuracy:  null,
  };

  return (
    <View className="flex-1 bg-ft-bg">
      <SafeAreaView edges={['bottom']} className="flex-1">
        {/* Top-Bar — explizit unter Dynamic Island/Statusbar. */}
        <View className="flex-row items-center gap-3 px-[18px] pb-[10px]" style={{ paddingTop: insets.top + 8 }}>
          <Pressable className="w-9 h-9 rounded-[11px] border border-ft-line-strong bg-white/5 items-center justify-center" onPress={handleCancel} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={FT.text} />
          </Pressable>
          <View className="flex-row items-center gap-[7px] px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,93,108,0.14)', borderWidth: 1, borderColor: 'rgba(255,93,108,0.3)' }}>
            <RecDot />
            <Text className="text-[11px] font-extrabold tracking-[1.4px] text-[#ff8a94]">LIVE</Text>
          </View>
          <View className="flex-1" />
          {/* Sprachausgabe an/aus */}
          <Pressable onPress={() => setVoiceOn(v => !v)} hitSlop={8}
            className={`w-9 h-9 rounded-[11px] items-center justify-center border ${voiceOn ? 'bg-ft-acc-dim border-[rgba(21,230,195,0.4)]' : 'bg-white/5 border-ft-line-strong'}`}>
            <Ionicons name={voiceOn ? 'volume-high' : 'volume-mute'} size={17} color={voiceOn ? FT.acc : FT.muted} />
          </Pressable>
          {/* Live-Score */}
          <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-ft-acc-dim border border-[rgba(21,230,195,0.4)]">
            <Ionicons name="trophy" size={12} color={FT.acc} />
            <Text className="text-[12px] font-extrabold text-ft-acc" style={{ fontVariant: ['tabular-nums'] }}>{s.score}</Text>
          </View>
          <View className="flex-row bg-white/5 rounded-[11px] p-[3px] gap-[2px]">
            {(['map', 'sketch'] as const).map(k => {
              const on = view === k;
              return (
                <Pressable key={k} onPress={() => setView(k)} className={`px-[11px] py-1.5 rounded-lg ${on ? 'bg-ft-acc' : ''}`}>
                  <Text className={`text-[11.5px] font-bold ${on ? 'text-ft-acc-text' : 'text-ft-muted'}`}>{k === 'map' ? 'Karte' : 'Skizze'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Karte / Skizze */}
        <View className="flex-1 mx-[14px] rounded-[24px] overflow-hidden border border-ft-line bg-[#08100e]">
          {view === 'map' ? (
            <TrackingMap
              layPoints={snapData.laidLatLng} dimLay
              runPoints={runPoints} markers={mapMarkers} breaks={breakPts}
              currentPosition={curPos}
              follow={follow}
              onToggleFollow={() => setFollow(f => !f)}
              onUserPan={() => setFollow(false)}
              controlsTop={64}
            />
          ) : (
            <View className="flex-1 bg-[#08100e]"><TrackSketch points={snapData.laidLatLng} angleMarkers={guidanceAngles} objectMarkers={guidanceObjects} legs={winkel} objects={s.totalObjects} w={360} h={520} progress={1} /></View>
          )}

          {/* Timer (oben links) */}
          <View className="absolute top-[14px] left-[14px] rounded-[16px] px-4 py-[10px] bg-ft-glass border border-ft-glass-line">
            <Text className="text-[30px] text-ft-text font-black" style={{ fontVariant: ['tabular-nums'] }}>{fmtClock(s.elapsedS)}</Text>
            <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">{t('track.searchDuration')}</Text>
          </View>

          {/* Hunde-Pill (oben rechts) */}
          <View className="absolute top-[14px] right-[14px] flex-row items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 bg-ft-glass border border-ft-glass-line">
            <View className="w-[26px] h-[26px] rounded-full bg-ft-acc items-center justify-center">
              <Text className="text-[12px] font-extrabold text-ft-acc-text">{(dogName?.[0] ?? '?').toUpperCase()}</Text>
            </View>
            <Text className="text-[12.5px] font-bold text-ft-text">{dogName}</Text>
          </View>

          {/* Metrik-Leiste (unten) */}
          <View className="absolute left-[14px] right-[14px] bottom-[14px] flex-row rounded-[18px] py-3 px-2 bg-ft-glass border border-ft-glass-line">
            {metrics.map((mm, i) => (
              <View key={i} className={`flex-1 items-center ${i > 0 ? 'border-l border-ft-line' : ''}`}>
                <Text className={`text-[15px] font-black ${mm.warn ? 'text-ft-warn' : 'text-ft-text'}`} style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>{mm.value}</Text>
                <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">{mm.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Steuerung */}
        <View className="flex-row gap-3 px-[18px] pt-[14px] pb-[26px]">
          <Pressable
            className="flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-white/5 border border-ft-line-strong"
            style={s.foundObjects >= s.totalObjects ? { opacity: 0.45 } : undefined}
            onPress={() => { hapticSuccess(); s.markObject(); }} disabled={s.foundObjects >= s.totalObjects}
          >
            <Ionicons name="flag" size={20} color={FT.text} />
            <Text className="text-[10.5px] font-extrabold text-ft-text">{t('track.object')}</Text>
          </Pressable>
          <Pressable
            className="h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-ft-bad"
            style={[{ flex: 1.3 }, finishing ? { opacity: 0.45 } : null]}
            onPress={handleFinish} disabled={finishing}
          >
            {finishing ? <ActivityIndicator color="#2a060a" /> : <Ionicons name="stop" size={20} color="#2a060a" />}
            <Text className="text-[10.5px] font-extrabold text-[#2a060a]">{t('track.evaluate')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {SHOW_GPS_DEBUG && (
        <PrecisionDebugPanel
          engineLabel={dbg?.source === 'native' ? 'native' : 'expo'}
          stats={gpsDebugStats}
          status={null}
          phase="recording"
          isNativePrecision={dbg?.source === 'native'}
          provider={dbg?.provider ?? null}
          nativeAvailable={dbg?.isNativeAvailable ?? null}
          rawGnssAvailable={dbg?.rawGnssSupported ?? null}
          rawPointCount={s.points.length}
          devMode
        />
      )}
    </View>
  );
}
