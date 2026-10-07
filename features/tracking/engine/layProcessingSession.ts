import type * as Location from 'expo-location';
import type { AngleKind, MarkerSample, TrackPointSample } from '@/features/tracking/store/trackingStore';
import {
  calculateDistance, calculateAverageAccuracy, medianLatLng, type LatLng,
} from '@/features/tracking/utils/gpsFilter';
import {
  createGpsQualityTracker, type GpsQualityTracker, type GpsQualityState,
} from '@/features/tracking/utils/gpsQualityState';
import { logGpsQualityChange } from '@/features/tracking/utils/angleDiagnostics';
import { legacyDetectCorner, type LegacyAcceptedPoint } from '@/features/tracking/utils/legacyCornerDetection';
import {
  DETECTOR_INPUT, CORNER_GAP_M, type ShortLegPoint,
} from '@/features/tracking/utils/shortLegCornerDetection';
import { fuseTurns, nearestCompatibleTurnEvidence, type FusedTurn } from '@/features/tracking/utils/turnFusion';
import { lineGateStepM, lineEmaAlpha, inTurnZone } from '@/features/tracking/utils/turnAwareLineGate';
import { createCanonicalDistance } from '@/features/tracking/utils/canonicalDistance';
import { getTrackingEngineMode } from '@/features/tracking/utils/trackingEngineMode';
import { pushQaCandidateLine } from '@/features/tracking/utils/qaCandidateLog';
import {
  QA_MOTION_CONTEXT_MS,
  type QaCapturePoint, type QaDistanceScale, type QaMarkerSource, type QaCandidateMotion, type QaSessionCapture,
} from '@/features/tracking/utils/qaSessionCapture';
import { MotionEvidenceBuffer, TURN_EVIDENCE_DEFAULTS, motionTurnDirection, type TurnEvidence } from '@/features/tracking/utils/motionTurnEvidence';
import { recordBackgroundLayEvent } from '@/features/tracking/utils/backgroundLayDiagnostics';
import { layStartBlockingReason } from '@/features/tracking/utils/layStartLock';
import { confirmLayMovement } from '@/features/tracking/utils/layMovementConfirmation';
import { boundedPush } from '@/features/tracking/utils/trackingUxDiagnostics';

// ──────────────────────────────────────────────────────────────────────────
// Sessiongebundener Lay-Fix-Processor (React-unabhängig).
//
// Enthält den synchronen fachlichen Verarbeitungskern der Fährtenaufnahme, der
// bisher direkt in useTrackRecorder lag: Start-Lock, EMA-Ketten, GPS-Quality,
// Accuracy-/Speed-Gates, Detektor-Puffer, kanonische Distanz, Linien-Gate,
// Winkel-Erkennung (CURRENT + BUILD40). Der Code ist unverändert verschoben —
// gleiche Reihenfolge, gleiche Konstanten, gleiche Seiteneffekte.
//
// Zustand: ein explizites Session-Objekt (createLayProcessingState). Die Felder
// sind schlichte `{ current }`-Boxen mit den bisherigen Ref-Namen, damit der
// Algorithmus Zeile für Zeile identisch bleibt. Kein React, keine Hooks, kein UI.
//
// Seiteneffekte (Store, Persistenz-Puffer, Marker-Commit, Diagnose-Events,
// Winkel-Callback) laufen über die vom Owner übergebenen Deps — an exakt den
// bisherigen Stellen und in derselben Reihenfolge. Owner ist in dieser Phase
// weiterhin useTrackRecorder.
// ──────────────────────────────────────────────────────────────────────────

// Filter-/Glättungs-Parameter.
export const MAX_ACCURACY_M = 45;   // gröber → kein LINIEN-Punkt (Puck folgt trotzdem). Feld unter Bäumen ~30-45 m.
export const MAX_SPEED_MPS  = 12;   // ~43 km/h: schnellerer Sprung = unrealistisch → verwerfen
export const MIN_STEP_M     = 2.0;  // Distanz-Gate: erst ab 2 m neuen Linienpunkt setzen
export const EMA_ALPHA      = 0.4;  // Glättung der aufgezeichneten LINIE (ruhig, träge)
export const PUCK_ALPHA     = 0.6;  // Glättung des LIVE-Pucks separat → folgt flotter,
                             // ohne die aufgezeichnete Linie unruhiger zu machen

// Auto-Winkel-Erkennung: die gesamte reine, testbare Logik lebt in
// features/tracking/utils/autoCornerDetection.ts (Single Source of Truth) —
// stabile Ein-/Auslaufschenkel (LEG_MIN_M=4 m, Heading-Abweichung ≤12°, ≥2 Segmente),
// konzentrierte Scheitel-Richtungsänderung, Innenwinkel-Klassen (75–105° normal,
// 30–60° spitz), Rechts/Links via Bearing, Corner-Gap + Accuracy-Gate.

// Start-Lock: Stabilisierungsphase direkt nach „Fährte legen". Verhindert, dass
// GPS-Warmup-/Startdrift (auf iPhone real ~8 m, obwohl man steht) als echte
// Trackstrecke gespeichert wird. Solange aktiv: KEINE Linie, KEINE Distanz,
// KEINE Winkel — nur gute Fixes für den Startanker sammeln.
export const START_LOCK_MAX_MS       = 12000;  // nur mit gutem Anker: nach 12 s auch ohne Bewegungsbestätigung freigeben
export const START_ANCHOR_MIN_FIXES  = 4;      // so viele gute Fixes → Median-Anker
export const START_ANCHOR_MAX_ACC_M  = 20;     // nur Fixes ≤ 20 m fliessen in den Anker
export const START_FIX_MAX_AGE_MS    = 5000;   // gecachte/stale Fixes bestätigen keine Bewegung

export interface AcceptedPoint extends LatLng { t: number; accuracy: number | null; cumDist: number; }
export type Raw = { lat: number; lng: number; accuracy: number | null; altitude: number | null; speed: number | null; t: number };

export type Box<T> = { current: T };
const box = <T,>(value: T): Box<T> => ({ current: value });

export interface AngleDebug {
  count: number; acuteCount: number; lastType: AngleKind | null; lastDeg: number | null;
  lastDir: 'links' | 'rechts' | null; lastReject: string | null;
}

/** Fachlicher (und verarbeitungsnaher Diagnose-)Zustand EINER Lay-Session. */
export interface LayProcessingState {
  pointsRef: Box<AcceptedPoint[]>;
  emaRef: Box<LatLng | null>;
  lineEmaRef: Box<LatLng | null>;
  canonDistRef: Box<ReturnType<typeof createCanonicalDistance>>;
  puckRef: Box<LatLng | null>;
  lastRawRef: Box<Raw | null>;
  lastCornerAtRef: Box<number>;
  lineTurnZoneRef: Box<boolean>;
  lastCornerRescuedRef: Box<boolean>;
  detectPointsRef: Box<ShortLegPoint[]>;
  detectEmaRef: Box<LatLng | null>;
  rawTailRef: Box<ShortLegPoint[]>;
  rejectedRef: Box<number>;
  startLockRef: Box<boolean>;
  startLockBeganRef: Box<number>;
  startFixesRef: Box<{ lat: number; lng: number; accuracy: number; t: number }[]>;
  startAnchorRef: Box<LatLng | null>;
  startAnchorAccRef: Box<number | null>;
  startDriftRejRef: Box<number>;
  gpsQualityRef: Box<GpsQualityTracker>;
  gpsQualityStateRef: Box<GpsQualityState | null>;
  angleDbgRef: Box<AngleDebug>;
  liveTurnsRef: Box<Map<number, FusedTurn>>;
  turnEvidenceRef: Box<Map<number, TurnEvidence>>;
  qaMotionSeenRef: Box<Set<number>>;
  qaCandidateMotionRef: Box<QaCandidateMotion[]>;
  qaLastRejectRef: Box<string | null>;
  qaOriginRef: Box<{ lat: number; lng: number; t: number } | null>;
  qaRawFixesRef: Box<QaCapturePoint[]>;
  qaRawCountRef: Box<number>;
  qaAcceptedCountRef: Box<number>;
}

/** Anfangszustand — identisch zu den bisherigen useRef-Initialwerten. */
export function createLayProcessingState(): LayProcessingState {
  return {
    pointsRef: box<AcceptedPoint[]>([]),
    emaRef: box<LatLng | null>(null),
    lineEmaRef: box<LatLng | null>(null),
    canonDistRef: box(createCanonicalDistance()),
    puckRef: box<LatLng | null>(null),
    lastRawRef: box<Raw | null>(null),
    lastCornerAtRef: box<number>(-Infinity),
    lineTurnZoneRef: box(false),
    lastCornerRescuedRef: box(false),
    detectPointsRef: box<ShortLegPoint[]>([]),
    detectEmaRef: box<LatLng | null>(null),
    rawTailRef: box<ShortLegPoint[]>([]),
    rejectedRef: box(0),
    startLockRef: box<boolean>(false),
    startLockBeganRef: box<number>(0),
    startFixesRef: box<{ lat: number; lng: number; accuracy: number; t: number }[]>([]),
    startAnchorRef: box<LatLng | null>(null),
    startAnchorAccRef: box<number | null>(null),
    startDriftRejRef: box<number>(0),
    gpsQualityRef: box<GpsQualityTracker>(createGpsQualityTracker()),
    gpsQualityStateRef: box<GpsQualityState | null>(null),
    angleDbgRef: box<AngleDebug>({ count: 0, acuteCount: 0, lastType: null, lastDeg: null, lastDir: null, lastReject: null }),
    liveTurnsRef: box<Map<number, FusedTurn>>(new Map()),
    turnEvidenceRef: box<Map<number, TurnEvidence>>(new Map()),
    qaMotionSeenRef: box<Set<number>>(new Set()),
    qaCandidateMotionRef: box<QaCandidateMotion[]>([]),
    qaLastRejectRef: box<string | null>(null),
    qaOriginRef: box<{ lat: number; lng: number; t: number } | null>(null),
    qaRawFixesRef: box<QaCapturePoint[]>([]),
    qaRawCountRef: box(0),
    qaAcceptedCountRef: box(0),
  };
}

/** Teilmenge des Tracking-Stores, die der Processor beschreibt (UI-/Store-Seite). */
export interface LayStoreFacade {
  isPaused: boolean;
  setCurrentPosition: (p: LatLng, accuracy: number | null) => void;
  setStartAnchor: (a: { lat: number; lng: number; accuracy: number | null; t: number }) => void;
  setStartDriftRejectedCount: (n: number) => void;
  setStartLockActive: (active: boolean) => void;
  addTrackPoint: (p: TrackPointSample, opts?: { skipDistance?: boolean }) => void;
  setDistanceMeters: (m: number) => void;
}

export type LayPointRow = {
  latitude: number; longitude: number; accuracy: number | null; altitude: number | null;
  speed: number | null; heading: number | null; timestamp: string;
};

/** Vom Owner (heute: useTrackRecorder) bereitgestellte Ein-/Ausgänge. */
export interface LayProcessorDeps {
  store: { getState: () => LayStoreFacade };
  localSessionId: Box<string | null>;
  ptBuffer: Box<LayPointRow[]>;
  flushPoints: () => Promise<void>;
  commitMarker: (marker: MarkerSample, qa?: { source: QaMarkerSource; scale: QaDistanceScale; apexIndex: number | null }) => Promise<void>;
  onAngleRef: Box<((kind: AngleKind) => void) | undefined>;
  recordingRef: Box<boolean>;
  qaRef: Box<boolean>;
  motionActiveRef: Box<boolean>;
  motionBufRef: Box<MotionEvidenceBuffer>;
  autoDetectRef: Box<boolean>;
  startupRef: Box<QaSessionCapture['startupDiagnostics']>;
  startupMovementRef: Box<NonNullable<QaSessionCapture['startupMovementDiagnostics']>>;
  startupSec: () => number | null;
}

export interface LayCornerEvent {
  kind: AngleKind;
  atM: number;
  apexIndex: number | null;
  source: 'auto' | 'auto_split_apex' | 'build40';
}

export type LayRejectReason = 'start_lock_active' | 'accuracy' | 'gps_outlier' | 'distance_gate';

/** Explizites Ergebnis eines Fixes (vorher implizit im Hook). */
export interface LayFixResult {
  /** warmup = keine Aufnahme aktiv, paused = pausiert, rejected = kein Linienpunkt, accepted = neuer Linienpunkt. */
  outcome: 'warmup' | 'paused' | 'rejected' | 'accepted';
  rejectReason: LayRejectReason | null;
  /** In diesem Fix wurde der Start-Lock gelöst (Anker = erster Linienpunkt). */
  anchorReleased: boolean;
  acceptedPoint: AcceptedPoint | null;
  corners: LayCornerEvent[];
  /** Kanonische Distanz nach diesem Fix. */
  distanceM: number;
  /** Zähler verworfener Fixes (Genauigkeit/Sprung) nach diesem Fix. */
  rejectedCount: number;
}

export function createLayProcessor(session: LayProcessingState, deps: LayProcessorDeps) {
  const {
    pointsRef, emaRef, lineEmaRef, canonDistRef, puckRef, lastRawRef, lastCornerAtRef, lineTurnZoneRef,
    lastCornerRescuedRef, detectPointsRef, detectEmaRef, rawTailRef, rejectedRef,
    startLockRef, startLockBeganRef, startFixesRef, startAnchorRef, startAnchorAccRef, startDriftRejRef,
    gpsQualityRef, gpsQualityStateRef, angleDbgRef, liveTurnsRef, turnEvidenceRef, qaMotionSeenRef,
    qaCandidateMotionRef, qaLastRejectRef, qaOriginRef, qaRawFixesRef, qaRawCountRef, qaAcceptedCountRef,
  } = session;
  const {
    store, localSessionId, ptBuffer, flushPoints, commitMarker, onAngleRef, recordingRef, qaRef,
    motionActiveRef, motionBufRef, autoDetectRef, startupRef, startupMovementRef, startupSec,
  } = deps;

  // Relativkoordinaten für den QA-Mitschnitt. Der Ursprung ist der erste
  // Rohfix; er selbst wird NICHT mitgeschrieben, nur die Differenzen.
  const qaRel = (lat: number, lng: number, t: number, accuracy: number | null, cumDistM?: number): QaCapturePoint => {
    const o = qaOriginRef.current;
    const mPerLat = 111320;
    const mPerLng = 111320 * Math.cos(((o?.lat ?? lat) * Math.PI) / 180);
    return {
      x: Math.round(((lng - (o?.lng ?? lng)) * mPerLng) * 1000) / 1000,
      y: Math.round(((lat - (o?.lat ?? lat)) * mPerLat) * 1000) / 1000,
      accuracy,
      tMs: t - (o?.t ?? t),
      ...(cumDistM != null ? { cumDistM: Math.round(cumDistM * 100) / 100 } : {}),
    };
  };

  const persistLegacyCorner = (pts: readonly LegacyAcceptedPoint[]): LayCornerEvent[] => {
    const r = legacyDetectCorner(pts, lastCornerAtRef.current);
    const dbg = angleDbgRef.current;
    if (r.reject) { dbg.lastReject = r.reject; return []; }
    dbg.count++;
    if (r.kind === 'spitz_rechts' || r.kind === 'spitz_links') dbg.acuteCount++;
    dbg.lastType = r.kind; dbg.lastDeg = r.angleDeg; dbg.lastDir = r.dir; dbg.lastReject = null;
    lastCornerAtRef.current = r.apex.cumDist;
    const now = Date.now();
    void commitMarker({
      id: `angle-${now}-${r.kind}`, type: 'winkel', material: null, angleKind: r.kind,
      lat: r.apex.lat, lng: r.apex.lng, accuracy: r.apex.accuracy,
      distance_from_start: Math.round(r.apex.cumDist * 10) / 10,
      note: null, audio_url: null, found: false, t: now,
    }, { source: 'build40', scale: 'line', apexIndex: null });
    onAngleRef.current?.(r.kind);
    return [{ kind: r.kind, atM: r.apex.cumDist, apexIndex: null, source: 'build40' }];
  };

  const persistShortLegCorners = (): LayCornerEvent[] => {
    const committed: LayCornerEvent[] = [];
    // Motion-Confidence-Kopplung (±0,12): der Detector bekommt eine reine
    // NACHSCHLAGEFUNKTION für die Turn-Evidenz zum Kandidaten-Zeitpunkt. Läuft
    // kein Motion-Mitschnitt (z. B. ENGINE=BUILD40 oder Modul nicht verfügbar),
    // wird nichts übergeben und die Confidence bleibt exakt wie bisher.
    const turnEvidenceAt = motionActiveRef.current
      ? (t: number | null) => {
        if (t == null) return null;
        const current = motionBufRef.current.evidenceForTrailing(t);
        const retained = turnEvidenceRef.current.get(t);
        if (current.available && (!retained || (current.evidence ?? 0) > (retained.evidence ?? 0)))
          turnEvidenceRef.current.set(t, current);
        return turnEvidenceRef.current.get(t) ?? current;
      }
      : undefined;
    const turnEvidenceForDirection = motionActiveRef.current
      ? (t: number | null, direction: 'links' | 'rechts') => t == null ? null : nearestCompatibleTurnEvidence(t, direction, queryT => {
        if (queryT == null) return null;
        return motionBufRef.current.evidenceFor(queryT);
      })
      : undefined;
    // Turn-Fusion (GPS ∪ IMU): Regelpfad des Detektors + Split-Apex-Paarung +
    // Schärfe-Auflösbarkeit. Ohne Motion rein GPS-basiert.
    let { corners, diagnostics, turns } = fuseTurns(detectPointsRef.current, { turnEvidenceAt, turnEvidenceForDirection });
    // Some candidates are inspected before the GPS corner is accepted. Save
    // their available evidence and re-evaluate the same GPS candidates once.
    let newlyAssociated = false;
    if (motionActiveRef.current) for (const d of diagnostics) {
      if (d.t == null || turnEvidenceRef.current.has(d.t)) continue;
      const ev = motionBufRef.current.evidenceForTrailing(d.t);
      if (ev.available) { turnEvidenceRef.current.set(d.t, ev); newlyAssociated = true; }
    }
    if (newlyAssociated) ({ corners, diagnostics, turns } = fuseTurns(detectPointsRef.current, { turnEvidenceAt, turnEvidenceForDirection }));

    // ── QA v2.1: Motion-Evidenz LIVE je Kandidat festhalten ────────────────
    // Rein beobachtend. Greift nur im QA-Diagnosemodus und nur, solange Core
    // Motion ohnehin läuft. Es wird NICHTS neu berechnet — die Aggregate
    // stammen aus derselben Auswertung, die der Detektor gerade benutzt hat,
    // und die Rohsamples kommen unverändert aus dem Ringpuffer.
    if (qaRef.current && motionActiveRef.current) {
      for (const d of diagnostics) {
        const tCand = d.t;
        if (tCand == null) continue;
        // Nur Kandidaten, bei denen Motion überhaupt eine Rolle spielen kann:
        // die Geometrie muss bis zur Richtungsmessung gekommen sein.
        if (d.headingDeltaDeg == null) continue;
        const ev = motionBufRef.current.evidenceForTrailing(tCand);
        const previousIndex = qaCandidateMotionRef.current.findIndex(c => c.apexIndex === d.apexIndex);
        if (previousIndex >= 0 && (qaCandidateMotionRef.current[previousIndex].turnEvidence ?? 0) >= (ev.evidence ?? 0)) continue;
        qaMotionSeenRef.current.add(d.apexIndex);
        const samples = motionBufRef.current.samplesIn(
          tCand - (TURN_EVIDENCE_DEFAULTS.halfWindowSec * 1000 + QA_MOTION_CONTEXT_MS),
          tCand + (TURN_EVIDENCE_DEFAULTS.halfWindowSec * 1000 + QA_MOTION_CONTEXT_MS),
        );
        const t0 = qaOriginRef.current?.t ?? tCand;
        const candidate: QaCandidateMotion = {
          apexIndex: d.apexIndex,
          evaluatedAtMs: Math.round(tCand - t0),
          windowStartMs: Math.round(ev.windowStartMs - tCand),
          windowEndMs: Math.round(ev.windowEndMs - tCand),
          sampleCount: ev.sampleCount,
          firstSampleAgeMs: samples.length ? Math.round(samples[0].t - tCand) : null,
          lastSampleAgeMs: samples.length ? Math.round(samples[samples.length - 1].t - tCand) : null,
          motionAvailable: ev.available,
          netYawDeg: Math.round(ev.netYawDeg * 100) / 100,
          signedNetYawDeg: Math.round(ev.signedNetYawDeg * 100) / 100,
          direction: motionTurnDirection(ev),
          grossYawDeg: Math.round(ev.grossYawDeg * 100) / 100,
          monotonicity: Math.round(ev.monotonicity * 1000) / 1000,
          yawShare: Math.round(ev.yawShare * 1000) / 1000,
          accelerationEvidence: Math.round(ev.gaitAccelFraction * 1000) / 1000,
          stepDelta: ev.steps,
          cadence: ev.cadence,
          movementState: ev.movementState,
          locomotionEvidence: ev.locomotionSource,
          turnEvidence: ev.evidence,
          adjustmentApplied: d.motionAdjustment ?? 0,
          samples: samples.map(x => ({
            dtMs: Math.round(x.t - tCand),
            headingDelta: Math.round(x.headingDelta * 100) / 100,
            rotationMagnitude: Math.round(x.rotationMagnitude * 1000) / 1000,
            accelerationMagnitude: Math.round(x.accelerationMagnitude * 1000) / 1000,
            stepDelta: x.stepDelta,
            cadence: x.cadence,
            movementState: x.movementState,
          })),
          source: 'live',
        };
        if (previousIndex >= 0) qaCandidateMotionRef.current[previousIndex] = candidate;
        else qaCandidateMotionRef.current.push(candidate);
      }
    }
    if (__DEV__ && diagnostics.length) {
      const last = diagnostics[diagnostics.length - 1];
      if (last.rejectReason) angleDbgRef.current.lastReject = last.rejectReason;
    }
    // ── QA-Diagnose (nur Diagnosemodus): eine Zeile je Kandidat, inklusive
    // Motion-Turn-Evidenz, falls Core Motion mitläuft. Rein beobachtend.
    if (qaRef.current && diagnostics.length) {
      const last = diagnostics[diagnostics.length - 1];
      const changed = last.rejectReason !== qaLastRejectRef.current;
      qaLastRejectRef.current = last.rejectReason;
      if (changed || last.classification) {
        const ev = motionActiveRef.current && last.t != null
          ? motionBufRef.current.evidenceForTrailing(last.t)
          : null;
        // Confidence-Rechenweg sichtbar machen: vorher + Motion = nachher → Entscheidung.
        const before = last.confidenceBeforeMotion;
        const adj = last.motionAdjustment;
        const confTrail = before != null && adj != null
          ? `conf ${before.toFixed(2)} ${adj >= 0 ? '+' : '−'} motion ${Math.abs(adj).toFixed(2)} = ${last.confidence.toFixed(2)}`
          : `conf ${last.confidence.toFixed(2)}`;
        pushQaCandidateLine(
          `[gps] ${new Date(last.t ?? Date.now()).toISOString().slice(11, 19)} ` +
          `acc=${last.accuracyM?.toFixed(1) ?? '—'}m typ=${last.classification ?? '—'} ` +
          `innen=${last.interiorAngleDeg?.toFixed(1) ?? '—'}° ${confTrail} ` +
          `→ ${last.rejectReason ? `rejected (${last.rejectReason})` : 'accepted'}` +
          (ev ? ` | [motion] netYaw=${ev.netYawDeg.toFixed(1)}° gross=${ev.grossYawDeg.toFixed(1)}° ` +
            `mono=${ev.monotonicity.toFixed(2)} yawShare=${ev.yawShare.toFixed(2)} ` +
            `locomotion=${ev.locomotionSource} steps=${ev.steps} ` +
            `accelFraction=${ev.gaitAccelFraction.toFixed(2)} accelThr=${ev.gaitAccelThreshold.toFixed(2)}g ` +
            `cad=${ev.cadence?.toFixed(0) ?? '—'} state=${ev.movementState ?? '—'} ` +
            `turnEvidence=${ev.evidence?.toFixed(3) ?? '—'}` : ''),
        );
      }
    }
    for (const c of corners) {
      if (c.atM <= lastCornerAtRef.current) continue;   // schon gemeldet
      const fused = turns.find(t => t.apexIndex === c.apexIndex) ?? null;
      // Eine gepaarte (Split-Apex-)Ecke wird früh gemeldet; entdeckt der Regelpfad
      // mit mehr Punkten einen Nachbarscheitel in derselben Ecke, darf daraus keine
      // zweite Markierung werden.
      if (lastCornerRescuedRef.current && c.atM - lastCornerAtRef.current < CORNER_GAP_M) continue;
      if (fused) liveTurnsRef.current.set(c.apexIndex, fused);
      lastCornerRescuedRef.current = fused?.source === 'gps_split_apex';
      lastCornerAtRef.current = c.atM;
      // ── QA: JEDE automatisch akzeptierte Ecke bekommt genau EINE Zeile ──
      // Zuordnung über den stabilen `apexIndex` der Diagnose, nicht mehr über
      // `diagnostics[length-1]` — der gehörte praktisch nie zur bestätigten
      // Ecke, weshalb akzeptierte Winkel bisher gar nicht protokolliert wurden.
      if (qaRef.current) {
        const d = diagnostics.find(x => x.apexIndex === c.apexIndex) ?? null;
        const ev = motionActiveRef.current && d?.t != null ? motionBufRef.current.evidenceForTrailing(d.t) : null;
        const before = d?.confidenceBeforeMotion ?? null;
        const adj = d?.motionAdjustment ?? null;
        const trail = before != null && adj != null
          ? `conf ${before.toFixed(2)} ${adj >= 0 ? '+' : '−'} motion ${Math.abs(adj).toFixed(2)} = ${(d?.confidence ?? 0).toFixed(2)}`
          : `conf ${(d?.confidence ?? 0).toFixed(2)}`;
        const dir = (c.kind === 'rechts' || c.kind === 'spitz_rechts') ? 'rechts' : 'links';
        pushQaCandidateLine(
          `AUTO ${new Date(d?.t ?? Date.now()).toISOString().slice(11, 19)} ` +
          `idx=${c.apexIndex} ${c.kind} (${dir}) src=${fused?.source ?? 'gps'} sharp=${fused?.sharpness ?? '—'} ` +
          `geo=${fused?.geometryQualityLevel ?? '—'}/${fused?.accuracyToLegRatio ?? '—'} ` +
          `innen=${d?.interiorAngleDeg?.toFixed(1) ?? '—'}° ` +
          `acc=${d?.accuracyM?.toFixed(1) ?? '—'}m ${trail} → accepted` +
          (ev ? ` | turnEvidence=${ev.evidence?.toFixed(3) ?? '—'} locomotion=${ev.locomotionSource} ` +
            `steps=${ev.steps} accelFraction=${ev.gaitAccelFraction.toFixed(2)} ` +
            `netYaw=${ev.netYawDeg.toFixed(1)}° mono=${ev.monotonicity.toFixed(2)} yawShare=${ev.yawShare.toFixed(2)}` : ''),
        );
      }
      const dbg = angleDbgRef.current;
      dbg.count++;
      if (c.kind === 'spitz_rechts' || c.kind === 'spitz_links') dbg.acuteCount++;
      dbg.lastType = c.kind;
      dbg.lastDir = (c.kind === 'rechts' || c.kind === 'spitz_rechts') ? 'rechts' : 'links';
      dbg.lastReject = null;
      const p = detectPointsRef.current[c.apexIndex];
      const now = Date.now();
      void commitMarker({
        id: `angle-${now}-${c.kind}`, type: 'winkel', material: null, angleKind: c.kind,
        lat: p.lat, lng: p.lng, accuracy: p.accuracy,
        distance_from_start: Math.round(c.atM * 10) / 10,
        note: null, audio_url: null, found: false, t: now,
      }, { source: fused?.source === 'gps_split_apex' ? 'auto_split_apex' : 'auto', scale: 'detector', apexIndex: c.apexIndex });
      onAngleRef.current?.(c.kind);
      committed.push({ kind: c.kind, atM: c.atM, apexIndex: c.apexIndex, source: fused?.source === 'gps_split_apex' ? 'auto_split_apex' : 'auto' });
    }
    return committed;
  };

  const detectCorner = (): LayCornerEvent[] => {
    // BUILD40: unveränderte historische Einzelschuss-Erkennung.
    if (getTrackingEngineMode() === 'build40') { return persistLegacyCorner(pointsRef.current); }
    // CURRENT: adaptive Short-Leg-Erkennung auf dem dichteren Detektor-Puffer.
    // Die frühere, an LEG_MIN_M = 4 m gebundene Confirmation-Kaskade
    // (feedCornerBuffer/classifyCornerCandidate) konnte Schenkel unter 4 m
    // strukturell nie bestätigen — nachgerechnet, siehe
    // shortLegCornerDetection.ts. autoCornerDetection/cornerConfirmation
    // bleiben als Module unverändert bestehen (weiterhin getestet), werden
    // hier aber nicht mehr aufgerufen.
    return persistShortLegCorners();
  };

  // Start-Lock verarbeiten. Gibt true zurück, sobald in DIESEM Fix freigegeben
  // wurde (der Anker ist dann als erster Linienpunkt gesetzt → Fix läuft normal
  // weiter). Solange false: Stabilisieren, KEINE Linie/Distanz.
  const handleStartLock = (raw: Raw): boolean => {
    const s = store.getState();
    const now = raw.t;
    const elapsed = now - startLockBeganRef.current;

    // Gute Fixes für den Anker sammeln (nur akzeptable Genauigkeit).
    const previousAccepted = startFixesRef.current[startFixesRef.current.length - 1];
    const distinct = !previousAccepted || raw.t > previousAccepted.t;
    const fresh = raw.t <= now && now - raw.t <= START_FIX_MAX_AGE_MS;
    const plausibleSpeed = !previousAccepted || (distinct
      && calculateDistance(previousAccepted, raw) / ((raw.t - previousAccepted.t) / 1000) <= MAX_SPEED_MPS);
    if (raw.accuracy != null && raw.accuracy <= START_ANCHOR_MAX_ACC_M && fresh && distinct && plausibleSpeed) {
      startFixesRef.current.push({ lat: raw.lat, lng: raw.lng, accuracy: raw.accuracy, t: raw.t });
    }
    // Anker = Median der guten Fixes, sobald genug beisammen sind.
    if (!startAnchorRef.current && startFixesRef.current.length >= START_ANCHOR_MIN_FIXES) {
      const m = medianLatLng(startFixesRef.current);
      if (m) {
        startAnchorRef.current = m;
        startAnchorAccRef.current = calculateAverageAccuracy(startFixesRef.current.map(f => f.accuracy));
        s.setStartAnchor({ lat: m.lat, lng: m.lng, accuracy: startAnchorAccRef.current, t: now });
      }
    }

    const anchor = startAnchorRef.current;
    const gaitSamples = motionBufRef.current.samplesIn(startLockBeganRef.current, now);
    const movement = confirmLayMovement({ anchor, anchorAccuracyM: startAnchorAccRef.current,
      acceptedFixes: startFixesRef.current,
      gaitSamples,
      sessionStartedMs: startLockBeganRef.current, nowMs: now, fallbackAfterMs: START_LOCK_MAX_MS });
    if (anchor && movement.displacementM != null && movement.displacementM > MIN_STEP_M && !movement.confirmed) {
      startDriftRejRef.current++; s.setStartDriftRejectedCount(startDriftRejRef.current);
    }
    const moved = movement.confirmed && movement.source !== 'fallback';
    if (moved) startupRef.current!.movementConfirmedTSec ??= startupSec();
    startupRef.current!.movementConfirmationSource = movement.source;
    startupRef.current!.movementConfirmationConfidence = movement.confidence;
    startupRef.current!.movementGpsDisplacementM = movement.displacementM;
    startupRef.current!.movementStepDelta = movement.stepDelta;
    startupRef.current!.movementMotionState = movement.motionState;

    const blocker = layStartBlockingReason({ anchorReady: !!anchor, movementConfirmed: moved,
      elapsedMs: elapsed, maximumMs: START_LOCK_MAX_MS });
    startupRef.current!.blockingReason = blocker;
    if (qaRef.current && startupRef.current!.recordingSessionStartedTSec != null) {
      const startupMovement = startupMovementRef.current;
      const walking = gaitSamples.filter(g => g.movementState === 'walking' || g.movementState === 'running');
      const accelEvidence = walking.length
        ? walking.filter(g => g.accelerationMagnitude >= 0.1).length / walking.length : 0;
      const tSec = Math.max(0, (now - startLockBeganRef.current) / 1000);
      const recorded = boundedPush(startupMovement.samples, {
        tSec, accuracyM: raw.accuracy ?? null,
        acceptedFix: !!(raw.accuracy != null && raw.accuracy <= START_ANCHOR_MAX_ACC_M && fresh && distinct && plausibleSpeed),
        displacementFromAnchorM: movement.displacementM,
        cumulativeStepDelta: movement.stepDelta, motionState: movement.motionState,
        locomotionEvidence: movement.stepDelta > 0 ? 'steps'
          : accelEvidence >= TURN_EVIDENCE_DEFAULTS.gaitAccelMinFraction ? 'gait_accel' : 'none',
        accelerationEvidence: Math.round(accelEvidence * 1000) / 1000,
        candidateSource: movement.source, confirmed: movement.confirmed,
        rejectionReason: blocker ?? (!anchor ? 'anchor_unavailable' : !movement.confirmed ? 'movement_unconfirmed' : null),
      }, 100);
      if (!recorded) startupMovement.truncated = true;
      if (movement.confirmed && startupMovement.confirmationTSec == null) {
        startupMovement.confirmationTSec = tSec;
        startupMovement.confirmationSource = movement.source;
        startupMovement.confirmationConfidence = movement.confidence;
        startupMovement.fallbackUsed = movement.source === 'fallback';
      }
    }
    if (blocker) return false;

    // Kein Fallback auf einen unbrauchbaren Fix: der Anker muss aus guten Fixes stammen.
    const a = startAnchorRef.current;
    if (!a) return false;

    // Start-Lock beenden und den Anker als ERSTEN Linienpunkt setzen.
    startLockRef.current = false;
    s.setStartLockActive(false);
    if (startupRef.current!.actualRecordingStartTSec == null) {
      startupRef.current!.actualRecordingStartTSec = startupSec();
      startupRef.current!.geometryStartedTSec = startupRef.current!.actualRecordingStartTSec;
      const sessionStart = startupRef.current!.recordingSessionStartedTSec;
      startupRef.current!.geometryLockDelayMs = sessionStart == null ? null
        : Math.max(0, Math.round((startupRef.current!.geometryStartedTSec! - sessionStart) * 1000));
      startupRef.current!.fallbackUsed = movement.source === 'fallback';
      startupRef.current!.accuracyAtStartM = startAnchorAccRef.current;
      const tap = startupRef.current!.userTapStartTSec;
      startupRef.current!.startupDelayMs = tap == null ? null : Math.max(0, Math.round((startupRef.current!.actualRecordingStartTSec! - tap) * 1000));
      startupRef.current!.blockingReason = null;
    }
    const p0: AcceptedPoint = { lat: a.lat, lng: a.lng, t: now, accuracy: startAnchorAccRef.current, cumDist: 0 };
    pointsRef.current = [p0];
    canonDistRef.current.start({ lat: p0.lat, lng: p0.lng });
    lastRawRef.current = raw;
    s.addTrackPoint({ lat: p0.lat, lng: p0.lng, accuracy: p0.accuracy, altitude: null, speed: null, heading: null, t: now });
    ptBuffer.current.push({
      latitude: p0.lat, longitude: p0.lng, accuracy: p0.accuracy ?? null,
      altitude: null, speed: null, heading: null, timestamp: new Date(now).toISOString(),
    });
    void recordBackgroundLayEvent(localSessionId.current, 'onFixAccepted').catch(() => {});
    return true;
  };

  // EIN Fix-Handler für Warmup UND Aufnahme.
  const runFix = (loc: Location.LocationObject, out: LayFixResult) => {
    startupRef.current!.firstRawFixTSec ??= startupSec();
    if (loc.coords.accuracy != null && loc.coords.accuracy <= START_ANCHOR_MAX_ACC_M)
      startupRef.current!.firstStableFixTSec ??= startupSec();
    const c = loc.coords;
    const s = store.getState();
    const raw: Raw = {
      lat: c.latitude, lng: c.longitude, accuracy: c.accuracy ?? null,
      altitude: c.altitude ?? null, speed: c.speed ?? null, t: loc.timestamp || Date.now(),
    };
    if (__DEV__) console.log('[trackRecorder] fix', { accuracy: raw.accuracy, recording: recordingRef.current });

    // ── QA-Mitschnitt: JEDER eingegangene Rohfix, vor allen Gates. Nur im
    // Diagnosemodus; ausserhalb passiert hier nichts. ──
    if (qaRef.current) {
      if (!qaOriginRef.current) qaOriginRef.current = { lat: raw.lat, lng: raw.lng, t: raw.t };
      qaRawCountRef.current++;
      qaRawFixesRef.current.push(qaRel(raw.lat, raw.lng, raw.t, raw.accuracy));
    }

    // EMA-Glättung der Position — IMMER (Warmup wie Aufnahme). So folgt der
    // Live-Puck stets der echten Position und friert NIE ein, auch bei mässigem
    // GPS. Der Genauigkeits-/Speed-Filter blockt nur das Setzen von LINIEN-Punkten.
    // Turn-aware: in einer Kurvenzone (CURRENT) glättet die Linie leichter, damit
    // eine Ecke nicht über ~2 m abgerundet wird; sonst unverändert EMA_ALPHA.
    const lineAlpha = getTrackingEngineMode() === 'build40' ? EMA_ALPHA : lineEmaAlpha(lineTurnZoneRef.current);
    // Kanonische Kette (Start-Lock + Distanz): unverändert EMA_ALPHA.
    const prevEma = emaRef.current;
    const ema: LatLng = prevEma
      ? { lat: prevEma.lat + (raw.lat - prevEma.lat) * EMA_ALPHA, lng: prevEma.lng + (raw.lng - prevEma.lng) * EMA_ALPHA }
      : { lat: raw.lat, lng: raw.lng };
    emaRef.current = ema;
    // Geometrie-Kette der LINIE (turn-aware, s. o.).
    const prevLine = lineEmaRef.current;
    const lineEma: LatLng = prevLine
      ? { lat: prevLine.lat + (raw.lat - prevLine.lat) * lineAlpha, lng: prevLine.lng + (raw.lng - prevLine.lng) * lineAlpha }
      : { lat: raw.lat, lng: raw.lng };
    lineEmaRef.current = lineEma;

    // Live-Puck getrennt und LEICHTER glätten (PUCK_ALPHA > EMA_ALPHA): er folgt
    // der echten Position deutlich flotter (weniger „hinkt nach"), während die
    // aufgezeichnete Linie unten weiter mit dem trägen EMA ruhig bleibt.
    const prevPuck = puckRef.current;
    const puck: LatLng = prevPuck
      ? { lat: prevPuck.lat + (raw.lat - prevPuck.lat) * PUCK_ALPHA, lng: prevPuck.lng + (raw.lng - prevPuck.lng) * PUCK_ALPHA }
      : { lat: raw.lat, lng: raw.lng };
    puckRef.current = puck;
    s.setCurrentPosition(puck, raw.accuracy);

    // Ab hier nur die aufgezeichnete LINIE.
    out.outcome = recordingRef.current ? 'paused' : 'warmup';
    if (!recordingRef.current || s.isPaused) return;
    void recordBackgroundLayEvent(localSessionId.current, 'onFixReceived').catch(() => {});

    // ── Start-Lock: bis echte Bewegung KEINE Linie/Distanz/Winkel. Verhindert,
    //    dass Warmup-/Startdrift (auf iPhone real ~8 m im Stand) als Strecke landet.
    //    Bei Freigabe ist der Anker als erster Linienpunkt gesetzt → Fix läuft weiter.
    out.outcome = 'rejected'; out.rejectReason = 'start_lock_active';
    if (startLockRef.current) {
      if (!handleStartLock(raw)) {
        void recordBackgroundLayEvent(localSessionId.current, 'onFixRejected', 1, 'start_lock_active').catch(() => {});
        angleDbgRef.current.lastReject = 'start_lock_active'; return;
      }   // noch am Stabilisieren
      out.anchorReleased = true;
    }

    // ── GPS Quality Engine: JEDEN Fix (accepted, distanz-gated oder rejected) in das
    //    Rolling Window geben. Reine Kontextbewertung — ändert Geometrie/Reject nicht.
    {
      const prevQ = lastRawRef.current;
      const qDist = prevQ ? calculateDistance(prevQ, raw) : null;
      const qDt = prevQ ? raw.t - prevQ.t : null;
      const accReject = raw.accuracy == null || raw.accuracy > MAX_ACCURACY_M;
      const jumpReject = !accReject && !!prevQ && qDt != null && qDt > 0 && (qDist as number) / (qDt / 1000) > MAX_SPEED_MPS;
      const qState = gpsQualityRef.current.observe({
        t: raw.t, accuracy: raw.accuracy, distFromPrevM: qDist, dtMs: qDt,
        rejected: accReject || jumpReject,
        rejectReason: accReject ? 'accuracy' : jumpReject ? 'jump' : null,
        speedMps: raw.speed,
      });
      if (__DEV__) logGpsQualityChange(gpsQualityStateRef.current, qState);
      gpsQualityStateRef.current = qState;
    }

    // 1) Zu ungenauer / unrealistischer Fix → kein Linienpunkt (Puck steht schon).
    out.rejectReason = 'accuracy';
    if (raw.accuracy == null || raw.accuracy > MAX_ACCURACY_M) {
      void recordBackgroundLayEvent(localSessionId.current, 'onFixRejected', 1, 'accuracy').catch(() => {});
      rejectedRef.current++; return;
    }
    const prevRaw = lastRawRef.current;
    if (prevRaw) {
      out.rejectReason = 'gps_outlier';
      const d = calculateDistance(prevRaw, raw);
      const dt = (raw.t - prevRaw.t) / 1000;
      if (dt > 0 && d / dt > MAX_SPEED_MPS) {
        void recordBackgroundLayEvent(localSessionId.current, 'onFixRejected', 1, 'gps_outlier').catch(() => {});
        rejectedRef.current++; return;
      }   // unrealistischer Sprung
    }
    lastRawRef.current = raw;
    if (qaRef.current) qaAcceptedCountRef.current++;

    // ── Detektor-Puffer fortschreiben (nur Winkel-Erkennung, siehe oben) ──
    {
      const a = DETECTOR_INPUT.emaAlpha;
      const prevD = detectEmaRef.current;
      const dEma: LatLng = prevD
        ? { lat: prevD.lat + (raw.lat - prevD.lat) * a, lng: prevD.lng + (raw.lng - prevD.lng) * a }
        : { lat: raw.lat, lng: raw.lng };
      detectEmaRef.current = dEma;
      const dPts = detectPointsRef.current;
      const dLast = dPts[dPts.length - 1];
      const dStep = dLast ? calculateDistance(dLast, dEma) : 0;
      if (!dLast || dStep >= DETECTOR_INPUT.minStepM) {
        dPts.push({ lat: dEma.lat, lng: dEma.lng, cumDist: (dLast?.cumDist ?? 0) + dStep, accuracy: raw.accuracy, t: raw.t });
      }
      // Rohfix-Ring für den Stop-Flush (ungeglättet, kein Gate). Nur die
      // letzten Meter werden gebraucht — bewusst klein gehalten.
      const rt = rawTailRef.current;
      const rLast = rt[rt.length - 1];
      const rStep = rLast ? calculateDistance(rLast, { lat: raw.lat, lng: raw.lng }) : 0;
      rt.push({ lat: raw.lat, lng: raw.lng, cumDist: (rLast?.cumDist ?? 0) + rStep, accuracy: raw.accuracy, t: raw.t });
      if (rt.length > 60) rt.splice(0, rt.length - 60);
      // Kurvenzone für Linien-Gate (dieser Fix) und Linien-Glättung (nächster Fix).
      lineTurnZoneRef.current = inTurnZone(dPts, lastCornerAtRef.current);
    }

    // 3) Distanz-Gate: erst ab MIN_STEP_M einen neuen Linienpunkt setzen.
    // Kanonische Distanz: exakt die bisherige Semantik (EMA 0,4 / Gate 2,0 m),
    // unabhängig davon, wie dicht die Geometrie unten persistiert wird.
    {
      const before = canonDistRef.current.total;
      const total = canonDistRef.current.push(ema);
      if (total !== before) store.getState().setDistanceMeters(total);
    }
    const pts = pointsRef.current;
    const last = pts[pts.length - 1];
    const step = last ? calculateDistance(last, lineEma) : 0;
    // Turn-aware Gate (CURRENT): 2,0 m auf gerader Strecke wie bisher, in der
    // Kurvenzone dichter (turnAwareLineGate.ts). BUILD40 bleibt beim festen Gate.
    const gateM = getTrackingEngineMode() === 'build40' ? MIN_STEP_M : lineGateStepM(detectPointsRef.current, lastCornerAtRef.current);
    out.rejectReason = 'distance_gate';
    if (last && step < gateM) {
      void recordBackgroundLayEvent(localSessionId.current, 'onFixRejected', 1, 'distance_gate').catch(() => {});
      return;
    }

    const accepted: AcceptedPoint = {
      lat: lineEma.lat, lng: lineEma.lng, t: raw.t, accuracy: raw.accuracy,
      cumDist: (last?.cumDist ?? 0) + step,
    };
    pts.push(accepted);
    out.outcome = 'accepted'; out.rejectReason = null; out.acceptedPoint = accepted;
    void recordBackgroundLayEvent(localSessionId.current, 'onFixAccepted').catch(() => {});
    startupRef.current!.firstAcceptedFixTSec ??= startupSec();

    const sample: TrackPointSample = {
      lat: accepted.lat, lng: accepted.lng, accuracy: accepted.accuracy,
      altitude: raw.altitude, speed: raw.speed, heading: null, t: accepted.t,
    };
    s.addTrackPoint(sample, { skipDistance: true });   // Distanz kommt aus canonDistRef (Punktdichte-unabhängig); Store aktualisiert Qualität
    ptBuffer.current.push({
      latitude: sample.lat, longitude: sample.lng, accuracy: sample.accuracy ?? null,
      altitude: sample.altitude ?? null, speed: sample.speed ?? null, heading: null,
      timestamp: new Date(sample.t).toISOString(),
    });
    if (ptBuffer.current.length >= 25) void flushPoints();

    // 4) Winkel-Erkennung auf der frischen Linie (nur wenn aktiviert).
    // Abriss wird bewusst nur manuell gesetzt, weil das Halt-Muster im Feld zu
    // fehleranfällig ist.
    if (autoDetectRef.current) {
      out.corners = detectCorner();
    }
  };

  /** Einen Fix verarbeiten — synchron, wie bisher der Fix-Handler im Hook. */
  const processFix = (loc: Location.LocationObject): LayFixResult => {
    const out: LayFixResult = {
      outcome: 'warmup', rejectReason: null, anchorReleased: false, acceptedPoint: null,
      corners: [], distanceM: 0, rejectedCount: 0,
    };
    runFix(loc, out);
    out.distanceM = canonDistRef.current.total;
    out.rejectedCount = rejectedRef.current;
    return out;
  };

  return { processFix, qaRel };
}
