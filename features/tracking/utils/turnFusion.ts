// ──────────────────────────────────────────────────────────────────────────
// Turn-Fusion: GPS-Kandidaten ∪ IMU-Evidenz → Richtung / Schärfe / Confidence.
//
// STELLUNG IM SYSTEM (T-TRACK-FUSION-QUALITY-2026-09-30, §3):
//
//   GPS-Kandidaten ─┐
//                   ├─►  fuseTurns  ─►  Direction ─► Sharpness ─► Confidence ─► Persistenz
//   IMU-Evidenz   ──┘
//
// `evaluateShortLegCorner()` bleibt UNVERÄNDERT streng: no_window_before/after
// kann dort durch Motion niemals gerettet werden (Invariante in
// motionConfidenceCoupling.test.ts — die Schutzschicht gegen Tail-Fehlalarme).
// Alles, was darüber hinausgeht, lebt HIER, in einer eigenständig gegateten
// Stufe mit eigenem `source` in der Telemetrie.
//
// Was diese Stufe tut:
//   1. DIREKTION und SCHÄRFE sind getrennte Grössen. Die Richtung kommt aus dem
//      GPS-Vorzeichen. Nur bei schwacher, bereits vorhandener GPS-Ecke kann
//      starke gerichtete Motion die Richtung übersteuern (Telemetrie:
//      motion_override_low_geometry). Das ist kein Beweis gegen Handyrotation.
//      „spitz" ist eine Behauptung über den Winkel und braucht belegbare
//      GPS-Geometrie (turnGeometryQuality). Motion trägt zu Existenz,
//      Richtungsbestätigung/-widerspruch und Motion-Qualität bei — NIE zur
//      Schärfe.
//   2. SPLIT-APEX-RESCUE (rein geometrisch, GPS): ein einziges Wackel-Segment
//      direkt am Scheitel lässt KEINEN der beiden Nachbarpunkte beide Fenster
//      bekommen (F1: vor Punkt 22 sauber, nach Punkt 23 sauber, dazwischen ein
//      0,66-m-Segment mit 244°). Gepaart wird deshalb Vorher-Fenster(i) mit
//      Nachher-Fenster(i+1). Die Fenster selbst werden NICHT gelockert (≥ 2 m,
//      ≥ 3 Punkte, Streuung ≤ 26°) — am Puffer-Ende gibt es weiterhin keinen
//      Rescue, weil dort kein Nachher-Fenster existiert.
//   3. IMU-ONLY-Ereignisse (gerichtete Drehung ohne GPS-Ecke) werden nur
//      PROTOKOLLIERT (`imuOnly`), nie persistiert: ohne GPS-Beleg ist ein
//      Motion-Ereignis von Handy-Drehen im Gehen nicht zu unterscheiden
//      (motionTurnEvidenceBenchmark: „geradeaus + Handy um 90° drehen" = 1,00).
//
// Reine Funktion, kein React/Native.
// ──────────────────────────────────────────────────────────────────────────
import { confirmLocalDirections, type LocalDirectionState } from './localDirectionConfirmation';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import {
  detectShortLegCorners, legWindows, stableLegWindow, spitzConsensus, meanBearing, nearIndex, normalizeDeg, clamp01, cornerConfidence,
  ACCEPT_SCORE, SCALES_M, MIN_LEG_M, MIN_SAMPLES_SHORT, CORNER_GAP_M, MIN_TURN_DEG, MIN_TURN_TO_NOISE, NORMAL_MIN, NORMAL_MAX, SPITZ_MIN, SPITZ_MAX,
  TURN_CONCENTRATION_M, STRAIGHT_TOL_DEG,
  type ShortLegPoint, type ShortLegDiagnostics, type TurnEvidenceLookup, type LegWindow,
  type DirectionalTurnEvidenceLookup,
} from '@/features/tracking/utils/shortLegCornerDetection';
import {
  computeTurnEvidence, motionTurnDirection, TURN_EVIDENCE_DEFAULTS,
  type MotionWindowSample, type TurnEvidence,
} from '@/features/tracking/utils/motionTurnEvidence';
import { turnGeometryQuality, type GeometryQualityLevel } from '@/features/tracking/utils/turnGeometryQuality';

// ── Parameter ─────────────────────────────────────────────────────────────
/** Split-Apex: höchstens ein Segment (m) zwischen Vorher- und Nachher-Scheitel. */
export const SPLIT_APEX_MAX_GAP_M = 1.0;
/** Split-Apex ist strenger als der Regelpfad: nur echte Ecken, keine sanften Bögen. */
export const RESCUE_MIN_TURN_DEG = 60;
export const RESCUE_MAX_SPREAD_DEG = 18;
export const RESCUE_MAX_RESIDUAL_M = 0.6;
export const RESCUE_MIN_CONCENTRATION = 0.6;
export const RESCUE_MIN_SAMPLES = 3;
/** Abschlag auf die Confidence eines gepaarten Scheitels (er ist ein Indiz, kein Regelfall). */
export const RESCUE_CONFIDENCE_FACTOR = 0.9;
/** Gleichgerichtete IMU-Bestätigung hebt die Rescue-Confidence um höchstens so viel. */
export const RESCUE_MOTION_BONUS = 0.06;
/** IMU-Ereignisse gelten als „ohne GPS-Ecke", wenn keine Ecke näher als so viele Sekunden liegt. */
export const IMU_ONLY_MATCH_S = 3.0;
/** Mindest-Evidenz, ab der ein IMU-Ereignis überhaupt protokolliert wird. */
export const IMU_EVENT_MIN_EVIDENCE = 0.5;
export const MOTION_EPISODE_ASSOCIATION_OFFSETS_MS = [0, -500, 500, -1000, 1000, -1500, 1500] as const;
export const MOTION_EVENT_REUSE_GUARD_MS = 1_500;

export type TurnSharpness = 'normal' | 'spitz' | 'unresolved';
export type TurnSource = 'gps' | 'gps_split_apex';

export interface FusedTurnMotion {
  available: boolean;
  signedNetYawDeg: number | null;
  netYawDeg: number | null;
  evidence: number | null;
  direction: 'links' | 'rechts' | null;
  /** true/false = bestätigt/widerspricht der Richtung; null = Motion nennt keine. */
  directionAgrees: boolean | null;
  /** |netYaw| ÷ |GPS-Winkel|. */
  magnitudeRatio: number | null;
}

/** Eine fusionierte Ecke — genau die QA-Telemetrie aus Vorgabe §17. */
export interface FusedTurn {
  apexIndex: number;
  atM: number;
  t: number | null;
  source: TurnSource;
  direction: 'links' | 'rechts';
  directionSource?: 'gps' | 'motion_override_low_geometry';
  motionAssociationSource?: 'live_cached' | 'accepted_live_turn' | 'current_ring' | 'nearest_episode' | 'none';
  /** Internal time anchor for enforcing one GPS association per Motion episode. */
  motionAssociationTimeMs?: number | null;
  sharpness: TurnSharpness;
  /** Persistierter Wert (`angleKind`); `unresolved` wird als normale Ecke gespeichert. */
  kind: AngleKind;
  /** Erkennungs-Confidence (existiert die Ecke?). */
  confidence: number;
  confidenceBeforeMotion: number | null;
  motionAdjustment: number | null;
  /** Wie belastbar ist die Schärfe? 0..1 — getrennt von `confidence`. */
  sharpnessConfidence: number;
  headingDeltaDeg: number | null;
  interiorAngleDeg: number | null;
  accuracyM: number | null;
  legBeforeM: number | null;
  legAfterM: number | null;
  geometryQuality: number | null;
  geometryQualityLevel: GeometryQualityLevel | null;
  accuracyToLegRatio: number | null;
  motion: FusedTurnMotion;
  /** Warum diese Entscheidung — für QA lesbar. */
  flags: string[];
}

export interface ImuOnlyEvent {
  t: number;
  direction: 'links' | 'rechts' | null;
  signedNetYawDeg: number;
  evidence: number;
  /** Immer false: IMU-only wird nie persistiert. */
  persisted: false;
  reason: 'imu_only_no_gps_corner';
}

export interface FusionResult {
  /** Gleiche Form wie `detectShortLegCorners().corners` — Drop-in für Recorder/Stop-Flush. */
  corners: { kind: AngleKind; apexIndex: number; atM: number }[];
  diagnostics: ShortLegDiagnostics[];
  detectorPointCount: number;
  turns: FusedTurn[];
  imuOnly: ImuOnlyEvent[];
  /** Anzahl der durch Split-Apex zusätzlich gefundenen Ecken. */
  rescued: number;
}

/** Finish reconstruction may outlive the 20-second Motion ring. Prefer the
 * actual live fusion for the same GPS apex; a unique close timestamp is only
 * a fallback. Never creates an additional corner. */
export function associateLiveTurn(reconstructed: FusedTurn, live: readonly FusedTurn[]): FusedTurn {
  const exact = live.find(t => t.apexIndex === reconstructed.apexIndex);
  const close = reconstructed.t == null ? []
    : live.filter(t => t.t != null && Math.abs(t.t - reconstructed.t!) <= 750);
  const associated = exact ?? (close.length === 1 ? close[0] : null);
  if (!associated?.motion.available || reconstructed.motion.available) return reconstructed;
  // Restore only evidence lost from the bounded Motion ring. The GPS corner,
  // geometry and persisted kind remain those of the finish reconstruction.
  return { ...reconstructed, motion: associated.motion };
}

export interface FuseOptions {
  /** Session-owned delayed confirmation; omitted for historical/offline sweeps. */
  localDirectionState?: LocalDirectionState;
  /** Turn-Evidenz-Lookup (wie im Detektor) — bestätigt/widerspricht Richtung, stützt Schärfe. */
  turnEvidenceAt?: TurnEvidenceLookup;
  /** A bounded nearest-episode lookup; compatible GPS direction is required. */
  turnEvidenceForDirection?: DirectionalTurnEvidenceLookup;
  /** Rohe Motion-Samples für IMU-only-Protokollierung. Optional. */
  motionSamples?: readonly MotionWindowSample[];
  /** Split-Apex-Rescue. Default: an. */
  splitApexRescue?: boolean;
}

/** Choose the strongest direction-compatible motion window in a bounded
 * ±1.5 s episode around an existing GPS candidate. Motion remains a lookup;
 * this helper cannot create a GPS candidate. */
export function nearestCompatibleTurnEvidence(
  tMs: number | null, gpsDirection: 'links' | 'rechts', lookup?: TurnEvidenceLookup,
): TurnEvidence | null {
  if (tMs == null || !lookup) return null;
  const windows: { offset: number; ev: TurnEvidence }[] = [];
  for (const offset of MOTION_EPISODE_ASSOCIATION_OFFSETS_MS) {
    const ev = lookup(tMs + offset);
    if (ev?.available && (ev.evidence ?? 0) >= 0.5
      && (ev.locomotionSource !== 'none' || ev.steps > 0)) windows.push({ offset, ev });
  }
  windows.sort((a, b) => {
    const aMatch = motionTurnDirection(a.ev) === gpsDirection ? 1 : 0;
    const bMatch = motionTurnDirection(b.ev) === gpsDirection ? 1 : 0;
    return bMatch - aMatch || (b.ev.evidence ?? 0) - (a.ev.evidence ?? 0) || Math.abs(a.offset) - Math.abs(b.offset);
  });
  return windows[0]?.ev ?? null;
}

// ── Hilfen ────────────────────────────────────────────────────────────────
function motionView(ev: TurnEvidence | null | undefined, dir: 'links' | 'rechts', magnitudeDeg: number): FusedTurnMotion {
  if (!ev || !ev.available) {
    return { available: false, signedNetYawDeg: null, netYawDeg: null, evidence: null, direction: null, directionAgrees: null, magnitudeRatio: null };
  }
  const md = motionTurnDirection(ev);
  return {
    available: true,
    signedNetYawDeg: Math.round(ev.signedNetYawDeg * 10) / 10,
    netYawDeg: Math.round(ev.netYawDeg * 10) / 10,
    evidence: ev.evidence == null ? null : Math.round(ev.evidence * 1000) / 1000,
    direction: md,
    directionAgrees: md == null ? null : md === dir,
    magnitudeRatio: magnitudeDeg > 0 ? Math.round((ev.netYawDeg / magnitudeDeg) * 1000) / 1000 : null,
  };
}

function kindFor(dir: 'links' | 'rechts', sharpness: TurnSharpness): AngleKind {
  if (sharpness === 'spitz') return dir === 'rechts' ? 'spitz_rechts' : 'spitz_links';
  return dir;
}

/**
 * Belastbarkeit der Schärfe (0..1): Geometrie-Qualität, gestützt bzw. gedämpft
 * durch Motion. Nie ein Beleg für die Existenz der Ecke.
 */
function sharpnessConfidence(quality: number | null, sharpness: TurnSharpness): number {
  if (sharpness === 'unresolved') return 0.25;
  return Math.round(clamp01(quality ?? 0.5) * 1000) / 1000;
}

function turnFromDiag(d: ShortLegDiagnostics, atM: number, ev: TurnEvidence | null, nearestEpisodeLookup = false): FusedTurn {
  const gpsDir = d.direction ?? ((d.headingDeltaDeg ?? 0) > 0 ? 'rechts' : 'links');
  const magnitude = Math.abs(d.headingDeltaDeg ?? 0);
  const flags: string[] = [];
  const sharpness: TurnSharpness = d.sharpness ?? 'normal';
  const motion = motionView(ev, gpsDir, magnitude);
  // Only an existing GPS corner may be corrected. Poor geometry plus strong,
  // directional motion can resolve a sign conflict; GPS still sets sharpness.
  const override = !!d.motionDirectionOverride || (d.geometryQualityLevel === 'low' && (d.geometryQuality ?? 1) < 0.4
    && (d.accuracyToLegRatio ?? 0) >= 2 && motion.available
    && motion.direction != null && motion.direction !== gpsDir
    && (ev?.evidence ?? 0) >= 0.95 && (ev?.monotonicity ?? 0) >= 0.9
    && (ev?.yawShare ?? 0) >= 0.7
    && (ev?.movementState === 'walking' || ev?.movementState === 'running'));
  const dir = override ? motion.direction! : gpsDir;
  const directionSource = override ? 'motion_override_low_geometry' : 'gps';

  if (d.sharpnessDemoted) flags.push('sharpness_demoted_low_geometry');
  if (d.sharpnessNoConsensus) flags.push('sharpness_no_consensus');
  if (motion.directionAgrees === false) flags.push('motion_direction_conflict');
  if (override) flags.push('motion_direction_override_low_geometry');
  if (d.motionBoostSuppressed) flags.push('motion_boost_suppressed');

  // Motion bestimmt die SCHÄRFE nie: Netto-Yaw ist kein Winkelmass (reale
  // 90°-Ecken 32–81°, reale Spitzwinkel 82–98°). Sharpness kommt ausschliesslich
  // aus der GPS-Geometrie: auflösbar → GPS-Klasse, nicht auflösbar → 'unresolved'.
  const finalKind = kindFor(dir, sharpness === 'unresolved' ? 'normal' : sharpness);
  return {
    apexIndex: d.apexIndex, atM, t: d.t, source: d.fusionSource === 'gps_split_apex' ? 'gps_split_apex' : 'gps',
    direction: dir, directionSource,
    motionAssociationSource: nearestEpisodeLookup && ev?.available && d.t != null
      && Math.abs((ev.windowStartMs + ev.windowEndMs) / 2 - d.t) >= 250 ? 'nearest_episode'
      : ev?.available ? 'current_ring' : 'none',
    motionAssociationTimeMs: ev?.available ? (ev.windowStartMs + ev.windowEndMs) / 2 : null,
    sharpness, kind: finalKind,
    confidence: d.confidence, confidenceBeforeMotion: d.confidenceBeforeMotion, motionAdjustment: d.motionAdjustment,
    sharpnessConfidence: sharpnessConfidence(d.geometryQuality, sharpness),
    headingDeltaDeg: d.headingDeltaDeg, interiorAngleDeg: d.interiorAngleDeg, accuracyM: d.accuracyM,
    legBeforeM: d.legBeforeM, legAfterM: d.legAfterM,
    geometryQuality: d.geometryQuality, geometryQualityLevel: d.geometryQualityLevel, accuracyToLegRatio: d.accuracyToLegRatio,
    motion, flags,
  };
}

/** Recover an already-measured GPS corner when its unstable near-reversal sign
 * is contradicted by strong, direction-specific walking Motion. GPS must have
 * passed the full candidate geometry gates; Motion only resolves direction.
 * The angle remains unresolved because this path has no supported sharpness
 * band. */
function recoverAmbiguousGpsCorner(d: ShortLegDiagnostics, ev: TurnEvidence | null): boolean {
  const gpsCandidateExists = d.rejectReason === 'low_evidence'
    || (d.rejectReason == null && d.classification == null && d.confidence >= ACCEPT_SCORE);
  if (!gpsCandidateExists || d.classification != null || d.direction == null
    || d.headingDeltaDeg == null || d.interiorAngleDeg == null || d.geometryQuality == null
    || d.geometryQuality >= 0.65 || (d.turnConcentrationM ?? 0) < 0.75
    || Math.abs(d.headingDeltaDeg) < 60 || (d.confidence ?? 0) < 0.5
    || !ev?.available || (ev.evidence ?? 0) < 0.95 || ev.monotonicity < 0.9 || ev.yawShare < 0.65
    || motionTurnDirection(ev) == null || motionTurnDirection(ev) === d.direction
    || (ev.locomotionSource === 'none' && ev.steps <= 0)) return false;
  // This route has no defensible geometry class. In particular, near 180° GPS
  // heading deltas are not converted into a sharp turn by Motion magnitude.
  d.direction = motionTurnDirection(ev);
  d.motionDirectionOverride = true;
  d.classification = d.direction;
  d.sharpness = 'unresolved';
  d.sharpnessDemoted = true;
  d.motionDirection = motionTurnDirection(ev);
  d.motionDirectionAgrees = true;
  d.motionBoostSuppressed = false;
  d.fusionSource = 'gps';
  d.rejectReason = null;
  return true;
}

// ── Split-Apex ────────────────────────────────────────────────────────────
interface SplitApexHit {
  apexIndex: number;
  pairIndex: number;
  /** Segmente zwischen Vorher- und Nachher-Scheitel: 1 = klassischer Split-Apex (Golden Path), 2 = Zwei-Segment-Episode. */
  span: number;
  kind: AngleKind;
  direction: 'links' | 'rechts';
  sharpness: TurnSharpness;
  confidence: number;
  confidenceBeforeMotion: number;
  motionAdjustment: number;
  headingDeltaDeg: number;
  interiorAngleDeg: number;
  before: LegWindow;
  after: LegWindow;
  concentration: number;
  geoScore: number;
  geoLevel: GeometryQualityLevel;
  ratio: number | null;
  demoted: boolean;
  consensusPairs: number | null;
  consensusMaxInterior: number | null;
  noConsensus: boolean;
  ev: TurnEvidence | null;
}

/**
 * Paarungen für den Rescue, engste zuerst:
 *   • 1 Segment  (p → p+1, ≤ SPLIT_APEX_MAX_GAP_M): ein einzelnes Wackel-Segment am Scheitel.
 *   • 2 Segmente (p → p+2, ≤ TURN_CONCENTRATION_M): eine abgerundete Ecke, deren Drehung auf
 *     zwei Segmente verteilt ist (reales F1-02: 41° → 78° → 103° → 147°). Kein einzelner
 *     Scheitel hat dann beide sauberen Fenster. Zusätzlich muss die Drehung im Übergang
 *     monoton in eine Richtung laufen — Wackeln/Drift erfüllt das nicht.
 * Je Paarung zuerst die regulären Fenster (26°), danach Fenster mit der STRENGEREN
 * Rescue-Toleranz: ein langes Fenster, das hinten in einen Nachbarbogen läuft, darf ein
 * kürzeres sauberes Fenster nicht verdecken. Es kommt nie etwas hinzu, was die
 * Rescue-Gates (Spread/Residuum/Drehung/Konzentration) nicht selbst bestehen.
 */
/**
 * NEUER Rescue-Bound (V6.2): grösste Wegstrecke zwischen Vorher- und Nachher-Scheitel einer
 * Zwei-Segment-Ecke. Bewusst KEINE freie Zahl, sondern TURN_CONCENTRATION_M (2,5 m) — dieselbe
 * Strecke, in der der Detektor überall sonst verlangt, dass eine echte Ecke ihre Drehung
 * konzentriert. Bei 0,6–1,4 m Fix-Abstand (Gehen, 1 Hz) sind das höchstens zwei Segmente; mehr
 * Verteilung wäre von Drift nicht mehr zu trennen. Der Bound hängt weder an einem Lauf noch an
 * einer Seite; Grenzfälle (knapp darunter/darüber, monoton/Zickzack, IMU stimmt/widerspricht):
 * __tests__/turnEpisodeBound.test.ts.
 */
export const EPISODE_MAX_SPAN_M = TURN_CONCENTRATION_M;

function evaluateSplitApex(
  points: readonly ShortLegPoint[], i: number, turnEvidenceAt?: TurnEvidenceLookup,
  turnEvidenceForDirection?: DirectionalTurnEvidenceLookup,
): SplitApexHit | null {
  if (i < 1) return null;
  for (const span of [1, 2]) {
    for (const tolDeg of [STRAIGHT_TOL_DEG, RESCUE_MAX_SPREAD_DEG]) {
      const hit = evaluateApexPair(points, i, i + span, tolDeg, turnEvidenceAt, turnEvidenceForDirection);
      if (hit) return hit;
    }
  }
  return null;
}

/** Every transition segment must remain inside the measured turn sector.
 * Requiring their bearings to increase monotonically rejects a real corner
 * when short GPS segments wobble while still moving forward through the turn.
 * Two segment bearings may each vary by the existing spread tolerance, so
 * their relative backtrack is limited to twice that tolerance. Larger
 * reversals still reject a zigzag, even when it fits inside the sector.
 * Metre, leg-fit, concentration and directional Motion gates remain mandatory.
 */
function transitionWithinTurnSector(points: readonly ShortLegPoint[], p: number, q: number, beforeDeg: number, headingDelta: number): boolean {
  const sign = headingDelta >= 0 ? 1 : -1;
  const total = Math.abs(headingDelta);
  let furthest = -RESCUE_MAX_SPREAD_DEG;
  for (let k = p; k < q; k++) {
    const seg = meanBearing(points, k, k + 1);
    if (!seg) continue;
    const progress = normalizeDeg(seg.deg - beforeDeg) * sign;
    if (progress < -RESCUE_MAX_SPREAD_DEG || progress > total + RESCUE_MAX_SPREAD_DEG) return false;
    if (furthest - progress > 2 * RESCUE_MAX_SPREAD_DEG) return false;
    furthest = Math.max(furthest, progress);
  }
  return true;
}

function evaluateApexPair(
  points: readonly ShortLegPoint[], p: number, q: number, tolDeg: number, turnEvidenceAt?: TurnEvidenceLookup,
  turnEvidenceForDirection?: DirectionalTurnEvidenceLookup,
): SplitApexHit | null {
  if (q > points.length - 2) return null;
  const span = q - p;
  const gap = points[q].cumDist - points[p].cumDist;
  if (!(gap > 0) || gap > (span === 1 ? SPLIT_APEX_MAX_GAP_M : EPISODE_MAX_SPAN_M)) return null;
  // Scheitel: bei einem Segment der Vorher-Punkt (unverändert), bei zwei der Mittelpunkt.
  const apexIndex = span === 1 ? p : p + 1;
  const a = points[apexIndex];

  const before = stableLegWindow(points, p, false, tolDeg);
  const after = stableLegWindow(points, q, true, tolDeg);
  if (!before || !after) return null;
  if (before.sampleCount < RESCUE_MIN_SAMPLES || after.sampleCount < RESCUE_MIN_SAMPLES) return null;
  if (Math.max(before.spreadDeg, after.spreadDeg) > RESCUE_MAX_SPREAD_DEG) return null;
  if (before.residualM > RESCUE_MAX_RESIDUAL_M || after.residualM > RESCUE_MAX_RESIDUAL_M) return null;

  const headingDelta = normalizeDeg(after.bearingDeg - before.bearingDeg);
  const magnitude = Math.abs(headingDelta);
  if (magnitude < Math.max(RESCUE_MIN_TURN_DEG, MIN_TURN_DEG)) return null;
  if (magnitude < Math.max(before.spreadDeg, after.spreadDeg, 4) * MIN_TURN_TO_NOISE) return null;
  if (span > 1 && !transitionWithinTurnSector(points, p, q, before.bearingDeg, headingDelta)) return null;

  // Konzentration: die Änderung muss unmittelbar an der Scheitel-NAHT liegen
  // (Vorher-Kurzfenster endet bei i, Nachher-Kurzfenster beginnt bei i+1).
  const shortBefore = meanBearing(points, nearIndex(points, p, false, TURN_CONCENTRATION_M), p);
  const shortAfter = meanBearing(points, q, nearIndex(points, q, true, TURN_CONCENTRATION_M));
  const shortTurn = shortBefore && shortAfter ? Math.abs(normalizeDeg(shortAfter.deg - shortBefore.deg)) : 0;
  const concentration = clamp01(shortTurn / magnitude);
  if (concentration < RESCUE_MIN_CONCENTRATION) return null;

  const interior = 180 - magnitude;
  const dir: 'links' | 'rechts' = headingDelta > 0 ? 'rechts' : 'links';
  let sharpness: TurnSharpness;
  let demoted = false;
  let consensusPairs: number | null = null;
  let consensusMaxInterior: number | null = null;
  let noConsensus = false;

  const windowAcc: (number | null)[] = [];
  for (let k = before.endIndex; k <= after.endIndex; k++) windowAcc.push(points[k].accuracy);
  const geo = turnGeometryQuality({
    legBeforeM: before.lengthM, legAfterM: after.lengthM,
    sampleCountBefore: before.sampleCount, sampleCountAfter: after.sampleCount,
    spreadBeforeDeg: before.spreadDeg, spreadAfterDeg: after.spreadDeg,
    windowAccuraciesM: windowAcc, straightTolDeg: STRAIGHT_TOL_DEG,
  });
  if (interior >= NORMAL_MIN && interior <= NORMAL_MAX) sharpness = 'normal';
  else if (interior >= SPITZ_MIN && interior <= SPITZ_MAX) {
    // Wie im Regelpfad: „spitz" braucht Auflösbarkeit UND Multi-Scale-Konsens über (p, q).
    const consensus = spitzConsensus(points, p, q);
    consensusPairs = consensus.pairs; consensusMaxInterior = consensus.maxInteriorDeg;
    if (geo.sharpnessResolvable && consensus.supported) sharpness = 'spitz';
    else { sharpness = 'unresolved'; demoted = true; noConsensus = geo.sharpnessResolvable; }
  } else if (interior > SPITZ_MAX && interior < NORMAL_MIN) {
    // Lücke zwischen den Bändern (Richtungsänderung ≈ 115–120°): weder „normal" noch „spitz"
    // belegbar. Die GPS-Ecke und ihre Richtung sind bewiesen — die Schärfe wird nicht behauptet
    // (unresolved → als normale Ecke gespeichert), statt eine belegte Ecke zu verwerfen.
    sharpness = 'unresolved';
  } else return null;   // sonst „angle_unclear": Beinahe-Umkehr oder fast gerade

  // Only motion of the same quality required for confirmation may veto GPS.
  // A handset yaw with no usable walking evidence remains neutral.
  const ev = turnEvidenceForDirection?.(a.t ?? null, dir) ?? turnEvidenceAt?.(a.t ?? null) ?? null;
  const md = ev && ev.available ? motionTurnDirection(ev) : null;
  const reliableMotion = md != null && (ev?.evidence ?? 0) >= 0.5;
  if (reliableMotion && md !== dir) return null;
  const agrees = reliableMotion && md === dir;
  // Zwei-Segment-Ecke: der Scheitel ist unschärfer als bei einem einzelnen Wackel-Segment (nur GPS
  // wäre von Start-Wackeln nicht zu trennen, real: r1 bei 4,7 m). Alle GPS-Gates oben müssen
  // bestanden sein; zusätzlich muss die IMU die Richtung unabhängig BESTÄTIGEN. Motion erzeugt
  // hier keine Ecke — sie schaltet nur einen bereits GPS-belegten, schwächeren Kandidaten frei.
  if (span > 1 && !agrees) return null;

  const { confidence: base } = cornerConfidence({
    before, after, magnitude, concentration, accuracyM: a.accuracy,
  });
  const scaled = base * RESCUE_CONFIDENCE_FACTOR;
  const confidence = clamp01(scaled + (agrees ? RESCUE_MOTION_BONUS : 0));
  if (confidence < ACCEPT_SCORE) return null;

  return {
    apexIndex, pairIndex: q, span,
    kind: kindFor(dir, sharpness === 'unresolved' ? 'normal' : sharpness),
    direction: dir, sharpness, confidence,
    confidenceBeforeMotion: scaled, motionAdjustment: confidence - scaled,
    headingDeltaDeg: headingDelta, interiorAngleDeg: interior,
    before, after, concentration, geoScore: geo.score, geoLevel: geo.level, ratio: geo.accuracyToLegRatio,
    demoted, consensusPairs, consensusMaxInterior, noConsensus, ev,
  };
}

// ── IMU-Ereignisse ────────────────────────────────────────────────────────
function detectImuEvents(samples: readonly MotionWindowSample[]): ImuOnlyEvent[] {
  if (samples.length < 2) return [];
  const first = samples[0].t, last = samples[samples.length - 1].t;
  const step = 500;
  const cand: { t: number; ev: TurnEvidence }[] = [];
  for (let t = first; t <= last; t += step) {
    const ev = computeTurnEvidence(samples, t, TURN_EVIDENCE_DEFAULTS);
    if (ev.available && (ev.evidence ?? 0) >= IMU_EVENT_MIN_EVIDENCE) cand.push({ t, ev });
  }
  // Nicht-Maximum-Unterdrückung: stärkste zuerst, ±2 s sperren.
  cand.sort((x, y) => (y.ev.evidence ?? 0) - (x.ev.evidence ?? 0) || Math.abs(y.ev.netYawDeg) - Math.abs(x.ev.netYawDeg));
  const kept: typeof cand = [];
  for (const c of cand) if (!kept.some(k => Math.abs(k.t - c.t) < 2000)) kept.push(c);
  return kept.sort((x, y) => x.t - y.t).map(c => ({
    t: c.t, direction: motionTurnDirection(c.ev),
    signedNetYawDeg: Math.round(c.ev.signedNetYawDeg * 10) / 10,
    evidence: Math.round((c.ev.evidence ?? 0) * 1000) / 1000,
    persisted: false as const, reason: 'imu_only_no_gps_corner' as const,
  }));
}

// ── Einstieg ──────────────────────────────────────────────────────────────
/**
 * Drop-in-Ersatz für `detectShortLegCorners` mit Fusions-Semantik. `corners` /
 * `diagnostics` / `detectorPointCount` haben dieselbe Form; zusätzlich liefert
 * die Funktion `turns` (QA-Telemetrie je Ecke) und `imuOnly`.
 */
export function fuseTurns(points: readonly ShortLegPoint[], opts: FuseOptions = {}): FusionResult {
  const base = detectShortLegCorners(points, null, opts.turnEvidenceAt, opts.turnEvidenceForDirection);
  const diagnostics = base.diagnostics.map(d => ({ ...d }));
  const byApex = new Map(diagnostics.map(d => [d.apexIndex, d]));
  const corners = base.corners.map(c => ({ ...c }));
  const turns: FusedTurn[] = [];
  let rescued = 0;
  const pairedOriginalDiagnostics = new Map<number, ShortLegDiagnostics>();
  const lookup = opts.turnEvidenceAt;

  // GPS-confirmed but sign-ambiguous near-reversals can be recovered only when
  // strong same-episode walking Motion supplies the opposite direction. This
  // does not widen the regular confidence threshold or infer sharpness.
  for (const d of diagnostics) {
    if (corners.some(c => Math.abs(c.atM - points[d.apexIndex].cumDist) < CORNER_GAP_M)) continue;
    const ev = opts.turnEvidenceForDirection?.(d.t ?? null, d.direction ?? 'rechts') ?? lookup?.(d.t ?? null) ?? null;
    if (!recoverAmbiguousGpsCorner(d, ev)) continue;
    const atM = points[d.apexIndex].cumDist;
    d.motionAdjustment = 0;
    corners.push({ kind: d.direction!, apexIndex: d.apexIndex, atM });
    rescued++;
  }

  // 1. Regelpfad-Ecken → fusionierte Ecken (Schärfe ggf. durch IMU belegt).
  for (const c of corners) {
    const d = byApex.get(c.apexIndex)!;
    const ev = opts.turnEvidenceForDirection?.(d.t ?? null, d.direction ?? 'rechts') ?? lookup?.(d.t ?? null) ?? null;
    const t = turnFromDiag(d, c.atM, ev, opts.turnEvidenceForDirection != null);
    c.kind = t.kind;   // spitz durch Motion belegt → persistierte Klasse folgt
    turns.push(t);
  }

  // 2. Split-Apex-Rescue.
  if (opts.splitApexRescue !== false) {
    const hits: SplitApexHit[] = [];
    for (let i = 1; i < points.length - 2; i++) {
      const atM = points[i].cumDist;
      if (corners.some(c => Math.abs(c.atM - atM) < CORNER_GAP_M)) continue;
      const h = evaluateSplitApex(points, i, lookup, opts.turnEvidenceForDirection);
      if (h) hits.push(h);
    }
    // Deterministische Reihenfolge: der klassische Ein-Segment-Split-Apex (Golden Path) ist IMMER
    // bevorzugt; eine Zwei-Segment-Episode kommt nur zum Zug, wo er keine Ecke in CORNER_GAP_M liefert.
    hits.sort((x, y) => x.span - y.span || y.confidence - x.confidence || x.apexIndex - y.apexIndex);
    for (const h of hits) {
      const atM = points[h.apexIndex].cumDist;
      if (corners.some(c => Math.abs(c.atM - atM) < CORNER_GAP_M)) continue;
      rescued++;
      corners.push({ kind: h.kind, apexIndex: h.apexIndex, atM });
      const d = byApex.get(h.apexIndex)!;
      Object.assign(d, {
        rejectReason: null, classification: h.kind, confidence: Math.round(h.confidence * 1000) / 1000,
        confidenceBeforeMotion: Math.round(h.confidenceBeforeMotion * 1000) / 1000,
        motionAdjustment: Math.round(h.motionAdjustment * 1000) / 1000,
        headingDeltaDeg: Math.round(h.headingDeltaDeg * 10) / 10, interiorAngleDeg: Math.round(h.interiorAngleDeg * 10) / 10,
        bearingBefore: Math.round(h.before.bearingDeg * 10) / 10, bearingAfter: Math.round(h.after.bearingDeg * 10) / 10,
        legBeforeM: Math.round(h.before.lengthM * 100) / 100, legAfterM: Math.round(h.after.lengthM * 100) / 100,
        sampleCountBefore: h.before.sampleCount, sampleCountAfter: h.after.sampleCount,
        spreadBeforeDeg: Math.round(h.before.spreadDeg * 10) / 10, spreadAfterDeg: Math.round(h.after.spreadDeg * 10) / 10,
        turnConcentrationM: Math.round(h.concentration * 1000) / 1000,
        direction: h.direction, sharpness: h.sharpness, sharpnessDemoted: h.demoted,
        sharpnessConsensusPairs: h.consensusPairs, sharpnessMaxInteriorDeg: h.consensusMaxInterior, sharpnessNoConsensus: h.noConsensus,
        geometryQuality: h.geoScore, geometryQualityLevel: h.geoLevel, accuracyToLegRatio: h.ratio,
        fusionSource: 'gps_split_apex' as const,
      });
      const t = turnFromDiag(d, atM, h.ev, opts.turnEvidenceForDirection != null);
      t.flags.unshift(h.span > 1 ? 'turn_episode_pair' : 'split_apex_pair');
      turns.push(t);
    }
  }
  // Additional evidence for a short dogleg: both chord views must
  // agree on TWO opposite normal corners. A lone rescued bend remains rejected.
  // No existing accepted corner can serve as the second half of the pair.
  // Boundary-only failures cannot form a pair: both chord views still need
  // the existing minimum distance and sample count on each side. Avoid two
  // full-buffer scans unless at least two primary candidates can satisfy them.
  let possiblePairedApexes = 0;
  if (opts.splitApexRescue !== false) for (const d of diagnostics) {
    if (d.rejectReason !== 'no_window_before' && d.rejectReason !== 'no_window_after') continue;
    const i = d.apexIndex;
    if (i + 1 < MIN_SAMPLES_SHORT || points.length - i < MIN_SAMPLES_SHORT) continue;
    if (points[i].cumDist - points[0].cumDist < MIN_LEG_M
      || points[points.length - 1].cumDist - points[i].cumDist < MIN_LEG_M) continue;
    if (++possiblePairedApexes === 2) break;
  }
  if (possiblePairedApexes >= 2) {
    const views = [0.75, 1].map(spacing => ({ spacing,
      result: detectShortLegCorners(points, null, opts.turnEvidenceAt, opts.turnEvidenceForDirection, spacing) }));
    const plateau = (windows: LegWindow[]) => windows.length >= 2 && windows.every(a =>
      windows.every(b => Math.abs(normalizeDeg(a.bearingDeg - b.bearingDeg)) <= RESCUE_MAX_SPREAD_DEG));
    const candidates: { turn: FusedTurn; diagnostic: ShortLegDiagnostics }[] = [];
    for (const c of views[0].result.corners) {
      const primary = byApex.get(c.apexIndex);
      if (!primary || (primary.rejectReason !== 'no_window_before' && primary.rejectReason !== 'no_window_after')) continue;
      if (turns.some(t => Math.abs(t.atM - c.atM) < CORNER_GAP_M)) continue;
      const matches = views.map(v => v.result.corners.find(x => x.apexIndex === c.apexIndex && x.kind === c.kind));
      if (matches.some(m => !m)) continue;
      const d = views[0].result.diagnostics.find(x => x.apexIndex === c.apexIndex)!;
      if (d.sharpness !== 'normal') continue;
      const ev = opts.turnEvidenceForDirection?.(d.t ?? null, d.direction ?? 'rechts') ?? lookup?.(d.t ?? null) ?? null;
      const turn = turnFromDiag(d, c.atM, ev, opts.turnEvidenceForDirection != null);
      if (turn.motion.available && (turn.motion.evidence ?? 0) >= 0.5
        && turn.motion.direction != null && turn.motion.direction !== turn.direction) continue;
      if (!views.every(v => v.result.diagnostics.find(x => x.apexIndex === c.apexIndex)?.sharpness === 'normal'
        && [false, true].every(forward => plateau(legWindows(points, c.apexIndex, forward, STRAIGHT_TOL_DEG, v.spacing))))) continue;
      // An added candidate must never steal motion evidence from an existing turn.
      if (turn.motionAssociationSource === 'nearest_episode' && turn.motionAssociationTimeMs != null
        && turns.some(t => t.motionAssociationSource === 'nearest_episode' && t.motionAssociationTimeMs != null
          && Math.abs(t.motionAssociationTimeMs - turn.motionAssociationTimeMs!) <= MOTION_EVENT_REUSE_GUARD_MS)) continue;
      candidates.push({ turn, diagnostic: d });
    }
    // 8m is the detector's existing largest local leg window, not a new angle threshold.
    const paired = candidates.filter(a => candidates.some(b => a !== b && a.turn.direction !== b.turn.direction
      && Math.abs(a.turn.atM - b.turn.atM) >= CORNER_GAP_M && Math.abs(a.turn.atM - b.turn.atM) <= SCALES_M[SCALES_M.length - 1]))
      .sort((a, b) => b.turn.confidence - a.turn.confidence || a.turn.apexIndex - b.turn.apexIndex);
    const selected: typeof paired = [];
    for (const item of paired) {
      if (!selected.some(t => Math.abs(t.turn.atM - item.turn.atM) < CORNER_GAP_M)) selected.push(item);
    }
    for (const { turn, diagnostic } of selected) {
      if (!selected.some(other => other.turn !== turn && other.turn.direction !== turn.direction
        && Math.abs(other.turn.atM - turn.atM) >= CORNER_GAP_M && Math.abs(other.turn.atM - turn.atM) <= SCALES_M[SCALES_M.length - 1])) continue;
      if (turns.some(t => Math.abs(t.atM - turn.atM) < CORNER_GAP_M)) continue;
      turn.flags.push('paired_short_leg_rescue');
      pairedOriginalDiagnostics.set(turn.apexIndex, { ...byApex.get(turn.apexIndex)! });
      Object.assign(byApex.get(turn.apexIndex)!, diagnostic);
      turns.push(turn);
      corners.push({ kind: turn.kind, apexIndex: turn.apexIndex, atM: turn.atM });
      rescued++;
    }
  }
  corners.sort((x, y) => x.atM - y.atM);
  turns.sort((x, y) => x.atM - y.atM);

  // A single Core Motion episode may support one GPS corner only. If adjacent
  // candidate windows picked the same delayed event, retain the closest GPS
  // apex (then stronger GPS confidence) and drop the duplicate association.
  const usedEpisodes: { timeMs: number; turn: FusedTurn }[] = [];
  const duplicateApexes = new Set<number>();
  for (const turn of turns.filter(t => t.motionAssociationSource === 'nearest_episode'
    && t.motion.available && t.motionAssociationTimeMs != null).sort((a, b) => {
      const at = a.motionAssociationTimeMs! - (a.t ?? a.motionAssociationTimeMs!);
      const bt = b.motionAssociationTimeMs! - (b.t ?? b.motionAssociationTimeMs!);
      return Math.abs(at) - Math.abs(bt) || b.confidence - a.confidence;
    })) {
    const timeMs = turn.motionAssociationTimeMs!;
    if (usedEpisodes.some(episode => Math.abs(episode.timeMs - timeMs) <= MOTION_EVENT_REUSE_GUARD_MS)) {
      duplicateApexes.add(turn.apexIndex);
    } else usedEpisodes.push({ timeMs, turn });
  }
  if (duplicateApexes.size) {
    for (let i = turns.length - 1; i >= 0; i--) if (duplicateApexes.has(turns[i].apexIndex)) turns.splice(i, 1);
    for (let i = corners.length - 1; i >= 0; i--) if (duplicateApexes.has(corners[i].apexIndex)) corners.splice(i, 1);
  }

  // Final episode allocation may remove one member of an added pair. Recheck
  // the final survivors, then restore the original rejected diagnostic/count
  // for every removed addition, including members already removed by dedup.
  const survivingPairs = turns.filter(t => pairedOriginalDiagnostics.has(t.apexIndex));
  const orphanApexes = new Set(survivingPairs.filter(a => !survivingPairs.some(b => a !== b
    && a.direction !== b.direction && Math.abs(a.atM - b.atM) >= CORNER_GAP_M
    && Math.abs(a.atM - b.atM) <= SCALES_M[SCALES_M.length - 1])).map(t => t.apexIndex));
  if (orphanApexes.size) {
    for (let i = turns.length - 1; i >= 0; i--) if (orphanApexes.has(turns[i].apexIndex)) turns.splice(i, 1);
    for (let i = corners.length - 1; i >= 0; i--) if (orphanApexes.has(corners[i].apexIndex)) corners.splice(i, 1);
  }
  for (const [apexIndex, original] of pairedOriginalDiagnostics) {
    if (turns.some(t => t.apexIndex === apexIndex)) continue;
    Object.assign(byApex.get(apexIndex)!, original);
    rescued--;
  }

  // 3. IMU-only: nur Telemetrie.
  let imuOnly: ImuOnlyEvent[] = [];
  if (opts.motionSamples?.length) {
    const cornerTimes = turns.map(t => t.t).filter((t): t is number => t != null);
    imuOnly = detectImuEvents(opts.motionSamples)
      .filter(e => !cornerTimes.some(ct => Math.abs(ct - e.t) <= IMU_ONLY_MATCH_S * 1000));
  }

  const result = { corners, diagnostics, detectorPointCount: base.detectorPointCount, turns, imuOnly, rescued };
  return opts.localDirectionState ? appendLocalDirectionTurns(points, result, opts.localDirectionState, lookup) : result;
}

/** Extend an already evaluated prefix without repeating the baseline sweep. */
export function appendLocalDirectionTurns(
  points: readonly ShortLegPoint[], result: FusionResult, state: LocalDirectionState, lookup?: TurnEvidenceLookup,
): FusionResult {
  const { corners, diagnostics, turns } = result;
  const byApex = new Map(diagnostics.map(d => [d.apexIndex, d]));
  const additions = confirmLocalDirections(state, points, diagnostics, corners, lookup);
  for (const d of additions) {
    const atM = points[d.apexIndex].cumDist;
    if (corners.some(c => Math.abs(c.atM - atM) < CORNER_GAP_M)) continue;
    const turn = turnFromDiag(d, atM, null);
    turn.flags.push('local_direction_confirmed');
    turns.push(turn);
    corners.push({ kind: turn.kind, apexIndex: turn.apexIndex, atM });
    Object.assign(byApex.get(d.apexIndex)!, d);
    result.rescued++;
  }
  corners.sort((a, b) => a.atM - b.atM);
  turns.sort((a, b) => a.atM - b.atM);
  // The baseline sweep classifies IMU-only events before this optional stage.
  // An event matching the added GPS corner is no longer IMU-only in QA.
  result.imuOnly = result.imuOnly.filter(e => !turns.some(t => t.t != null
    && Math.abs(t.t - e.t) <= IMU_ONLY_MATCH_S * 1000));
  return result;
}

/** Bounded extra work between ordinary line fixes. Only fresh detector support
 * is inspected, using three existing maximum leg windows of context. A new
 * proposal must still pass the full primary-conflict check before persistence. */
export function probeLocalDirectionTurns(
  points: readonly ShortLegPoint[], state: LocalDirectionState,
  opts: Omit<FuseOptions, 'localDirectionState'> = {}, minimumAtM = -Infinity,
): FusionResult | null {
  const now = points.at(-1);
  if (!now || now === state.lastPoint) return null;
  const contextM = 3 * SCALES_M[SCALES_M.length - 1];
  let offset = points.length - 1;
  while (offset > 0 && now.cumDist - points[offset - 1].cumDist <= contextM) offset--;
  const local = fuseTurns(points.slice(offset), opts);
  const diagnostics = local.diagnostics.map(d => ({ ...d, apexIndex: d.apexIndex + offset }));
  const corners = local.corners.map(c => ({ ...c, apexIndex: c.apexIndex + offset }));
  const previous = new Set(state.confirmed.keys());
  confirmLocalDirections(state, points, diagnostics, corners, opts.turnEvidenceAt);
  const fresh = [...state.confirmed.keys()].filter(i => !previous.has(i));
  for (const i of fresh) if (points[i].cumDist - minimumAtM < CORNER_GAP_M) state.confirmed.delete(i);
  if (!fresh.some(i => state.confirmed.has(i))) return null;
  const full = fuseTurns(points, opts);
  for (const c of full.corners) state.primarySeen.set(c.apexIndex, c.atM);
  // A provisional local candidate must not survive a conflicting global
  // primary result and reappear later when that primary window changes.
  for (const i of fresh) if (full.corners.some(c => Math.abs(c.atM - points[i].cumDist) < CORNER_GAP_M)) state.confirmed.delete(i);
  if (!fresh.some(i => state.confirmed.has(i))) return null;
  return appendLocalDirectionTurns(points, full, state, opts.turnEvidenceAt);
}
