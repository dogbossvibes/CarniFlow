// Fährten-Simulator — reiner Testcode, wird von der App nicht importiert.
// Parameterstudie zum Linien-Gate (utils/turnAwareLineGate.ts): Dieselben Szenarien laufen
// mit unveränderten Werten und mit Varianten von LINE_GATE durch die ECHTE Lege-Verarbeitung.
// Die Varianten werden nur für die Dauer eines Laufs im Speicher überschrieben und danach
// zurückgesetzt; die Produktdatei bleibt unverändert.
import { LINE_GATE } from '../../utils/turnAwareLineGate';
import { addFieldNoise, fieldInputFromExport, FIELD_NOISE_LEVELS, type FieldExport } from './feldReplay';
import { runLay } from './layRunner';
import { ANDROID_BATCH_30S, ENV_LABEL, type Environment } from './profiles';
import { runScenario, type Scenario } from './scenario';
import { distanceToPolylineM, polylineLengthM } from './scoring';
import { EXAM_TRACKS, singleCornerTrack, type TrackSpec } from './truthTrack';

export type GatePatch = Partial<Record<keyof typeof LINE_GATE, number>>;
export interface GateVariant { name: string; patch: GatePatch }

export const GATE_VARIANTS: GateVariant[] = [
  { name: 'Basis (0,4 / 1,5 m)', patch: {} },
  { name: 'emaAlpha 0,5', patch: { emaAlpha: 0.5 } },
  { name: 'emaAlpha 0,6', patch: { emaAlpha: 0.6 } },
  { name: 'emaAlpha 0,7', patch: { emaAlpha: 0.7 } },
  { name: 'lookM 1,0', patch: { lookM: 1.0 } },
  { name: 'emaAlpha 0,5 + lookM 1,0', patch: { emaAlpha: 0.5, lookM: 1.0 } },
  { name: 'emaAlpha 0,6 + lookM 1,0', patch: { emaAlpha: 0.6, lookM: 1.0 } },
  { name: 'emaAlpha 0,7 + lookM 1,0', patch: { emaAlpha: 0.7, lookM: 1.0 } },
  { name: 'stepM 1,5', patch: { stepM: 1.5 } },
  { name: 'stepM 1,0', patch: { stepM: 1.0 } },
];

/** Führt `fn` mit überschriebenen LINE_GATE-Werten aus und stellt die Originalwerte in jedem Fall wieder her. */
export function withLineGate<T>(patch: GatePatch, fn: () => T): T {
  const gate = LINE_GATE as unknown as Record<string, number>;
  const original = { ...gate };
  Object.assign(gate, patch);
  try { return fn(); } finally { Object.assign(gate, original); }
}

export interface StudyCase { env: string; leg: string; kind: string; scenario: Scenario }

/** Kurze Übungsfährte wie in den Feldaufnahmen (Schenkel 5–7 m, zwei rechte Winkel, ein Spitzwinkel). */
export function shortTrack(mirror: boolean): TrackSpec {
  const k = mirror ? -1 : 1;
  return { name: `kurz${mirror ? 'R' : 'L'}`, parts: [{ leg: 7 }, { turn: 90 * k }, { leg: 5 }, { turn: 90 * k }, { leg: 7 }, { turn: -135 * k }, { leg: 7 }] };
}

const BASE = { device: 'single', env: 'open', carry: 'hand', platform: 'ios' } as const;
export const STUDY_ENVS: Environment[] = ['open', 'edge', 'forest'];
export const STUDY_LEGS_M = [10, 20, 40];

export function buildStudyCases(seeds: number): StudyCase[] {
  const cases: StudyCase[] = [];
  const seedList = Array.from({ length: seeds }, (_, i) => i + 1);
  const signed = (turn: number, seed: number) => (seed % 2 === 0 ? turn : -turn);
  for (const env of STUDY_ENVS) {
    for (const seed of seedList) {
      cases.push({ env: ENV_LABEL[env], leg: '5–7 m (Kurzfährte)', kind: 'gemischt', scenario: { ...BASE, env, track: shortTrack(seed % 2 === 0), seed } });
      for (const leg of STUDY_LEGS_M) for (const [turn, kind] of [[90, 'rechter Winkel'], [135, 'Spitzwinkel 45°']] as const)
        cases.push({ env: ENV_LABEL[env], leg: `${leg} m`, kind, scenario: { ...BASE, env, track: singleCornerTrack(signed(turn, seed), leg), seed } });
    }
    if (env !== 'edge') for (const seed of seedList.slice(0, Math.max(1, Math.ceil(seeds / 4))))
      cases.push({ env: ENV_LABEL[env], leg: 'IGP-1 (75 m)', kind: 'rechter Winkel', scenario: { ...BASE, env, track: EXAM_TRACKS['IGP-1'], seed } });
  }
  // Gehweise und Gerät: nur offenes Feld, 20-m-Schenkel, rechter Winkel.
  const extras: [string, Partial<Scenario>][] = [
    ['Langsam gelegt (0,7 m/s)', { walk: { speedMps: 0.7 } }],
    ['Zügig gelegt (1,3 m/s)', { walk: { speedMps: 1.3 } }],
    ['Ohne Bewegungssensor', { motion: false }],
    ['Android gebündelt (30 s)', { platform: 'android', delivery: ANDROID_BATCH_30S }],
  ];
  for (const [label, patch] of extras) for (const seed of seedList)
    cases.push({ env: `Sonderfall: ${label}`, leg: '20 m', kind: 'rechter Winkel', scenario: { ...BASE, ...patch, track: singleCornerTrack(signed(90, seed), 20), seed } });
  return cases;
}

export interface StudyCell {
  variant: string; env: string; leg: string; kind: string;
  runs: number; cornersTruth: number; cornersFound: number; cornersSpurious: number; kindCorrect: number; directionCorrect: number;
  cutSum: number; cutShapeSum: number; cutGpsSum: number; cutN: number; cutGpsN: number; cutMax: number;
  apexToLineSum: number; apexToLineN: number; apexErrSum: number; apexErrN: number;
  lineErrSum: number; lineErrP95Sum: number; shapeErrSum: number; lineN: number;
  lineLengthErrPctSum: number; wiggleSum: number; wiggleN: number; linePointsSum: number; truthLengthSum: number;
}

function emptyCell(variant: string, c: StudyCase): StudyCell {
  return {
    variant, env: c.env, leg: c.leg, kind: c.kind, runs: 0, cornersTruth: 0, cornersFound: 0, cornersSpurious: 0, kindCorrect: 0, directionCorrect: 0,
    cutSum: 0, cutShapeSum: 0, cutGpsSum: 0, cutN: 0, cutGpsN: 0, cutMax: 0, apexToLineSum: 0, apexToLineN: 0, apexErrSum: 0, apexErrN: 0,
    lineErrSum: 0, lineErrP95Sum: 0, shapeErrSum: 0, lineN: 0, lineLengthErrPctSum: 0, wiggleSum: 0, wiggleN: 0, linePointsSum: 0, truthLengthSum: 0,
  };
}

export function runStudy(variants: readonly GateVariant[], seeds: number, onProgress?: (text: string) => void): StudyCell[] {
  const cases = buildStudyCases(seeds);
  const cells = new Map<string, StudyCell>();
  for (const variant of variants) {
    const started = Date.now();
    withLineGate(variant.patch, () => {
      for (const c of cases) {
        const key = [variant.name, c.env, c.leg, c.kind].join('|');
        if (!cells.has(key)) cells.set(key, emptyCell(variant.name, c));
        const cell = cells.get(key)!;
        const { score: s, truth } = runScenario(c.scenario);
        cell.runs++; cell.cornersTruth += s.cornersTruth; cell.cornersFound += s.cornersFound; cell.cornersSpurious += s.cornersSpurious;
        cell.kindCorrect += s.kindCorrect; cell.directionCorrect += s.directionCorrect; cell.truthLengthSum += truth.lengthM;
        for (const k of s.corners) {
          if (k.cutM != null && k.cutShapeM != null) { cell.cutSum += k.cutM; cell.cutShapeSum += k.cutShapeM; cell.cutN++; cell.cutMax = Math.max(cell.cutMax, k.cutM); }
          if (k.cutGpsM != null) { cell.cutGpsSum += k.cutGpsM; cell.cutGpsN++; }
          if (k.apexErrM != null) { cell.apexErrSum += k.apexErrM; cell.apexErrN++; }
        }
        if (s.apexToLineMeanM != null) { cell.apexToLineSum += s.apexToLineMeanM; cell.apexToLineN++; }
        if (s.lineErrMeanM != null && s.lineErrP95M != null && s.shapeErrMeanM != null) {
          cell.lineErrSum += s.lineErrMeanM; cell.lineErrP95Sum += s.lineErrP95M; cell.shapeErrSum += s.shapeErrMeanM; cell.lineN++;
          cell.lineLengthErrPctSum += s.lineLengthErrPct; cell.linePointsSum += s.linePoints;
        }
        if (s.lineWiggleDeg != null) { cell.wiggleSum += s.lineWiggleDeg; cell.wiggleN++; }
      }
    });
    onProgress?.(`${variant.name}: ${cases.length} Läufe in ${Math.round((Date.now() - started) / 1000)} s`);
  }
  return [...cells.values()];
}

// ── Bericht ─────────────────────────────────────────────────────────────────
const NUMERIC = (c: StudyCell) => Object.entries(c).filter(([, v]) => typeof v === 'number') as [keyof StudyCell, number][];

/** Zellen zusammenlegen (Summen addieren, Maximum behalten). */
export function mergeCells(cells: readonly StudyCell[], label: Pick<StudyCell, 'variant' | 'env' | 'leg' | 'kind'>): StudyCell {
  const out = { ...emptyCell(label.variant, { env: label.env, leg: label.leg, kind: label.kind, scenario: null as never }) };
  for (const c of cells) for (const [k, v] of NUMERIC(c)) {
    if (k === 'cutMax') out.cutMax = Math.max(out.cutMax, v); else (out[k] as number) += v;
  }
  return out;
}

const f2 = (v: number, n: number) => (n ? (v / n).toFixed(2) : '—');
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—');

export function renderRow(label: string, c: StudyCell): string {
  return `| ${label} | ${c.runs} | ${f2(c.cutGpsSum, c.cutGpsN)} | ${f2(c.cutShapeSum, c.cutN)} | ${f2(c.cutSum, c.cutN)} | ${f2(c.apexToLineSum, c.apexToLineN)} | `
    + `${f2(c.lineErrSum, c.lineN)} | ${f2(c.lineErrP95Sum, c.lineN)} | ${f2(c.shapeErrSum, c.lineN)} | ${c.lineN ? (c.lineLengthErrPctSum / c.lineN).toFixed(1) : '—'} | `
    + `${c.wiggleN ? (c.wiggleSum / c.wiggleN).toFixed(1) : '—'} | ${c.lineN ? (c.linePointsSum / c.lineN).toFixed(1) : '—'} | `
    + `${c.cornersFound}/${c.cornersTruth} | ${c.cornersSpurious} | ${pct(c.kindCorrect, c.cornersFound)} | ${f2(c.apexErrSum, c.apexErrN)} |`;
}
const HEAD = (first: string) => `| ${first} | Läufe | Ecke↔Linie (GPS-Sicht) m | Ecke↔Linie (Form) m | Ecke↔Linie (absolut) m | gemeldeter Winkel↔Linie m | Linienfehler Mittel m | Linienfehler P95 m | Formfehler m | Linienlänge % | Unruhe °/Punkt | Punkte | Winkel gefunden | falsche | Klasse richtig | Winkelpunkt-Fehler m |\n|${'---|'.repeat(16)}`;

export function renderStudy(cells: readonly StudyCell[], variants: readonly GateVariant[], seeds: number): string {
  const out: string[] = ['# Linien-Gate: Parameterstudie (Fährten-Simulator)', '',
    `Wiederholungen je Zelle: ${seeds}. Jede Variante läuft mit denselben Seeds (gleiches GPS-Rauschen), die Unterschiede sind deshalb paarweise vergleichbar.`, ''];
  const section = (title: string, filter: (c: StudyCell) => boolean) => {
    out.push(`## ${title}`, '', HEAD('Variante'));
    for (const v of variants) {
      const sel = cells.filter(c => c.variant === v.name && filter(c));
      if (sel.length) out.push(renderRow(v.name, mergeCells(sel, { variant: v.name, env: '', leg: '', kind: '' })));
    }
    out.push('');
  };
  const regular = (c: StudyCell) => !c.env.startsWith('Sonderfall');
  section('Alle Umgebungen und Schenkel (ohne Sonderfälle)', regular);
  for (const env of [...new Set(cells.filter(regular).map(c => c.env))]) section(`Umgebung: ${env}`, c => c.env === env);
  for (const leg of [...new Set(cells.filter(regular).map(c => c.leg))]) section(`Schenkel: ${leg}`, c => regular(c) && c.leg === leg);
  for (const kind of ['rechter Winkel', 'Spitzwinkel 45°']) section(`Winkelart: ${kind} (Einzelwinkel 10–40 m)`, c => regular(c) && c.kind === kind && !c.leg.startsWith('IGP'));
  for (const env of [...new Set(cells.filter(c => !regular(c)).map(c => c.env))]) section(env, c => c.env === env);
  return out.join('\n');
}

// ── Feldaufnahmen ───────────────────────────────────────────────────────────
export interface FieldVariantRow {
  variant: string;
  corners: { kind: string; atM: number; source: string | null; committedAtS: number }[];
  linePoints: number; lineLengthM: number; distanceM: number;
  /** Abstand der in DIESEM Lauf gemeldeten Winkelpunkte zur Linie. */
  apexToLineM: number[];
  /** Abstand der im Feld gespeicherten Winkelpunkte (Export) zur Linie dieses Laufs. */
  fieldMarkerToLineM: number[];
  /** Unter Zusatzrauschen: Läufe mit derselben Winkelfolge wie im Feld / zu wenig / zu viel, über alle Rauschstufen. */
  noise: { runs: number; sameAsField: number; tooFew: number; tooMany: number; wrongDirection: number; apexToLineMeanM: number | null; lineLengthMeanM: number };
}

const dirOf = (kind: string) => (kind.includes('rechts') ? 'rechts' : 'links');

export function fieldStudy(d: FieldExport, variants: readonly GateVariant[], seeds: number): FieldVariantRow[] {
  const input = fieldInputFromExport(d);
  const t0 = input.fixes[0]?.tMs ?? 0;
  // Der Export führt je Marker auch die lokale Lage (x/y); FieldExport beschreibt nur den Ausschnitt der Wiedergabe.
  const fieldPts = ((d.markers ?? []) as { type: string; angleKind?: string | null; x?: unknown; y?: unknown }[])
    .filter(m => m.type === 'winkel' && !!m.angleKind && typeof m.x === 'number' && typeof m.y === 'number')
    .map(m => ({ x: m.x as number, y: m.y as number }));
  const fieldDirs = input.fieldCorners.map(c => dirOf(c.kind));
  const hasMotion = input.motion.length > 0;
  return variants.map(v => withLineGate(v.patch, () => {
    const r = runLay({ fixes: input.fixes, motion: input.motion, motionActive: hasMotion });
    const noise = { runs: 0, sameAsField: 0, tooFew: 0, tooMany: 0, wrongDirection: 0, apexToLineMeanM: null as number | null, lineLengthMeanM: 0 };
    let apexSum = 0, apexN = 0, lenSum = 0;
    FIELD_NOISE_LEVELS.forEach((level, li) => {
      for (let s = 1; s <= seeds; s++) {
        const n = runLay({ fixes: addFieldNoise(input.fixes, level, s * 7919 + li * 101), motion: input.motion, motionActive: hasMotion });
        const dirs = n.corners.map(c => dirOf(c.kind));
        noise.runs++;
        if (dirs.length < fieldDirs.length) noise.tooFew++;
        else if (dirs.length > fieldDirs.length) noise.tooMany++;
        else if (dirs.every((x, i) => x === fieldDirs[i])) noise.sameAsField++;
        else noise.wrongDirection++;
        for (const c of n.corners) { const dist = distanceToPolylineM(n.line, c.x, c.y); if (dist != null) { apexSum += dist; apexN++; } }
        lenSum += polylineLengthM(n.line);
      }
    });
    noise.apexToLineMeanM = apexN ? apexSum / apexN : null;
    noise.lineLengthMeanM = noise.runs ? lenSum / noise.runs : 0;
    const round = (x: number | null) => (x == null ? NaN : Math.round(x * 100) / 100);
    return {
      variant: v.name,
      corners: r.corners.map(c => ({ kind: c.kind, atM: Math.round(c.atM * 10) / 10, source: c.fused?.source ?? null, committedAtS: Math.round((c.committedAtMs - t0) / 100) / 10 })),
      linePoints: r.line.length, lineLengthM: round(polylineLengthM(r.line)), distanceM: round(r.distanceM),
      apexToLineM: r.corners.map(c => round(distanceToPolylineM(r.line, c.x, c.y))),
      fieldMarkerToLineM: fieldPts.map(p => round(distanceToPolylineM(r.line, p.x, p.y))),
      noise,
    };
  }));
}

export function renderFieldStudy(name: string, rows: readonly FieldVariantRow[]): string {
  const mean = (a: number[]) => (a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) : '—');
  const out = [`## Feldaufnahme ${name}`, '',
    '| Variante | Winkel (Art@Meter) | Punkte | Linienlänge m | Distanz m | gemeldeter Winkel↔Linie m | Feld-Winkel↔Linie m | Rauschen: wie im Feld | zu wenig | zu viel | andere Richtung | Rauschen: Winkel↔Linie m | Rauschen: Linienlänge m |',
    `|${'---|'.repeat(13)}`];
  for (const r of rows) {
    out.push(`| ${r.variant} | ${r.corners.map(c => `${c.kind}@${c.atM}`).join(', ') || 'keine'} | ${r.linePoints} | ${r.lineLengthM} | ${r.distanceM} | ${mean(r.apexToLineM)} | ${mean(r.fieldMarkerToLineM)} | `
      + `${r.noise.sameAsField}/${r.noise.runs} | ${r.noise.tooFew} | ${r.noise.tooMany} | ${r.noise.wrongDirection} | ${r.noise.apexToLineMeanM?.toFixed(2) ?? '—'} | ${r.noise.lineLengthMeanM.toFixed(1)} |`);
  }
  return out.join('\n');
}
