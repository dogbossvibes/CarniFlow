import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useKeepAwake } from 'expo-keep-awake';
import { FT } from '@/constants/colors';
import { useT } from '@/i18n';
import { HelpButton } from '@/components/help/HelpButton';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { fmtClock } from '@/features/tracking/components/LiveChrome';
import { useSearchRecorder, type Level } from '@/features/tracking/hooks/useSearchRecorder';
import { getGpsQuality } from '@/features/tracking/utils/gpsFilter';
import { useTrackVoiceGuidance, say, speechLanguage, type GuidanceAngle } from '@/features/tracking/hooks/useTrackVoiceGuidance';
import { requestVoice, resetVoiceEvents, voiceDiagnostics } from '@/features/tracking/utils/voiceEvents';
import i18n from '@/i18n/config';
import { offTrackTransitionFeedback, offTrackBanner } from '@/features/tracking/utils/offTrackFeedback';
import type { OffTrackState } from '@/features/tracking/utils/offTrack';
import { useTrackHapticGuidance, type GuidanceObject } from '@/features/tracking/hooks/useTrackHapticGuidance';
import { useTrackEndGuidance } from '@/features/tracking/hooks/useTrackEndGuidance';
import { advanceEndFixHistory, INITIAL_END_FIX_HISTORY } from '@/features/tracking/utils/endFixConfirmation';
import { buildSearchDiagnostics, saveQaSearchCapture } from '@/features/tracking/utils/qaSearchCapture';
import { toSupportCapture } from '@/features/tracking/utils/supportDiagnostics';
import { isQaDiagnosticsEnabled } from '@/features/tracking/utils/qaDiagnosticsMode';
import { DEFAULT_HANDLER_DISTANCE_M, HANDLER_DISTANCES_M, isHandlerDistance, haversineM, type SearchHandlerDistanceM } from '@/features/tracking/utils/searchGeometry';
import { endRadiusM, trackEndBlocker } from '@/features/tracking/utils/guidanceEngine';
import { boundedPush, TRACKING_UX_QA_LIMITS } from '@/features/tracking/utils/trackingUxDiagnostics';
import type { QaApproachFixDiagnostics, QaEndConfirmationDiagnostics, QaEndEligibilitySample, QaStartApproachDiagnostics } from '@/features/tracking/utils/qaSearchCapture';
import { hapticSuccess, hapticTap, hapticMarker } from '@/features/tracking/utils/haptics';
import { useTrackingStore, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { useStartPointApproach } from '@/features/tracking/hooks/useStartPointApproach';
import { precisionLocationClient } from '@/features/tracking/native/precisionLocationClient';
import {
  DEFAULT_APPROACH_CONFIG, nextStartZonePhase, type StartMode,
} from '@/features/tracking/engine/startApproach';
import { loadPending, type PendingTrack } from '@/features/tracking/store/trackPersist';
import { buildSearchEventArcs, type CanonicalArc } from '@/features/tracking/utils/canonicalArc';
import type { SearchRunState } from '@/features/tracking/store/searchRunState';

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

import { getTrackSessionDogName } from '@/features/tracking/services/trackService';
import { finalizeLocalTrackRun } from '@/features/training/repositories/localTrainingRepository';
import { enqueueSyncOperation } from '@/features/sync/repositories/syncQueueRepository';
import { syncNow } from '@/features/sync/services/syncEngine';
import { buildRunResultPayload } from '@/features/tracking/utils/localTrackRun';
import {
  type AnalyticsCornerInput, type AnalyticsObjectInput, type AnalyticsAngleKind,
} from '@/features/tracking/engine/trackAnalytics';
import { computeTrackAnalyticsV3 } from '@/features/tracking/engine/trackAnalyticsV3';
import * as Crypto from 'expo-crypto';
import { PocketLockOverlay } from '@/features/tracking/components/PocketLockOverlay';
import { HoldToStopButton } from '@/features/tracking/components/HoldToStopButton';

// GPS-Debug-Overlay nur im Dev-Build (nur lesend, beeinflusst die Absuche nicht).
const SHOW_GPS_DEBUG = __DEV__;

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

// Stabiler Leer-Snapshot auf MODUL-Ebene (nicht pro Render neu): wird als
// Fallback verwendet, solange der echte Snapshot noch nicht geladen ist.
// Neue Array-Identitäten pro Render würden useSearchRecorder in eine
// Endlosschleife aus Abmelden/Neu-Abonnieren der Positionsquelle treiben
// (Root-Cause Feldtest B — Details im Watch-Effect von useSearchRecorder.ts).
const EMPTY_SNAP_CONST = {
  laidLatLng: [] as { lat: number; lng: number }[],
  laidPoints: [] as { latitude: number; longitude: number }[],
  laidAccuracies: [] as (number | null)[],
  laidObjects: [] as { at: { latitude: number; longitude: number }; index: number; material: string }[],
  laidMarkers: [] as ReturnType<typeof useTrackingStore.getState>['markers'],
  eventArcs: {} as Record<string, CanonicalArc>,
  segments: [] as ReturnType<typeof useTrackingStore.getState>['segments'],
  referenceCanonicalLengthM: null as number | null,
  level: 'training' as Level,
  recovery: null as SearchRunState | null,
};

// AUSARBEITEN — der Hund läuft die gelegte Fährte ab. Snapshot (laidPoints,
// laidObjects, level) wird beim Betreten aus dem Lege-Store übernommen; der
// useSearchRecorder startet genau einmal und liefert Spur, Abrisse, Abweichung,
// Metriken und Live-Score. Stop → Auswertung via s.stop().
export default function TrackRunScreen() {
  const { id, dogId } = useLocalSearchParams<{ id: string; dogId?: string }>();
  const router = useRouter();
  const { t } = useT();
  useKeepAwake();   // Display während der Absuche anlassen (Bildschirm nicht sperren)
  // Registry aufräumen: eine abgeschlossene/abgebrochene Fährte gehört dem Hund
  // nicht mehr als „offen". Ein no-op ohne dogId (Legacy-Deeplinks).
  const clearRegistry = useCallback(() => { if (dogId) useActiveFaehrten.getState().remove(dogId); }, [dogId]);
  const insets = useSafeAreaInsets();   // sichere Abstände (Dynamic Island / Statusbar)

  // Snapshot der gelegten Fährte (aus dem Store — nach Recovery via restoreSearchSession
  // befüllt). Wird nach der Recovery-Entscheidung EINMAL gesetzt und bleibt stabil.
  // `withRecovery`: Search-Recovery-State desselben Runs (nach restoreSearchSession
  // im Store) in den Snapshot übernehmen → seedet Voice/Haptik/Ende/Segmente.
  // Frischer Start und Discard bauen den Snapshot OHNE Recovery (recovery: null).
  const buildSnap = (withRecovery = false) => {
    const st = useTrackingStore.getState();
    const objs = st.markers.filter(m => m.type === 'gegenstand' && m.lat != null && m.lng != null);
    // `t` (Fix-Zeitstempel je Linienpunkt) bleibt erhalten: canonicalArc wählt
    // bei selbst-benachbarten Schenkeln den Durchgang über die gemeinsame
    // Zeitachse Marker ↔ Linie (P0 „Self-Crossing", qa-0ec8c4ca). Für den
    // Recorder (LL) ist das Feld unsichtbar.
    const laidPoints = st.trackPoints.map(p => ({ latitude: p.lat, longitude: p.lng, t: p.t }));
    // Kanonische Eventposition (P0-Fix „Canonical Reference Progress"): JEDER
    // Marker bekommt seine Bogenlänge auf GENAU dieser laidPoints-Linie —
    // per Projektion seiner Koordinate (canonicalArc.ts). `distance_from_start`
    // ist ab hier keine Search-Authority mehr (Auto-Winkel trugen dort den
    // Detektor-Maßstab, Lauf 9: 4,8 m gespeichert ↔ 7,8 m auf der Linie).
    const eventArcs = buildSearchEventArcs(st.markers, laidPoints);
    if (__DEV__) {
      // Reine Diagnose (kein Gate, keine Schwelle): Maßstabsabweichung + seitlicher Abstand je Marker.
      for (const m of st.markers) {
        const a = eventArcs[m.id];
        console.log('[canonicalArc]', {
          id: m.id, type: m.type, angleKind: m.angleKind, source: a?.source, selection: a?.selection, segmentIndex: a?.segmentIndex,
          storedM: m.distance_from_start, canonicalM: a?.arcM != null ? Math.round(a.arcM * 100) / 100 : null,
          deltaM: a?.arcM != null ? Math.round((a.arcM - m.distance_from_start) * 100) / 100 : null,
          offLineM: a?.offLineM != null ? Math.round(a.offLineM * 100) / 100 : null,
        });
      }
    }
    return {
      laidLatLng: st.trackPoints.map(p => ({ lat: p.lat, lng: p.lng })),
      laidPoints,
      laidAccuracies: st.trackPoints.map(p => p.accuracy ?? null),
      laidObjects: objs.map((m, i) => ({ at: { latitude: m.lat as number, longitude: m.lng as number },
        index: i, material: m.material ?? '', id: m.id, atM: eventArcs[m.id]?.arcM ?? null })),
      laidMarkers: st.markers,
      eventArcs,
      segments: st.segments,
      referenceCanonicalLengthM: st.distanceMeters,
      level: 'training' as Level,
      recovery: withRecovery ? st.searchRunState : null,
    };
  };
  type Snap = ReturnType<typeof buildSnap>;
  // Modul-stabiler Leer-Snapshot (siehe snapData unten) — bewusst EIN Objekt
  // für die gesamte Lebensdauer, nicht pro Render neu.
  const EMPTY_SNAP = EMPTY_SNAP_CONST as Snap;

  const [phase, setPhase] = useState<'checking' | 'ready'>('checking');
  const [effectiveId, setEffectiveId] = useState<string | null>(id ?? null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [recovery, setRecovery] = useState<PendingTrack | null>(null);   // gesetzt ⇒ Recovery-Dialog offen
  const finishRequestedRef = useRef(false);   // synchroner Once-only-Guard für Confirm-Callbacks
  // WICHTIG (Root-Cause-Fix Feldtest B): der Fallback muss eine STABILE
  // Identität haben. Als Inline-Objektliteral erzeugte er bei jedem Render
  // neue leere Arrays → useSearchRecorder baute seine Positionsquelle in einer
  // Endlosschleife neu auf und verarbeitete nie einen Fix (Details siehe
  // Kommentar am Watch-Effect in useSearchRecorder.ts).
  const snapData: Snap = snap ?? EMPTY_SNAP;

  // Gewählter Abstand Hundeführer↔Hund (5/10 m) — vor Absuchestart gesetzt,
  // persistiert (Store/PendingTrack) und bei Recovery wiederhergestellt (Default 5).
  const [searchHandlerDistanceM, setSearchHandlerDistanceM] = useState<SearchHandlerDistanceM>(DEFAULT_HANDLER_DISTANCE_M);
  const { stepLengthM } = useStepLengthSetting();   // optionale persönliche Schrittlänge (Default 0,75 m)

  const laidAngleArcM = useMemo(() => snapData.laidMarkers.filter(m => m.type === 'winkel')
    .flatMap(m => { const at = snapData.eventArcs[m.id]?.arcM; return at == null ? [] : [at]; }), [snapData]);
  const s = useSearchRecorder({ laidPoints: snapData.laidPoints, laidObjects: snapData.laidObjects,
    level: snapData.level, sessionId: effectiveId, handlerDistanceM: searchHandlerDistanceM,
    angleArcM: laidAngleArcM });

  const [view, setView] = useState<'map' | 'sketch'>('map');
  const [follow, setFollow] = useState(true);   // Karte folgt der Live-Position; aus → frei zoombar
  const [voiceOn, setVoiceOn] = useState(true);
  const autoDwellVoiceKey = s.autoDwellObjectIds.join('|');
  useEffect(() => {
    if (!voiceOn || !s.recording) return;
    autoDwellVoiceKey.split('|').filter(Boolean).forEach(id => requestVoice({ eventType: 'object',
      text: t('track.voiceObjectDetected'), language: speechLanguage(i18n.language as never),
      priority: 6, onceKey: `auto_dwell:${id}`, phase: 'search' }));
  }, [voiceOn, s.recording, autoDwellVoiceKey, t]);
  const [dogName, setDogName] = useState('Hund');
  const [finishing, setFinishing] = useState(false);
  const [pendingExit, setPendingExit] = useState<string | null>(null);
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
  // Off-Track-Übergänge (Feedback nur auf echten State-Wechseln); wird bei Resume aus
  // dem Search-Recovery-State geseedet (siehe resumeSearch), bei Discard zurückgesetzt.
  const prevOffTrackRef = useRef<OffTrackState>('on_track');

  // Ursprünglicher Startpunkt (Fährtenansatz):
  //   1) gültiger Runtime-Startpunkt (erster gelegter Punkt = StartAnchor),
  //   2) persistierter startAnchor als Fallback (nach App-Neustart),
  //   3) sonst null → kontrollierte Recovery (kein stiller Sofortstart).
  const startPoint = (snap && snap.laidLatLng.length > 0 ? snap.laidLatLng[0] : null) ?? anchorFallback;
  const approachOriginRef = useRef<number | null>(null);
  const approachQaRef = useRef<QaStartApproachDiagnostics | null>(null);
  const approachFixQaRef = useRef<QaApproachFixDiagnostics>({ samples: [], truncated: false });
  const endQaRef = useRef<QaEndEligibilitySample[]>([]);
  const endQaTruncatedRef = useRef(false);
  const endConfirmationRef = useRef<QaEndConfirmationDiagnostics | null>(null);
  const finalObjectGraceQaRef = useRef({ startedAtMs: null as number | null, endedAtMs: null as number | null, reason: null as string | null });
  const recordApproachFix = useCallback((event: import('@/features/tracking/hooks/useStartPointApproach').ApproachFixEvent) => {
    if (!isQaDiagnosticsEnabled()) return;
    approachOriginRef.current ??= event.tMs;
    const recorded = boundedPush(approachFixQaRef.current.samples, {
      tSec: Math.max(0, (event.tMs - approachOriginRef.current) / 1000),
      distanceToStartM: event.distanceToStartM, accuracyM: event.accuracyM,
      stable: event.stable, stableCount: event.stableCount, zone: event.zone,
      transition: event.transition,
    }, 100);
    if (!recorded) approachFixQaRef.current.truncated = true;
  }, []);
  const approach = useStartPointApproach({ active: arming, start: startPoint, liveFix: s.liveFix,
    onDiagnostic: recordApproachFix });
  useEffect(() => {
    if (arming) {
      approachOriginRef.current ??= Date.now(); approachQaRef.current = null;
      endQaRef.current = []; endQaTruncatedRef.current = false;
      endConfirmationRef.current = null;
      finalObjectGraceQaRef.current = { startedAtMs: null, endedAtMs: null, reason: null };
      resetVoiceEvents(approachOriginRef.current);
    }
  }, [arming]);
  const approachPhaseRef = useRef(approach.phase);
  approachPhaseRef.current = approach.phase;
  const approachArmedRef = useRef(approach.armed);
  approachArmedRef.current = approach.armed;
  const approachDistanceRef = useRef(approach.distanceM);
  approachDistanceRef.current = approach.distanceM;
  if (arming && isQaDiagnosticsEnabled() && approachOriginRef.current != null) {
    const rel = (ms: number | null) => ms == null ? null : Math.max(0, (ms - approachOriginRef.current!) / 1000);
    approachQaRef.current = {
      startDistanceM: approachQaRef.current?.startDistanceM ?? approach.distanceM,
      firstStableFixTSec: rel(approach.firstStableFixAtMs), armedTSec: rel(approach.armedAtMs),
      startZoneEnteredTSec: rel(approach.startZoneEnteredAtMs),
      voiceTriggerTSec: rel(approach.startReachedAtMs), voiceQueuedTSec: null, voiceSpokenTSec: null,
      startReachedTSec: rel(approach.startReachedAtMs),
      departedStartTSec: rel(approach.departedStartAtMs), searchStartedTSec: null,
      reason: approach.reason,
    };
  }
  useEffect(() => {
    if (!arming || !voiceOn || approach.startReachedAtMs == null) return;
    requestVoice({ eventType: 'approach', text: t('track.voiceApproachReached'),
      language: speechLanguage(i18n.language as never), priority: 3,
      onceKey: 'approach-reached', phase: 'approach', distanceM: approachDistanceRef.current,
      valid: () => approachPhaseRef.current === 'at_start' && approachArmedRef.current,
    });
  }, [arming, voiceOn, approach.startReachedAtMs, t]);

  // Bisher im Approach: präzise Ortung nur während der Annäherung anfragen.
  // Die Berechtigung kommt vom Recorder; kein zweiter Location-Start/Stop.
  useEffect(() => {
    if (!arming || !s.ready) return;
    try { void precisionLocationClient.requestTemporaryFullAccuracy('TrackingDogSportPrecision').catch(() => {}); } catch { /* best-effort */ }
  }, [arming, s.ready]);

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
        useTrackingStore.getState().restoreSearchSession(decision.pending);   // laid + Metadaten + Run-State in den (evtl. leeren) Store
        setEffectiveId(decision.pending.sessionId ?? id ?? null);
        runIdRef.current = decision.pending.runId ?? null;
        setSnap(buildSnap(true));        // inkl. Search-Recovery-State (Dedupe-Seeds)
        setRecovery(decision.pending);   // → Dialog
      } else {
        // Root-Cause-Fix (Feldtest B): `buildSnap()` liest AUSSCHLIESSLICH den
        // Laufzeit-Store. Nach App-Neustart/-Kill in der Liegezeit (im Feld
        // ~1:49 h) ist der Store leer — ohne Recovery-Fall wurde die gelegte
        // Fährte hier bislang NIE nachgeladen: keine Geometrie auf der Karte,
        // kein Startpunkt („Der gespeicherte Fährtenansatz ist nicht
        // verfügbar"), keine Abweichung. Der Puffer (loadPending) enthält
        // trackPoints/markers/segments/startAnchor bereits vollständig — er
        // wird jetzt zurückgespielt, bevor der Snapshot gebaut wird.
        // restorePending setzt KEINE neue Session und startet nichts; es füllt
        // nur den leeren Store (dieselbe Funktion, die liegen.tsx nutzt).
        const st = useTrackingStore.getState();
        if (st.trackPoints.length === 0 && pending && pending.trackPoints.length > 0) {
          st.restorePending(pending);
        }
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
    approachPhaseRef.current = nextStartZonePhase(approachPhaseRef.current, false, false, true);
    if (approachQaRef.current && approachOriginRef.current != null)
      approachQaRef.current.searchStartedTSec = (Date.now() - approachOriginRef.current) / 1000;
    if (approachQaRef.current) approachQaRef.current.searchStartReason = mode;
    if (isQaDiagnosticsEnabled() && approachOriginRef.current != null) {
      const last = approachFixQaRef.current.samples.at(-1);
      const recorded = boundedPush(approachFixQaRef.current.samples, {
        tSec: (Date.now() - approachOriginRef.current) / 1000,
        distanceToStartM: approachDistanceRef.current ?? last?.distanceToStartM ?? 0,
        accuracyM: last?.accuracyM ?? null, stable: approachArmedRef.current,
        stableCount: last?.stableCount ?? 0, zone: last?.zone ?? 'outside',
        transition: 'search_started',
      }, 100);
      if (!recorded) approachFixQaRef.current.truncated = true;
    }
    startModeRef.current = mode;   // Runtime-Info (manual-at-start | manual-override)
    setArming(false);
    hapticSuccess();   // haptisches Feedback beim Erreichen des Ansatzes
    if (voiceOn) requestVoice({ eventType: 'search_start', text: t('track.voiceSearchStarted'),
      language: speechLanguage(i18n.language as never), priority: 2,
      onceKey: 'search-started', phase: 'search' });
    const startMs = Date.now();
    searchStartMsRef.current = startMs;
    // Stabile client-Run-UUID SOFORT (führende Run-ID, kein Warten auf Supabase).
    // Wird via setSearchRunId in den PendingTrack persistiert → überlebt App-Kill/Recovery.
    const runUuid = Crypto.randomUUID();
    runIdRef.current = runUuid;
    useTrackingStore.getState().setSearchRunId(runUuid);
    // Gewählten Abstand in den Store spiegeln → landet im PendingTrack-Snapshot (Recovery).
    useTrackingStore.getState().setSearchHandlerDistanceM(searchHandlerDistanceM);
    // Root-Cause-Fix (Golden-Reference-Audit, Punkt 2): ein ausdrücklicher
    // manueller Override ("Trotzdem starten") darf keinen stillen, ungültigen
    // Zustand erzeugen (LIVE + Timer läuft, aber SearchStartAcquisition nie
    // START_LOCKED) — er gibt die Aufnahme jetzt auch WIRKLICH frei
    // (forceLocked), statt zusätzlich noch die interne Akquisition zu
    // verlangen. 'manual-at-start' (Ansatz bereits per approach.armed
    // bestätigt) durchläuft weiterhin die normale Akquisition unverändert.
    s.start(undefined, { forceLocked: mode === 'manual-override' });
    // Status 'searching' + Suchzeit-Start + FRISCHER Run-State. runUuid wird hier
    // mitgegeben (vorher `null` → überschrieb die Zeile davor und der Puffer verlor
    // die runId; Resume erzeugte dadurch eine NEUE Run-ID statt derselben).
    useTrackingStore.getState().startSearchSession(runUuid, startMs);
    if (dogId) useActiveFaehrten.getState().upsert(dogId, { status: 'searching', searchStartedAt: startMs });
    // Kein direkter Remote-Start mehr (RUN-SAVE2): track_runs wird beim Stop über die
    // Sync-Queue idempotent per runUuid upserted. runUuid ist bereits lokal geführt.
  }, [s, voiceOn, dogId, effectiveId, searchHandlerDistanceM, t]);

  // Nach bestätigtem Ansatz und echter Abbewegung beginnt die Absuche ohne
  // weitere Zeit-Sperre. Der manuelle Override bleibt für GPS-Probleme erhalten.
  useEffect(() => {
    if (arming && approach.phase === 'departed_start' && approach.startReachedAtMs != null)
      beginSearchNow('automatic-departure');
  }, [arming, approach.phase, approach.startReachedAtMs, beginSearchNow]);

  // Manueller „Jetzt starten": EINE einzige Definition von "Ansatz erreicht" —
  // exakt dasselbe `approach.armed`, das auch das Banner oben zeigt (Root-
  // Cause-Fix, siehe startApproach.ts). Banner und Button können dadurch nie
  // mehr widersprüchlich sein. Der Override tut NICHT so, als sei der
  // GPS-Startpunkt bestätigt (startMode = 'manual-override').
  const handleManualStart = useCallback(() => {
    if (startedRef.current) return;
    hapticTap();
    if (approach.armed) { beginSearchNow('manual-at-start'); return; }
    const distTxt = approach.distanceM != null ? `ca. ${Math.round(approach.distanceM)} m` : 'unbekannt weit';
    Alert.alert(
      'Noch nicht am Startpunkt',
      `Du bist noch ${distTxt} vom Fährtenansatz entfernt. Trotzdem jetzt starten?`,
      [
        { text: 'Zurück', style: 'cancel' },
        { text: 'Trotzdem starten', style: 'destructive', onPress: () => beginSearchNow('manual-override') },
      ],
    );
  }, [approach.armed, approach.distanceM, beginSearchNow]);

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

  // GPS-Genauigkeit gedrosselt (4 s) in die Registry spiegeln, damit die Karten
  // „Suche läuft" mit GPS-Qualität zeigen. Nur vorhandene Daten.
  //
  // Root-Cause-Fix (Feldtest B — „Liegezeit zeigt plötzlich 0 m / 8 Winkel /
  // 7 Gegenstände"): hier wurde zusätzlich `distanceMeters: s.distanceM`
  // geschrieben — also die ABSUCHE-Distanz (startet bei 0) in ein Feld, das
  // laut activeFaehrtenModel.ts ausdrücklich die Kennzahl der GELEGTEN Fährte
  // ist und von liegen.tsx als Fallback-Zusammenfassung gelesen wird
  // (`regEntry.distanceMeters`). Sobald die Absuche betreten wurde, überschrieb
  // dieser Intervall die gelegten 252 m mit 0 — Winkel/Gegenstände blieben
  // unberührt, weil sie hier nicht mitgeschrieben werden. Exakt das beobachtete
  // Muster. Die Absuche-Distanz gehört nicht in dieses Feld und wird hier nicht
  // mehr geschrieben.
  useEffect(() => {
    if (!dogId || phase !== 'ready') return;
    const iv = setInterval(() => {
      useActiveFaehrten.getState().upsert(dogId, {
        gpsAccuracy: s.accuracy ?? null,
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
    // Search-Recovery-State DESSELBEN Runs (restoreSearchSession → Store, legacy-
    // sicher saniert): Fortschritt/Funde/Abrisse/Abweichung/Off-Track seeden.
    // Off-Track- und Segment-Dedupe werden VOR dem Start gesetzt, damit der erste
    // Snapshot keinen falschen Übergang (on_track→…) meldet und Segmente nicht
    // erneut angesagt werden.
    const runState = useTrackingStore.getState().searchRunState;
    prevOffTrackRef.current = runState.offTrackState;
    segmentAnnouncementRef.current = { ...runState.segmentAnnouncements };
    s.start({ points: saved.map(p => ({ latitude: p.lat, longitude: p.lng })), startedAtMs: pending.searchStartedAt ?? Date.now(), runState });
  };

  // Beenden: vorhandene Suchpunkte speichern + Session sauber abschliessen.
  const endSearch = async (pending: PendingTrack) => {
    const saved = await loadSavedSearchPoints(pending);
    await flushSearchPoints().catch(() => {});
    const sessId = pending.sessionId ?? effectiveId;
    const runId = pending.runId ?? runIdRef.current ?? Crypto.randomUUID();
    const durationS = pending.searchStartedAt ? Math.max(0, Math.floor((Date.now() - pending.searchStartedAt) / 1000)) : 0;
    // LOKAL zuerst (durabel): Run-Ergebnis der beendeten Absuche in payload_json.run.
    //
    // BEKANNTE EINSCHRÄNKUNG (Punkt 8 der Nachbesserung, geprüft, nicht
    // improvisiert): dieser Recovery-Kurzpfad läuft NICHT über den laufenden
    // useSearchRecorder — `saved` sind rohe, aus SQLite/dem Store
    // wiederhergestellte Punkte (lat/lng/accuracy/…), OHNE die pro-Fix
    // Cursor-Projektion/Abweichung/Fusion-Confidence, aus der
    // AnalyticsSample[] besteht. Score/deviationAvgM/foundObjects/breaks sind
    // in diesem Pfad bereits VOR dieser Nachbesserung hart auf 0/leer gesetzt
    // (dieselbe Einschränkung, nicht neu) — `analytics` würde dieselbe Lücke
    // erben und könnte nur durch ein vollständiges Offline-Replay der
    // Fährtenprojektion (projectForward/EMA/Fusion ausserhalb des Hooks neu
    // implementiert) korrekt gefüllt werden. Das wäre ein grosser, riskanter
    // Eingriff ausserhalb des Scopes dieser Nachbesserung ("maximal
    // konservativ") — daher bewusst NICHT improvisiert. `analytics` bleibt
    // hier absichtlich weg (siehe buildRunResultPayload — additiv/optional,
    // kein Dummy-Objekt). Test: run-recovery-analytics-gap.test.ts.
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
        // analytics bewusst NICHT gesetzt — siehe Kommentar oben.
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
    setPendingExit(sessId ? `/track/${sessId}` : '/track');
  };

  // Verwerfen: NUR den Suchlauf löschen (gelegte Fährte bleibt), mit Bestätigung.
  const discardSearch = (pending: PendingTrack) => {
    Alert.alert('Absuche verwerfen?', 'Nur der Suchlauf wird gelöscht — die gelegte Fährte bleibt erhalten.', [
      { text: 'Abbrechen', style: 'cancel', onPress: () => showRecoveryDialog(pending) },
      { text: 'Verwerfen', style: 'destructive', onPress: async () => {
        const sessId = pending.sessionId ?? effectiveId;
        if (sessId) await deleteSearchPointsBySession(sessId).catch(() => {});
        useTrackingStore.getState().resetSearchPoints();   // leert auch den Run-State
        useTrackingStore.getState().setSessionStatus('cancelled');
        clearRegistry();
        startedRef.current = false;   // erlaubt einen frischen Start (neue Absuche, neue runId)
        // Kein State des verworfenen Runs darf in den neuen Search überlaufen.
        segmentAnnouncementRef.current = {};
        prevOffTrackRef.current = 'on_track';
        setSnap(buildSnap(false));
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
  // Bogenlänge). Ereignis-Bogenlänge = KANONISCHE arcM aus dem Snapshot
  // (Projektion der Markerkoordinate auf laidPoints, canonicalArc.ts) — derselbe
  // Maßstab wie dogProgressM. NICHT mehr marker.distance_from_start (dort lag bei
  // Auto-Winkeln der Detektor-Maßstab). Ein Marker ohne bestimmbare Position
  // ('unavailable') kann nicht angesagt werden und bleibt aussen vor.
  const guidanceAngles = useMemo<GuidanceAngle[]>(
    () => snapData.laidMarkers
      .filter(m => m.type === 'winkel')
      .flatMap(m => { const arcM = snapData.eventArcs[m.id]?.arcM; return arcM == null ? [] : [{ id: m.id, arcM, angleKind: m.angleKind, lat: m.lat, lng: m.lng }]; }),
    [snapData.laidMarkers, snapData.eventArcs],
  );
  // Gegenstände (inkl. material für die Voice-Ansage „Dübel"/„Gegenstand").
  const guidanceObjects = useMemo<GuidanceObject[]>(
    () => snapData.laidMarkers
      .filter(m => m.type === 'gegenstand')
      .flatMap(m => { const arcM = snapData.eventArcs[m.id]?.arcM; return arcM == null ? [] : [{ id: m.id, arcM, material: m.material, lat: m.lat, lng: m.lng }]; }),
    [snapData.laidMarkers, snapData.eventArcs],
  );
  // ── Search-Guidance Activation Guard ─────────────────────────────────────
  // EIN zentraler Zustand für ACTIVE SEARCH GUIDANCE (Winkel/Gegenstand/Dübel/
  // GW-OW-BW-Abriss-Voice, deren Haptik, Segment-Ansagen, Off-Track-Feedback,
  // Ende). Zwei bestehende Recorder-Authorities, beide nötig:
  //   • `s.recording` — true erst ab s.start() (beginSearchNow/resumeSearch),
  //     false nach stop()/Discard.
  //   • `s.searchStartState === 'START_LOCKED'` — der Fährtenansatz ist
  //     tatsächlich erkannt (Search-Start-Acquisition). Während SEEKING_START/
  //     START_CANDIDATE läuft recording bereits, dogProgressM ist ≥ 0 → ohne
  //     diese Bedingung sprächen Events nahe dem Start schon in der
  //     Acquisition. Resume/Freilauf/Override/BUILD40 starten direkt LOCKED.
  // Vorher (Arming, Recovery-Dialog, leerer Snapshot, Acquisition) konnten
  // Events vorzeitig sprechen/vibrieren und dabei „verbraucht" werden.
  // `arming` ist keine Zusatzbedingung nötig (immer false, bevor recording
  // true wird). Bewusst NICHT gegated (Pre-Search-/Übergangs-Feedback):
  // „Suche läuft", Start-Haptik, „Fährtenansatz erkannt" (Lock-Übergang),
  // Toasts/Banner.
  const searchGuidanceActive = s.recording && s.searchStartState === 'START_LOCKED';

  // Search-Recovery-State: Seeds (bereits angesagt/ausgelöst in DIESEM Run) aus dem
  // Snapshot; jede neue Ansage/Auslösung wird sofort in den Run-State gespiegelt.
  // Voice und Haptik führen getrennte Mengen (unterschiedliche Triggerdistanzen).
  const voiceRecovery = useMemo(() => ({
    initialAnnouncedIds: snapData.recovery?.voiceFiredIds,
    onAnnounced: (id: string) => useTrackingStore.getState().noteSearchVoiceFired(id),
    enabled: searchGuidanceActive,
  }), [snapData.recovery, searchGuidanceActive]);
  const hapticRecovery = useMemo(() => ({
    initialFiredIds: snapData.recovery?.hapticFiredIds,
    onFired: (id: string) => useTrackingStore.getState().noteSearchHapticFired(id),
  }), [snapData.recovery]);
  useTrackVoiceGuidance(s.dogProgressM, guidanceAngles, voiceOn, stepLengthM, guidanceObjects, voiceRecovery,
    { handlerPosition: s.position, configuredDogLeadM: searchHandlerDistanceM, activeObjectWait: s.activeObjectWait });

  // Haptische Führung: 1× bei Gegenstand voraus, 2× bei Winkel voraus — dieselbe
  // Bogenlängendistanz (dogProgressM) wie die Sprachführung.
  useTrackHapticGuidance(s.dogProgressM, guidanceAngles, guidanceObjects, searchGuidanceActive, hapticRecovery);

  // Fährtenende-Erkennung + Voice („Ende der Fährte erreicht."), Once-only, auf Basis
  // akzeptierter Handler-Fixes und des gespeicherten Endpunkts (letzter Punkt
  // der gelegten Fährte). DogLead bleibt nur eine Projektion. Beendet die
  // Absuche NICHT — nur Anzeige/Voice/Haptik; der Nutzer beendet weiterhin selbst.
  const endPoint = snapData.laidPoints.length ? snapData.laidPoints[snapData.laidPoints.length - 1] : null;
  const finalObjectIndex = snapData.laidObjects.length - 1;
  const finalObject = finalObjectIndex >= 0 ? snapData.laidObjects[finalObjectIndex] : null;
  const finalObjectPendingNearEnd = !!(finalObject && endPoint && s.objectStatuses[finalObjectIndex] === 'pending'
    && haversineM(finalObject.at, endPoint) <= 3);
  const acceptedHandlerDistanceToEndM = s.endHandlerFix && endPoint ? haversineM(s.endHandlerFix.position, endPoint) : null;
  const lastSegmentReached = s.trackLengthM > 0 && s.progressM / s.trackLengthM >= 0.75
    && acceptedHandlerDistanceToEndM != null && acceptedHandlerDistanceToEndM <= 5;
  // QA (rein beobachtend): Zustand beim einmaligen Ende-Ereignis festhalten. Die
  // Ende-Logik selbst (useTrackEndGuidance/stepTrackEnd) bleibt unverändert; Haptik
  // und Voice feuern im selben Tick wie `onFired` (siehe useTrackEndGuidance).
  const sLatestRef = useRef(s);
  sLatestRef.current = s;
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const qaEndRef = useRef<{ tSec: number; progressM: number; searchDistanceM: number; voice: boolean } | null>(null);
  const noteEndFired = useCallback(() => {
    useTrackingStore.getState().noteSearchEndFired();
    sLatestRef.current.confirmEnd();
    if (isQaDiagnosticsEnabled() && !qaEndRef.current) {
      const st = sLatestRef.current;
      qaEndRef.current = {
        tSec: (Date.now() - (searchStartMsRef.current ?? Date.now())) / 1000,
        progressM: st.dogProgressM, searchDistanceM: st.distanceM, voice: voiceOnRef.current,
      };
      if (endConfirmationRef.current) endConfirmationRef.current.confirmationTSec = qaEndRef.current.tSec;
    }
  }, []);
  const openMandatoryObjects = Math.max(0, s.totalObjects - s.foundObjects);
  const noteFinalObjectGrace = useCallback((grace: { startedAtMs: number | null; endedAtMs: number | null; reason: string | null }) => {
    finalObjectGraceQaRef.current = grace;
    if (!endConfirmationRef.current || searchStartMsRef.current == null) return;
    endConfirmationRef.current.finalObjectGraceStartedTSec = grace.startedAtMs == null ? null
      : Math.max(0, (grace.startedAtMs - searchStartMsRef.current) / 1000);
    endConfirmationRef.current.finalObjectGraceEndedTSec = grace.endedAtMs == null ? null
      : Math.max(0, (grace.endedAtMs - searchStartMsRef.current) / 1000);
    endConfirmationRef.current.finalObjectGraceReason = grace.reason;
  }, []);
  const trackEndState = useTrackEndGuidance({
    recording: searchGuidanceActive,
    dogProgressM: s.dogProgressM,
    handlerProgressM: s.progressM,
    handlerPosition: s.position,
    endHandlerFix: s.endHandlerFix,
    lastSegmentReached,
    trackLengthM: s.trackLengthM,
    estimatedDogPosition: s.estimatedDogPosition,
    endPoint,
    openMandatoryObjects,
    activeObjectWait: s.activeObjectWait,
    finalObjectPendingNearEnd,
    onFinalObjectGraceChange: noteFinalObjectGrace,
    voiceOn,
    initialFired: snapData.recovery?.endFired ?? false,
    onFired: noteEndFired,
  });
  const trackEndReached = trackEndState === 'reached' || trackEndState === 'completed';
  const endQaHistoryRef = useRef(INITIAL_END_FIX_HISTORY);
  useEffect(() => {
    if (!isQaDiagnosticsEnabled() || !searchGuidanceActive || !endPoint) return;
    const handlerDistanceToEndM = acceptedHandlerDistanceToEndM;
    const dogDistanceToEndM = s.estimatedDogPosition ? haversineM(s.estimatedDogPosition, endPoint) : null;
    if (s.endHandlerFix && handlerDistanceToEndM != null)
      endQaHistoryRef.current = advanceEndFixHistory(endQaHistoryRef.current, {
        tMs: s.endHandlerFix.tMs, distanceToEndM: handlerDistanceToEndM,
        accuracyM: s.endHandlerFix.accuracyM, lastSegmentReached,
        handlerProgressRatio: s.trackLengthM > 0 ? s.progressM / s.trackLengthM : 0,
      });
    const history = endQaHistoryRef.current;
    const blockerReason = trackEndBlocker({ dogProgressM: s.dogProgressM, handlerProgressM: s.progressM,
      handlerDistanceToEndM, geomDistanceM: dogDistanceToEndM, trackLengthM: s.trackLengthM,
      openMandatoryObjects, activeObjectWait: s.activeObjectWait, searchActive: searchGuidanceActive,
      accuracyM: s.endHandlerFix?.accuracyM ?? null, lastSegmentReached,
      finalObjectGraceActive: finalObjectGraceQaRef.current.startedAtMs != null
        && finalObjectGraceQaRef.current.endedAtMs == null
        && finalObjectGraceQaRef.current.reason !== 'active_dwell',
      approachSeen: history.approachSeen, stableEndFixCount: history.insideCount,
      stableEndFixSpanMs: history.firstInsideMs == null || s.endHandlerFix == null ? 0
        : s.endHandlerFix.tMs - history.firstInsideMs });
    endConfirmationRef.current = {
      candidateStartedTSec: history.firstInsideMs == null || searchStartMsRef.current == null ? null
        : Math.max(0, (history.firstInsideMs - searchStartMsRef.current) / 1000),
      stableFixCount: history.insideCount, requiredStableFixCount: 2,
      handlerDistanceM: handlerDistanceToEndM,
      effectiveEndRadiusM: endRadiusM(s.endHandlerFix?.accuracyM ?? null),
      lastSegmentReached, activeObjectWait: s.activeObjectWait,
      approachHistorySampleCount: history.approachSampleCount,
      approachHistoryStartDistanceM: history.approachStartDistanceM,
      approachHistoryEndDistanceM: history.approachEndDistanceM,
      approachHistoryNetDeltaM: history.approachStartDistanceM == null || handlerDistanceToEndM == null
        ? null : Math.round((history.approachStartDistanceM - handlerDistanceToEndM) * 100) / 100,
      finalObjectGraceStartedTSec: finalObjectGraceQaRef.current.startedAtMs == null || searchStartMsRef.current == null ? null
        : Math.max(0, (finalObjectGraceQaRef.current.startedAtMs - searchStartMsRef.current) / 1000),
      finalObjectGraceEndedTSec: finalObjectGraceQaRef.current.endedAtMs == null || searchStartMsRef.current == null ? null
        : Math.max(0, (finalObjectGraceQaRef.current.endedAtMs - searchStartMsRef.current) / 1000),
      finalObjectGraceReason: finalObjectGraceQaRef.current.reason,
      confirmationTSec: endConfirmationRef.current?.confirmationTSec ?? qaEndRef.current?.tSec ?? null,
      rejectionReason: blockerReason,
    };
    const recorded = boundedPush(endQaRef.current, { tSec: (Date.now() - (searchStartMsRef.current ?? Date.now())) / 1000,
      handlerProgressM: s.progressM, dogProjectedProgressM: s.dogProgressM,
      configuredDogLeadM: searchHandlerDistanceM, handlerDistanceToEndM, dogDistanceToEndM,
      activeObjectWait: s.activeObjectWait, endEligible: blockerReason == null, blockerReason,
      eventFiredTSec: qaEndRef.current?.tSec ?? null }, TRACKING_UX_QA_LIMITS.end);
    if (!recorded) endQaTruncatedRef.current = true;
  }, [searchGuidanceActive, s.progressM, s.dogProgressM, s.endHandlerFix, s.estimatedDogPosition,
    s.trackLengthM, endPoint, openMandatoryObjects, s.activeObjectWait, searchHandlerDistanceM,
    acceptedHandlerDistanceToEndM, lastSegmentReached]);

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
    if (!voiceOn || !searchGuidanceActive || snapData.segments.length === 0) return;
    const result = searchSegmentAnnouncements({
      segments: snapData.segments,
      currentStep: metersToSteps(s.dogProgressM, stepLengthM),   // hundebezogen (5/10-m-Versatz entlang der Fährte)
      state: segmentAnnouncementRef.current,
    });
    segmentAnnouncementRef.current = result.state;
    if (result.messages.length) useTrackingStore.getState().setSearchSegmentAnnouncements(result.state);   // Recovery-State
    result.messages.forEach(message => {
      requestVoice({ eventType: 'segment', text: message, language: speechLanguage(i18n.language as never),
        priority: 2, onceKey: `segment:${message}`, phase: 'search' });
    });
  }, [searchGuidanceActive, s.dogProgressM, snapData.segments, voiceOn, stepLengthM]);

  // Off-Track-Feedback (Phase 2): Voice + Haptik NUR auf echten State-Übergängen.
  // Die State-Machine ist bereits debounced → offTrackState ändert sich nur bei einer
  // bestätigten Transition (kein eigener Debounce nötig). KEIN Progress-/Recorder-
  // Freeze, keine Auto-Pause — ausschliesslich Feedback.
  // Transientes Recovery-Banner „Wieder auf der Fährte" — kurz einblenden, nicht
  // dauerhaft stehen lassen (Warn-/Off-Track-Banner leiten sich dagegen aus dem State ab).
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Guard ZUERST: solange keine aktive Suche läuft, wird weder Feedback gegeben
    // noch prevOffTrackRef fortgeschrieben (ein Übergang wird nicht „verbraucht";
    // der Recovery-Seed aus resumeSearch bleibt bis zum ersten aktiven Tick stehen).
    if (!searchGuidanceActive) return;
    const fb = offTrackTransitionFeedback(prevOffTrackRef.current, s.offTrackState);
    prevOffTrackRef.current = s.offTrackState;
    if (!fb) return;
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
  }, [s.offTrackState, searchGuidanceActive, voiceOn, t]);
  // Timer beim Verlassen aufräumen (kein setState nach Unmount).
  useEffect(() => () => { if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current); }, []);

  // Permanentes Off-Track-Banner leitet sich vom aktuellen State ab (nur während der
  // aktiven Absuche; im Arming-Overlay unsichtbar).
  const offBanner = !arming && s.recording ? offTrackBanner(s.offTrackState) : null;
  // Search Start Acquisition (Track-Assoziation am Beginn der Absuche): kurzes,
  // unaufdringliches Banner zwischen "Jetzt starten" (Arming-Overlay schliesst)
  // und dem eindeutigen Start-Lock. SEEKING_START zeigt bewusst nichts (der
  // Ansatz-Hinweis kam bereits im Arming-Overlay) — nur START_CANDIDATE bekommt
  // einen Hinweistext, START_LOCKED eine kurze, transiente Bestätigung
  // (derselbe Debounce-/Timer-Aufbau wie das Off-Track-Recovery-Banner oben).
  // Kein Freeze, keine Blockade — die Absuche läuft im Hintergrund normal weiter.
  const [startLockedBannerVisible, setStartLockedBannerVisible] = useState(false);
  const startLockedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSearchStartRef = useRef(s.searchStartState);
  useEffect(() => {
    const prev = prevSearchStartRef.current;
    prevSearchStartRef.current = s.searchStartState;
    if (!s.recording || arming) return;
    if (prev !== 'START_LOCKED' && s.searchStartState === 'START_LOCKED') {
      hapticSuccess();
      setStartLockedBannerVisible(true);
      if (startLockedTimerRef.current) clearTimeout(startLockedTimerRef.current);
      startLockedTimerRef.current = setTimeout(() => { setStartLockedBannerVisible(false); startLockedTimerRef.current = null; }, 1800);
    }
  }, [s.searchStartState, s.recording, arming, voiceOn, t]);
  useEffect(() => () => { if (startLockedTimerRef.current) clearTimeout(startLockedTimerRef.current); }, []);
  const searchStartBanner = !arming && s.recording
    ? (s.searchStartState === 'START_CANDIDATE' ? t('track.searchStartCandidate')
      : startLockedBannerVisible ? t('track.searchStartLocked')
      : null)
    : null;

  const currentRunSegment = useMemo(() => {
    const step = metersToSteps(s.dogProgressM, stepLengthM);
    return snapData.segments.find(seg => seg.status === 'completed' && step >= seg.startStep && step < seg.endStep) ?? null;
  }, [s.dogProgressM, snapData.segments, stepLengthM]);

  const hasLaid = snapData.laidPoints.length > 1;
  const devShown = hasLaid && Number.isFinite(s.deviationM) ? s.deviationM : null;
  const devOff = devShown != null && devShown > 8;

  const handleCancel = () => {
    Alert.alert('Fährte läuft noch', 'Die Absuche bleibt aktiv. Zum Beenden bitte den Stop-Button antippen.', [{ text: 'Zur Aufnahme', style: 'cancel' }]);
  };

  const confirmRecoveryEnd = (pending: PendingTrack) => {
    Alert.alert('Absuche wirklich beenden?', 'Die gespeicherten Suchpunkte bleiben erhalten.', [
      { text: 'Weiter', style: 'cancel' },
      { text: 'Absuche beenden', style: 'destructive', onPress: () => void endSearch(pending) },
    ]);
  };

  const handleFinish = async () => {
    if (finishing || finishRequestedRef.current) return;   // Doppelt-Tippen → keine doppelte Finalisierung
    finishRequestedRef.current = true;
    hapticSuccess();
    setFinishing(true);
    const res = s.stop();   // ← Search-Recorder beenden (flusht letzten Puffer)
    // runUuid ist seit dem Start deterministisch vorhanden (kein Null-Race mehr);
    // defensiver Fallback, falls doch nicht gesetzt.
    const runId = runIdRef.current ?? Crypto.randomUUID();
    const sessId = effectiveId;

    // Punkt 10/13: Track Analytics Engine — REIN aus In-Session-Daten (keine
    // gespeicherten Rohpunkte, keine Migration). Ecken/Gegenstände kommen aus
    // denselben gefilterten Markern, aus denen auch snapData.laidObjects
    // gebaut wurde (buildSnap) — dieselbe Filterreihenfolge, daher deckt sich
    // der Index mit res.foundObjectIndices. atM = kanonische arcM (Snapshot).
    const cornerInputs: AnalyticsCornerInput[] = snapData.laidMarkers
      .filter((m): m is typeof m & { angleKind: AnalyticsAngleKind } =>
        m.type === 'winkel' && m.angleKind != null && m.angleKind !== 'absatz' && m.angleKind !== 'abriss')
      .flatMap(m => { const atM = snapData.eventArcs[m.id]?.arcM; return atM == null ? [] : [{ atM, angleKind: m.angleKind }]; });
    const objectMarkers = snapData.laidMarkers.filter(m => m.type === 'gegenstand' && m.lat != null && m.lng != null);
    const objectInputs: AnalyticsObjectInput[] = objectMarkers.map((m, i) => ({
      objectId: m.id,
      objectIndex: objectMarkers.slice(0, i + 1).filter(marker => marker.material !== 'duebel').length,
      atM: snapData.eventArcs[m.id]?.arcM ?? m.distance_from_start,
      material: m.material,
      found: res.foundObjectIndices.includes(i),
      positionAccuracyM: m.accuracy,
      legIndex: 1 + cornerInputs.filter(corner => corner.atM <= (snapData.eventArcs[m.id]?.arcM ?? m.distance_from_start)).length,
    }));
    // QA-Search-Diagnose (nur QA-Modus, rein beobachtend, best-effort): Ströme,
    // Cursor-Samples, Gegenstände, Ende, Replay-Parität → eigener QA-Speicher.
    // Verändert weder `res` noch Analytics/Score/Distanz.
    if (res.qa && sessId && snapData.laidPoints.length) {
      try {
        const stopSec = (Date.now() - (searchStartMsRef.current ?? res.qa.startedAtMs)) / 1000;
        // Support-Level (normale Kunden): Minimal-Capture — keine Voice-/Approach-/Ende-Sample-Diagnosen.
        const isSupportLevel = res.qa.captureLevel === 'support';
        const diag = buildSearchDiagnostics({
          ux: isSupportLevel ? undefined : (() => {
            const voice = voiceDiagnostics();
            const approachQa = approachQaRef.current ? { ...approachQaRef.current } : undefined;
            const approachVoice = voice.events.find(e => e.eventType === 'approach');
            if (approachQa && approachVoice) {
              approachQa.voiceTriggerTSec = approachVoice.triggerTSec;
              approachQa.voiceQueuedTSec = approachVoice.queuedTSec;
              approachQa.voiceSpokenTSec = approachVoice.spokenTSec;
            }
            return { voiceDiagnostics: voice, startApproachDiagnostics: approachQa,
              approachFixDiagnostics: { samples: approachFixQaRef.current.samples.slice(),
                truncated: approachFixQaRef.current.truncated },
              endEligibilityDiagnostics: { samples: endQaRef.current.slice(), truncated: endQaTruncatedRef.current },
              endConfirmationDiagnostics: endConfirmationRef.current ?? undefined };
          })(),
          origin: snapData.laidPoints[0],
          telemetry: res.qa,
          run: { points: res.points, pointsTimeSec: res.pointsTimeSec },
          replay: res.replayPoints && res.replayPointsTimeSec ? { points: res.replayPoints, timeSec: res.replayPointsTimeSec } : null,
          analyticsSampleCount: res.analyticsSamples.length,
          resumed: res.qa.resumed,
          laid: { total: s.trackLengthM, end: snapData.laidPoints[snapData.laidPoints.length - 1] },
          referenceCanonicalLengthM: snapData.referenceCanonicalLengthM,
          objects: objectInputs.map((o, i) => ({
            index: i, at: { latitude: objectMarkers[i].lat as number, longitude: objectMarkers[i].lng as number },
            atM: o.atM ?? null, found: o.found ?? null, status: res.objectStatuses[i], legIndex: o.legIndex ?? null,
          })),
          cornerAtM: cornerInputs.map(c => c.atM),
          end: { fired: qaEndRef.current, hapticFired: qaEndRef.current ? true : null, voiceFired: qaEndRef.current ? qaEndRef.current.voice : null },
          manualStopTSec: stopSec,
        });
        // Interner QA-Speicher nur im QA-Modus (unverändert); die privacy-reduced Support-Diagnose
        // wird für jede Absuche lokal abgelegt (eigener Namespace, gleiche Retention). Beides
        // best-effort und NICHT awaited: ein Diagnosefehler blockiert das Speichern der Fährte nie.
        if (!isSupportLevel) void saveQaSearchCapture(sessId, diag);
        void saveQaSearchCapture(sessId, toSupportCapture(diag), 'support');
      } catch (e) { console.warn('[trackRun] QA search capture', e); }
    }
    const analytics = res.analyticsSamples.length ? computeTrackAnalyticsV3({
      samples: res.analyticsSamples,
      corners: cornerInputs,
      objects: objectInputs,
      breaks: res.breaks.map(b => ({
        startedAtSec: b.startedAtSec,
        recoveredAtSec: b.recoveredAtSec ?? null,
        durationSec: b.durationSec ?? null,
      })),
      trackLengthM: s.trackLengthM,
      durationS: res.durationS,
      handlerDistanceHintM: searchHandlerDistanceM,
      // Referenz-Qualität der gelegten Fährte (Accuracy + scharfe Knicke ohne Winkel-Marker).
      referenceLine: snapData.laidPoints.map((p, i) => ({ latitude: p.latitude, longitude: p.longitude, accuracy: snapData.laidAccuracies[i] ?? null })),
    }) : undefined;

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
          autoDwellObjectIds: res.autoDwellObjectIds,
          analytics,
          pointsTimeSec: res.pointsTimeSec,
          replayPoints: res.replayPoints,
          replayPointsTimeSec: res.replayPointsTimeSec,
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
  };

  const guardedBack = useCallback(() => {
    if (pocketLock) return;
    handleCancel();
  }, [pocketLock]);

  usePreventRemove(!arming && s.recording, useCallback(() => {
    if (!pocketLock) handleCancel();
  }, [pocketLock]));

  useEffect(() => {
    if (!pendingExit || s.recording) return;
    setPendingExit(null);
    router.replace(pendingExit as never);
  }, [pendingExit, router, s.recording]);

  const unlockPocket = useCallback(() => {
    hapticTap();
    setPocketLock(false);
  }, []);

  // Root-Cause-Fix (echtes iPhone Build 43 — Abschnitt 7 des Audits): die
  // bisherige 5×5-Punktlösung neben dem "GPS"-Label war auf realem Gerät
  // praktisch unsichtbar (UX-Fehler, kein Diagnose-Ersatz). Jetzt ein
  // sichtbares Text-Label ("GPS · Gut" statt nur "GPS"), Accuracy UND
  // Qualitätsbewertung bewusst getrennt (Accuracy bleibt der reine Meterwert,
  // Qualität kommt separat aus dem bestehenden Confidence-System) — dieselben
  // i18n-Keys/Label wie bereits in SegmentDetailSheet.tsx/[id].tsx
  // (track.replay.legend.confidence*, alle 5 ANYVO-Sprachen bereits vorhanden,
  // keine neuen Keys nötig).
  const gpsQualityLabelKey: Record<'excellent' | 'good' | 'limited' | 'unreliable', string> = {
    excellent: 'track.replay.legend.confidenceExcellent',
    good:      'track.replay.legend.confidenceGood',
    limited:   'track.replay.legend.confidenceLimited',
    unreliable:'track.replay.legend.confidenceUnreliable',
  };
  const gpsQualityColor = s.gpsQuality
    ? (s.gpsQuality.band === 'excellent' || s.gpsQuality.band === 'good') ? FT.acc
      : s.gpsQuality.band === 'limited' ? FT.warn
      : FT.bad
    : null;
  const gpsLabel = s.gpsQuality ? `GPS · ${t(gpsQualityLabelKey[s.gpsQuality.band] as any)}` : 'GPS';

  // Golden-Reference-Audit Punkt 6: dieselbe konsistente Anzeige auch in der
  // ANSATZ-Phase (vorher nur ein roher ±X m-Text, kein Qualitäts-Band) —
  // reine Zusatz-Anzeige, KEIN neues Accuracy-Gate (approach.armed/
  // maxAccuracyM bleiben exakt wie zuvor die einzigen Bedingungen).
  // getGpsQuality()/die vier existierenden i18n-Keys sind dieselben wie in
  // legen.tsx (track.gpsVeryGood/gpsGood/gpsMedium/gpsPoor).
  const approachQualityBand = approach.accuracy != null ? getGpsQuality(approach.accuracy) : null;
  const approachQualityKey: Record<'sehr-gut' | 'gut' | 'mittel' | 'schwach', string> = {
    'sehr-gut': 'track.gpsVeryGood', 'gut': 'track.gpsGood', 'mittel': 'track.gpsMedium', 'schwach': 'track.gpsPoor',
  };
  const approachQualityColor = approachQualityBand === 'sehr-gut' || approachQualityBand === 'gut' ? FT.acc
    : approachQualityBand === 'mittel' ? FT.warn
    : approachQualityBand === 'schwach' ? FT.warn : FT.muted;
  const approachGpsLabel = approachQualityBand ? `GPS · ${t(approachQualityKey[approachQualityBand] as any)}` : 'GPS';

  const metrics: { value: string; label: string; warn?: boolean }[] = [
    { value: `${Math.round(s.distanceM)} m`, label: `≈ ${metersToSteps(s.distanceM, stepLengthM)} Schr.` },
    { value: `${s.foundObjects}/${s.totalObjects}`, label: 'Gegenst.' },
    { value: devShown != null ? `${devOff ? '+' : ''}${devShown.toFixed(1)} m` : '—', label: 'Abweich.', warn: devOff },
    { value: s.accuracy != null ? `±${Math.round(s.accuracy)} m` : '—', label: gpsLabel },
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
              smartFollow={!arming}
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

          {/* Search Start Acquisition: kurzes Banner zwischen "Jetzt starten" und dem
              eindeutigen Start-Lock (SEEKING_START zeigt hier bewusst nichts — der
              Ansatz-Hinweis kam bereits im Arming-Overlay). Kein Freeze, keine
              Blockade — die Absuche läuft im Hintergrund bereits normal weiter. */}
          {searchStartBanner && (
            <View className="absolute top-[84px] left-[14px] right-[14px]" pointerEvents="none">
              <View className="flex-row items-center gap-2 rounded-[16px] px-4 py-3 bg-ft-glass border border-ft-glass-line">
                <Ionicons name="locate-outline" size={16} color={FT.acc} />
                <Text className="flex-1 text-[13px] font-bold text-ft-text">{searchStartBanner}</Text>
              </View>
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
            {metrics.map((mm, i) => {
              // Live-GPS-Qualität (Punkt 15/Abschnitt 7): nur an der GPS-Kachel,
              // jetzt als sichtbares Text-Label statt eines kaum erkennbaren
              // 5×5-Punkts. Accuracy (mm.value, "±X m") bleibt getrennt vom
              // Qualitätswort (mm.label, "GPS · Gut") — keine Verwechslung.
              const isGpsTile = mm.label.startsWith('GPS');
              return (
                <View key={i} className={`flex-1 items-center ${i > 0 ? 'border-l border-ft-line' : ''}`}>
                  <Text className={`text-[15px] font-black ${mm.warn ? 'text-ft-warn' : 'text-ft-text'}`} style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>{mm.value}</Text>
                  <Text
                    className={`text-[8.5px] font-bold tracking-[1px] uppercase mt-px ${isGpsTile && gpsQualityColor ? '' : 'text-ft-muted'}`}
                    style={isGpsTile && gpsQualityColor ? { color: gpsQualityColor } : undefined}
                    numberOfLines={1}
                  >
                    {mm.label}
                  </Text>
                </View>
              );
            })}
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
                {/* Konsistentes GPS-Qualitäts-Band (Punkt 6 des Audits) — unabhängig
                    vom obigen Status-Text immer sichtbar, solange eine Genauigkeit
                    gemeldet ist. Reine Anzeige, kein zusätzliches Gate. */}
                {approach.accuracy != null && (
                  <Text className="text-[10.5px] font-bold mt-1.5" style={{ color: approachQualityColor }}>
                    {approachGpsLabel}
                  </Text>
                )}
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
          <HoldToStopButton
            onStop={handleFinish}
            disabled={finishing || arming}
            busy={finishing}
            label={t('track.evaluate')}
            containerClassName="h-[60px] rounded-[18px]"
            containerStyle={{ flex: 1.3 }}
          />
        </View>
      </SafeAreaView>

      <PocketLockOverlay
        visible={pocketLock && !arming && s.recording}
        duration={fmtClock(s.elapsedS)}
        distanceM={`${Math.round(s.distanceM)} m`}
        onUnlock={unlockPocket}
        onStop={handleFinish}
        label={t('track.evaluate')}
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
