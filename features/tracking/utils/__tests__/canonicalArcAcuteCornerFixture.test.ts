/**
 * Canonical Reference Progress — CHARACTERIZATION-Test (kein Golden-Test).
 *
 * Reale Feld-Fixture qa-0ec8c4ca (Lay v2.1-Export, anonymisiert: relative x/y,
 * gleicher Ursprung für `points` und `markers`). Ground Truth der gelaufenen
 * Fährte: R → L → SL → SR. Lay CURRENT hat davon nur ZWEI Marker erzeugt
 * (rechts @ 5.9 m, spitz_rechts @ 27.5 m, beides Detektor-Maßstab). Die fehlenden
 * L/SL sind ein Corner-Detector-Thema und gehören NICHT hierher — canonicalArc
 * bekommt nur vorhandene Marker.
 *
 * Was dieser Test festhält: die Vollfenster-Projektion (`projectForward` über
 * [0, total], „nächstes Segment") ordnet den SPÄTEN Spitzwinkel dem räumlich
 * nahen FRÜHEN Schenkel zu — bei zurücklaufenden/selbst-benachbarten Schenkeln
 * liegt das Linienende wenige Dezimeter neben dem Linienanfang. Ergebnis heute:
 * spitz_rechts ≈ 6.29 m statt im späten Streckenabschnitt. Formal monoton
 * (2.49 < 6.29), semantisch falsch.
 *
 * Die Pins dokumentieren den CURRENT-Zustand und müssen heute GRÜN sein. Sobald
 * eine order-/progress-bewusste Projektion kommt, kippt dieser Test bewusst und
 * wird dann auf das korrigierte Verhalten umgeschrieben. Keine Fixlogik hier.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildSearchEventArcs } from '@/features/tracking/utils/canonicalArc';
import { buildArc, type LL } from '@/features/tracking/utils/searchGeometry';

const FIXTURE = path.join(__dirname, 'fixtures', 'realFieldV21', 'spitz-qa-0ec8c4ca.json');
const LAT0 = 47.0, LNG0 = 8.0;
const M_PER_LAT = 111320;
const M_PER_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const toLL = (x: number, y: number): LL => ({ latitude: LAT0 + y / M_PER_LAT, longitude: LNG0 + x / M_PER_LNG });

interface FixtureMarker { type: string; angleKind: string | null; x: number; y: number; atM: number; source?: string; scale?: string }

function loadFixture() {
  const j = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const line: LL[] = j.points.map((p: { x: number; y: number }) => toLL(p.x, p.y));
  const markers = (j.markers as FixtureMarker[]).map((m, i) => ({
    id: `m${i}`, angleKind: m.angleKind, lat: toLL(m.x, m.y).latitude, lng: toLL(m.x, m.y).longitude, distance_from_start: m.atM,
  }));
  return { j, line, markers, total: buildArc(line).total, detectorPathM: j.distances.detectorPathM as number };
}

describe('canonicalArc — qa-0ec8c4ca (R → L → SL → SR, selbst-benachbarte Schenkel)', () => {
  it('Fixture-Vertrag: 2 Auto-Marker im Detektor-Maßstab, Linie ≈ 23.68 m, Detektorpfad ≈ 34.58 m', () => {
    const { j, markers, total, detectorPathM } = loadFixture();
    expect(j.sessionId).toBe('qa-0ec8c4ca');
    expect(Math.abs(total - 23.68)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(detectorPathM - 34.58)).toBeLessThanOrEqual(0.05);
    expect(markers.map(m => m.angleKind)).toEqual(['rechts', 'spitz_rechts']);
    expect(markers.map(m => m.distance_from_start)).toEqual([5.9, 27.5]);
    for (const m of j.markers as FixtureMarker[]) { expect(m.source).toBe('auto'); expect(m.scale).toBe('detector'); }
    // Die gespeicherte Detektor-Distanz des SR liegt HINTER dem Linienende — der
    // Detektor-Maßstab ist als Search-Position unbrauchbar (Grund für canonicalArc).
    expect(27.5).toBeGreaterThan(total);
  });

  it('CURRENT: rechts (detector 5.9 m) wird auf ≈ 2.49 m projiziert', () => {
    const { line, markers } = loadFixture();
    const a = buildSearchEventArcs(markers, line).m0;
    expect(a.source).toBe('projected');
    expect(Math.abs((a.arcM as number) - 2.49)).toBeLessThanOrEqual(0.05);
  });

  it('documents nearest-segment misprojection for late acute corner on qa-0ec8c4ca (CURRENT ≈ 6.29 m, NOT correct)', () => {
    const { line, markers, total, detectorPathM } = loadFixture();
    const sr = buildSearchEventArcs(markers, line).m1;
    expect(sr.source).toBe('projected');
    // Pin des heutigen (falschen) Ergebnisses: geometrisch nächstes Segment = früher Schenkel.
    expect(Math.abs((sr.arcM as number) - 6.29)).toBeLessThanOrEqual(0.05);
    expect(sr.offLineM as number).toBeLessThan(1); // liegt tatsächlich dicht an der Linie — nur am falschen Durchgang

    // Diagnostic Evidence (KEIN Produktalgorithmus, KEIN Threshold): normalisierter
    // Detektor-Fortschritt 27.5 / 34.58 ≈ 0.795 → grob 0.795 × 23.68 ≈ 18.8 m auf
    // der Linie. Der SR gehört fachlich in den späten Abschnitt, nicht zu 6.29 m.
    const progress = 27.5 / detectorPathM;
    const roughLineM = progress * total;
    expect(Math.abs(progress - 0.795)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(roughLineM - 18.8)).toBeLessThanOrEqual(0.1);
    expect(sr.arcM as number).toBeLessThan(total / 2);    // CURRENT: erste Hälfte …
    expect(roughLineM).toBeGreaterThan(total / 2);        // … Evidenz: zweite Hälfte.
  });

  it('Reihenfolge: canonical ist monoton (2.49 < 6.29), aber Monotonie allein beweist keine korrekte Zuordnung', () => {
    const { line, markers } = loadFixture();
    const arcs = buildSearchEventArcs(markers, line);
    const r = arcs.m0.arcM as number, sr = arcs.m1.arcM as number;
    // Detektor-Reihenfolge rechts → spitz_rechts bleibt auch kanonisch erhalten …
    expect(r).toBeLessThan(sr);
    // … und trotzdem ist der SR falsch platziert: die Lücke zwischen den beiden
    // Markern ist kanonisch nur ~3.8 m, im Detektor-Maßstab ~21.6 m (≈ 62 % des
    // Detektorpfads). Nearest-segment allein reicht nicht; Detektor-Fortschritt/
    // Reihenfolge trägt Information, die die Projektion heute nicht nutzt.
    expect(sr - r).toBeLessThan(5);
    expect(27.5 - 5.9).toBeGreaterThan(20);
  });
});
