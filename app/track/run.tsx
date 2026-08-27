import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useKeepAwake } from 'expo-keep-awake';
import { FT } from '@/constants/colors';
import { useT } from '@/i18n';
import { useCapabilities } from '@/hooks/useCapabilities';
import { HelpButton } from '@/components/help/HelpButton';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { fmtClock } from '@/features/tracking/components/LiveChrome';
import { useSearchRecorder, type Level } from '@/features/tracking/hooks/useSearchRecorder';
import { useTrackVoiceGuidance, say, type GuidanceAngle } from '@/features/tracking/hooks/useTrackVoiceGuidance';
import { offTrackTransitionFeedback, offTrackBanner } from '@/features/tracking/utils/offTrackFeedback';
import type { OffTrackState } from '@/features/tracking/utils/offTrack';
import { useTrackHapticGuidance, type GuidanceObject } from '@/features/tracking/hooks/useTrackHapticGuidance';
import { useTrackEndGuidance } from '@/features/tracking/hooks/useTrackEndGuidance';
import { DEFAULT_HANDLER_DISTANCE_M, HANDLER_DISTANCES_M, isHandlerDistance, type SearchHandlerDistanceM } from '@/features/tracking/utils/searchGeometry';
import { hapticSuccess, hapticTap, hapticMarker } from '@/features/tracking/utils/haptics';
import { useTrackingStore, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { useStartPointApproach } from '@/features/tracking/hooks/useStartPointApproach';
import {
  DEFAULT_APPROACH_CONFIG, classifyManualStart, type StartMode,
} from '@/features/tracking/engine/startApproach';
import { loadPending, type PendingTrack } from '@/features/tracking/store/trackPersist';

// expo-speech defensiv laden (nativ; kein Crash, wenn Modul fehlt).
let Speech: typeof import('expo-speech') | null = null;
try { Speech = require('expo-speech'); } catch { Speech = null; }
import { decideRecovery, dedupeSearchPoints, pathDistanceM } from '@/features/tracking/store/searchRecovery';
import { flushSearchPoints } from '@/features/tracking/store/searchPersist';
import { getSearchPointsBySession, deleteSearchPointsBySession } from '@/features/tracking/repositories/localTrackRepository';
import { endLiegezeitNotification } from '@/features/tracking/native/liegezeitNotification';
import { metersToSteps } from '@/features/tracking/utils/steps';
import { useStepLengthSetting } from '@/hooks/useStepLengthSetting';
import { PrecisionDebugPanel } from '@/features/tracking/components/PrecisionDebugPanel';
import type { GpsStats } from '@/features/tracking/engine/types';
import {
  searchSegmentAnnouncements,
  segmentDisplayLabel,
  type SearchSegmentAnnouncementState,
} from '@/features/tracking/utils/trackSegments';

// GPS-Debug-Overlay nur im Dev-Build (nur lesend, beeinflusst die Absuche nicht).
const SHOW_GPS_DEBUG = __DEV__;
import { getTrackSessionDogName } from '@/features/tracking/services/trackService';
import { finalizeLocalTrackRun } from '@/features/training/repositories/localTrainingRepository';
import { enqueueSyncOperation } from '@/features/sync/repositories/syncQueueRepository';
import { syncNow } from '@/features/sync/services/syncEngine';
import { buildRunResultPayload } from '@/features/tracking/utils/localTrackRun';
import * as Crypto from 'expo-crypto';
import { PocketLockOverlay } from '@/features/tracking/components/PocketLockOverlay';
import { useHoldAction } from '@/features/tracking/hooks/useHoldAction';

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
  const { id, dogId } = useLocalSearchParams<{ id: string; dogId?: string }>();
  const router = useRouter();
  const { t } = useT();
  useKeepAwake();   // Display während der Absuche anlassen (Bildschirm nicht sperren)
  const { isPro, loading: capLoading } = useCapabilities();

  // NEWBIE (Nicht-Pro) darf keine laufende Fährte fortsetzen: Absuche/Resume sperren und
  // auf die bestehende Upgrade-Ansicht (Active) leiten. Nutzt das bestehende isPro-Gate.
  useEffect(() => {
    if (!capLoading && !isPro) router.replace('/premium' as never);
  }, [capLoading, isPro, router]);
  // Registry aufräumen: eine abgeschlossene/abgebrochene Fährte gehört dem Hund
  // nicht mehr als „offen". Ein no-op ohne dogId (Legacy-Deeplinks).
  const clearRegistry = useCallback(() => { if (dogId) useActiveFaehrten.getState().remove(dogId); }, [dogId]);
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
      segments: st.segments,
      level: 'training' as Level,
    };
  };
  type Snap = ReturnType<typeof buildSnap>;

  const [phase, setPhase] = useState<'checking' | 'ready'>('checking');
  const [effectiveId, setEffectiveId] = useState<string | null>(id ?? null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [recovery, setRecovery] = useState<PendingTrack | null>(null);   // gesetzt ⇒ Recovery-Dialog offen
  const finishRequestedRef = useRef(false);   // synchroner Once-only-Guard für Confirm-Callbacks
  const snapData: Snap = snap ?? { laidLatLng: [], laidPoints: [], laidObjects: [], laidMarkers: [], segments: [], level: 'training' as Level };

  // Gewählter Abstand Hundeführer↔Hund (5/10 m) — vor Absuchestart gesetzt,
  // persistiert (Store/PendingTrack) und bei Recovery wiederhergestellt (Default 5).
  const [searchHandlerDistanceM, setSearchHandlerDistanceM] = useState<SearchHandlerDistanceM>(DEFAULT_HANDLER_DISTANCE_M);
  const { stepLengthM } = useStepLengthSetting();   // optionale persönliche Schrittlänge (Default 0,75 m)

  const s = useSearchRecorder({ laidPoints: snapData.laidPoints, laidObjects: snapData.laidObjects, level: snapData.level, sessionId: effectiveId, handlerDistanceM: searchHandlerDistanceM });

  const [view, setView] = useState<'map' | 'sketch'>('map');
  const [follow, setFollow] = useState(true);   // Karte folgt der Live-Position; aus → frei zoombar
  const [voiceOn, setVoiceOn] = useState(true);
  const [dogName, setDogName] = useState('Hund');
  const [finishing, setFinishing] = useState(false);
  const [pocketLock, setPocketLock] = useState(false);
  const [arming, setArming] = useState(false);   // true = Navigation zum Fährtenansatz (Suchzeit läuft NICHT)
  // Persistierter Startanker (Fallback, wenn der Runtime-Store nach App-Neustart leer ist).
  const [anchorFallback, setAnchorFallback] = useState<{ lat: number; lng: number } | null>(null);
  const [noStartHandled, setNoStartHandled] = useState(false);   // kontrolliertes „kein Startpunkt" nur einmal
  const startModeRef = useRef<StartMode>('manual-at-start');   // wie der Start bestätigt wurde (Runtime-Info)
  const startedRef = useRef(false);
  const runIdRef = useRef<string | null>(null);
  const searchStartMsRef = useRef<number | null>(null);   // Suchzeit-Start (für lokale Run-Finalisierung)
  const segmentAnnouncementRef = useRef<Record<string, SearchSegmentAnnouncementState>>({});

  // Ursprünglicher Startpunkt (Fährtenansatz):
  //   1) gültiger Runtime-Startpunkt (erster gelegter Punkt = StartAnchor),
  //   2) persistierter startAnchor als Fallback (nach App-Neustart),
  //   3) sonst null → kontrollierte Recovery (kein stiller Sofortstart).
  const startPoint = (snap && snap.laidLatLng.length > 0 ? snap.laidLatLng[0] : null) ?? anchorFallback;
  const approach = useStartPointApproach({ active: arming, start: startPoint });

  // P4: Beim Betreten der Absuche ist die Liegezeit vorbei → System-Anzeige entfernen.
  useEffect(() => { void endLiegezeitNotification(); }, []);

  // 1) Beim Betreten entscheiden: frische Absuche oder unterbrochene fortsetzen (P2).
  useEffect(() => {
    let alive = true;
    (async () => {
      const pending = await loadPending(dogId);
      if (!alive) return;
      // Persistierten Startanker als Fallback merken (RC-4): überlebt App-Neustart.
      if (pending?.startAnchor) setAnchorFallback({ lat: pending.startAnchor.lat, lng: pending.startAnchor.lng });
      // Recovery: gewählten 1/5/10-m-Abstand wiederherstellen (nicht erneut fragen).
      if (isHandlerDistance(pending?.searchHandlerDistanceM)) {
        setSearchHandlerDistanceM(pending.searchHandlerDistanceM);
      }
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

  // Absuche WIRKLICH starten: Recorder + Timer + Status 'searching'. Wird erst am
  // Fährtenansatz (Arming) bzw. beim Fortsetzen aufgerufen — NICHT beim Betreten.
  const beginSearchNow = useCallback((mode: StartMode = 'manual-at-start') => {
    if (startedRef.current) return;
    startedRef.current = true;
    startModeRef.current = mode;   // Runtime-Info (manual-at-start | manual-override)
    setArming(false);
    hapticSuccess();   // haptisches Feedback beim Erreichen des Ansatzes
    if (voiceOn && Speech) { try { Speech.speak('Suche läuft', { language: 'de-DE' }); } catch { /* best-effort */ } }
    const startMs = Date.now();
    searchStartMsRef.current = startMs;
    // Stabile client-Run-UUID SOFORT (führende Run-ID, kein Warten auf Supabase).
    // Wird via setSearchRunId in den PendingTrack persistiert → überlebt App-Kill/Recovery.
    const runUuid = Crypto.randomUUID();
    runIdRef.current = runUuid;
    useTrackingStore.getState().setSearchRunId(runUuid);
    // Gewählten Abstand in den Store spiegeln → landet im PendingTrack-Snapshot (Recovery).
    useTrackingStore.getState().setSearchHandlerDistanceM(searchHandlerDistanceM);
    s.start();
    useTrackingStore.getState().startSearchSession(null, startMs);   // Status 'searching' + Suchzeit-Start
    if (dogId) useActiveFaehrten.getState().upsert(dogId, { status: 'searching', searchStartedAt: startMs });
    // Kein direkter Remote-Start mehr (RUN-SAVE2): track_runs wird beim Stop über die
    // Sync-Queue idempotent per runUuid upserted. runUuid ist bereits lokal geführt.
  }, [s, voiceOn, dogId, effectiveId, searchHandlerDistanceM]);

  // Manueller „Jetzt starten": innerhalb des dynamischen Radius → direkt nach Tippen; sonst
  // bewusste Bestätigung (Override). Der Override tut NICHT so, als sei der
  // GPS-Startpunkt bestätigt (startMode = 'manual-override').
  const handleManualStart = useCallback(() => {
    if (startedRef.current) return;
    hapticTap();
    const decision = classifyManualStart(approach.distanceM, approach.accuracy, DEFAULT_APPROACH_CONFIG);
    if (decision === 'at-start') { beginSearchNow('manual-at-start'); return; }
    const distTxt = approach.distanceM != null ? `ca. ${Math.round(approach.distanceM)} m` : 'unbekannt weit';
    Alert.alert(
      'Noch nicht am Startpunkt',
      `Du bist noch ${distTxt} vom Fährtenansatz entfernt. Trotzdem jetzt starten?`,
      [
        { text: 'Zurück', style: 'cancel' },
        { text: 'Trotzdem starten', style: 'destructive', onPress: () => beginSearchNow('manual-override') },
      ],
    );
  }, [approach.distanceM, approach.accuracy, beginSearchNow]);

  // 2) Beim Betreten NICHT direkt starten: erst zum Fährtenansatz navigieren
  //    (Arming, Suchzeit läuft noch nicht). Ohne bekannten Startpunkt → Fallback:
  //    kontrollierter Bestätigungsdialog. Kein Start bei ausstehendem Recovery-Dialog.
  useEffect(() => {
    if (phase !== 'ready' || startedRef.current || arming || recovery || !snap) return;
    if (startPoint) { setArming(true); return; }
    // RC-4: Kein Startpunkt (Runtime leer UND kein persistierter Anker) → NICHT
    // stillschweigend direkt starten. Kontrollierte Recovery-Auswahl anbieten.
    if (noStartHandled) return;
    setNoStartHandled(true);
    Alert.alert(
      'Startpunkt nicht gefunden',
      'Der gespeicherte Fährtenansatz ist nicht verfügbar (z. B. nach App-Neustart). Du kannst zurückgehen oder die Absuche ohne Startpunkt-Prüfung beginnen.',
      [
        { text: 'Zurück', style: 'cancel', onPress: () => router.replace((dogId ? `/track/liegen?dogId=${dogId}` : '/track') as never) },
        { text: 'Trotzdem starten', style: 'destructive', onPress: () => beginSearchNow('manual-override') },
      ],
      { cancelable: false },
    );
  }, [phase, recovery, snap, arming, startPoint, beginSearchNow, noStartHandled, dogId, router]);

  useEffect(() => { if (effectiveId) getTrackSessionDogName(effectiveId).then(r => { if (r.data) setDogName(r.data); }); }, [effectiveId]);

  // GPS-Genauigkeit + Strecke der Absuche gedrosselt (4 s) in die Registry spiegeln,
  // damit die Karten „Suche läuft" mit GPS-Qualität zeigen. Nur vorhandene Daten.
  useEffect(() => {
    if (!dogId || phase !== 'ready') return;
    const iv = setInterval(() => {
      useActiveFaehrten.getState().upsert(dogId, {
        gpsAccuracy: s.accuracy ?? null, distanceMeters: Math.round(s.distanceM),
      });
    }, 4000);
    return () => clearInterval(iv);
  }, [dogId, phase, s.accuracy, s.distanceM]);

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
      { text: 'Beenden',    onPress: () => confirmRecoveryEnd(pending) },
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
    // DIESELBE runUuid weiterverwenden (keine neue Run-ID, keine Duplikate). Fehlt sie
    // in einem Legacy-Puffer, deterministisch einmal erzeugen + persistieren.
    const rid = pending.runId ?? Crypto.randomUUID();
    runIdRef.current = rid;
    useTrackingStore.getState().setSearchRunId(rid);
    searchStartMsRef.current = pending.searchStartedAt ?? Date.now();
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
    const runId = pending.runId ?? runIdRef.current ?? Crypto.randomUUID();
    const durationS = pending.searchStartedAt ? Math.max(0, Math.floor((Date.now() - pending.searchStartedAt) / 1000)) : 0;
    // LOKAL zuerst (durabel): Run-Ergebnis der beendeten Absuche in payload_json.run.
    if (sessId) {
      await finalizeLocalTrackRun(sessId, buildRunResultPayload({
        runId, sessionId: sessId,
        startedAtMs: pending.searchStartedAt ?? Date.now(), endedAtMs: Date.now(),
        result: {
          durationS, score: 0, deviationAvgM: 0, foundObjects: 0, totalObjects: 0,
          distanceM: pathDistanceM(saved), breaks: [],
          points: saved.map(p => ({ latitude: p.lat, longitude: p.lng })),
        },
        searchHandlerDistanceM: pending.searchHandlerDistanceM,
      })).catch(() => {});
    }
    // Remote-Transport über die Sync-Queue (RUN-SAVE2), nicht mehr direkt.
    if (sessId) {
      try { await enqueueSyncOperation({ entityType: 'training_session', entityLocalId: sessId, operation: 'create', priority: 1 }); }
      catch (e) { console.warn('[trackRun] enqueue', e); }
      void syncNow().catch(() => {});
    }
    startedRef.current = true;
    setRecovery(null);
    s.stop();
    useTrackingStore.getState().setSessionStatus('completed');
    useTrackingStore.getState().reset();
    clearRegistry();
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
        clearRegistry();
        startedRef.current = false;   // erlaubt einen frischen Start (neue Absuche, neue runId)
        setRecovery(null);
      } },
    ]);
  };

  // Hundespur / Abriss / Position → Karten-Koordinaten ({lat,lng}).
  const runPoints = useMemo(() => s.points.map(p => ({ lat: p.latitude, lng: p.longitude })), [s.points]);
  const breakPts  = useMemo(() => s.breaks.map(b => ({ lat: b.at.latitude, lng: b.at.longitude })), [s.breaks]);
  const curPos = s.position ? { lat: s.position.latitude, lng: s.position.longitude } : null;

  const mapMarkers: MapMarker[] = snapData.laidMarkers.map(m => ({
    id: m.id, type: m.type, lat: m.lat, lng: m.lng, angleKind: m.angleKind, material: m.material,
  }));
  const winkel = snapData.laidMarkers.filter(m => m.type === 'winkel').length;

  // Hundebezogene Ansagen: Distanz relativ zur VIRTUELLEN HUNDEPOSITION (dogProgressM,
  // Bogenlänge). Ereignis-Bogenlänge = marker.distance_from_start (bei Platzierung
  // aufgezeichnet → order-korrekt, immun gegen Selbstkreuzung).
  const guidanceAngles = useMemo<GuidanceAngle[]>(
    () => snapData.laidMarkers
      .filter(m => m.type === 'winkel')
      .map(m => ({ id: m.id, arcM: m.distance_from_start, angleKind: m.angleKind })),
    [snapData.laidMarkers],
  );
  // Gegenstände (inkl. material für die Voice-Ansage „Dübel"/„Gegenstand").
  const guidanceObjects = useMemo<GuidanceObject[]>(
    () => snapData.laidMarkers
      .filter(m => m.type === 'gegenstand')
      .map(m => ({ id: m.id, arcM: m.distance_from_start, material: m.material })),
    [snapData.laidMarkers],
  );
  useTrackVoiceGuidance(s.dogProgressM, guidanceAngles, voiceOn, stepLengthM, guidanceObjects);

  // Haptische Führung: 1× bei Gegenstand voraus, 2× bei Winkel voraus — dieselbe
  // Bogenlängendistanz (dogProgressM) wie die Sprachführung.
  useTrackHapticGuidance(s.dogProgressM, guidanceAngles, guidanceObjects, true);

  // Fährtenende-Erkennung + Voice („Ende der Fährte erreicht."), Once-only, auf Basis
  // der VIRTUELLEN Hundeposition (dogProgressM/estimatedDogPosition, order-aware) und
  // des gespeicherten Endpunkts (letzter Punkt der gelegten Fährte). Beendet die
  // Absuche NICHT — nur Anzeige/Voice/Haptik; der Nutzer beendet weiterhin selbst.
  const endPoint = snapData.laidPoints.length ? snapData.laidPoints[snapData.laidPoints.length - 1] : null;
  const openMandatoryObjects = Math.max(0, s.totalObjects - s.foundObjects);
  const trackEndState = useTrackEndGuidance({
    recording: s.recording && !arming,
    dogProgressM: s.dogProgressM,
    trackLengthM: s.trackLengthM,
    estimatedDogPosition: s.estimatedDogPosition,
    endPoint,
    openMandatoryObjects,
    voiceOn,
  });
  const trackEndReached = trackEndState === 'reached' || trackEndState === 'completed';

  // Karten-/Skizzen-Marker (Koordinaten) — getrennt von den Bogenlängen-basierten
  // Guidance-Listen (die tragen arcM statt lat/lng).
  const sketchAngleMarkers = useMemo(
    () => snapData.laidMarkers.filter(m => m.type === 'winkel' && m.lat != null && m.lng != null).map(m => ({ lat: m.lat as number, lng: m.lng as number })),
    [snapData.laidMarkers],
  );
  const sketchObjectMarkers = useMemo(
    () => snapData.laidMarkers.filter(m => m.type === 'gegenstand' && m.lat != null && m.lng != null).map(m => ({ lat: m.lat as number, lng: m.lng as number })),
    [snapData.laidMarkers],
  );

  useEffect(() => {
    if (!voiceOn || arming || !s.recording || snapData.segments.length === 0) return;
    const result = searchSegmentAnnouncements({
      segments: snapData.segments,
      currentStep: metersToSteps(s.dogProgressM, stepLengthM),   // hundebezogen (5/10-m-Versatz entlang der Fährte)
      state: segmentAnnouncementRef.current,
    });
    segmentAnnouncementRef.current = result.state;
    result.messages.forEach(message => {
      if (Speech) {
        try { Speech.speak(message, { language: 'de-CH', pitch: 1.0, rate: 0.95 }); } catch { /* best-effort */ }
      }
    });
  }, [arming, s.dogProgressM, s.recording, snapData.segments, voiceOn, stepLengthM]);

  // Off-Track-Feedback (Phase 2): Voice + Haptik NUR auf echten State-Übergängen.
  // Die State-Machine ist bereits debounced → offTrackState ändert sich nur bei einer
  // bestätigten Transition (kein eigener Debounce nötig). KEIN Progress-/Recorder-
  // Freeze, keine Auto-Pause — ausschliesslich Feedback.
  const prevOffTrackRef = useRef<OffTrackState>('on_track');
  // Transientes Recovery-Banner „Wieder auf der Fährte" — kurz einblenden, nicht
  // dauerhaft stehen lassen (Warn-/Off-Track-Banner leiten sich dagegen aus dem State ab).
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const fb = offTrackTransitionFeedback(prevOffTrackRef.current, s.offTrackState);
    prevOffTrackRef.current = s.offTrackState;
    if (!fb || !s.recording) return;
    if (fb.haptic === 'light') hapticTap();
    else if (fb.haptic === 'strong') hapticMarker();
    else hapticSuccess();
    if (voiceOn) say(t(fb.voiceKey));
    // Recovery-Transition (→ on_track): kurzes positives Banner. Neue Warnung/Off-Track
    // blendet ein evtl. laufendes Recovery-Banner sofort wieder aus.
    if (recoveryTimerRef.current) { clearTimeout(recoveryTimerRef.current); recoveryTimerRef.current = null; }
    if (s.offTrackState === 'on_track') {
      setRecoveryVisible(true);
      recoveryTimerRef.current = setTimeout(() => { setRecoveryVisible(false); recoveryTimerRef.current = null; }, 2600);
    } else {
      setRecoveryVisible(false);
    }
  }, [s.offTrackState, s.recording, voiceOn, t]);
  // Timer beim Verlassen aufräumen (kein setState nach Unmount).
  useEffect(() => () => { if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current); }, []);

  // Permanentes Off-Track-Banner leitet sich vom aktuellen State ab (nur während der
  // aktiven Absuche; im Arming-Overlay unsichtbar).
  const offBanner = !arming && s.recording ? offTrackBanner(s.offTrackState) : null;

  const currentRunSegment = useMemo(() => {
    const step = metersToSteps(s.dogProgressM, stepLengthM);
    return snapData.segments.find(seg => seg.status === 'completed' && step >= seg.startStep && step < seg.endStep) ?? null;
  }, [s.dogProgressM, snapData.segments, stepLengthM]);

  const hasLaid = snapData.laidPoints.length > 1;
  const devShown = hasLaid && Number.isFinite(s.deviationM) ? s.deviationM : null;
  const devOff = devShown != null && devShown > 8;

  const handleCancel = () => {
    Alert.alert('Fährte läuft noch', 'Die Absuche bleibt aktiv. Zum Beenden bitte den Stop-Button gedrückt halten.', [{ text: 'Zur Aufnahme', style: 'cancel' }]);
  };

  const confirmRecoveryEnd = (pending: PendingTrack) => {
    Alert.alert('Absuche wirklich beenden?', 'Die gespeicherten Suchpunkte bleiben erhalten.', [
      { text: 'Weiter', style: 'cancel' },
      { text: 'Absuche beenden', style: 'destructive', onPress: () => void endSearch(pending) },
    ]);
  };

  const handleFinish = () => {
    if (finishing || finishRequestedRef.current) return;   // Doppelt-Tippen → keine doppelte Finalisierung
    Alert.alert(t('track.finishTitle'), t('track.finishBody'), [
      { text: t('track.keepSearching'), style: 'cancel' },
      { text: t('common.finish'), style: 'destructive', onPress: async () => {
        if (finishRequestedRef.current) return;
        finishRequestedRef.current = true;
        hapticSuccess();   // sofort beim Bestätigen, vor await
        setFinishing(true);
        const res = s.stop();   // ← Search-Recorder beenden (flusht letzten Puffer)
        // runUuid ist seit dem Start deterministisch vorhanden (kein Null-Race mehr);
        // defensiver Fallback, falls doch nicht gesetzt.
        const runId = runIdRef.current ?? Crypto.randomUUID();
        const sessId = effectiveId;

        // 1) LOKAL zuerst = Erfolgsschwelle. Run-Ergebnis dauerhaft in payload_json.run.
        //    Schlägt das fehl → KEIN Reset/Navigation (Recovery bleibt möglich, kein Verlust).
        if (sessId) {
          try {
            await finalizeLocalTrackRun(sessId, buildRunResultPayload({
              runId, sessionId: sessId,
              startedAtMs: searchStartMsRef.current ?? (Date.now() - res.durationS * 1000), endedAtMs: Date.now(),
              result: {
                durationS: res.durationS, score: res.score, deviationAvgM: res.deviationAvgM,
                foundObjects: res.foundObjects, totalObjects: res.totalObjects, distanceM: res.distanceM,
                breaks: res.breaks, points: res.points,
              },
              searchHandlerDistanceM,
            }));
          } catch (e) {
            console.warn('[trackRun] local finalize', e);
            finishRequestedRef.current = false;
            setFinishing(false);
            Alert.alert('Speichern fehlgeschlagen', 'Die Absuche konnte nicht lokal gespeichert werden. Bitte erneut versuchen.');
            return;   // kein Reset, keine Navigation → Ergebnis bleibt erhalten
          }
        }

        // Lokal sicher → Session abschliessen (Recovery bietet sie nicht mehr als laufend an).
        useTrackingStore.getState().setSessionStatus('completed');
        useTrackingStore.getState().reset();
        clearRegistry();

        // 2) Remote-Transport ausschliesslich über die persistente Sync-Queue (RUN-SAVE2):
        //    dieselbe training_session erneut enqueuen → syncNow lädt Lay + Run (track_runs
        //    per runUuid) idempotent hoch. Navigation wartet NICHT (lokal bereits durabel).
        if (sessId) {
          try {
            await enqueueSyncOperation({ entityType: 'training_session', entityLocalId: sessId, operation: 'create', priority: 1 });
          } catch (e) { console.warn('[trackRun] enqueue', e); }
          void syncNow().catch(() => { /* Queue bleibt pending → Retry später */ });
        }
        setFinishing(false);
        router.replace((sessId ? `/track/${sessId}` : '/track') as never);
      } },
    ]);
  };
  const stopHold = useHoldAction(handleFinish);

  const guardedBack = useCallback(() => {
    if (pocketLock) return;
    handleCancel();
  }, [pocketLock]);

  usePreventRemove(!arming && s.recording, useCallback(() => {
    if (!pocketLock) handleCancel();
  }, [pocketLock]));

  const unlockPocket = useCallback(() => {
    hapticTap();
    setPocketLock(false);
  }, []);

  const metrics: { value: string; label: string; warn?: boolean }[] = [
    { value: `${Math.round(s.distanceM)} m`, label: `≈ ${metersToSteps(s.distanceM, stepLengthM)} Schr.` },
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

  // Fährten-Absuche ist Pro-only — Nicht-Pro sieht die Absuche-/Resume-UI nie (Redirect oben).
  if (!capLoading && !isPro) return null;

  return (
    <View className="flex-1 bg-ft-bg">
      <SafeAreaView edges={['bottom']} className="flex-1">
        {/* Top-Bar — explizit unter Dynamic Island/Statusbar. */}
        <View className="flex-row items-center gap-3 px-[18px] pb-[10px]" style={{ paddingTop: insets.top + 8 }}>
          <Pressable
            className="w-9 h-9 rounded-[11px] border border-ft-line-strong bg-white/5 items-center justify-center"
            onPress={arming
              ? () => router.replace((effectiveId ? `/track/liegen?id=${effectiveId}${dogId ? `&dogId=${dogId}` : ''}` : dogId ? `/track/liegen?dogId=${dogId}` : '/track') as never)
              : guardedBack}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color={FT.text} />
          </Pressable>
          {arming ? (
            <View className="flex-row items-center gap-[6px] px-3 py-1.5 rounded-full bg-ft-acc-dim border border-[rgba(21,230,195,0.4)]">
              <Ionicons name="locate" size={12} color={FT.acc} />
              <Text className="text-[11px] font-extrabold tracking-[1.4px] text-ft-acc">ANSATZ</Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-[7px] px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,93,108,0.14)', borderWidth: 1, borderColor: 'rgba(255,93,108,0.3)' }}>
              <RecDot />
              <Text className="text-[11px] font-extrabold tracking-[1.4px] text-[#ff8a94]">LIVE</Text>
            </View>
          )}
          <View className="flex-1" />
          <HelpButton topicId="track_search" autoShow tint={FT.text} size={18} />
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
          {!arming && s.recording && (
            <Pressable
              accessibilityLabel={pocketLock ? 'Absuche entsperren' : 'Absuche sperren'}
              accessibilityHint={pocketLock ? 'Zum Entsperren gedrückt halten' : 'Sperrt gefährliche Touch-Aktionen'}
              onPress={() => { if (!pocketLock) { hapticTap(); setPocketLock(true); } }}
              className={`absolute top-[64px] right-[14px] z-30 w-9 h-9 rounded-[11px] items-center justify-center border ${pocketLock ? 'bg-ft-acc border-ft-acc' : 'bg-black/90 border-ft-line-strong'}`}
              style={{ elevation: 30 }}
            >
              <Ionicons name={pocketLock ? 'lock-closed' : 'lock-open-outline'} size={17} color={pocketLock ? FT.accText : FT.text} />
            </Pressable>
          )}
          {view === 'map' ? (
            <TrackingMap
              layPoints={snapData.laidLatLng} dimLay
              runPoints={runPoints} markers={mapMarkers} segments={snapData.segments} breaks={breakPts}
              currentPosition={arming ? approach.position : curPos}
              dogPosition={!arming && s.estimatedDogPosition ? { lat: s.estimatedDogPosition.latitude, lng: s.estimatedDogPosition.longitude } : null}
              follow={follow}
              onToggleFollow={() => setFollow(f => !f)}
              onUserPan={() => setFollow(false)}
              controlsTop={124}
            />
          ) : (
            <View className="flex-1 bg-[#08100e]"><TrackSketch points={snapData.laidLatLng} angleMarkers={sketchAngleMarkers} objectMarkers={sketchObjectMarkers} legs={winkel} objects={s.totalObjects} w={360} h={520} progress={1} /></View>
          )}

          {/* Timer (oben links) */}
          <View className="absolute top-[14px] left-[14px] rounded-[16px] px-4 py-[10px] bg-ft-glass border border-ft-glass-line">
            <Text className="text-[30px] text-ft-text font-black" style={{ fontVariant: ['tabular-nums'] }}>{fmtClock(s.elapsedS)}</Text>
            <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">{t('track.searchDuration')}</Text>
          </View>

          {/* Off-Track-Banner (Phase 2): warning dezent (Amber), off_track deutlicher (Rot),
              Recovery kurz positiv (Mint). Reines Feedback — kein Freeze, keine Auto-Pause. */}
          {(offBanner || recoveryVisible) && (
            <View className="absolute top-[84px] left-[14px] right-[14px]" pointerEvents="none">
              {offBanner === 'off_track' ? (
                <View className="flex-row items-center gap-2 rounded-[16px] px-4 py-3.5 border" style={{ backgroundColor: 'rgba(255,93,108,0.16)', borderColor: 'rgba(255,93,108,0.55)' }}>
                  <Ionicons name="alert-circle" size={18} color={FT.bad} />
                  <Text className="flex-1 text-[13.5px] font-black text-[#ff8a94]">{t('track.offTrack')}</Text>
                </View>
              ) : offBanner === 'warning' ? (
                <View className="flex-row items-center gap-2 rounded-[16px] px-4 py-3 bg-ft-glass border border-[rgba(255,181,71,0.45)]">
                  <Ionicons name="warning-outline" size={16} color={FT.warn} />
                  <Text className="flex-1 text-[13px] font-bold text-ft-warn">{t('track.offTrackWarning')}</Text>
                </View>
              ) : recoveryVisible ? (
                <View className="flex-row items-center gap-2 rounded-[16px] px-4 py-3 bg-ft-glass border border-[rgba(21,230,195,0.45)]">
                  <Ionicons name="checkmark-circle" size={16} color={FT.acc} />
                  <Text className="flex-1 text-[13px] font-bold text-ft-acc">{t('track.backOnTrack')}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Fährtenende erreicht — persistentes Mint-Banner. KEIN Auto-Beenden; der
              Nutzer beendet die Absuche weiterhin bewusst selbst. */}
          {!arming && s.recording && trackEndReached && (
            <View className="absolute top-[84px] left-[14px] right-[14px]" pointerEvents="none">
              <View className="flex-row items-center gap-2 rounded-[16px] px-4 py-3.5 border" style={{ backgroundColor: 'rgba(21,230,195,0.16)', borderColor: 'rgba(21,230,195,0.55)' }}>
                <Ionicons name="flag" size={18} color={FT.acc} />
                <Text className="flex-1 text-[13.5px] font-black text-ft-acc">{t('track.trackEndReached')}</Text>
              </View>
            </View>
          )}

          {!arming && currentRunSegment && (
            <View className="absolute left-[14px] right-[14px] bottom-[88px] rounded-[16px] px-4 py-3 bg-ft-glass border border-ft-glass-line">
              <Text className="text-[10px] text-ft-faint font-bold tracking-[1.2px] uppercase">Teilstrecke</Text>
              <Text className="text-[14px] text-ft-text font-black mt-0.5">{segmentDisplayLabel(currentRunSegment)}</Text>
              <Text className="text-[11px] text-ft-muted font-semibold mt-1">
                Noch ca. {Math.max(0, currentRunSegment.endStep - metersToSteps(s.dogProgressM, stepLengthM))} Schritte
              </Text>
            </View>
          )}

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

          {/* Arming-Overlay: Navigation zum Fährtenansatz. Suchzeit läuft NICHT
              (Recorder ungestartet, Timer 00:00). Start erst per Bestätigung. */}
          {arming && (
            <View className="absolute inset-0 bg-black/55">
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 24 }}
              >
              <View className="items-center gap-2">
                <View className="w-[62px] h-[62px] rounded-full items-center justify-center border-2 border-[rgba(21,230,195,0.4)] bg-ft-acc-dim mb-1">
                  <Ionicons name="locate" size={26} color={FT.acc} />
                </View>
                <Text className="text-[13px] font-bold text-ft-text text-center leading-[19px] max-w-[280px]">{t('track.searchApproachHint')}</Text>
                <Text className="text-[48px] font-black text-ft-text mt-1" style={{ fontVariant: ['tabular-nums'] }}>
                  {approach.distanceM != null ? `${approach.distanceM.toFixed(1)} m` : '– m'}
                </Text>
                <Text className="text-[9px] text-ft-muted font-bold tracking-[1.4px] uppercase">Distanz zum Ansatz</Text>
                {/* Status: Distanz + gemeldete GPS-Genauigkeit (keine falsche cm-Präzision). */}
                <View className="flex-row items-center gap-2 mt-3 px-3 py-1.5 rounded-full bg-white/5 border border-ft-line">
                  {approach.armed ? (
                    <>
                      <Ionicons name="checkmark-circle" size={13} color={FT.acc} />
                      <Text className="text-[12px] font-bold text-ft-acc">{t('track.searchApproachReached')}</Text>
                    </>
                  ) : approach.withinRadius ? (
                    <>
                      <Ionicons name="ellipse-outline" size={13} color={FT.acc} />
                      <Text className="text-[12px] font-bold text-ft-acc">
                        {approach.accuracy != null ? `${t('track.gpsStabilizing')} … ±${Math.round(approach.accuracy)} m` : t('track.gpsStabilizing')}
                      </Text>
                    </>
                  ) : approach.accuracy == null ? (
                    <>
                      <Ionicons name="navigate" size={13} color={FT.muted} />
                      <Text className="text-[12px] font-bold text-ft-muted">GPS wird gesucht…</Text>
                    </>
                  ) : approach.accuracy > DEFAULT_APPROACH_CONFIG.maxAccuracyM ? (
                    <>
                      <Ionicons name="warning-outline" size={13} color={FT.warn} />
                      <Text className="text-[12px] font-bold text-ft-warn">
                        GPS wird stabilisiert … ±{Math.round(approach.accuracy)} m
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="navigate" size={13} color={FT.muted} />
                      <Text className="text-[12px] font-bold text-ft-muted">
                        {approach.distanceM != null ? `Startpunkt ${Math.round(approach.distanceM)} m entfernt · ` : ''}GPS ±{Math.round(approach.accuracy)} m
                      </Text>
                    </>
                  )}
                </View>
                {/* Abstand Hundeführer ↔ Hund: bestimmt die virtuelle Hundeposition
                    (1/5/10 m entlang der Fährte) für hundebezogene Ansagen. Default 5 m. */}
                <Text className="text-[9px] text-ft-muted font-bold tracking-[1.4px] uppercase mt-4">{t('track.searchHandlerDistanceLabel')}</Text>
                <View className="flex-row gap-2 mt-1.5">
                  {HANDLER_DISTANCES_M.map(d => {
                    const on = searchHandlerDistanceM === d;
                    return (
                      <Pressable
                        key={d}
                        accessibilityLabel={t('track.searchHandlerDistanceOption', { meters: String(d) })}
                        onPress={() => { setSearchHandlerDistanceM(d); useTrackingStore.getState().setSearchHandlerDistanceM(d); }}
                        className={`px-6 py-2.5 rounded-[14px] border ${on ? 'bg-ft-acc-dim border-[rgba(21,230,195,0.55)]' : 'bg-white/5 border-ft-line'}`}
                      >
                        <Text className={`text-[14px] font-black ${on ? 'text-ft-acc' : 'text-ft-text'}`}>{d} m</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {/* Manueller Start (RC-2): immer verfügbar, wenn noch nicht gestartet. */}
                <Pressable
                  accessibilityLabel={t('track.searchStartNow')}
                  accessibilityHint={t('track.searchStartHint')}
                  onPress={handleManualStart}
                  className="flex-row items-center justify-center gap-2 mt-4 px-6 py-3 rounded-[16px] bg-ft-acc"
                >
                  <Ionicons name="play" size={16} color={FT.accText} />
                  <Text className="text-[14px] font-black text-ft-acc-text">{t('track.searchStartNow')}</Text>
                </Pressable>
              </View>
              </ScrollView>
            </View>
          )}
        </View>

        {/* Steuerung */}
        <View className="flex-row gap-3 px-[18px] pt-[14px] pb-[26px]">
          <Pressable
            className="flex-1 h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-white/5 border border-ft-line-strong"
            style={(arming || s.foundObjects >= s.totalObjects) ? { opacity: 0.45 } : undefined}
            onPress={() => { hapticSuccess(); s.markObject(); }} disabled={arming || s.foundObjects >= s.totalObjects}
          >
            <Ionicons name="flag" size={20} color={FT.text} />
            <Text className="text-[10.5px] font-extrabold text-ft-text">{t('track.object')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Absuche beenden"
            accessibilityHint="Zum Öffnen der Bestätigung gedrückt halten"
            className="h-[60px] rounded-[18px] items-center justify-center gap-[3px] bg-ft-bad"
            style={[{ flex: 1.3 }, (finishing || arming) ? { opacity: 0.45 } : null]}
            onPress={stopHold.onPress} onPressIn={stopHold.onPressIn} onPressOut={stopHold.onPressOut} disabled={finishing || arming}
          >
            {finishing ? <ActivityIndicator color="#2a060a" /> : <Ionicons name="stop" size={20} color="#2a060a" />}
            <Text className="text-[10.5px] font-extrabold text-[#2a060a]">{t('track.evaluate')}</Text>
            <Text numberOfLines={1} className="text-[8px] font-bold text-[#2a060a]/75">Gedrückt halten</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <PocketLockOverlay
        visible={pocketLock && !arming && s.recording}
        duration={fmtClock(s.elapsedS)}
        distanceM={`${Math.round(s.distanceM)} m`}
        onUnlock={unlockPocket}
        onRequestStop={handleFinish}
        stopLabel="Absuche beenden"
      />

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
