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
import { evaluateSearchFix, type SearchFixDecision, type SearchFixPrev } from '@/features/tracking/utils/searchFix';

export interface GpsDebug {
  source: LocationSourceKind | null;
  provider: string | null;
  isNativeAvailable: boolean;
  rawGnssSupported: boolean;
  rejectedCount: number;
}

export type LatLng = { latitude: number; longitude: number };
export type SearchObject = { at: LatLng; index: number; material: string };
export type Break = { at: LatLng; t: number; recoveredAfterM?: number };

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
  // Search Start Acquisition (Track-Assoziation am Beginn der Absuche): solange
  // nicht START_LOCKED, ist dogProgressM/estimatedDogPosition NICHT um den
  // Hundabstand vorgeschoben (siehe engine/searchStartAcquisition.ts). Der
  // UI-Text wird bewusst NICHT hier zurückgegeben (kein i18n-Zugriff in
  // diesem reinen Hook) — run.tsx mappt den State selbst über t().
  searchStartState: SearchStartState;
  // Ohne Argument: frische Absuche (Reset). Mit `resume`: unterbrochene Absuche
  // fortsetzen (P2) — Punkte/Distanz/Timer werden fortgeführt, keine neue Session.
  start: (resume?: { points: LatLng[]; startedAtMs: number }) => void;
  stop: () => SearchResult;
  setPaused: (p: boolean) => void;
  markObject: () => void;
}
export type SearchResult = {
  points: LatLng[]; breaks: Break[]; foundObjects: number; totalObjects: number;
  deviationAvgM: number; distanceM: number; durationS: number; score: number;
};

export type { Level };

export function useSearchRecorder(opts: { laidPoints: LatLng[]; laidObjects: SearchObject[]; level: Level; sessionId?: string | null; handlerDistanceM?: number }): SearchRecorder {
  const { laidPoints, laidObjects, level } = opts;
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

  // ── Refs (live im Callback) ──
  const recordingRef = useRef(false);
  const pausedRef = useRef(false);
  const pointsRef = useRef<LatLng[]>([]);
  const breaksRef = useRef<Break[]>([]);
  const smoothRef = useRef<LatLng | null>(null);
  const prevFixRef = useRef<SearchFixPrev | null>(null);   // letzter AKZEPTIERTER Rohfix (für das Speed-Gate)
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
    // letzten AKZEPTIERTEN Rohfix. KEIN absoluter Jump-Filter mehr.
    const decision = evaluateSearchFix(
      prevFixRef.current,
      { lat: raw.latitude, lng: raw.longitude, t: tNow, accuracy: accRaw, speed },
    );

    // Puck-Glättung IMMER (auch bei verworfenem Linienpunkt) → die Position folgt
    // weiter, statt einzufrieren.
    const sm: LatLng = prev
      ? { latitude: prev.latitude + SMOOTH_ALPHA * (raw.latitude - prev.latitude),
          longitude: prev.longitude + SMOOTH_ALPHA * (raw.longitude - prev.longitude) }
      : raw;
    smoothRef.current = sm;
    setPosition(sm);

    if (!recordingRef.current || pausedRef.current) return;

    if (!decision.accepted) { rejectedRef.current++; logSearchFix(decision); return; }

    // Akzeptiert → als Referenz für das nächste Speed-Gate merken (wie Legen: auch
    // bei anschliessendem Distanz-Gate).
    prevFixRef.current = { lat: raw.latitude, lng: raw.longitude, t: tNow };
    lastFixTRef.current = tNow;

    const pts = pointsRef.current;
    if (pts.length > 0) {
      const d = distM(pts[pts.length - 1], sm);
      if (d < MIN_SEGMENT) return;   // Liniendichte-Gate: noch kein neuer Linienpunkt
      distRef.current += d;
    }
    pts.push(sm);
    logSearchFix(decision);

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
    let dev: number;
    // ── Search Start Acquisition (Punkt 2-11): solange nicht START_LOCKED,
    // bleibt die Track-Projektion auf das enge Startfenster [0, startWindowM]
    // beschränkt (Punkt 3) — die normale, unveränderte order-aware Projektion
    // (LOOKAHEAD_M/BACK_M/ADVANCE_DEV_M, cursor-relativ) läuft erst NACH dem
    // Lock, mit einem Cursor, der deterministisch vom gelockten Startfenster-
    // Kandidaten übernommen wird (Punkt 10) statt von einem beliebigen späteren
    // nearest-point-Kandidaten (Punkt 5/11 — genau der Feldtest-Fall).
    const wasLocked = !hasTrack || searchStartRef.current.state === 'START_LOCKED';
    if (hasTrack && !wasLocked) {
      const evalu = evaluateStartCandidate(sm, laidPoints, arc.cum, DEFAULT_SEARCH_START_CONFIG);
      // Bewegungsrichtung seit dem vorletzten AKZEPTIERTEN Streckenpunkt — nur
      // zusätzliche Evidenz (Punkt 5/16), niemals eine harte Bedingung.
      const heading = pts.length >= 2
        ? calculateHeading(
            { lat: pts[pts.length - 2].latitude, lng: pts[pts.length - 2].longitude },
            { lat: pts[pts.length - 1].latitude, lng: pts[pts.length - 1].longitude },
          )
        : null;
      const prevState = searchStartRef.current.state;
      searchStartRef.current = stepSearchStart(
        searchStartRef.current, evalu, { position: sm, accuracy: accRaw, headingDeg: heading },
        firstLegHeading, DEFAULT_SEARCH_START_CONFIG,
      );
      if (searchStartRef.current.state !== prevState) {
        setSearchStartState(searchStartRef.current.state);
        if (__DEV__) {
          // Kein PII/keine vollständigen Koordinaten — nur abgeleitete Meterwerte.
          console.log('[searchStart]', {
            state: searchStartRef.current.state, support: searchStartRef.current.support,
            distanceM: evalu.candidateDevM != null ? Math.round(evalu.candidateDevM * 10) / 10 : null,
            accuracy: accRaw != null ? Math.round(accRaw) : null,
            candidateProgress: evalu.candidateAtM != null ? Math.round(evalu.candidateAtM * 10) / 10 : null,
            ambiguity: evalu.ambiguityM != null ? Math.round(evalu.ambiguityM * 10) / 10 : null,
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
      dev = evalu.candidateDevM != null && Number.isFinite(evalu.candidateDevM) ? evalu.candidateDevM : ZERO_DEV_M;
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

    if (startLocked) {
      if (!inBreakRef.current) {
        if (dev > BREAK_THRESHOLD_M) {
          if (offTrackSinceRef.current == null) offTrackSinceRef.current = now;
          else if (now - offTrackSinceRef.current >= BREAK_HOLD_MS) {
            inBreakRef.current = true;
            breaksRef.current.push({ at: sm, t: Math.floor((now - startMsRef.current) / 1000) });
          }
        } else {
          offTrackSinceRef.current = null;
        }
      } else {
        if (dev <= RECOVER_M) {
          inBreakRef.current = false;
          offTrackSinceRef.current = null;
          const b = breaksRef.current[breaksRef.current.length - 1];
          if (b) b.recoveredAfterM = Math.round(distRef.current);
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
  }, [laidPoints, laidObjects, pushSnapshot, hasTrack, arc.cum, arc.total, handlerDistanceM, firstLegHeading]);

  // ── Watch ab Mount ──
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || !mounted) return;
      setReady(true);
      // Zentrale Positionsquelle: natives Precision-Modul bevorzugt, expo-Fallback.
      const handle = await startPositionSource(
        (s) => {
          setGpsDebug(d => (d.source === s.source && d.provider === s.provider) ? d : { ...d, source: s.source, provider: s.provider });
          onFix(sampleToLocationObject(s));
        },
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      );
      if (!mounted) { handle.stop(); return; }   // Unmount während des Starts → kein Leak
      watchRef.current = { remove: handle.stop };
      setGpsDebug(d => ({ ...d, isNativeAvailable: handle.info.isNativeAvailable, rawGnssSupported: handle.info.rawGnssSupported, source: d.source ?? handle.info.source }));
    })();
    return () => { mounted = false; watchRef.current?.remove(); };
  }, [onFix]);

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
  const start = useCallback((resume?: { points: LatLng[]; startedAtMs: number }) => {
    const resumePts = resume?.points ?? [];
    // Fortsetzen: mit den wiederhergestellten Punkten seeden (Linie/Distanz laufen
    // weiter); frisch: leer.
    pointsRef.current = resumePts.slice();
    breaksRef.current = [];
    smoothRef.current = resumePts.length ? resumePts[resumePts.length - 1] : null;
    prevFixRef.current = null;   // Zeitlücke → nächster Fix ist neuer Referenzpunkt (kein Speed-Gate gegen alten Fix)
    lastFixTRef.current = 0; rejectedRef.current = 0;
    let d = 0;
    for (let i = 1; i < resumePts.length; i++) d += distM(resumePts[i - 1], resumePts[i]);
    distRef.current = d;
    devEmaRef.current = 0; devSumRef.current = 0; devCountRef.current = 0;
    offTrackSinceRef.current = null; inBreakRef.current = false;
    offTrackRef.current = initialOffTrack();
    cursorMRef.current = 0; maxCursorMRef.current = 0;
    // Fortsetzen einer bereits laufenden Absuche (Resume) oder Freilauf ohne
    // Soll-Fährte: die Track-Assoziation wurde vorher schon bestätigt bzw. ist
    // gegenstandslos → direkt START_LOCKED, keine erneute Akquisition nötig.
    searchStartRef.current = (resume || !hasTrack)
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
    const durationS = Math.floor((Date.now() - startMsRef.current) / 1000);
    return {
      points: pointsRef.current.slice(),
      breaks: breaksRef.current.slice(),
      foundObjects: foundRef.current.size,
      totalObjects,
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
    gpsDebug,
    searchStartState,
    start, stop, setPaused, markObject,
  };
}
