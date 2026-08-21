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
}

// Begründung der Defaults (an bestehende Recorder-/Guidance-Toleranzen angelehnt):
//  • reachedProgressRatio 0.97 → nahezu komplette Fährte in Reihenfolge abgearbeitet
//    (deckt sich mit dem Coverage-Anteil maxCursorM/arc.total im Score).
//  • reachedGeomM 3.0 → zwischen ON_TRACK_M (3.0) und knapp über OBJECT_HIT_M (2.5),
//    unter BREAK_THRESHOLD_M (6.0): „am Endpunkt auf der Fährte".
//  • approachingRemainingM 10 → wie announceAheadM der Guidance-Engine.
export const DEFAULT_TRACK_END_OPTIONS: TrackEndOptions = {
  reachedProgressRatio: 0.97,
  reachedGeomM: 3.0,
  approachingRemainingM: 10,
};

// Ein Schritt der Ende-Zustandsmaschine. Einmal `reached`/`completed` bleibt es
// `completed` (Once-only; GPS-Jitter kann nicht erneut auslösen). `justReached` ist
// genau im Übergangs-Tick true → Ansage/Haptik genau einmal.
export function stepTrackEnd(
  input: TrackEndInput,
  previous: TrackEndState = 'unseen',
  options: TrackEndOptions = DEFAULT_TRACK_END_OPTIONS,
): { state: TrackEndState; justReached: boolean } {
  if (previous === 'reached' || previous === 'completed') {
    return { state: 'completed', justReached: false };
  }
  // Ohne gelegte Fährte gibt es kein Ende.
  if (!(input.trackLengthM > 1)) return { state: previous, justReached: false };

  const ratio = input.dogProgressM / input.trackLengthM;
  const remainingM = Math.max(0, input.trackLengthM - input.dogProgressM);

  const reached =
    ratio >= options.reachedProgressRatio          // order-aware fast komplett abgearbeitet
    && input.geomDistanceM != null
    && input.geomDistanceM <= options.reachedGeomM // virtuelle Hundeposition wirklich am Endpunkt
    && input.openMandatoryObjects <= 0;            // keine offenen Pflicht-Gegenstände davor

  if (reached) return { state: 'reached', justReached: true };

  // Im End-Anlauf (order-aware nah am Ende), aber Kriterien noch nicht alle erfüllt
  // (z. B. geometrisch noch > reachedGeomM oder offene Gegenstände) → „approaching".
  if (remainingM <= options.approachingRemainingM) {
    return { state: 'approaching', justReached: false };
  }
  return { state: previous === 'approaching' ? 'approaching' : 'unseen', justReached: false };
}
