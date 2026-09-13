/**
 * Canonical Reference Progress — Regressionstest (reale Feld-Fixture).
 *
 * qa-0ec8c4ca (Lay v2.1-Export, anonymisiert: relative x/y + tMs, gleicher
 * Ursprung für `points` und `markers`). Ground Truth der gelaufenen Fährte:
 * R → L → SL → SR. Lay CURRENT hat davon nur ZWEI Marker erzeugt (rechts @ 5.9 m,
 * spitz_rechts @ 27.5 m, beides Detektor-Maßstab). Die fehlenden L/SL sind ein
 * Corner-Detector-Thema und gehören NICHT hierher — canonicalArc bekommt nur
 * vorhandene Marker.
 *
 * Root Cause (ehemals Characterization „CURRENT ≈ 6.29 m"): die Nächstes-
 * Segment-Projektion ordnete den späten Spitzwinkel dem räumlich nahen FRÜHEN
 * Schenkel zu (Segment 2, 6.29 m, offLine 0.64 m), obwohl der Marker am
 * Linien-Scheitel Punkt 7 (Segment 6/7, 18.20 m, offLine 0.92 m) liegt — bei
 * zurücklaufenden Schenkeln liegen Anfang und Ende Dezimeter nebeneinander.
 * Fix: alle Segment-Kandidaten + Auswahl über die gemeinsame Zeitachse
 * (Linie t, Marker t). Keine Meter-/Sekunden-Schwelle.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildSearchEventArcs, arcCandidates, lineTimesMs } from '@/features/tracking/utils/canonicalArc';
import { buildArc, type LL } from '@/features/tracking/utils/searchGeometry';

const FIXTURE = path.join(__dirname, 'fixtures', 'realFieldV21', 'spitz-qa-0ec8c4ca.json');
const LAT0 = 47.0, LNG0 = 8.0;
const M_PER_LAT = 111320;
const M_PER_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const toLL = (x: number, y: number): LL => ({ latitude: LAT0 + y / M_PER_LAT, longitude: LNG0 + x / M_PER_LNG });

interface FixtureMarker { type: string; angleKind: string | null; x: number; y: number; atM: number; tMs: number; source?: string; scale?: string }
interface FixturePoint { x: number; y: number; tMs: number }

function loadFixture(withTimes: boolean) {
  const j = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const line = (j.points as FixturePoint[]).map(p => (withTimes ? { ...toLL(p.x, p.y), t: p.tMs } : toLL(p.x, p.y)));
  const markers = (j.markers as FixtureMarker[]).map((m, i) => ({
    id: `m${i}`, angleKind: m.angleKind, lat: toLL(m.x, m.y).latitude, lng: toLL(m.x, m.y).longitude,
    distance_from_start: m.atM, ...(withTimes ? { t: m.tMs } : {}),
  }));
  const arc = buildArc(line);
  return { j, line, markers, cum: arc.cum, total: arc.total, detectorPathM: j.distances.detectorPathM as number };
}

describe('canonicalArc — qa-0ec8c4ca (R → L → SL → SR, selbst-benachbarte Schenkel)', () => {
  it('Fixture-Vertrag: 2 Auto-Marker im Detektor-Maßstab, Linie ≈ 23.68 m, Detektorpfad ≈ 34.58 m, Zeiten vorhanden', () => {
    const { j, line, markers, total, detectorPathM } = loadFixture(true);
    expect(j.sessionId).toBe('qa-0ec8c4ca');
    expect(Math.abs(total - 23.68)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(detectorPathM - 34.58)).toBeLessThanOrEqual(0.05);
    expect(markers.map(m => m.angleKind)).toEqual(['rechts', 'spitz_rechts']);
    expect(markers.map(m => m.distance_from_start)).toEqual([5.9, 27.5]);
    expect(markers.map(m => m.t)).toEqual([14123, 39128]);
    for (const m of j.markers as FixtureMarker[]) { expect(m.source).toBe('auto'); expect(m.scale).toBe('detector'); }
    expect(lineTimesMs(line)).not.toBeNull();   // Produktpfad: TrackPointSample.t je Linienpunkt
    // Die gespeicherte Detektor-Distanz des SR liegt HINTER dem Linienende — der
    // Detektor-Maßstab ist als Search-Position unbrauchbar (Grund für canonicalArc).
    expect(27.5).toBeGreaterThan(total);
  });

  it('Kandidaten SR: früher Schenkel (Segment 2, 6.29 m) UND später Scheitel (Segment 6/7, 18.20 m = cum[7])', () => {
    const { line, markers, cum } = loadFixture(true);
    const sr = markers[1];
    const cands = arcCandidates({ latitude: sr.lat, longitude: sr.lng }, line, cum, lineTimesMs(line));
    expect(cands.map(c => c.segmentIndex)).toEqual([2, 6]);
    expect(Math.abs(cands[0].arcM - 6.29)).toBeLessThanOrEqual(0.01);
    expect(cands[1].arcM).toBeCloseTo(cum[7], 6);          // exakt der Linien-Scheitel Punkt 7 (frac = 1 auf Segment 6)
    expect(cands[1].frac).toBe(1);
    expect(cands[0].offLineM).toBeLessThan(cands[1].offLineM);   // Nearest wählte deshalb den falschen (0.64 < 0.92)
    // Zeitachse: früher Kandidat ≈ 14.6 s, später ≈ 34.0 s; Marker-Commit 39.1 s.
    expect((cands[0].tMs as number) / 1000).toBeCloseTo(14.6, 0);
    expect((cands[1].tMs as number) / 1000).toBeCloseTo(34.0, 0);
  });

  it('rechts (detector 5.9 m) bleibt auf Segment 1 ≈ 2.49 m — Zeitauswahl, einziger naher Kandidat', () => {
    const { line, markers } = loadFixture(true);
    const a = buildSearchEventArcs(markers, line).m0;
    expect(a.source).toBe('projected');
    expect(a.selection).toBe('time');
    expect(a.segmentIndex).toBe(1);
    expect(Math.abs((a.arcM as number) - 2.49)).toBeLessThanOrEqual(0.05);
  });

  it('late acute corner on qa-0ec8c4ca projects onto the late traversal (Segment 6, Scheitel 18.20 m), NOT onto the early leg (6.29 m)', () => {
    const { line, markers, cum, total } = loadFixture(true);
    const sr = buildSearchEventArcs(markers, line).m1;
    expect(sr.source).toBe('projected');
    expect(sr.selection).toBe('time');
    expect(sr.segmentIndex).toBe(6);
    expect(sr.arcM).toBeCloseTo(cum[7], 6);                 // geometrisch exakt aus der Linie (Scheitel Punkt 7)
    expect(Math.abs((sr.arcM as number) - 18.20)).toBeLessThanOrEqual(0.01);
    expect(Math.abs((sr.arcM as number) - 6.29)).toBeGreaterThan(5);
    expect(sr.arcM as number).toBeGreaterThan(total / 2);   // später Streckenabschnitt
    expect(sr.offLineM as number).toBeLessThan(1);
  });

  it('Reihenfolge R → SR bleibt erhalten; Lücke kanonisch ≈ 15.7 m (vorher 3.8 m, Detektor 21.6 m)', () => {
    const { line, markers } = loadFixture(true);
    const arcs = buildSearchEventArcs(markers, line);
    const r = arcs.m0.arcM as number, sr = arcs.m1.arcM as number;
    expect(r).toBeLessThan(sr);
    expect(sr - r).toBeGreaterThan(10);
  });

  it('ohne Zeitinformation (Legacy) bleibt exakt das bisherige Nearest-Verhalten — dokumentierte Grenze, kein Crash', () => {
    const { line, markers } = loadFixture(false);
    const arcs = buildSearchEventArcs(markers, line);
    expect(arcs.m0.selection).toBe('nearest');
    expect(arcs.m1.selection).toBe('nearest');
    expect(Math.abs((arcs.m0.arcM as number) - 2.49)).toBeLessThanOrEqual(0.05);
    expect(Math.abs((arcs.m1.arcM as number) - 6.29)).toBeLessThanOrEqual(0.05);   // bekannte Grenze ohne Zeitachse
  });
});
