import type { AngleKind } from '@/features/tracking/store/trackingStore';
import { forwardDistanceFromDog } from '@/features/tracking/utils/searchGeometry';

export type GuidanceFeatureState = 'unseen' | 'approaching' | 'announced' | 'reached' | 'passed';

export type GuidanceFeature =
  | { id: string; arcM: number; kind: 'angle'; angleKind: AngleKind | null }
  | { id: string; arcM: number; kind: 'object'; material?: string | null };

export interface GuidanceEngineOptions {
  announceAheadM: number;
  reachedM: number;
  passedM: number;
}

export interface GuidanceEngineResult {
  state: Record<string, GuidanceFeatureState>;
  announcement: { feature: GuidanceFeature; distanceM: number; state: GuidanceFeatureState } | null;
}

export const DEFAULT_GUIDANCE_OPTIONS: GuidanceEngineOptions = {
  announceAheadM: 10,
  reachedM: 1.5,
  passedM: 2.5,
};

function nextState(distanceM: number | null, previous: GuidanceFeatureState, opts: GuidanceEngineOptions): GuidanceFeatureState {
  if (distanceM == null) return previous === 'reached' || previous === 'announced' ? 'passed' : previous;
  if (distanceM <= opts.reachedM) return 'reached';
  if (distanceM <= opts.announceAheadM) return previous === 'announced' ? 'announced' : 'approaching';
  return previous;
}

export function stepGuidanceEngine(
  features: GuidanceFeature[],
  dogProgressM: number,
  previousState: Record<string, GuidanceFeatureState> = {},
  options: GuidanceEngineOptions = DEFAULT_GUIDANCE_OPTIONS,
): GuidanceEngineResult {
  const state: Record<string, GuidanceFeatureState> = { ...previousState };
  let announcement: GuidanceEngineResult['announcement'] = null;
  let bestDistance = Infinity;

  const ordered = [...features].sort((a, b) => a.arcM - b.arcM);
  for (const feature of ordered) {
    const prev = state[feature.id] ?? 'unseen';
    const distanceM = forwardDistanceFromDog(feature.arcM, dogProgressM);
    const next = nextState(distanceM, prev, options);
    state[feature.id] = next;

    if (
      distanceM != null
      && distanceM <= options.announceAheadM
      && (prev === 'unseen' || prev === 'approaching')
      && distanceM < bestDistance
    ) {
      bestDistance = distanceM;
      announcement = { feature, distanceM, state: next };
    }
  }

  if (announcement) state[announcement.feature.id] = 'announced';
  return { state, announcement };
}

// ── Fährtenende-Erkennung ──────────────────────────────────────────────────
// Eigener, kleiner, REINER Detektor — KEINE zweite Guidance-Engine: er behandelt
// nur das eine „Ende"-Feature, nutzt dieselben virtuellen Hundegrößen (dogProgressM,
// order-aware) wie die Voice-Guidance und ist damit gegen räumliches Vorbeilaufen
// robust. Ende gilt nur, wenn der Hund die Fährte fast vollständig IN REIHENFOLGE
// abgearbeitet hat UND geometrisch am gespeicherten Endpunkt ist UND keine offenen
// Pflicht-Gegenstände davor liegen.
export type TrackEndState = 'unseen' | 'approaching' | 'reached' | 'completed';

export interface TrackEndInput {
  dogProgressM: number;         // virtueller Hundefortschritt (Bogenlänge, order-aware)
  trackLengthM: number;         // Gesamtlänge der gelegten Fährte
  geomDistanceM: number | null; // Distanz virtuelle Hundeposition → gespeicherter Endpunkt
  openMandatoryObjects: number; // noch nicht gefundene Pflicht-Gegenstände
}

export interface TrackEndOptions {
  reachedProgressRatio: number;  // Coverage-Anteil (0..1), ab dem das Ende zählt
  reachedGeomM: number;          // max. Luftlinie virtuelle Hundeposition → Endpunkt
  approachingRemainingM: number; // Rest-Bogenlänge, ab der „approaching" gilt
  openObjectsBlockEnd: boolean;  // ob offene Pflicht-Gegenstände das Ende HART blockieren
}

// Begründung der Defaults (an bestehende Recorder-/Guidance-Toleranzen angelehnt):
//  • reachedProgressRatio 0.97 → nahezu komplette Fährte in Reihenfolge abgearbeitet
//    (deckt sich mit dem Coverage-Anteil maxCursorM/arc.total im Score).
//  • reachedGeomM 3.0 → zwischen ON_TRACK_M (3.0) und knapp über OBJECT_HIT_M (2.5),
//    unter BREAK_THRESHOLD_M (6.0): „am Endpunkt auf der Fährte".
//  • approachingRemainingM 10 → wie announceAheadM der Guidance-Engine.
//  • openObjectsBlockEnd FALSE (Produktentscheidung): ein Gegenstand, der wegen GPS-/
//    EMA-Toleranz NICHT automatisch als gefunden markiert wurde (o.at ist ein eigener
//    GPS-Marker, nicht auf der geglätteten Linie → ≤2.5-m-Treffer kann dauerhaft
//    ausbleiben), darf das TATSÄCHLICHE Track-Ende NICHT blockieren. Das Ende folgt aus
//    Along-Track-Fortschritt + Endpunktnähe (order-aware); verpasste Gegenstände werden
//    SEPARAT im Score geführt (foundObjects/objectPts), nicht als Endsperre.
export const DEFAULT_TRACK_END_OPTIONS: TrackEndOptions = {
  reachedProgressRatio: 0.97,
  reachedGeomM: 3.0,
  approachingRemainingM: 10,
  openObjectsBlockEnd: false,
};

// Diagnose-Grund, warum der Ende-Trigger (noch) nicht ausgelöst hat (Phase-B-Feld-QA).
// Rein additiv — ändert die Trigger-Bedingungen NICHT.
//  • 'open_objects' tritt nur noch auf, wenn openObjectsBlockEnd === true.
//  • 'triggered_open_objects' = Ende ausgelöst, obwohl noch Gegenstände offen sind
//    (progress+geom erfüllt) — für QA sichtbar, blockiert NICHT.
export type TrackEndBlockReason =
  | 'triggered' | 'triggered_open_objects' | 'already_completed' | 'no_track'
  | 'progress_below_ratio' | 'geom_too_far' | 'open_objects';

export function trackEndReason(
  input: TrackEndInput, previous: TrackEndState, options: TrackEndOptions = DEFAULT_TRACK_END_OPTIONS,
): TrackEndBlockReason {
  if (previous === 'reached' || previous === 'completed') return 'already_completed';
  if (!(input.trackLengthM > 1)) return 'no_track';
  const ratio = input.dogProgressM / input.trackLengthM;
  if (ratio < options.reachedProgressRatio) return 'progress_below_ratio';
  if (input.geomDistanceM == null || input.geomDistanceM > options.reachedGeomM) return 'geom_too_far';
  if (input.openMandatoryObjects > 0) {
    // Nur harte Blockade, wenn ausdrücklich aktiviert; sonst Ende trotz offener Objekte.
    return options.openObjectsBlockEnd ? 'open_objects' : 'triggered_open_objects';
  }
  return 'triggered';
}

// Ein Schritt der Ende-Zustandsmaschine. Einmal `reached`/`completed` bleibt es
// `completed` (Once-only; GPS-Jitter kann nicht erneut auslösen). `justReached` ist
// genau im Übergangs-Tick true → Ansage/Haptik genau einmal. `reason` ist additiv
// (Diagnose) und beeinflusst die Trigger-Logik nicht.
export function stepTrackEnd(
  input: TrackEndInput,
  previous: TrackEndState = 'unseen',
  options: TrackEndOptions = DEFAULT_TRACK_END_OPTIONS,
): { state: TrackEndState; justReached: boolean; reason: TrackEndBlockReason } {
  const reason = trackEndReason(input, previous, options);
  if (previous === 'reached' || previous === 'completed') {
    return { state: 'completed', justReached: false, reason };
  }
  // Ohne gelegte Fährte gibt es kein Ende.
  if (!(input.trackLengthM > 1)) return { state: previous, justReached: false, reason };

  const remainingM = Math.max(0, input.trackLengthM - input.dogProgressM);

  // Ende erreicht — auch, wenn noch Gegenstände offen sind (diese blockieren per
  // Produktentscheidung nicht; sie werden separat im Score geführt).
  if (reason === 'triggered' || reason === 'triggered_open_objects') {
    return { state: 'reached', justReached: true, reason };
  }

  // Im End-Anlauf (order-aware nah am Ende), aber Kriterien noch nicht alle erfüllt
  // (z. B. geometrisch noch > reachedGeomM oder offene Gegenstände) → „approaching".
  if (remainingM <= options.approachingRemainingM) {
    return { state: 'approaching', justReached: false, reason };
  }
  return { state: previous === 'approaching' ? 'approaching' : 'unseen', justReached: false, reason };
}
