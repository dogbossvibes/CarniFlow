// ──────────────────────────────────────────────────────────────────────────
// Kanonische Track-Distanz — entkoppelt von der Darstellungs-Geometrie.
//
// Track-Geometrie ≠ Track-Distanz. Die turn-aware Linie (turnAwareLineGate.ts)
// darf Ecken dichter abbilden, die nutzersichtbare Distanz darf deshalb aber
// nicht steigen: mehr Punkte addieren mehr GPS-Wackeln.
//
// Dieser Akkumulator bildet EXAKT die bisherige Distanz-Semantik nach und ist
// von der Persistenzdichte unabhängig: er sieht denselben Strom, den die Linie
// früher bekam (EMA 0,4, Gate 2,0 m, Start beim Anker) und summiert dessen
// Schritte. Keine neue Heuristik, kein Tuning.
//
// Reine Klasse, kein React/Native.
// ──────────────────────────────────────────────────────────────────────────
import { calculateDistance, type LatLng } from '@/features/tracking/utils/gpsFilter';

/** Bisheriges Linien-Gate (m) = Referenz-Semantik der Distanz. */
export const CANONICAL_GATE_M = 2.0;

export interface CanonicalDistance {
  /** Neu beginnen; `anchor` ist der erste Punkt (Distanz 0). */
  start(anchor: LatLng): void;
  /** Nächste (mit dem bisherigen EMA 0,4 geglättete) Position. Liefert die Gesamtdistanz. */
  push(ema: LatLng): number;
  readonly total: number;
  reset(): void;
}

export function createCanonicalDistance(gateM: number = CANONICAL_GATE_M): CanonicalDistance {
  let last: LatLng | null = null;
  let total = 0;
  return {
    start(anchor) { last = { lat: anchor.lat, lng: anchor.lng }; total = 0; },
    push(ema) {
      if (!last) { last = { lat: ema.lat, lng: ema.lng }; return total; }
      const step = calculateDistance(last, ema);
      if (step >= gateM) { total += step; last = { lat: ema.lat, lng: ema.lng }; }
      return total;
    },
    get total() { return total; },
    reset() { last = null; total = 0; },
  };
}
