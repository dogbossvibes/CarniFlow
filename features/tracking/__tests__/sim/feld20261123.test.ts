// Fährten-Simulator: Feldaufnahme vom 2026-11-23 (T-221) als fester Testfall.
//
// REALE QA-Aufnahme (iOS 1.0.8/60, Production-OTA), datenschutzreduziert
// (relative x/y/tMs, keine absoluten Positionen/Zeiten/IDs):
//   field20261123/first-corner-missed.json — kurze Testfährte ~19,5 m, Handy in
//   der Hand, GPS-Genauigkeit ~3 m. Sollfolge laut Hundeführerin/Karte:
//     L  ~100°, rund 5–6 m nach dem Beginn des Detektor-Puffers  ← im Feld VERPASST
//     L  ~100°, bei ~13,4 m                                      ← im Feld erkannt («90 L»)
//
// Ursache des verpassten Winkels (nachgerechnet am 2026-11-24): Die Drehung ist
// auf drei Punkte (~1,5 m) verteilt, dazu eine 2-s-Messlücke mit kleinem
// Rücksprung. An keinem Scheitel gibt es auf BEIDEN Seiten ein gerades
// Schenkelfenster → alle Kandidaten scheitern an `no_window_before/after`.
// Der erste Schenkel ist im Detektor nur ~5 m lang, weil die Startfreigabe die
// ersten ~3 m nicht in den Puffer übernimmt. Beim zweiten Winkel hat
// `split_apex_pair` die verteilte Drehung zusammengesetzt, beim ersten nicht.
//
// Dieser Test hält den IST-Zustand fest (BEKANNTE LÜCKE). Wird der erste Winkel
// künftig erkannt, schlägt er absichtlich fehl und muss bewusst angepasst werden.
// Er ist kein Auftrag, die Erkennung zu ändern (geschützte Fährtenbasis).
import * as fs from 'fs';
import * as path from 'path';
import { capturedDetectorBuffer } from '../../utils/__tests__/helpers/realSessionFixture';
import { fuseTurns } from '../../utils/turnFusion';
import { replayFieldExport, type FieldExport } from './feldReplay';

jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../../utils/backgroundLayDiagnostics', () => ({ recordBackgroundLayEvent: jest.fn(async () => {}) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) }));

const FIXTURE = path.join(__dirname, '..', '..', 'utils', '__tests__', 'fixtures', 'field20261123', 'first-corner-missed.json');
const load = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

/** Kursrichtung (Grad, 0 = Nord, im Uhrzeigersinn) zwischen zwei Puffer-Punkten. */
function bearing(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
}
/** Vorzeichenbehaftete Kursänderung, negativ = links. */
const turnDeg = (from: number, to: number) => ((to - from + 540) % 360) - 180;

describe('Feldaufnahme 2026-11-23: verpasster erster Winkel', () => {
  test('Fixture ist datenschutzreduziert', () => {
    const json = JSON.stringify(load());
    expect(json).not.toMatch(/"(?:lat|lng|latitude|longitude|sessionId|userId|email|createdAt|startedAt|endedAt|absoluteTimestamp|updateId)"/i);
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  test('der erste Knick ist in der GPS-Geometrie eindeutig: ~100° links', () => {
    const p = load().detectorPoints;
    const turn = turnDeg(bearing(p[0], p[4]), bearing(p[8], p[12]));
    expect(turn).toBeLessThan(-80);
    expect(turn).toBeGreaterThan(-120);
  });

  test('im Feld: nur der zweite Winkel gemeldet, die Kandidaten am ersten Knick scheiterten an fehlenden Schenkelfenstern', () => {
    const d = load();
    expect(d.turnFusion.map((t: any) => [t.kind, t.flags])).toEqual([['links', ['split_apex_pair']]]);
    expect(d.markers.map((m: any) => [m.type, m.angleKind])).toEqual([['winkel', 'links']]);
    const reasons = d.autoDiagnostics.filter((x: any) => x.apexIndex >= 4 && x.apexIndex <= 10).map((x: any) => x.rejectReason);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.every((r: string) => r === 'no_window_before' || r === 'no_window_after')).toBe(true);
  });

  test('BEKANNTE LÜCKE: nur aus GPS (ohne Bewegungssensor) findet die Erkennung auf dem Feld-Puffer keinen Winkel', () => {
    // Im Feld hob erst der Sensor-Zuschlag (+0,06) den zweiten Winkel über die Schwelle.
    const r = fuseTurns(capturedDetectorBuffer(load().detectorPoints));
    expect(r.corners).toEqual([]);
  });

  test('BEKANNTE LÜCKE: die ganze Lege-Verarbeitung meldet mit Sensor nur den zweiten Winkel, ohne Sensor keinen', () => {
    const report = replayFieldExport(load() as FieldExport, { seeds: 0 });
    expect(report.field).toEqual([{ kind: 'links', atM: 13.4 }]);
    expect(report.withMotion!.corners.map(c => c.kind)).toEqual(['links']);
    expect(Math.abs(report.withMotion!.corners[0].atM - 13.4)).toBeLessThan(1.5);
    expect(report.withoutMotion.corners).toEqual([]);
  });
});
