// Fährten-Simulator (T-192) — reiner Testcode, wird von der App nicht importiert.
// Deterministische Zufallszahlen: gleicher Seed → exakt gleicher Lauf.

export type Rng = () => number;

/** mulberry32 — klein, schnell, für Simulationen ausreichend gleichverteilt. */
export function makeRng(seed: number): Rng {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standardnormalverteilt (Box-Muller). */
export function gauss(rng: Rng): number {
  let u = rng();
  if (u < 1e-12) u = 1e-12;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Stabiler Seed aus beliebigen Teilen (FNV-1a), damit jede Matrixzelle ihren eigenen Strom hat. */
export function seedFrom(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Ein Schritt eines Gauss-Markov-Prozesses 1. Ordnung (zeitlich korrelierter Fehler):
 * stationäre Streuung `sigma`, Korrelationszeit `tauS`.
 */
export function gaussMarkovStep(prev: number, sigma: number, tauS: number, dtS: number, rng: Rng): number {
  if (sigma <= 0) return 0;
  if (tauS <= 0) return sigma * gauss(rng);
  const a = Math.exp(-dtS / tauS);
  return prev * a + sigma * Math.sqrt(1 - a * a) * gauss(rng);
}
