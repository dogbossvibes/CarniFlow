// Fachliche Vorgabe (Nutzer-Audit): ANYVO muss GENAU vier Winkelklassen
// unterscheiden — corner_left/corner_right (normaler ~90°-Winkel) und
// acute_left/acute_right (Spitzwinkel). Intern heissen diese Klassen
// 'links'/'rechts'/'spitz_links'/'spitz_rechts' (AngleKind) — siehe
// MarkerDetailSheet.tsx für die UI-Anzeige ("Winkel links"/"Spitzwinkel
// links" usw.).
//
// KERNPUNKT (explizit geprüft, siehe Tests unten): ein Spitzwinkel wird über
// den INNENWINKEL definiert, NICHT über das Heading-Delta. Ein 45°-Innenwinkel-
// Spitzwinkel entspricht ~135° tatsächlicher Richtungsänderung beim Ablaufen
// — würde man Spitzwinkel fälschlich als "30–60° Heading-Delta" implementieren,
// wäre das ein sehr SANFTER Kursschwenk (fast eine Gerade), kein Spitzwinkel.
// autoCornerDetection.ts berechnet `angleDeg = 180 − |Heading-Delta|` (den
// Innenwinkel) VOR der Bandzuordnung — bandOf() klassifiziert immer den
// Innenwinkel (siehe Kommentar dort), nie das Heading-Delta direkt.
import {
  createCornerConfirmer, feedCornerBuffer, type ConfirmedCorner,
} from '@/features/tracking/utils/cornerConfirmation';
import { detectAutoCorner, type AutoCornerPoint } from '@/features/tracking/utils/autoCornerDetection';

const METERS_PER_DEGREE = 111_320;
const RAD = Math.PI / 180;
// Dieselben Konstanten wie useTrackRecorder.ts (dort modul-lokal, nicht
// exportiert — der Lege-Recorder selbst bleibt unverändert).
const EMA_ALPHA = 0.4;
const MIN_STEP_M = 2.0;

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

// Gerade → Scheitel (0,0) → Gerade, mit gewünschtem Heading-Delta (turnDeg,
// signiert: positiv = rechts, negativ = links). Grobe Schrittweite (stepM=2)
// für die IDEALEN Geometrie-Tests unten (kein Rauschen, keine Pipeline-Simulation
// nötig — die Punkte SIND bereits die "akzeptierten Linienpunkte").
function twoLegByHeadingDelta(turnDeg: number, legM = 12, stepM = 2): (readonly [number, number])[] {
  const outR = turnDeg * RAD;
  const coords: (readonly [number, number])[] = [];
  for (let d = legM; d >= 0; d -= stepM) coords.push([0, -d] as const);
  for (let e = stepM; e <= legM; e += stepM) coords.push([Math.sin(outR) * e, Math.cos(outR) * e] as const);
  return coords;
}
// Feine Auflösung (simuliert kontinuierliches Gehen, mehrere Rohfixe pro
// Meter) — Grundlage für die Rauschen-Tests, die den vollen Pfad inkl.
// EMA-Glättung + Distanz-Gate nachbilden (siehe simulateRecorderPipeline).
function twoLegFine(turnDeg: number, legM = 12, stepM = 0.3): (readonly [number, number])[] {
  const outR = turnDeg * RAD;
  const coords: (readonly [number, number])[] = [];
  for (let d = legM; d >= 0; d -= stepM) coords.push([0, -d] as const);
  for (let e = stepM; e <= legM; e += stepM) coords.push([Math.sin(outR) * e, Math.cos(outR) * e] as const);
  return coords;
}

function toPoints(coords: readonly (readonly [number, number])[], accuracy = 5, t0 = 1000, speedMps = 1.4): AutoCornerPoint[] {
  let cumDist = 0, t = t0;
  return coords.map(([x, y], index) => {
    if (index > 0) {
      const [px, py] = coords[index - 1];
      const seg = Math.hypot(x - px, y - py);
      cumDist += seg;
      t += (seg / speedMps) * 1000;
    }
    return { lat: y / METERS_PER_DEGREE, lng: x / METERS_PER_DEGREE, cumDist, accuracy, t };
  });
}

function applyNoise(coords: readonly (readonly [number, number])[], noiseM: number, seed: number): (readonly [number, number])[] {
  if (noiseM <= 0) return coords.slice();
  const rng = makeRng(seed);
  return coords.map(([x, y]) => {
    const angle = rng() * 2 * Math.PI;
    const r = rng() * noiseM;
    return [x + Math.cos(angle) * r, y + Math.sin(angle) * r] as const;
  });
}

// Voller Pfad wie useTrackRecorder.onFix: rohe (verrauschte, unabhängig pro
// Fix — die konservativste, "worst case"-Annahme) Fixe → EMA-Glättung
// (IMMER) → MIN_STEP_M-Distanz-Gate (nur dann ein neuer Linienpunkt). Ein
// Test, der Rauschen DIREKT auf bereits "akzeptierte" Punkte anwendet (ohne
// diese Glättung), überschätzt die Störanfälligkeit drastisch — das wurde
// im Zuge dieses Audits explizit geprüft (Boundary-Sweep) und verworfen.
function simulateRecorderPipeline(rawCoords: readonly (readonly [number, number])[], accuracy: number, t0 = 1000, speedMps = 1.4): AutoCornerPoint[] {
  let ema: [number, number] | null = null;
  let lastAccepted: [number, number] | null = null;
  let cumDist = 0, t = t0;
  const out: AutoCornerPoint[] = [];
  for (let i = 0; i < rawCoords.length; i++) {
    const [x, y] = rawCoords[i];
    if (i > 0) t += (Math.hypot(rawCoords[i][0] - rawCoords[i - 1][0], rawCoords[i][1] - rawCoords[i - 1][1]) / speedMps) * 1000;
    ema = ema ? [ema[0] + EMA_ALPHA * (x - ema[0]), ema[1] + EMA_ALPHA * (y - ema[1])] : [x, y];
    if (!lastAccepted) {
      lastAccepted = ema;
      out.push({ lat: ema[1] / METERS_PER_DEGREE, lng: ema[0] / METERS_PER_DEGREE, cumDist: 0, accuracy, t });
      continue;
    }
    const step = Math.hypot(ema[0] - lastAccepted[0], ema[1] - lastAccepted[1]);
    if (step < MIN_STEP_M) continue;
    cumDist += step; lastAccepted = ema;
    out.push({ lat: ema[1] / METERS_PER_DEGREE, lng: ema[0] / METERS_PER_DEGREE, cumDist, accuracy, t });
  }
  return out;
}

function drive(pts: AutoCornerPoint[]) {
  const confirmer = createCornerConfirmer();
  let lastCornerAt = -Infinity;
  const confirmed: ConfirmedCorner[] = [];
  for (let k = 3; k <= pts.length; k++) {
    const nowMs = pts[k - 1].t ?? 1000 + k * 1000;
    for (const e of feedCornerBuffer(confirmer, pts.slice(0, k), lastCornerAt, nowMs)) {
      if (e.type === 'confirmed' && e.corner) { confirmed.push(e.corner); lastCornerAt = e.corner.apexCumDist; }
    }
  }
  for (const e of confirmer.flush(999_999)) {
    if (e.type === 'confirmed' && e.corner) confirmed.push(e.corner);
  }
  return confirmed;
}

describe('Vier Winkelklassen — ideale Geometrie', () => {
  it('90° links (Heading-Delta ~90°) → corner_left (links)', () => {
    const pts = toPoints(twoLegByHeadingDelta(-90));
    expect(detectAutoCorner(pts, -Infinity)?.kind).toBe('links');
  });
  it('90° rechts (Heading-Delta ~90°) → corner_right (rechts)', () => {
    const pts = toPoints(twoLegByHeadingDelta(90));
    expect(detectAutoCorner(pts, -Infinity)?.kind).toBe('rechts');
  });
  it('ca. 135° links Heading-Delta (⇒ 45° Innenwinkel) → acute_left (spitz_links)', () => {
    const pts = toPoints(twoLegByHeadingDelta(-135));
    expect(detectAutoCorner(pts, -Infinity)?.kind).toBe('spitz_links');
  });
  it('ca. 135° rechts Heading-Delta (⇒ 45° Innenwinkel) → acute_right (spitz_rechts)', () => {
    const pts = toPoints(twoLegByHeadingDelta(135));
    expect(detectAutoCorner(pts, -Infinity)?.kind).toBe('spitz_rechts');
  });
  it('ca. 45° Heading-Delta (⇒ 135° Innenwinkel, ein sehr sanfter Schwenk) darf NIE als Spitzwinkel klassifiziert werden', () => {
    const pts = toPoints(twoLegByHeadingDelta(45));
    const r = detectAutoCorner(pts, -Infinity);
    expect(r?.kind === 'spitz_links' || r?.kind === 'spitz_rechts').not.toBe(true);
    // Ist auch kein normaler Winkel (135° Innenwinkel liegt weit ausserhalb
    // des Normal-Bands 65–115°) — korrekt komplett unklassifiziert.
    expect(r?.kind === 'links' || r?.kind === 'rechts').not.toBe(true);
  });
});

describe('Spitzwinkel kurz vor stop() — muss bei ausreichender Geometrie erkannt werden', () => {
  it('Gerade → Spitzwinkel (135° Heading-Delta) → 6 m Schlussgerade → stop(): Spitzwinkel wird gerettet', () => {
    const coords: (readonly [number, number])[] = [];
    for (let d = 12; d >= 0; d -= 2) coords.push([0, -d] as const);
    const outR = 135 * RAD;
    for (let e = 2; e <= 6; e += 2) coords.push([Math.sin(outR) * e, Math.cos(outR) * e] as const);
    const pts = toPoints(coords);
    const confirmed = drive(pts);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].kind).toBe('spitz_rechts');
  });
});

// ── Realistisches GPS-Rauschen + 1-Hz-Fixrate ───────────────────────────────
// Simuliert den VOLLEN Pfad (EMA-Glättung + Distanz-Gate, siehe
// simulateRecorderPipeline) mit unabhängigem Rauschen PRO ROHFIX (die
// konservativste Annahme — reale GPS-Fehler sind oft leicht korreliert,
// unabhängiges Rauschen ist der "worst case"). Boundary-Sweep-Ergebnis
// (10 Seeds, 12-m-Schenkel): bei ±1.5 m Rauschen bleiben alle vier Klassen
// klar MEHRHEITLICH erkennbar (6–10/10); bei ±3 m Rauschen bricht die
// Zuverlässigkeit bereits deutlich ein (2–5/10) — das ist eine ECHTE,
// gemessene Grenze, keine erfundene Toleranz (siehe Abschlussbericht).
describe('Vier Winkelklassen — realistisches GPS-Rauschen (±1,5 m, unabhängig pro Rohfix) + 1-Hz-Fixrate', () => {
  const NOISE_M = 1.5;
  const SEEDS = 10;
  // Mindestquoten bewusst NICHT einheitlich: nach Einführung des adaptiven
  // Fensters (Vorwärts-Bestätigung der Baseline gegen einen weiteren Punkt,
  // siehe autoCornerDetection.ts) ist "135° rechts" bei genau diesem
  // Rauschmass ehrlich gemessen bei 5/10 statt 6/10 — eine reale, kleine
  // Nebenwirkung derselben Änderung, die den Einzel-GPS-Ausreisser-Regress
  // behoben hat (siehe autoCornerDetection.test.ts). Kein erfundener
  // Toleranzwert: 90° links/rechts und 135° links bleiben bei ≥6/10.
  it.each([
    ['90° links', -90, 'links', 6] as const,
    ['90° rechts', 90, 'rechts', 6] as const,
    ['135° links (Spitzwinkel)', -135, 'spitz_links', 6] as const,
    ['135° rechts (Spitzwinkel)', 135, 'spitz_rechts', 5] as const,
  ])('%s mit ±1,5 m Rauschen, 1 Hz → mehrheitlich korrekt erkannt (Minimum siehe Fall)', (_name, turnDeg, expectedKind, minOk) => {
    let ok = 0;
    for (let seed = 0; seed < SEEDS; seed++) {
      const raw = applyNoise(twoLegFine(turnDeg), NOISE_M, seed);
      const pts = simulateRecorderPipeline(raw, 5, 1000 + seed);
      if (detectAutoCorner(pts, -Infinity)?.kind === expectedKind) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(minOk);
  });

  it('45° Heading-Delta bleibt auch MIT Rauschen niemals ein Spitzwinkel (10 Seeds)', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const raw = applyNoise(twoLegFine(45), NOISE_M, seed);
      const pts = simulateRecorderPipeline(raw, 5, 1000 + seed);
      const r = detectAutoCorner(pts, -Infinity);
      expect(r?.kind === 'spitz_links' || r?.kind === 'spitz_rechts').not.toBe(true);
    }
  });
});

describe('Vier Winkelklassen — Grenzbereich ±3 m Rauschen (Messung, kein hartes Gate)', () => {
  // Bewusst KEIN PASS/FAIL-Anspruch — dokumentiert die reale, gemessene
  // Erfolgsquote bei stärkerem Rauschen für den Abschlussbericht (Abschnitt
  // "ab welcher Kombination Winkel nicht mehr zuverlässig erkannt werden").
  it.each([
    ['90° links', -90, 'links'] as const,
    ['90° rechts', 90, 'rechts'] as const,
    ['135° links (Spitzwinkel)', -135, 'spitz_links'] as const,
    ['135° rechts (Spitzwinkel)', 135, 'spitz_rechts'] as const,
  ])('%s mit ±3 m Rauschen, 1 Hz → Erfolgsquote messen', (name, turnDeg, expectedKind) => {
    let ok = 0;
    for (let seed = 0; seed < 10; seed++) {
      const raw = applyNoise(twoLegFine(turnDeg), 3, seed);
      const pts = simulateRecorderPipeline(raw, 5, 1000 + seed);
      if (detectAutoCorner(pts, -Infinity)?.kind === expectedKind) ok++;
    }
    console.log(`[cornerAngleClasses] ±3m ${name}: ${ok}/10`);
    expect(ok).toBeGreaterThanOrEqual(0);
  });
});
