// Beweist Treue zum historischen Stand — NICHT "vertraue der Portierung",
// sondern: liest den tatsächlichen Quelltext aus Commit 82bd17c (Build 40,
// der letzte nachweislich funktionierende Fährten-Stand) zur Testlaufzeit
// per `git show` und vergleicht die dortigen Konstanten UND das
// Klassifikationsverhalten 1:1 gegen legacyCornerDetection.ts.
import { execSync } from 'node:child_process';
import {
  legacyDetectCorner, LEG_MIN_M, ACUTE_ANGLE_MIN_DEG, ACUTE_ANGLE_MAX_DEG,
  ANGLE_90_MIN_DEG, ANGLE_90_MAX_DEG, MAX_ANGLE_ACCURACY_M, CORNER_GAP_M,
  ANGLE_USE_INTERIOR, ANGLE_INVERT_SIDE, type LegacyAcceptedPoint,
} from '@/features/tracking/utils/legacyCornerDetection';
import type { LatLng } from '@/features/tracking/utils/gpsFilter';

const HISTORICAL_COMMIT = '82bd17c';

function historicalSource(): string {
  return execSync(`git show ${HISTORICAL_COMMIT}:features/tracking/hooks/useTrackRecorder.ts`, {
    cwd: process.cwd(), encoding: 'utf8',
  });
}

function extractConstNumber(src: string, name: string): number {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([\\d.]+)`));
  if (!m) throw new Error(`Konstante ${name} nicht im historischen Quelltext gefunden`);
  return Number(m[1]);
}
function extractConstBool(src: string, name: string): boolean {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*(true|false)`));
  if (!m) throw new Error(`Konstante ${name} nicht im historischen Quelltext gefunden`);
  return m[1] === 'true';
}

describe('legacyCornerDetection — Treue zu Commit 82bd17c (Build 40)', () => {
  let src: string;
  beforeAll(() => { src = historicalSource(); });

  it('git-Commit 82bd17c existiert und enthält detectCorner (Selbsttest der Fidelity-Prüfung)', () => {
    expect(src).toContain('const detectCorner = useCallback(');
    expect(src).toContain('Bester Scheitel-Kandidat');
  });

  it('alle Schwellenwert-Konstanten stimmen exakt mit dem historischen Quelltext überein', () => {
    expect(LEG_MIN_M).toBe(extractConstNumber(src, 'LEG_MIN_M'));
    expect(ACUTE_ANGLE_MIN_DEG).toBe(extractConstNumber(src, 'ACUTE_ANGLE_MIN_DEG'));
    expect(ACUTE_ANGLE_MAX_DEG).toBe(extractConstNumber(src, 'ACUTE_ANGLE_MAX_DEG'));
    expect(ANGLE_90_MIN_DEG).toBe(extractConstNumber(src, 'ANGLE_90_MIN_DEG'));
    expect(ANGLE_90_MAX_DEG).toBe(extractConstNumber(src, 'ANGLE_90_MAX_DEG'));
    expect(MAX_ANGLE_ACCURACY_M).toBe(extractConstNumber(src, 'MAX_ANGLE_ACCURACY_M'));
    expect(ANGLE_USE_INTERIOR).toBe(extractConstBool(src, 'ANGLE_USE_INTERIOR'));
    expect(ANGLE_INVERT_SIDE).toBe(extractConstBool(src, 'ANGLE_INVERT_SIDE'));
    // CORNER_GAP_M war historisch `= LEG_MIN_M` (kein Literal) — Quelltext-Beleg statt Zahl.
    expect(src).toMatch(/const CORNER_GAP_M\s*=\s*LEG_MIN_M/);
    expect(CORNER_GAP_M).toBe(LEG_MIN_M);
  });

  it('die portierte Kernlogik (Scheitel-Suche/Klassifikation) ist im historischen Quelltext wortgleich enthalten', () => {
    // Die exakten, algorithmus-tragenden Zeilen aus 82bd17c — wenn diese
    // Zeichenketten fehlen, wurde die Portierung nicht mechanisch, sondern
    // hätte den Algorithmus selbst verändert.
    const mustContain = [
      'if (C.cumDist - apex.cumDist < LEG_MIN_M) { sawLegShort = true; continue; }',
      'if (apex.cumDist - lastCornerAtRef.current < CORNER_GAP_M) break;',
      'if (apex.accuracy == null || apex.accuracy > MAX_ANGLE_ACCURACY_M) { sawPoorAcc = true; continue; }',
      'while (ai > 0 && apex.cumDist - pts[ai].cumDist < LEG_MIN_M) ai--;',
      'while (ci < n - 1 && pts[ci].cumDist - apex.cumDist < LEG_MIN_M) ci++;',
      'const diff = normalizeDeg(calculateHeading(apex, pts[ci]) - calculateHeading(pts[ai], apex));',
      'if (!best || best.mag < 15)',
      'const angleDeg = ANGLE_USE_INTERIOR ? 180 - best.mag : best.mag;',
    ];
    for (const line of mustContain) expect(src).toContain(line);
  });
});

// ── Geometrie-Helfer für die Verhaltenstests ──
const M_PER_DEG = 111320;
function toLL(xEastM: number, yNorthM: number): LatLng { return { lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG }; }
function buildPoints(coords: readonly (readonly [number, number])[], accuracy = 5): LegacyAcceptedPoint[] {
  let cumDist = 0;
  return coords.map(([x, y], i) => {
    if (i > 0) { const [px, py] = coords[i - 1]; cumDist += Math.hypot(x - px, y - py); }
    const ll = toLL(x, y);
    return { lat: ll.lat, lng: ll.lng, t: i * 1000, accuracy, cumDist };
  });
}
function walk(cursor: readonly [number, number], headingDeg: number, len: number, stepM: number): (readonly [number, number])[] {
  const r = headingDeg * Math.PI / 180;
  const out: (readonly [number, number])[] = [];
  let d = stepM;
  while (d < len) { out.push([cursor[0] + Math.sin(r) * d, cursor[1] + Math.cos(r) * d] as const); d += stepM; }
  out.push([cursor[0] + Math.sin(r) * len, cursor[1] + Math.cos(r) * len] as const);
  return out;
}

describe('legacyDetectCorner — Verhalten (Build-40-Bänder: 75–115° normal, 30–60° spitz, LEG_MIN_M=4)', () => {
  it('sauberer 90°-Knick (links) wird als "links" erkannt', () => {
    const coords: (readonly [number, number])[] = [[0, -8]];
    for (const p of walk([0, -8], 0, 8, 2)) coords.push(p);
    const cursor = coords[coords.length - 1] as [number, number];
    for (const p of walk(cursor, 270, 8, 2)) coords.push(p);
    const pts = buildPoints(coords);
    const r = legacyDetectCorner(pts, -Infinity);
    expect(r.reject).toBeNull();
    expect((r as any).kind).toBe('links');
    expect((r as any).angleDeg).toBeGreaterThanOrEqual(75);
    expect((r as any).angleDeg).toBeLessThanOrEqual(115);
  });

  it('Spitzwinkel rechts (Innenwinkel ~45°) wird als "spitz_rechts" erkannt', () => {
    const coords: (readonly [number, number])[] = [[0, -8]];
    for (const p of walk([0, -8], 0, 8, 2)) coords.push(p);
    const cursor = coords[coords.length - 1] as [number, number];
    for (const p of walk(cursor, 135, 8, 2)) coords.push(p);   // turn=135° rechts → Innenwinkel 45°
    const pts = buildPoints(coords);
    const r = legacyDetectCorner(pts, -Infinity);
    expect(r.reject).toBeNull();
    expect((r as any).kind).toBe('spitz_rechts');
    expect((r as any).angleDeg).toBeGreaterThanOrEqual(ACUTE_ANGLE_MIN_DEG);
    expect((r as any).angleDeg).toBeLessThanOrEqual(ACUTE_ANGLE_MAX_DEG);
  });

  it('zu kurzer Schenkel (< LEG_MIN_M=4 m) → leg_too_short/no_turn, kein Winkel', () => {
    const coords: (readonly [number, number])[] = [[0, -3]];
    for (const p of walk([0, -3], 0, 3, 1)) coords.push(p);
    const cursor = coords[coords.length - 1] as [number, number];
    for (const p of walk(cursor, 270, 3, 1)) coords.push(p);
    const pts = buildPoints(coords);
    const r = legacyDetectCorner(pts, -Infinity);
    expect(r.reject).not.toBeNull();
    expect(r.kind).toBeNull();
  });

  it('ungenauer Scheitel-Fix (> MAX_ANGLE_ACCURACY_M=20 m) wird nicht als Winkel bestätigt', () => {
    const coords: (readonly [number, number])[] = [[0, -8]];
    for (const p of walk([0, -8], 0, 8, 2)) coords.push(p);
    const cursor = coords[coords.length - 1] as [number, number];
    for (const p of walk(cursor, 270, 8, 2)) coords.push(p);
    const pts = buildPoints(coords, 25);   // alle Fixe > 20 m Genauigkeit
    const r = legacyDetectCorner(pts, -Infinity);
    expect(r.reject).not.toBeNull();
    expect(r.kind).toBeNull();
  });

  it('45°-Heading-Delta (sehr sanfter Schwenk, Innenwinkel 135°) ist NIE ein Winkel (ausserhalb beider Bänder)', () => {
    const coords: (readonly [number, number])[] = [[0, -8]];
    for (const p of walk([0, -8], 0, 8, 2)) coords.push(p);
    const cursor = coords[coords.length - 1] as [number, number];
    for (const p of walk(cursor, 45, 8, 2)) coords.push(p);
    const pts = buildPoints(coords);
    const r = legacyDetectCorner(pts, -Infinity);
    expect(r.kind).toBeNull();
  });
});
