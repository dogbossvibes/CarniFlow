// Fährten-Simulator: Parameterstudie zum Linien-Gate. Die Selbsttests laufen immer mit.
// Die Studie läuft nur mit FAEHRTEN_LINEGATE=1 (alle Varianten) oder einer Liste von
// Varianten-Nummern (z. B. FAEHRTEN_LINEGATE=0,2,6); Feldaufnahmen zusätzlich über FAEHRTEN_FELD.
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { LINE_GATE } from '../../utils/turnAwareLineGate';
import type { FieldExport } from './feldReplay';
import { buildStudyCases, fieldStudy, GATE_VARIANTS, renderFieldStudy, renderStudy, runStudy, withLineGate } from './lineGateStudy';
import { runScenario } from './scenario';
import { distanceToPolylineM, lineWiggleDeg, polylineLengthM } from './scoring';
import { singleCornerTrack } from './truthTrack';

jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../../utils/backgroundLayDiagnostics', () => ({ recordBackgroundLayEvent: jest.fn(async () => {}) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) }));

describe('Ecken-Kennzahl und Linien-Gate-Studie: Bausteine', () => {
  test('Abstand zum Linienzug, Länge und Unruhe', () => {
    const corner = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }];
    expect(distanceToPolylineM(corner, 0, 10)).toBeCloseTo(0, 9);
    // Abgeschnittene Ecke: Diagonale von (0,8) nach (2,10) liegt √2 m vom Winkelpunkt entfernt.
    expect(distanceToPolylineM([{ x: 0, y: 0 }, { x: 0, y: 8 }, { x: 2, y: 10 }, { x: 10, y: 10 }], 0, 10)).toBeCloseTo(Math.SQRT2, 9);
    expect(distanceToPolylineM([{ x: 0, y: 0 }], 0, 10)).toBeNull();
    expect(polylineLengthM(corner)).toBeCloseTo(20, 9);
    expect(lineWiggleDeg(corner)).toBeCloseTo(90, 9);
    expect(lineWiggleDeg(corner, [{ x: 0, y: 10 }])).toBeNull();
  });

  test('fehlerfreies GPS: Ecken-Abschnitt wird gemessen und sinkt mit weniger Glättung', () => {
    const scenario = { device: 'ideal', env: 'open', carry: 'hand', platform: 'ios', track: singleCornerTrack(90, 20), seed: 1 } as const;
    const base = runScenario(scenario).score;
    const light = withLineGate({ emaAlpha: 0.7 }, () => runScenario(scenario).score);
    expect(base.cornerCutMeanM).not.toBeNull();
    expect(base.cornerCutGpsMeanM).toBeCloseTo(base.cornerCutMeanM as number, 6);   // ohne Messfehler identisch
    expect(base.cornerCutMeanM as number).toBeLessThan(3);
    expect(light.cornerCutMeanM as number).toBeLessThanOrEqual(base.cornerCutMeanM as number);
    expect(base.lineLengthM).toBeGreaterThan(30);
  });

  test('Varianten überschreiben LINE_GATE nur vorübergehend', () => {
    const before = { ...LINE_GATE };
    expect(withLineGate({ emaAlpha: 0.7, lookM: 1 }, () => [LINE_GATE.emaAlpha, LINE_GATE.lookM])).toEqual([0.7, 1]);
    expect(() => withLineGate({ stepM: 1 }, () => { throw new Error('x'); })).toThrow('x');
    expect({ ...LINE_GATE }).toEqual(before);
    expect(GATE_VARIANTS[0].patch).toEqual({});
    expect(buildStudyCases(2).length).toBeGreaterThan(40);
  });
});

const mode = process.env.FAEHRTEN_LINEGATE;
const outDir = process.env.FAEHRTEN_SIM_OUT || join(tmpdir(), 'anyvo-faehrten-sim');
const variants = !mode || mode === '1' || mode === 'full'
  ? GATE_VARIANTS
  : mode.split(',').map((s: string) => GATE_VARIANTS[Number(s)]).filter(Boolean);

(mode ? test : test.skip)('Linien-Gate-Studie: Matrix', () => {
  const seeds = Math.max(1, Number(process.env.FAEHRTEN_SIM_SEEDS) || 6);
  mkdirSync(outDir, { recursive: true });
  const cells = runStudy(variants, seeds, text => process.stdout.write(`\n[linegate] ${text}`));
  const tag = process.env.FAEHRTEN_LINEGATE_TAG || 'studie';
  writeFileSync(join(outDir, `linegate-${tag}.json`), JSON.stringify({ seeds, variants, cells }, null, 1));
  writeFileSync(join(outDir, `linegate-${tag}.md`), renderStudy(cells, variants, seeds));
  process.stdout.write(`\n[linegate] → ${join(outDir, `linegate-${tag}.md`)}\n`);
  expect(cells.length).toBeGreaterThan(0);
}, 6 * 60 * 60 * 1000);

const fieldFiles = (process.env.FAEHRTEN_FELD ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
(mode && fieldFiles.length ? test : test.skip)('Linien-Gate-Studie: Feldaufnahmen aus FAEHRTEN_FELD', () => {
  const seeds = Math.max(0, Number(process.env.FAEHRTEN_FELD_SEEDS ?? 60) || 0);
  mkdirSync(outDir, { recursive: true });
  const parts: string[] = [];
  for (const file of fieldFiles) {
    const name = basename(file).replace(/\.json$/i, '');
    const rows = fieldStudy(JSON.parse(readFileSync(file, 'utf8')) as FieldExport, variants, seeds);
    writeFileSync(join(outDir, `linegate-feld-${name}.json`), JSON.stringify(rows, null, 1));
    parts.push(renderFieldStudy(name, rows));
    expect(rows[0].linePoints).toBeGreaterThan(0);
  }
  writeFileSync(join(outDir, 'linegate-feld.md'), parts.join('\n\n'));
  process.stdout.write(`\n[linegate] ${parts.join('\n\n')}\n`);
}, 60 * 60 * 1000);
