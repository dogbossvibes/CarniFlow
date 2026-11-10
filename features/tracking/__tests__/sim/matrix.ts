// Fährten-Simulator (T-192) — reiner Testcode.
// Szenario-Matrix: welche Kombinationen laufen, wie werden sie zusammengefasst,
// und wie sieht der Bericht aus.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ANDROID_BATCH_30S, CARRY_LABEL, DEVICE_LABEL, ENV_LABEL, type DeviceClass, type Environment } from './profiles';
import { runScenario, type Scenario, type ScenarioOutcome } from './scenario';
import { EXAM_TRACKS, expectedKindFor, singleCornerTrack } from './truthTrack';

export type GroupName = 'winkel' | 'geraet' | 'varianten' | 'pruefung';
export const GROUPS: GroupName[] = ['winkel', 'geraet', 'varianten', 'pruefung'];

export interface MatrixCase { table: string; row: string; col: string; scenario: Scenario }

export interface Cell {
  table: string; row: string; col: string;
  runs: number;
  cornersTruth: number; cornersFound: number; kindCorrect: number; directionCorrect: number; cornersSpurious: number;
  truthLengthM: number;
  apexErrSumM: number; apexErrN: number;
  shapeErrSumM: number; lineErrSumM: number; lineN: number;
  distanceErrPctSum: number; distanceErrAbsPctSum: number;
  startErrSumM: number; startN: number;
  coverageSum: number;
  fixComputeMaxMs: number;
  noLine: number;
}

export interface GroupResult { group: GroupName; seeds: number; runs: number; elapsedS: number; cells: Cell[] }

/** Richtungsänderungen der Winkel-Matrix (Grad). Innenwinkel = 180 − Wert. */
export const SWEEP_TURNS = [30, 45, 60, 75, 90, 105, 120, 135, 150];
export const SWEEP_LEGS_M = [10, 20, 40];

function angleLabel(turnAbs: number): string {
  const k = expectedKindFor(turnAbs).expected;
  const cls = k == null ? 'keine App-Klasse' : k.startsWith('spitz') ? 'spitz' : 'normal';
  return `Innenwinkel ${180 - turnAbs}° (${cls})`;
}
const signed = (turnAbs: number, seed: number) => (seed % 2 === 0 ? turnAbs : -turnAbs);
const BASE = { device: 'single', env: 'open', carry: 'hand', platform: 'ios' } as const;

export function buildGroup(group: GroupName, seeds: number, examTracks?: string[]): MatrixCase[] {
  const cases: MatrixCase[] = [];
  const seedList = Array.from({ length: seeds }, (_, i) => i + 1);
  if (group === 'winkel') {
    for (const turn of SWEEP_TURNS) for (const leg of SWEEP_LEGS_M) {
      for (const device of ['dual', 'single'] as DeviceClass[]) for (const seed of seedList)
        cases.push({ table: `Winkel × Schenkellänge — ${DEVICE_LABEL[device]}, offenes Feld, in der Hand`, row: angleLabel(turn), col: `${leg} m`,
          scenario: { ...BASE, device, track: singleCornerTrack(signed(turn, seed), leg), seed } });
      for (const seed of seedList.slice(0, 2))
        cases.push({ table: 'Kontrolle: fehlerfreies GPS', row: angleLabel(turn), col: `${leg} m`,
          scenario: { ...BASE, device: 'ideal', track: singleCornerTrack(signed(turn, seed), leg), seed } });
    }
  } else if (group === 'geraet') {
    for (const [turn, name] of [[90, 'rechter Winkel (90°)'], [135, 'Spitzwinkel (45°)']] as const)
      for (const device of ['dual', 'single', 'weak'] as DeviceClass[]) for (const env of ['open', 'edge', 'forest', 'dense'] as Environment[])
        for (const seed of seedList)
          cases.push({ table: `Gerät × Umgebung — ${name}, 40-m-Schenkel`, row: DEVICE_LABEL[device], col: ENV_LABEL[env],
            scenario: { ...BASE, device, env, track: singleCornerTrack(signed(turn, seed), 40), seed } });
  } else if (group === 'varianten') {
    const variants: [string, Partial<Scenario>][] = [
      ['Basis (in der Hand, iPhone, 1,0 m/s)', {}],
      [CARRY_LABEL.pocket, { carry: 'pocket' }],
      ['Android, im Hintergrund gebündelt (30 s)', { platform: 'android', delivery: ANDROID_BATCH_30S }],
      ['Langsam gelegt (0,7 m/s)', { walk: { speedMps: 0.7 } }],
      ['Zügig gelegt (1,3 m/s)', { walk: { speedMps: 1.3 } }],
      ['Ohne Bewegungssensor (nur GPS)', { motion: false }],
      ['Veraltete erste Position', { gpsOverride: { staleFirstFix: { offsetM: 25, ageS: 12 }, settleM: 8 } }],
      ['20 s Stehen am Abgang', { walk: { startStandS: 20 } }],
    ];
    for (const env of ['open', 'edge'] as Environment[]) for (const [label, patch] of variants)
      for (const [turn, name] of [[90, 'rechter Winkel'], [135, 'Spitzwinkel 45°']] as const)
        for (const seed of seedList)
          cases.push({ table: `Varianten — ${ENV_LABEL[env]}, Mittelklasse-Handy, 40-m-Schenkel`, row: label, col: name,
            scenario: { ...BASE, env, ...patch, track: singleCornerTrack(signed(turn, seed), 40), seed } });
  } else {
    const names = examTracks ?? ['IGP-1', 'IGP-2', 'IGP-3'];
    const combos: [DeviceClass, Environment][] = [['dual', 'open'], ['single', 'open'], ['single', 'edge'], ['single', 'forest']];
    for (const name of names) {
      const track = EXAM_TRACKS[name];
      if (!track) throw new Error(`Unbekannte Prüfungsfährte "${name}". Bekannt: ${Object.keys(EXAM_TRACKS).join(', ')}`);
      for (const [device, env] of combos) for (const seed of seedList.slice(0, Math.max(1, Math.ceil(seeds / 3))))
        cases.push({ table: 'Prüfungsfährten (ganze Fährte)', row: name, col: `${device === 'dual' ? 'Neueres Handy' : 'Mittelklasse'}, ${ENV_LABEL[env]}`,
          scenario: { ...BASE, device, env, track, seed } });
    }
  }
  return cases;
}

function emptyCell(table: string, row: string, col: string): Cell {
  return {
    table, row, col, runs: 0, cornersTruth: 0, cornersFound: 0, kindCorrect: 0, directionCorrect: 0, cornersSpurious: 0, truthLengthM: 0,
    apexErrSumM: 0, apexErrN: 0, shapeErrSumM: 0, lineErrSumM: 0, lineN: 0, distanceErrPctSum: 0, distanceErrAbsPctSum: 0,
    startErrSumM: 0, startN: 0, coverageSum: 0, fixComputeMaxMs: 0, noLine: 0,
  };
}

export function addOutcome(cell: Cell, o: ScenarioOutcome): void {
  const s = o.score;
  cell.runs++;
  cell.cornersTruth += s.cornersTruth; cell.cornersFound += s.cornersFound; cell.kindCorrect += s.kindCorrect;
  cell.directionCorrect += s.directionCorrect; cell.cornersSpurious += s.cornersSpurious; cell.truthLengthM += o.truth.lengthM;
  for (const c of s.corners) if (c.apexErrM != null) { cell.apexErrSumM += c.apexErrM; cell.apexErrN++; }
  if (s.shapeErrMeanM != null && s.lineErrMeanM != null) { cell.shapeErrSumM += s.shapeErrMeanM; cell.lineErrSumM += s.lineErrMeanM; cell.lineN++; } else cell.noLine++;
  cell.distanceErrPctSum += s.distanceErrPct; cell.distanceErrAbsPctSum += Math.abs(s.distanceErrPct);
  if (s.startErrM != null) { cell.startErrSumM += s.startErrM; cell.startN++; }
  cell.coverageSum += s.coverage;
  cell.fixComputeMaxMs = Math.max(cell.fixComputeMaxMs, o.run.fixComputeMaxMs);
}

export function runGroup(group: GroupName, seeds: number, examTracks?: string[]): GroupResult {
  const started = Date.now();
  const cells = new Map<string, Cell>();
  const cases = buildGroup(group, seeds, examTracks);
  for (const c of cases) {
    const key = `${c.table}|${c.row}|${c.col}`;
    if (!cells.has(key)) cells.set(key, emptyCell(c.table, c.row, c.col));
    addOutcome(cells.get(key)!, runScenario(c.scenario));
  }
  return { group, seeds, runs: cases.length, elapsedS: Math.round((Date.now() - started) / 1000), cells: [...cells.values()] };
}

// ── Bericht ─────────────────────────────────────────────────────────────────
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '–');
const num = (v: number, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '–');

function renderTable(cells: Cell[], title: string, value: (c: Cell) => string): string {
  const rows = [...new Set(cells.map(c => c.row))], cols = [...new Set(cells.map(c => c.col))];
  const get = (r: string, c: string) => cells.find(x => x.row === r && x.col === c);
  const lines = [`**${title}**`, '', `| | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`];
  for (const r of rows) lines.push(`| ${r} | ${cols.map(c => { const cell = get(r, c); return cell ? value(cell) : '–'; }).join(' | ')} |`);
  return lines.join('\n');
}

export function renderReport(results: GroupResult[]): string {
  const out: string[] = ['# Fährten-Simulator — Matrixbericht (Legen)', ''];
  const runs = results.reduce((s, r) => s + r.runs, 0);
  out.push(`${runs} simulierte Legeläufe durch die echte Lege-Verarbeitung der App. Gruppen: ${results.map(r => `${r.group} (${r.runs} Läufe, ${r.elapsedS} s)`).join(', ')}.`, '');
  out.push('Alle Zahlen sind Simulationsergebnisse mit angenommenen Fehlermodellen (siehe README.md), keine Feldmessungen.', '');
  out.push('Statistische Unsicherheit: bei 12 Läufen je Zelle schwankt ein Prozentwert zufällig um rund ±15 Punkte, bei 6 Läufen um ±20. Einzelne Zellen nicht überbewerten, auf Muster über mehrere Zellen achten.', '');
  for (const result of results) {
    for (const table of [...new Set(result.cells.map(c => c.table))]) {
      const cells = result.cells.filter(c => c.table === table);
      out.push(`## ${table}`, '', `Läufe je Zelle: ${cells[0]?.runs ?? 0}.`, '');
      out.push(renderTable(cells, 'Winkel gefunden UND richtig klassiert', c => pct(c.kindCorrect, c.cornersTruth)), '');
      out.push(renderTable(cells, 'Winkel gefunden (egal welche Klasse) · falsche Zusatzwinkel je 100 m',
        c => `${pct(c.cornersFound, c.cornersTruth)} · ${num((c.cornersSpurious / Math.max(1, c.truthLengthM)) * 100)}`), '');
      out.push(renderTable(cells, 'Lage des erkannten Winkels: Abstand zum wahren Winkelpunkt (m) · Richtung richtig',
        c => `${c.apexErrN ? num(c.apexErrSumM / c.apexErrN) : '–'} · ${pct(c.directionCorrect, c.cornersFound)}`), '');
      out.push(renderTable(cells, 'Linie: Formfehler (m) · Längenfehler (Betrag, %) · Startpunktfehler (m)',
        c => `${c.lineN ? num(c.shapeErrSumM / c.lineN) : '–'} · ${num(c.distanceErrAbsPctSum / c.runs)} · ${c.startN ? num(c.startErrSumM / c.startN) : '–'}`), '');
      out.push(renderTable(cells, 'Längste Rechenzeit der Engine für eine einzelne GPS-Messung (ms, auf diesem Rechner)', c => num(c.fixComputeMaxMs, 0)), '');
    }
  }
  return out.join('\n');
}

/** Schreibt das Gruppenergebnis und erzeugt den Gesamtbericht aus allen vorhandenen Gruppen neu. */
export function writeGroupResult(outDir: string, result: GroupResult): string {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `group-${result.group}.json`), JSON.stringify(result, null, 1));
  const all = readdirSync(outDir).filter(f => /^group-.*\.json$/.test(f))
    .map(f => JSON.parse(readFileSync(join(outDir, f), 'utf8')) as GroupResult)
    .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
  const reportPath = join(outDir, 'REPORT.md');
  writeFileSync(reportPath, renderReport(all));
  return reportPath;
}
