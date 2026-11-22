// Fährten-Simulator: Wiedergabe von Feldaufnahmen (QA-Export) durch die echte Lege-Verarbeitung.
// Die Selbsttests laufen immer mit. Die Wiedergabe echter Aufnahmen läuft nur, wenn
// FAEHRTEN_FELD gesetzt ist (ein oder mehrere Pfade, mit Komma getrennt).
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { addFieldNoise, fieldInputFromExport, renderFieldReport, replayFieldExport, type FieldExport } from './feldReplay';
import { SIM_T0_MS } from './layRunner';

jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../../utils/backgroundLayDiagnostics', () => ({ recordBackgroundLayEvent: jest.fn(async () => {}) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) }));

/** Künstlicher Export: 40 m nach Norden, Rechtswinkel, 40 m nach Osten; 1 Messung je Sekunde bei 1,2 m/s. */
function syntheticExport(): FieldExport {
  const rawFixes: NonNullable<FieldExport['rawFixes']> = [];
  const speed = 1.2, leg = 40;
  for (let i = 0; i * speed <= 2 * leg; i++) {
    const s = i * speed;
    rawFixes.push({ x: s <= leg ? 0 : s - leg, y: Math.min(s, leg), accuracy: 3, tMs: i * 1000, receivedMs: i * 1000 + 60, deliverySource: 'foreground' });
  }
  return { schemaVersion: 2, rawFixes, motionTimeline: { samples: [] }, markers: [{ type: 'winkel', angleKind: 'rechts', atM: 40, source: 'auto' }, { type: 'gegenstand', atM: 60 }] };
}

describe('Feld-Wiedergabe: Bausteine', () => {
  test('Export wird in Messungen, Sensorwerte und Feld-Winkel übersetzt', () => {
    const d = syntheticExport();
    d.motionTimeline = { samples: [{ tMs: 500, receivedMs: 520, headingDelta: 1, rotationMagnitude: 0.1, accelerationMagnitude: 0.02, stepDelta: 1, cadence: 100, movementState: 'walking' }] };
    const input = fieldInputFromExport(d);
    expect(input.fixes).toHaveLength(d.rawFixes!.length);
    expect(input.fixes[0]).toMatchObject({ tMs: SIM_T0_MS, receivedMs: SIM_T0_MS + 60, x: 0, y: 0, background: false, speedMps: 0 });
    expect(input.fixes[1].speedMps).toBeCloseTo(1.2, 6);
    expect(input.motion).toHaveLength(1);
    expect(input.motion[0].t).toBe(SIM_T0_MS + 520);
    expect(input.motion[0]).not.toHaveProperty('tMs');
    expect(input.fieldCorners).toEqual([{ kind: 'rechts', atM: 40 }]);
  });

  test('Export ohne Rohmessungen wird klar abgelehnt', () => {
    expect(() => fieldInputFromExport({ rawFixes: [] })).toThrow(/Rohmessungen/);
  });

  test('Rauschen ist je Seed gleich, verändert Lage und lässt Zeiten unberührt', () => {
    const { fixes } = fieldInputFromExport(syntheticExport());
    const level = { driftM: 1, jitterM: 0.5 };
    const a = addFieldNoise(fixes, level, 7), b = addFieldNoise(fixes, level, 7), c = addFieldNoise(fixes, level, 8);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.map(f => f.tMs)).toEqual(fixes.map(f => f.tMs));
    expect(a.some((f, i) => f.x !== fixes[i].x)).toBe(true);
    expect(addFieldNoise(fixes, { driftM: 0, jitterM: 0 }, 7)).toEqual(fixes);
  });

  test('saubere Aufnahme: die echte Engine findet genau den einen Rechtswinkel', () => {
    const r = replayFieldExport(syntheticExport(), { seeds: 2, levels: [{ driftM: 0, jitterM: 0.1 }] });
    expect(r.withMotion).toBeNull();
    expect(r.withoutMotion.corners.map(c => c.kind)).toEqual(['rechts']);
    // Die Engine zählt die Strecke erst ab der Startfreigabe, darum liegt der Winkel einige Meter vor 40 m.
    expect(Math.abs(r.withoutMotion.corners[0].atM - 40)).toBeLessThan(10);
    expect(r.noise).toHaveLength(1);
    expect(r.noise[0]).toMatchObject({ motion: false, runs: 2 });
    expect(r.noise[0].sameAsField + r.noise[0].tooFew + r.noise[0].tooMany + r.noise[0].wrongDirection).toBe(2);
    expect(renderFieldReport('test', r)).toContain('ohne Sensor:     rechts@');
  });
});

const fieldFiles = (process.env.FAEHRTEN_FELD ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
(fieldFiles.length ? test : test.skip)('Feld-Wiedergabe: Aufnahmen aus FAEHRTEN_FELD', () => {
  const seeds = Math.max(0, Number(process.env.FAEHRTEN_FELD_SEEDS ?? 60) || 0);
  const outDir = process.env.FAEHRTEN_SIM_OUT || join(tmpdir(), 'anyvo-faehrten-sim');
  mkdirSync(outDir, { recursive: true });
  for (const file of fieldFiles) {
    const report = replayFieldExport(JSON.parse(readFileSync(file, 'utf8')) as FieldExport, { seeds });
    const name = basename(file).replace(/\.json$/i, '');
    const outPath = join(outDir, `feld-${name}.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 1));
    process.stdout.write(`\n[faehrten-sim] ${renderFieldReport(name, report)}\n  → ${outPath}\n`);
    expect(report.withoutMotion.linePoints).toBeGreaterThan(0);
  }
}, 60 * 60 * 1000);
