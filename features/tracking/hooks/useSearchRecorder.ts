/**
 * useSearchRecorder.ts — ANYVO Ausarbeiten / Suche (Expo / React Native)
 *
 * Phase 2 nach dem Legen: der Hund arbeitet die gelegte Fährte aus. Liefert live
 * die Hundespur (geglättet), Abweichung zur Soll-Fährte, Abriss/Neuansatz
 * (breaks), Gegenstand-Verweisen und einen Live-Score nach IGP/IFH.
 *
 * Portiert aus design_handoff_faehrten/useSearchRecorder.ts; der Helfer distM
 * (Haversine auf {latitude,longitude}) ist hier lokal definiert.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  startPositionSource, sampleToLocationObject, type LocationSourceKind,
} from '@/features/tracking/utils/positionSource';
import { DEFAULT_HANDLER_DISTANCE_M, estimateDogProgressM, pointAtDistance, projectForward } from '@/features/tracking/utils/searchGeometry';
import {
  DEFAULT_SEARCH_START_CONFIG, INITIAL_SEARCH_START, evaluateStartCandidate, firstLegHeadingDeg as computeFirstLegHeadingDeg,
  stepSearchStart, type SearchStartAcqState, type SearchStartState,
} from '@/features/tracking/engine/searchStartAcquisition';
import { calculateHeading } from '@/features/tracking/utils/gpsFilter';
import { stepOffTrack, initialOffTrack, type OffTrackSnapshot, type OffTrackState } from '@/features/tracking/utils/offTrack';
import { useTrackingStore, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import { enqueueSearchPoint, flushSearchPoints, resetSearchBuffer } from '@/features/tracking/store/searchPersist';
import { evaluateSearchFix, type SearchFixDecision, type SearchFixPrev, type SearchFixRejectedRecord } from '@/features/tracking/utils/searchFix';
import { motionClient } from '@/features/tracking/native/motionClient';
import {
  evaluateFusion, DEFAULT_FUSION_CONFIG, confidenceBand,
  type MotionInput, type FusionHistory, type ConfidenceBand, type FusionMode,
} from '@/features/tracking/engine/trackFusionEngine';
import type { AnalyticsSample } from '@/features/tracking/engine/trackAnalytics';
import { getTrackingEngineMode } from '@/features/tracking/utils/trackingEngineMode';
import { formatSearchFixDiag, type SearchFixDiag, type SearchFixStatus } from '@/features/tracking/utils/searchFixDiag';

// Core-Motion-Sensor-Fusion (rein additiv, Punkt 2/3): NUR ein Zusatzsignal
// zur Confidence-Bewertung und zum Live-GPS-Qualitätsindikator (Punkt 15).
// Beeinflusst NIEMALS Annahme/Ablehnung eines Fixes (evaluateSearchFix bleibt
// unverändert die einzige Gate-Logik), die geglättete Position (sm), die
// Cursor-/Projektionslogik oder Search-Start-Acquisition — das würde gegen
// "Core Motion ersetzt GPS nicht" verstossen. Läuft auf Android/ohne Motion-
// Permission automatisch mit fusionMode='gps_only' weiter (motionLatestRef
// bleibt dann schlicht `null`).
export interface GpsQuality { confidence: number; band: ConfidenceBand; fusionMode: FusionMode }

export interface GpsDebug {
  source: LocationSourceKind | null;
  provider: string | null;
  isNativeAvailable: boolean;
  rawGnssSupported: boolean;
  rejectedCount: number;
}

export type LatLng = { latitude: number; longitude: number };
export type SearchObject = { at: LatLng; index: number; material: string };
export type Break = {
  at: LatLng;
  t: number;               // Sekunden seit Start, wann der Abriss BESTÄTIGT wurde (Konvention unverändert, z. B. Map-Marker-Zeitpunkt)
  recoveredAfterM?: number;
  // Punkt 1 (Re-Acquisition-Zeit): zusätzlich zur bestehenden Distanz-Metrik
  // (recoveredAfterM) jetzt auch echte Zeitstempel. startedAtSec ist bewusst
  // NICHT identisch mit `t` — es ist der Moment, in dem der Hund/die virtuelle
  // Position den äusseren Korridor (BREAK_THRESHOLD_M) tatsächlich verlassen
  // hat, `t` dagegen erst der spätere, um BREAK_HOLD_MS verzögerte
  // Bestätigungs-Zeitpunkt. Für die Re-Acquisition-DAUER zählt der echte
  // Verlassenszeitpunkt, nicht die Bestätigungsverzögerung.
  startedAtSec: number;
  // undefined/null = noch offen (Session endete im Abriss) — geht NICHT in
  // meanSec/maxSec ein (siehe trackAnalytics.computeReacquisitionStats).
  recoveredAtSec?: number;
  durationSec?: number;
};

const toRad = (d: number) => (d * Math.PI) / 180;
function distM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude), la2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// DEV-Diagnose: klar begrenzt, im Release ein No-op (keine störenden Logs).
function logSearchFix(d: SearchFixDecision): void {
  if (!__DEV__) return;
  console.log('[searchRecorder]', d.accepted ? 'ACCEPT' : 'REJECT',
    { reason: d.reason, accuracy: d.accuracy, speed: d.speed, jumpM: d.jumpM == null ? null : Math.round(d.jumpM * 10) / 10 });
}

// ── Parameter ──
// Die Fix-Annahme (Genauigkeit ≤ 45 m, Speed ≤ 12 m/s, kein absoluter Jump-Filter)
// liegt in utils/searchFix.ts (evaluateSearchFix, SEARCH_MAX_ACCURACY_M/…_SPEED_MPS)
// — an den bewährten Lege-Recorder angeglichen (vorher 20 m / 5 m/s → zu streng, hat
// unter realem GPS fast alle Suchfixes verworfen). useTrackRecorder bleibt unberührt.
const MIN_SEGMENT = 1.5;         // m — Distanz-Gate (Liniendichte, unverändert)
const SMOOTH_ALPHA = 0.4;        // EMA
const ON_TRACK_M = 3.0;          // m — innerhalb = "auf der Fährte"
const BREAK_THRESHOLD_M = 6.0;   // m — darüber für BREAK_HOLD = Abriss
const BREAK_HOLD_MS = 4000;      // ms — so lange muss die Abweichung halten
const RECOVER_M = 3.0;           // m — wieder unter diesem Wert = Neuansatz/erholt
const OBJECT_HIT_M = 2.5;        // m — so nah an einem Gegenstand = verwiesen/gefunden
const DEV_EMA = 0.25;            // Glättung der angezeigten Abweichung

// ── Reihenfolge-bewusste Projektion (Fortschritt entlang der Soll-Fährte) ──
const LOOKAHEAD_M = 20;          // m — so weit voraus wird auf die Soll-Fährte projiziert
const BACK_M = 4;                // m — kleine Toleranz nach hinten (Jitter)
const ADVANCE_DEV_M = 12;        // m — nur bei Abweichung darunter rückt der Fortschritt vor
// Strenge Abweichungs-Skala für die Wertung: volle Punkte bis FULL_DEV_M, 0 ab ZERO_DEV_M.
const FULL_DEV_M = 1.5;
const ZERO_DEV_M = 10;

// ── Soll-Werte je Stufe (für Score-Gewichtung) ──
type Level = 'igp1' | 'igp2' | 'igp3' | 'ifh1' | 'ifh2' | 'igpfh' | 'training';
const SCORE_MODEL: Record<Level, { trackPts: number; objectPts: number; objects: number }> = {
  igp1:    { trackPts: 79, objectPts: 21, objects: 3 },
  igp2:    { trackPts: 79, objectPts: 21, objects: 3 },
  igp3:    { trackPts: 79, objectPts: 21, objects: 3 },
  ifh1:    { trackPts: 79, objectPts: 21, objects: 4 },
  ifh2:    { trackPts: 79, objectPts: 21, objects: 7 },
  igpfh:   { trackPts: 79, objectPts: 21, objects: 7 },
  training:{ trackPts: 79, objectPts: 21, objects: 3 },
};

// ── Bogenlängen (kumuliert) entlang der Soll-Fährte ──
function buildArc(line: LatLng[]): { cum: number[]; total: number } {
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distM(line[i - 1], line[i]));
  return { cum, total: cum.length ? cum[cum.length - 1] : 0 };
}

export interface SearchRecorder {
  ready: boolean;
  recording: boolean;
  paused: boolean;
  points: LatLng[];
  position: LatLng | null;
  deviationM: number;
  onTrack: boolean;
  breaks: Break[];
  foundObjects: number;
  totalObjects: number;
  distanceM: number;
  offTrackState: OffTrackState;   // Phase-1 Off-Track-Status (on_track|warning|off_track) für UI/Recorder
  progressM: number;              // Handler-Fortschritt (Bogenlänge) — unverändert
  dogProgressM: number;           // virtueller Hundefortschritt = progressM + Abstand (geklemmt)
  trackLengthM: number;           // Gesamtlänge der gelegten Fährte (arc.total)
  estimatedDogPosition: LatLng | null;   // Runtime-Ableitung (KEIN GPS-Rohpunkt)
  elapsedS: number;
  score: number;
  accuracy: number | null;
  gpsDebug: GpsDebug;
  // Core-Motion-Sensor-Fusion (Punkt 15): `null`, solange noch kein Fix
  // fusionsbewertet wurde (z. B. ganz zu Beginn) — UI zeigt dann einfach
  // nichts an, kein Blocker.
  gpsQuality: GpsQuality | null;
  // Search Start Acquisition (Track-Assoziation am Beginn der Absuche): solange
  // nicht START_LOCKED, ist dogProgressM/estimatedDogPosition NICHT um den
  // Hundabstand vorgeschoben (siehe engine/searchStartAcquisition.ts). Der
  // UI-Text wird bewusst NICHT hier zurückgegeben (kein i18n-Zugriff in
  // diesem reinen Hook) — run.tsx mappt den State selbst über t().
  searchStartState: SearchStartState;
  // Ohne Argument: frische Absuche (Reset). Mit `resume`: unterbrochene Absuche
  // fortsetzen (P2) — Punkte/Distanz/Timer werden fortgeführt, keine neue Session.
  start: (resume?: { points: LatLng[]; startedAtMs: number }, opts?: { forceLocked?: boolean }) => void;
  stop: () => SearchResult;
  setPaused: (p: boolean) => void;
  markObject: () => void;
}
export type SearchResult = {
  points: LatLng[]; breaks: Break[]; foundObjects: number; totalObjects: number;
  deviationAvgM: number; distanceM: number; durationS: number; score: number;
  // Punkt 10/13: Rohmaterial für die Track Analytics Engine — ein Sample pro
  // akzeptiertem Fix NACH Start-Lock (siehe onFix). Additiv, bestehende
  // Konsumenten von SearchResult, die dieses Feld ignorieren, sind unberührt.
  analyticsSamples: AnalyticsSample[];
  // Indizes (in laidObjects) der TATSÄCHLICH als gefunden erkannten Gegenstände
  // (dieselbe autoritative Quelle wie foundObjects/foundRef) — additiv, damit
  // die Analytics-Engine "found" konsistent mit dem echten Score ableiten kann,
  // statt es aus Distanzwerten zu schätzen.
  foundObjectIndices: number[];
  // Punkt 17 (Track-Replay): Sekunden-seit-Start je Eintrag in `points`,
  // gleiche Länge/Reihenfolge wie `points` — additiv, KEINE zweite Geometrie.
  // Kürzer als `points` (Resume, ältere Sessions vor dieser Erweiterung) =
  // Replay für diese Session nicht verfügbar (siehe app/track/run.tsx).
  pointsTimeSec: number[];
};

export type { Level };

export function useSearchRecorder(opts: {
  laidPoints: LatLng[]; laidObjects: SearchObject[]; level: Level; sessionId?: string | null; handlerDistanceM?: number;
  /** QA-Diagnose: pro eingehendem Fix genau ein Endstatus (siehe searchFixDiag.ts). Rein beobachtend. */
  onFixDiag?: (d: SearchFixDiag) => void;
}): SearchRecorder {
  const { laidPoints, laidObjects, level } = opts;
  const onFixDiagRef = useRef(opts.onFixDiag);
  onFixDiagRef.current = opts.onFixDiag;
  const handlerDistanceM = opts.handlerDistanceM ?? DEFAULT_HANDLER_DISTANCE_M;
  const model = SCORE_MODEL[level] ?? SCORE_MODEL.training;
  const totalObjects = laidObjects.length || model.objects;

  // Ziel-Session der lokalen Absuche-Persistenz (immer aktueller via Ref).
  const sessionIdRef = useRef<string | null>(opts.sessionId ?? null);
  sessionIdRef.current = opts.sessionId ?? null;

  // Bogenlängen der Soll-Fährte (stabil, da laidPoints aus dem Snapshot stammt).
  const arc = useMemo(() => buildArc(laidPoints), [laidPoints]);
  const hasTrack = arc.total > 1;

  // ── State (UI) ──
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPausedState] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [snap, setSnap] = useState({ points: [] as LatLng[], breaks: [] as Break[], found: 0, deviationM: 0, onTrack: true, distanceM: 0, progressM: 0, score: 0, offTrackState: 'on_track' as OffTrackState });
  const [elapsedS, setElapsedS] = useState(0);
  const [gpsDebug, setGpsDebug] = useState<GpsDebug>({ source: null, provider: null, isNativeAvailable: false, rawGnssSupported: false, rejectedCount: 0 });
  // Aktuelle Quelle zusätzlich als Ref: `onFix` liest gpsDebug bewusst NICHT
  // über die Deps (siehe Kommentar am Ende von onFix) — für die QA-Diagnose
  // wird deshalb dieser Ref gelesen, damit dort die WIRKLICH aktive Quelle
  // steht und nicht der Wert vom Zeitpunkt der Callback-Erzeugung.
  const gpsSourceRef = useRef<LocationSourceKind | null>(null);
  const [gpsQuality, setGpsQuality] = useState<GpsQuality | null>(null);

  // ── Refs (live im Callback) ──
  const recordingRef = useRef(false);
  const pausedRef = useRef(false);
  const pointsRef = useRef<LatLng[]>([]);
  // Punkt 17 (Track-Replay-Auftrag): EINE Sekunden-seit-Start-Zeit pro
  // pointsRef-Eintrag, im selben Moment (`pts.push(sm)`) fortgeschrieben —
  // keine zweite, parallele Geometrie-Quelle, nur ein additiver Zeitstempel
  // auf der bereits bestehenden, MIN_SEGMENT-gegateten Ist-Suchspur. Von der
  // Fusion-Schutzschicht neutralisierte Fixes (gps_outlier/stationary)
  // erreichen `pts.push` gar nicht erst (frühes return oben) — Ausreisser
  // stehen dadurch bereits hier nie in der Replay-Geometrie, kein Sondercode
  // nötig. Bei Resume bleibt dieses Array (bewusst) leer für die
  // vor-Resume-Punkte → Länge weicht dann von pointsRef ab, wodurch
  // buildRunResultPayload Replay korrekt als nicht verfügbar erkennt
  // (keine erfundenen Zeitstempel für Alt-Punkte ohne echte Zeit).
  const pointsTimeRef = useRef<number[]>([]);
  const breaksRef = useRef<Break[]>([]);
  const smoothRef = useRef<LatLng | null>(null);
  const prevFixRef = useRef<SearchFixPrev | null>(null);   // letzter AKZEPTIERTER Rohfix (für das Speed-Gate)
  // Anker-Recovery (Root-Cause-Fix, siehe searchFix.ts ANCHOR_RESET_*): die
  // zuletzt wegen 'speed' verworfenen Rohfixe (nur Position/Zeit, kein
  // zweiter Geometrie-Zustand) — leert sich bei jedem Accept oder bei einem
  // Accuracy-Reject (der sagt nichts über einen falschen Anker aus).
  const recentRejectedRef = useRef<SearchFixRejectedRecord[]>([]);
  const lastFixTRef = useRef(0);      // Zeitstempel des letzten akzeptierten Fix (Ausreisser-Filter)
  const rejectedRef = useRef(0);      // verworfene Fixes (Ausreisser/Genauigkeit) — Debug
  const distRef = useRef(0);
  const devEmaRef = useRef(0);
  const devSumRef = useRef(0);
  const devCountRef = useRef(0);
  const offTrackSinceRef = useRef<number | null>(null);
  const inBreakRef = useRef(false);
  // Phase-1 Off-Track-State-Machine (features/tracking/utils/offTrack). NUR Status
  // halten/exponieren — KEIN Voice/Haptik/Banner/Recorder-Freeze/Auto-Pause hier.
  const offTrackRef = useRef<OffTrackSnapshot>(initialOffTrack());
  const foundRef = useRef<Set<number>>(new Set());
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const startMsRef = useRef(0);
  const cursorMRef = useRef(0);      // aktueller Fortschritt entlang der Soll-Fährte (m)
  const maxCursorMRef = useRef(0);   // weitester erreichter Fortschritt (für Coverage)

  // ── Core-Motion-Sensor-Fusion (rein additiv, siehe GpsQuality-Kommentar oben) ──
  const motionLatestRef = useRef<MotionInput | null>(null);
  // Rein diagnostisch (Punkt 9 des Audits) — bewusst NICHT Teil von MotionInput/
  // evaluateFusion (keine Funktions-/Signaturänderung an der reinen Fusion-
  // Engine), nur für das sparsame [fusion]-DEV-Log unten.
  const motionActivityAgeMsRef = useRef<number | null>(null);
  const motionUnsubRef = useRef<{ remove: () => void } | null>(null);
  const fusionHistoryRef = useRef<FusionHistory>({ prevAccepted: null, prevSpeedMps: null, prevCourseDeg: null });
  const analyticsSamplesRef = useRef<AnalyticsSample[]>([]);

  // ── Search Start Acquisition (Track-Assoziation am Beginn der Absuche) ──
  // Solange nicht START_LOCKED: Track-Projektion bleibt auf das enge Startfenster
  // beschränkt, der gewählte Hundabstand wird NICHT auf den Fortschritt addiert.
  // Reiner Reducer, siehe engine/searchStartAcquisition.ts.
  const [searchStartState, setSearchStartState] = useState<SearchStartState>('SEEKING_START');
  const searchStartRef = useRef<SearchStartAcqState>(INITIAL_SEARCH_START);
  // Richtung des ersten Schenkels — Vergleichsbasis für die (rein zusätzliche)
  // Kurs-Evidenz. Stabil pro laidPoints/arc, kein Recompute je Fix.
  const firstLegHeading = useMemo(() => computeFirstLegHeadingDeg(laidPoints, arc.cum), [laidPoints, arc.cum]);

  const computeScore = useCallback(() => {
    // Ohne Soll-Fährte (Freilauf-Training) gibt es nichts zu bewerten → neutral.
    const avgDev = devCountRef.current ? devSumRef.current / devCountRef.current : Infinity;
    // Strenge Abweichungs-Skala: volle Punkte bis FULL_DEV_M, linear auf 0 bis ZERO_DEV_M.
    const onTrackRatio = !hasTrack
      ? 1
      : (devCountRef.current ? Math.max(0, Math.min(1, (ZERO_DEV_M - avgDev) / (ZERO_DEV_M - FULL_DEV_M))) : 0);
    // Coverage: wie viel der Fährte in richtiger Reihenfolge abgelaufen wurde.
    const coverage = !hasTrack ? 1 : Math.max(0, Math.min(1, maxCursorMRef.current / arc.total));
    const breakPenalty = breaksRef.current.length * 4;
    const trackScore = Math.max(0, model.trackPts * onTrackRatio * coverage - breakPenalty);
    const objScore = totalObjects ? (foundRef.current.size / totalObjects) * model.objectPts : model.objectPts;
    return Math.round(Math.max(0, Math.min(100, trackScore + objScore)));
  }, [model, totalObjects, hasTrack, arc.total]);

  const pushSnapshot = useCallback(() => {
    setSnap({
      points: pointsRef.current.slice(),
      breaks: breaksRef.current.slice(),
      found: foundRef.current.size,
      deviationM: Math.round(devEmaRef.current * 10) / 10,
      onTrack: devEmaRef.current <= ON_TRACK_M,
      distanceM: distRef.current,
      progressM: maxCursorMRef.current,
      score: computeScore(),
      offTrackState: offTrackRef.current.state,
    });
  }, [computeScore]);

  // ── Kernlogik ──
  const onFix = useCallback((loc: Location.LocationObject) => {
    const accRaw = loc.coords.accuracy ?? null;
    setAccuracy(accRaw != null ? Math.round(accRaw) : null);

    const raw: LatLng = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    const tNow = loc.timestamp || Date.now();
    const speed = loc.coords.speed ?? null;
    const prev = smoothRef.current;

    // Fix-Annahme wie beim Legen (Genauigkeit ≤ 45 m, Speed ≤ 12 m/s), gegen den
    // letzten AKZEPTIERTEN Rohfix. KEIN absoluter Jump-Filter mehr. Anker-
    // Recovery (recentRejectedRef) erlaubt einen Reset, wenn der Anker selbst
    // der Fehler war (siehe searchFix.ts ANCHOR_RESET_*).
    const decision = evaluateSearchFix(
      prevFixRef.current,
      { lat: raw.latitude, lng: raw.longitude, t: tNow, accuracy: accRaw, speed },
      undefined,
      recentRejectedRef.current,
    );

    // Puck-Glättung IMMER (auch bei verworfenem Linienpunkt) → die Position folgt
    // weiter, statt einzufrieren. `let`, weil ein eindeutiger Fusion-Outlier/
    // Stillstands-Jitter (siehe unten) dies nach der Fusion-Bewertung wieder
    // auf den Stand VOR dieser Glättung zurücksetzt.
    let sm: LatLng = prev
      ? { latitude: prev.latitude + SMOOTH_ALPHA * (raw.latitude - prev.latitude),
          longitude: prev.longitude + SMOOTH_ALPHA * (raw.longitude - prev.longitude) }
      : raw;
    smoothRef.current = sm;
    setPosition(sm);

    if (!recordingRef.current || pausedRef.current) return;

    // QA-Diagnose (rein beobachtend, siehe searchFixDiag.ts): Ausgangswerte
    // festhalten, damit jeder Ausgang unten GENAU EINEN Endstatus meldet.
    const pointsBefore = pointsRef.current.length;
    const distanceBefore = distRef.current;
    const dtMs = prevFixRef.current ? tNow - prevFixRef.current.t : null;
    const emitDiag = (status: SearchFixStatus, fusionClass: string | null) => {
      const cb = onFixDiagRef.current;
      if (!cb && !__DEV__) return;
      const d: SearchFixDiag = {
        status,
        source: gpsSourceRef.current,
        accuracy: accRaw,
        dtMs,
        jumpM: decision.jumpM,
        speedMps: decision.jumpM != null && dtMs != null && dtMs > 0 ? decision.jumpM / (dtMs / 1000) : null,
        movementState: motionLatestRef.current?.movementState ?? null,
        fusion: fusionClass,
        pointsBefore,
        pointsAfter: pointsRef.current.length,
        distanceBefore,
        distanceAfter: distRef.current,
      };
      cb?.(d);
      if (__DEV__ && !cb) console.log(formatSearchFixDiag(d));
    };

    if (!decision.accepted) {
      rejectedRef.current++;
      emitDiag(decision.reason === 'accuracy' ? 'REJECT_ACCURACY' : 'REJECT_SPEED', null);
      // Nur 'speed'-Rejects zählen als Evidenz für einen falschen Anker — ein
      // Accuracy-Reject sagt nichts darüber aus und würde eine echte
      // Ausreisser-Serie fälschlich als "konsistent" erscheinen lassen.
      recentRejectedRef.current = decision.reason === 'speed'
        ? [...recentRejectedRef.current.slice(-4), { lat: raw.latitude, lng: raw.longitude, t: tNow }]
        : [];
      logSearchFix(decision);
      return;
    }
    recentRejectedRef.current = [];

    // Anker-Recovery griff (siehe searchFix.ts): der bisherige Anker war
    // vermutlich selbst falsch (z. B. ein geografisch veralteter erster Fix) —
    // die bislang darauf aufgebaute Linie/Distanz wird verworfen, dieser Fix
    // wird wie ein neuer "erster" Punkt behandelt (kein Phantom-Sprung in der
    // aufgezeichneten Distanz). Suchstart-Acquisition (unten) bleibt unberührt
    // (arbeitet ohnehin gegen die Soll-Fährte, nicht gegen pointsRef).
    if (decision.reason === 'anchor_reset') {
      if (__DEV__) console.log('[searchFix] anchor_reset', { jumpM: decision.jumpM != null ? Math.round(decision.jumpM) : null });
      pointsRef.current = [];
      pointsTimeRef.current = [];
      distRef.current = 0;
    }

    // Akzeptiert → als Referenz für das nächste Speed-Gate merken (wie Legen: auch
    // bei anschliessendem Distanz-Gate).
    prevFixRef.current = { lat: raw.latitude, lng: raw.longitude, t: tNow };
    lastFixTRef.current = tNow;

    // ── Core-Motion-Sensor-Fusion (rein additiv, siehe GpsQuality-Kommentar
    // oben im Modul): bewertet NUR die Confidence dieses bereits akzeptierten
    // Fixes. Beeinflusst weder decision.accepted (oben, bereits entschieden)
    // noch sm/dev/Cursor — ausschliesslich gpsQuality (Live-Anzeige, Punkt 15)
    // und das Analytics-Sample (Punkt 10/13).
    const gpsHeading = loc.coords.heading ?? null;
    const fusion = evaluateFusion(
      { latitude: raw.latitude, longitude: raw.longitude, timestamp: tNow, horizontalAccuracy: accRaw, speed, course: gpsHeading },
      motionLatestRef.current,
      fusionHistoryRef.current,
      DEFAULT_FUSION_CONFIG,
    );
    fusionHistoryRef.current = { prevAccepted: fusion.acceptedLocation, prevSpeedMps: speed, prevCourseDeg: gpsHeading };
    setGpsQuality({ confidence: fusion.confidence, band: confidenceBand(fusion.confidence), fusionMode: fusion.fusionMode });

    // ── Sensor-Fusion-Schutzschicht (Punkt 2 der Nachbesserung): ein
    // eindeutiger GPS-Outlier ODER ein per Motion bestätigtes Stillstands-
    // Jitter darf weder den Puck noch die Fährtenlinie fortschreiben. Puck +
    // Glättungsanker (smoothRef) werden auf den Stand VOR dieser Glättung
    // zurückgesetzt — der letzte akzeptierte gute Punkt bleibt massgebend
    // (fusionHistoryRef zeigt bereits korrekt auf ihn, nicht auf diesen
    // Rohfix, siehe oben — der nächste plausible Fix wird dadurch sofort
    // wieder normal übernommen, keine Lag-Kaskade, kein dauerhaftes
    // Einfrieren). `evaluateSearchFix` (oben) bleibt die einzige, unveränderte
    // erste Sicherheitsstufe — dies ist eine rein zusätzliche, zweite Stufe
    // NUR für bereits gate-akzeptierte Fixes.
    //
    // Search-Start-Acquisition (unten) ist bewusst NICHT ausgeklammert: sie
    // sieht ggf. denselben zurückgesetzten `sm`-Wert erneut (idempotent) —
    // ein per Motion bestätigter Stillstand am echten Ansatz muss weiterhin
    // Support aufbauen und locken können (c7eba84-Regression bleibt behoben).
    // ENGINE=BUILD40 (Golden-Reference-Audit, Punkt 5): Core Motion darf in
    // diesem Modus weiterhin Daten/Confidence liefern (evaluateFusion/
    // setGpsQuality laufen unverändert oben) — es darf nur NICHTS blockieren:
    // keine Position, keine Distanz, keine Linie, keine GPS-Fixes verwerfen.
    // Der historische Stand (82bd17c) kannte trackFusionEngine.ts gar nicht.
    const fusionBlocksGeometry = getTrackingEngineMode() !== 'build40'
      && (fusion.classification === 'gps_outlier' || fusion.classification === 'stationary');
    if (fusionBlocksGeometry && prev) {
      sm = prev;
      smoothRef.current = sm;
      setPosition(sm);
    }

    // ── Search Start Acquisition — MUSS auf JEDEM akzeptierten Fix laufen,
    // NICHT erst nach dem Liniendichte-Gate (MIN_SEGMENT) weiter unten. Sonst
    // kann ein stillstehender oder sehr langsam gehender Handler (< 1.5 m
    // Bewegung zwischen zwei akzeptierten Fixes — der Normalfall direkt am
    // Fährtenansatz) den Support-Zähler nie über 1 hinaus bringen, weil danach
    // jeder weitere Fix vor Erreichen dieses Codes early-returned: bestätigter
    // Production-Regressionsbug (527217d) — ein Handler, der exakt am echten
    // Start steht, wurde nie gelockt. Der Liniendichte-Gate bleibt unverändert
    // (steuert weiterhin nur, wann ein neuer Linienpunkt gespeichert wird).
    const wasLocked = !hasTrack || searchStartRef.current.state === 'START_LOCKED';
    let startEvalu: ReturnType<typeof evaluateStartCandidate> | null = null;
    if (hasTrack && !wasLocked) {
      startEvalu = evaluateStartCandidate(sm, laidPoints, arc.cum, DEFAULT_SEARCH_START_CONFIG);
      // Bewegungsrichtung seit dem letzten gespeicherten Streckenpunkt — nur
      // zusätzliche Evidenz (Punkt 5/16), niemals eine harte Bedingung. Unter
      // einem Meter Bewegung wird kein Kurs berechnet (sonst Richtungsrauschen
      // bei einem praktisch stillstehenden Handler statt "kein Kurs bekannt").
      const lastStored = pointsRef.current[pointsRef.current.length - 1] ?? null;
      const heading = lastStored && distM(lastStored, sm) >= 1
        ? calculateHeading(
            { lat: lastStored.latitude, lng: lastStored.longitude },
            { lat: sm.latitude, lng: sm.longitude },
          )
        : null;
      const prevState = searchStartRef.current.state;
      // Core-Motion (Punkt 7): rein optionale Zusatzevidenz, siehe
      // searchStartAcquisition.ts — niemals ein Gate, nur eine leichte
      // Aufweitung der erlaubten Abweichung bei erkannter Fussbewegung.
      const startMotion = motionLatestRef.current
        ? { movementState: motionLatestRef.current.movementState ?? 'unknown', motionConfidence: motionLatestRef.current.motionConfidence ?? 0 }
        : null;
      searchStartRef.current = stepSearchStart(
        searchStartRef.current, startEvalu, { position: sm, accuracy: accRaw, headingDeg: heading, motion: startMotion },
        firstLegHeading, DEFAULT_SEARCH_START_CONFIG,
      );
      if (searchStartRef.current.state !== prevState) {
        setSearchStartState(searchStartRef.current.state);
        if (__DEV__) {
          // Kein PII/keine vollständigen Koordinaten — nur abgeleitete Meterwerte.
          console.log('[searchStart]', {
            state: searchStartRef.current.state, support: searchStartRef.current.support,
            distanceM: startEvalu.candidateDevM != null ? Math.round(startEvalu.candidateDevM * 10) / 10 : null,
            accuracy: accRaw != null ? Math.round(accRaw) : null,
            candidateProgress: startEvalu.candidateAtM != null ? Math.round(startEvalu.candidateAtM * 10) / 10 : null,
            ambiguity: startEvalu.ambiguityM != null ? Math.round(startEvalu.ambiguityM * 10) / 10 : null,
          });
          if (searchStartRef.current.state === 'START_LOCKED') {
            console.log('[searchStart]', {
              state: 'START_LOCKED', progress: Math.round((searchStartRef.current.lockedAtM ?? 0) * 10) / 10,
              firstLegHeading, reason: 'stable_start_evidence',
            });
          }
        }
      }
      if (searchStartRef.current.state === 'START_LOCKED') {
        const lockedAt = searchStartRef.current.lockedAtM ?? 0;
        cursorMRef.current = lockedAt;
        maxCursorMRef.current = lockedAt;
      }
    }

    // ── Fusion-Outlier/Stillstand: Distanz/Cursor/Abweichung/Linie bleiben
    // komplett unverändert — dieser Fix trägt NICHTS zur geometrischen Fährte
    // bei (siehe Kommentar oben). Trotzdem ein Analytics-Sample mit
    // EINGEFRORENER Geometrie (letzter bekannter devEma-Wert, KEIN neuer
    // Fortschritt entlang der Fährte), damit eine Phase schlechter Sensorik
    // sichtbar in analysisConfidence einfliesst (Punkt 5/6/9) — die
    // Hundeleistung (dev/Distanz/Score) selbst bleibt unangetastet.
    // speedMps bewusst `null`: die gemeldete GPS-Geschwindigkeit ist während
    // eines Outliers/Jitters selbst nicht vertrauenswürdig genug, um in
    // Tempo-/Ecken-/Gegenstandsanalysen einzufliessen.
    if (fusionBlocksGeometry) {
      const startLockedNow = !hasTrack || searchStartRef.current.state === 'START_LOCKED';
      if (startLockedNow) {
        analyticsSamplesRef.current.push({
          atM: maxCursorMRef.current,
          tSec: (Date.now() - startMsRef.current) / 1000,
          devM: Math.round(devEmaRef.current * 10) / 10,
          confidence: fusion.confidence,
          speedMps: null,
        });
      }
      if (__DEV__) console.log('[fusion]', fusion.classification, {
        confidence: Math.round(fusion.confidence * 100) / 100, reasonFlags: fusion.reasonFlags,
        source: gpsDebug.source, movementState: motionLatestRef.current?.movementState ?? null,
        activityAgeMs: motionActivityAgeMsRef.current, geometryBlocked: true,
      });
      emitDiag(fusion.classification === 'stationary' ? 'BLOCK_FUSION_STATIONARY' : 'BLOCK_FUSION_OUTLIER', fusion.classification);
      return;
    }

    const pts = pointsRef.current;
    if (pts.length > 0) {
      const d = distM(pts[pts.length - 1], sm);
      if (d < MIN_SEGMENT) {   // Liniendichte-Gate: noch kein neuer Linienpunkt
        emitDiag('SKIP_MIN_SEGMENT', fusion.classification);
        return;
      }
      distRef.current += d;
    }
    pts.push(sm);
    pointsTimeRef.current.push(Math.round(((tNow - startMsRef.current) / 1000) * 10) / 10);
    logSearchFix(decision);
    emitDiag('ACCEPTED', fusion.classification);

    // ── Trennung Legen/Suche: akzeptierten Suchpunkt SEPARAT führen. In den Store
    //    (searchTrackPoints, NIE die gelegte `trackPoints`) spiegeln und inkrementell
    //    lokal puffern (point_type='search'). Persistenzfehler stoppen die Aufnahme nicht.
    const searchSample: TrackPointSample = {
      lat: sm.latitude, lng: sm.longitude, accuracy: accRaw,
      altitude: loc.coords.altitude ?? null, speed, heading: null, t: tNow,
    };
    useTrackingStore.getState().addSearchPoint(searchSample);
    enqueueSearchPoint({
      latitude: sm.latitude, longitude: sm.longitude, accuracy: accRaw,
      altitude: loc.coords.altitude ?? null, speed, heading: null,
      timestamp: new Date(tNow).toISOString(),
    });

    // ── Abweichung von der Soll-Fährte (reihenfolge-bewusst) ──
    // Projektion nur auf das ERWARTETE Fenster ab dem aktuellen Fortschritt; der
    // Cursor rückt nur vor, wenn der Hund nah genug an der erwarteten Stelle ist.
    // Der Acquisition-Schritt selbst lief bereits weiter oben (auf JEDEM
    // akzeptierten Fix, siehe Kommentar dort) — hier nur noch: Anzeige-
    // Abweichung ableiten (Fenster-Kandidat vor dem Lock, sonst normale
    // Cursor-Projektion) und ggf. den Cursor vorrücken.
    let dev: number;
    const nowLocked = !hasTrack || searchStartRef.current.state === 'START_LOCKED';
    if (hasTrack && !nowLocked) {
      dev = startEvalu?.candidateDevM != null && Number.isFinite(startEvalu.candidateDevM) ? startEvalu.candidateDevM : ZERO_DEV_M;
    } else if (hasTrack) {
      const proj = projectForward(sm, laidPoints, arc.cum, cursorMRef.current, LOOKAHEAD_M, BACK_M);
      dev = Number.isFinite(proj.devM) ? proj.devM : ZERO_DEV_M;
      if (dev <= ADVANCE_DEV_M && proj.atM > cursorMRef.current) {
        cursorMRef.current = proj.atM;
        if (proj.atM > maxCursorMRef.current) maxCursorMRef.current = proj.atM;
      }
    } else {
      dev = 0;
    }
    devEmaRef.current = devEmaRef.current ? devEmaRef.current + DEV_EMA * (dev - devEmaRef.current) : dev;
    devSumRef.current += dev; devCountRef.current += 1;

    // ── Abriss-/Neuansatz-Erkennung ──
    const now = Date.now();
    // Solange die Track-Assoziation noch nicht eindeutig ist (Punkt 9), wird
    // weder Off-Track noch Abriss bewertet — beides wäre gegen ein noch nicht
    // bestätigtes Segment gemessen und könnte einen falschen Alarm auslösen,
    // während der Handler nachweislich noch am Ansatz steht/ankommt.
    const startLocked = !hasTrack || searchStartRef.current.state === 'START_LOCKED';

    // Phase-1 Off-Track: State-Machine mit dem bereits berechneten seitlichen Abstand
    // (dev = projectForward().devM) + GPS-Genauigkeit füttern. NUR Status halten —
    // keine UI/Voice/Haptik/Freeze-/Pause-Aktion (bewusst separate Phase 2+).
    if (hasTrack && startLocked) {
      offTrackRef.current = stepOffTrack(offTrackRef.current, {
        crossTrackM: dev, accuracyM: accRaw, accepted: true, nowMs: now,
      }).snap;
    }

    // ── Analytics-Sample (Punkt 10/13) — nur nach Start-Lock: vor dem Lock
    // ist `dev` der Startfenster-Kandidat, keine reale Streckenabweichung
    // (siehe Kommentar oben), das würde die Analyse verfälschen.
    if (startLocked) {
      analyticsSamplesRef.current.push({
        atM: maxCursorMRef.current,
        tSec: (now - startMsRef.current) / 1000,
        devM: dev,
        confidence: fusion.confidence,
        speedMps: speed,
      });
    }

    if (startLocked) {
      if (!inBreakRef.current) {
        if (dev > BREAK_THRESHOLD_M) {
          if (offTrackSinceRef.current == null) offTrackSinceRef.current = now;
          else if (now - offTrackSinceRef.current >= BREAK_HOLD_MS) {
            inBreakRef.current = true;
            // startedAtSec = der TATSÄCHLICHE Verlassenszeitpunkt des äusseren
            // Korridors (offTrackSinceRef), nicht der um BREAK_HOLD_MS spätere
            // Bestätigungszeitpunkt `t` — sonst würde jede Re-Acquisition-Dauer
            // systematisch um die Bestätigungsverzögerung verkürzt gemessen.
            breaksRef.current.push({
              at: sm,
              t: Math.floor((now - startMsRef.current) / 1000),
              startedAtSec: Math.max(0, (offTrackSinceRef.current - startMsRef.current) / 1000),
            });
          }
        } else {
          offTrackSinceRef.current = null;
        }
      } else {
        if (dev <= RECOVER_M) {
          inBreakRef.current = false;
          offTrackSinceRef.current = null;
          const b = breaksRef.current[breaksRef.current.length - 1];
          if (b) {
            b.recoveredAfterM = Math.round(distRef.current);
            const recoveredAtSec = (now - startMsRef.current) / 1000;
            b.recoveredAtSec = recoveredAtSec;
            b.durationSec = Math.round(Math.max(0, recoveredAtSec - b.startedAtSec) * 10) / 10;
          }
        }
      }
    }

    // ── Gegenstand verwiesen? ──
    // Vor START_LOCKED ausschliesslich anhand der Handlerposition (Punkt 4) —
    // der gewählte Hundabstand darf die virtuelle Hundeposition nicht schon
    // vorschieben, bevor der Start eindeutig feststeht.
    const dogProgress = startLocked ? estimateDogProgressM(maxCursorMRef.current, handlerDistanceM, arc.total) : maxCursorMRef.current;
    const dogPos = startLocked ? pointAtDistance(laidPoints, arc.cum, dogProgress) : null;
    const objectReference = dogPos ?? sm;
    laidObjects.forEach((o, i) => {
      if (!foundRef.current.has(i) && distM(objectReference, o.at) <= OBJECT_HIT_M) {
        foundRef.current.add(i);
      }
    });

    pushSnapshot();
  // gpsDebug.source bewusst NICHT in den Deps: es wird nur für das sparsame
  // [fusion]-DEV-Log gelesen (Instrumentation, Punkt 9 des Audits) — würde es
  // hier mitlaufen, würde jede Source-Änderung (z. B. native→expo-Fallback)
  // onFix neu erzeugen und damit den Location-Watch-Effect (Deps: [onFix])
  // unnötig neu starten. Ein evtl. kurz veralteter Wert im Log ist unkritisch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laidPoints, laidObjects, pushSnapshot, hasTrack, arc.cum, arc.total, handlerDistanceM, firstLegHeading]);

  // ── Watch ab Mount ──
  //
  // Root-Cause-Fix (Feldtest B, CURRENT+EXPO — "Timer läuft, Distanz bleibt
  // exakt 0 m, keine Suchlinie"): dieser Effect hing an `[onFix]`. `onFix`
  // ist ein useCallback über u. a. `laidPoints`/`laidObjects`/`arc` — bekommt
  // der Hook diese Props mit NEUER Identität pro Render (genau das passiert
  // in run.tsx, solange `snap === null` ist: `snap ?? { laidPoints: [],
  // laidObjects: [], … }` erzeugt jedes Mal frische Arrays), ändert sich
  // `onFix` bei jedem Render → dieser Effect räumte die Positionsquelle ab
  // und abonnierte neu → setGpsDebug/setReady lösten das nächste Render aus →
  // Endlosschleife. Die Subscription wurde dabei schneller neu aufgebaut, als
  // ein GPS-Fix (~1 Hz) überhaupt eintreffen konnte: onFix lief nie, pts/
  // distRef blieben leer — während der native Karten-User-Location-Punkt
  // (TrackingMap showUserLocation, unabhängig von dieser Pipeline) weiter
  // sichtbar wanderte. Genau das Videobild.
  //
  // Fix: die Subscription wird GENAU EINMAL pro Mount aufgebaut; der aktuelle
  // onFix wird über eine Ref gelesen (dasselbe Muster, das useTrackRecorder
  // mit `onFixRef` bereits verwendet). Damit ist der Hook auch gegen instabile
  // Prop-Identitäten immun — unabhängig davon, dass run.tsx die Identitäten
  // zusätzlich stabilisiert.
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || !mounted) return;
      setReady(true);
      // Zentrale Positionsquelle: natives Precision-Modul bevorzugt, expo-Fallback.
      const handle = await startPositionSource(
        (s) => {
          gpsSourceRef.current = s.source;
          setGpsDebug(d => (d.source === s.source && d.provider === s.provider) ? d : { ...d, source: s.source, provider: s.provider });
          onFixRef.current(sampleToLocationObject(s));
        },
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      );
      if (!mounted) { handle.stop(); return; }   // Unmount während des Starts → kein Leak
      watchRef.current = { remove: handle.stop };
      setGpsDebug(d => ({ ...d, isNativeAvailable: handle.info.isNativeAvailable, rawGnssSupported: handle.info.rawGnssSupported, source: d.source ?? handle.info.source }));
    })();
    return () => { mounted = false; watchRef.current?.remove(); };
  }, []);

  // ── Core-Motion-Listener (Punkt 3/16: Listener-Registrierung ist billig;
  // der eigentlich teure Sensor-Betrieb wird ausschliesslich in start()/stop()
  // ein-/ausgeschaltet). Samples fliessen nur in motionLatestRef — kein
  // Re-Render pro 4-Hz-Motion-Sample, nur der nächste GPS-Fix liest den
  // aktuellsten Wert. Wird recordingRef nicht gesetzt (nicht aufgenommen),
  // ist motionClient ohnehin gestoppt → keine Samples zu erwarten. ──
  useEffect(() => {
    const sub = motionClient.onSample((sMotion) => {
      motionLatestRef.current = {
        movementState: sMotion.movementState,
        stepDelta: sMotion.stepDelta,
        accelerationMagnitude: sMotion.accelerationMagnitude,
        rotationMagnitude: sMotion.rotationMagnitude,
        headingDelta: sMotion.headingDelta,
        motionConfidence: sMotion.motionConfidence,
      };
      motionActivityAgeMsRef.current = sMotion.activityAgeMs ?? null;
    });
    motionUnsubRef.current = sub;
    return () => {
      sub.remove();
      // Defensiv: falls die Absuche noch lief, sauber stoppen (kein Leak über
      // den Unmount hinaus, Punkt 16).
      void motionClient.stop();
    };
  }, []);

  // ── Timer ──
  useEffect(() => {
    if (!recording || paused) return;
    const id = setInterval(() => {
      setElapsedS(Math.floor((Date.now() - startMsRef.current) / 1000));
      setGpsDebug(d => d.rejectedCount === rejectedRef.current ? d : { ...d, rejectedCount: rejectedRef.current });
    }, 1000);
    return () => clearInterval(id);
  }, [recording, paused]);

  // ── Steuerung ──
  const start = useCallback((resume?: { points: LatLng[]; startedAtMs: number }, opts?: { forceLocked?: boolean }) => {
    const resumePts = resume?.points ?? [];
    // Fortsetzen: mit den wiederhergestellten Punkten seeden (Linie/Distanz laufen
    // weiter); frisch: leer.
    pointsRef.current = resumePts.slice();
    // Bewusst NICHT mit Platzhalter-Zeiten für resumePts vorbefüllt — echte
    // Zeitstempel für die vor-Resume-Punkte sind nicht bekannt. Die
    // resultierende Längen-Differenz zu pointsRef ist das Signal für "Replay
    // für diese Session nicht verfügbar" (siehe SearchResult.pointsTimeSec).
    pointsTimeRef.current = [];
    breaksRef.current = [];
    smoothRef.current = resumePts.length ? resumePts[resumePts.length - 1] : null;
    prevFixRef.current = null;   // Zeitlücke → nächster Fix ist neuer Referenzpunkt (kein Speed-Gate gegen alten Fix)
    recentRejectedRef.current = [];
    lastFixTRef.current = 0; rejectedRef.current = 0;
    let d = 0;
    for (let i = 1; i < resumePts.length; i++) d += distM(resumePts[i - 1], resumePts[i]);
    distRef.current = d;
    devEmaRef.current = 0; devSumRef.current = 0; devCountRef.current = 0;
    offTrackSinceRef.current = null; inBreakRef.current = false;
    offTrackRef.current = initialOffTrack();
    cursorMRef.current = 0; maxCursorMRef.current = 0;
    // Core-Motion-Fusion (Punkt 3/16): NUR während einer aktiven Absuche aktiv.
    // Fire-and-forget — ein Start-Fehler (Permission verweigert, kein Modul im
    // Build, Android) fällt lautlos auf fusionMode='gps_only' zurück, blockiert
    // die Absuche nie.
    analyticsSamplesRef.current = [];
    fusionHistoryRef.current = { prevAccepted: null, prevSpeedMps: null, prevCourseDeg: null };
    void motionClient.start();
    // Fortsetzen einer bereits laufenden Absuche (Resume), Freilauf ohne
    // Soll-Fährte (die Track-Assoziation ist dann gegenstandslos), ODER ein
    // ausdrücklicher manueller Override ("Trotzdem starten", run.tsx
    // handleManualStart mode='manual-override') → direkt START_LOCKED, keine
    // Akquisition nötig. Root-Cause-Fix (Golden-Reference-Audit, Punkt 2):
    // vorher konnte "Trotzdem starten" recording/Timer starten, OHNE dass
    // SearchStartAcquisition je START_LOCKED erreichte — ein stiller,
    // ungültiger Zustand (LIVE + Timer läuft, aber Cursor/Fortschritt bleiben
    // auf 0 eingefroren, da hasTrack&&!locked die Cursor-Projektion blockiert).
    // Ein EXPLIZITER manueller Override bedeutet: der Handler übernimmt
    // bewusst die Verantwortung für "ich stehe am Start" — das muss die
    // Aufnahme dann auch wirklich freigeben, nicht nur so tun.
    // ENGINE=BUILD40 (Golden-Reference-Audit, Punkt 3): SearchStartAcquisition
    // ist ein Modul, das im historischen Stand (82bd17c) nicht existierte —
    // der erste akzeptierte Fix war dort direkt der Referenzpunkt, ohne
    // Konsekutiv-/Fenster-Gate. BUILD40 reproduziert das exakt.
    const build40 = getTrackingEngineMode() === 'build40';
    searchStartRef.current = (resume || !hasTrack || opts?.forceLocked || build40)
      ? { state: 'START_LOCKED', support: DEFAULT_SEARCH_START_CONFIG.requiredFixes, lockedAtM: 0 }
      : INITIAL_SEARCH_START;
    setSearchStartState(searchStartRef.current.state);
    foundRef.current = new Set();
    startMsRef.current = resume ? resume.startedAtMs : Date.now();
    setElapsedS(resume ? Math.max(0, Math.floor((Date.now() - resume.startedAtMs) / 1000)) : 0);
    pausedRef.current = false; setPausedState(false);
    // Frisch: Store-Suchspur leeren. Fortsetzen: Store wurde extern (restoreSearchSession)
    // mit den Punkten befüllt → NICHT leeren.
    if (!resume) useTrackingStore.getState().resetSearchPoints();
    // Puffer leeren, aber DIESELBE Session behalten → neue Fixes hängen an dieselbe
    // SQLite-Gruppe an; bereits gespeicherte Punkte werden NICHT erneut geschrieben.
    resetSearchBuffer(sessionIdRef.current ?? `local-search-${Date.now()}`);
    recordingRef.current = true; setRecording(true);
    if (__DEV__) console.log('[searchRecorder] recording started', { resume: !!resume, resumePts: resumePts.length });
    pushSnapshot();
  }, [pushSnapshot, hasTrack]);

  const stop = useCallback((): SearchResult => {
    recordingRef.current = false; setRecording(false);
    // Letzten lokalen Persistenz-Puffer schreiben (best-effort, blockiert nicht).
    void flushSearchPoints();
    // Core-Motion-Fusion sauber stoppen (Punkt 16 — kein CPU/Akku-Verbrauch
    // ausserhalb einer aktiven Absuche).
    void motionClient.stop();
    const durationS = Math.floor((Date.now() - startMsRef.current) / 1000);
    return {
      points: pointsRef.current.slice(),
      breaks: breaksRef.current.slice(),
      foundObjects: foundRef.current.size,
      totalObjects,
      analyticsSamples: analyticsSamplesRef.current.slice(),
      foundObjectIndices: Array.from(foundRef.current),
      pointsTimeSec: pointsTimeRef.current.slice(),
      deviationAvgM: devCountRef.current ? Math.round((devSumRef.current / devCountRef.current) * 10) / 10 : 0,
      distanceM: distRef.current,
      durationS,
      score: computeScore(),
    };
  }, [computeScore, totalObjects]);

  const setPaused = useCallback((p: boolean) => { pausedRef.current = p; setPausedState(p); }, []);

  const markObject = useCallback(() => {
    const cur = smoothRef.current; if (!cur) return;
    let bestI = -1, bestD = Infinity;
    laidObjects.forEach((o, i) => {
      if (foundRef.current.has(i)) return;
      const d = distM(cur, o.at);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    if (bestI >= 0) { foundRef.current.add(bestI); pushSnapshot(); }
  }, [laidObjects, pushSnapshot]);

  // Virtueller Hundefortschritt (Bogenlänge) + geschätzte Hundeposition — reine
  // Runtime-Ableitung aus dem bestehenden progressM (Handler). Kein GPS-Rohpunkt.
  // Vor START_LOCKED (Punkt 4): kein Hundabstand-Offset, kein Marker — nur die
  // Handlerposition selbst zählt, solange die Start-Assoziation nicht feststeht.
  const startLockedForDisplay = !hasTrack || searchStartState === 'START_LOCKED';
  const dogProgressM = startLockedForDisplay ? estimateDogProgressM(snap.progressM, handlerDistanceM, arc.total) : snap.progressM;
  const estimatedDogPosition = startLockedForDisplay ? pointAtDistance(laidPoints, arc.cum, dogProgressM) : null;

  return {
    ready, recording, paused,
    points: snap.points, position, deviationM: snap.deviationM, onTrack: snap.onTrack,
    breaks: snap.breaks, foundObjects: snap.found, totalObjects,
    distanceM: snap.distanceM, offTrackState: snap.offTrackState, progressM: snap.progressM,
    dogProgressM, trackLengthM: arc.total, estimatedDogPosition,
    elapsedS, score: snap.score, accuracy,
    gpsDebug, gpsQuality,
    searchStartState,
    start, stop, setPaused, markObject,
  };
}
