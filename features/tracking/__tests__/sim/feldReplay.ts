// Fährten-Simulator — reiner Testcode, wird von der App nicht importiert.
// Wiedergabe einer Feldaufnahme: Der QA-Export einer gelegten Fährte (Rohmessungen und
// Bewegungssensor) läuft durch die ECHTE Lege-Verarbeitung der App, wahlweise mit
// zusätzlich verschlechtertem GPS. So lässt sich eine Testfährte nachträglich prüfen:
// Kommt die aktuelle Logik auf dasselbe Ergebnis, und wie viel Reserve hatte sie?
//
// Der Export enthält nur lokale Meter-Koordinaten (keine Geo-Koordinaten). Feldaufnahmen
// gehören trotzdem nicht ins Repository: Die Datei wird zur Laufzeit von ausserhalb gelesen.
import type { MotionWindowSample } from '../../utils/motionTurnEvidence';
import type { AngleKind } from '../../store/trackingStore';
import type { SimFix } from './gpsModel';
import { runLay, SIM_T0_MS, type LayRunResult } from './layRunner';
import { gauss, gaussMarkovStep, makeRng } from './rng';

/** Ausschnitt des QA-Exports (schemaVersion 2), den die Wiedergabe braucht. */
export interface FieldExport {
  schemaVersion?: number;
  rawFixes?: { x: number; y: number; accuracy: number | null; tMs: number; receivedMs?: number | null; deliverySource?: string | null }[];
  motionTimeline?: { samples?: (Omit<MotionWindowSample, 't'> & { tMs: number; receivedMs?: number | null })[] } | null;
  markers?: { type: string; angleKind?: string | null; atM?: number | null; source?: string | null }[];
}

export interface FieldInput { fixes: SimFix[]; motion: MotionWindowSample[]; fieldCorners: { kind: string; atM: number }[] }

/** Zusätzliches GPS-Rauschen: langsam wandernder Anteil (m, Standardabweichung je Achse) und Zittern je Messung. */
export interface NoiseLevel { driftM: number; jitterM: number }

export const FIELD_NOISE_LEVELS: readonly NoiseLevel[] = [
  { driftM: 0, jitterM: 0.3 }, { driftM: 0.5, jitterM: 0.3 }, { driftM: 1, jitterM: 0.5 },
  { driftM: 2, jitterM: 0.5 }, { driftM: 3, jitterM: 0.7 },
];
const DRIFT_TAU_S = 30;

/** Export → Eingaben des Lege-Laufs. Wirft bei einem Export ohne Rohmessungen (Testmodus war aus). */
export function fieldInputFromExport(d: FieldExport, t0Ms = SIM_T0_MS): FieldInput {
  const raw = d.rawFixes ?? [];
  if (raw.length < 2) throw new Error('QA-Export enthält keine Rohmessungen (rawFixes). Die Fährte muss im Testmodus gelegt sein.');
  const fixes: SimFix[] = raw.map((f, i) => {
    const p = raw[Math.max(0, i - 1)];
    const dtS = Math.max(0.001, (f.tMs - p.tMs) / 1000);
    return {
      tMs: t0Ms + f.tMs, receivedMs: t0Ms + (f.receivedMs ?? f.tMs), x: f.x, y: f.y,
      accuracy: f.accuracy ?? 5, speedMps: i ? Math.hypot(f.x - p.x, f.y - p.y) / dtS : 0,
      trueErrM: 0, background: f.deliverySource === 'background',
    };
  });
  const motion: MotionWindowSample[] = (d.motionTimeline?.samples ?? []).map(({ tMs, receivedMs, ...rest }) => ({ ...rest, t: t0Ms + (receivedMs ?? tMs) }));
  const fieldCorners = (d.markers ?? [])
    .filter(m => m.type === 'winkel' && !!m.angleKind)
    .map(m => ({ kind: m.angleKind as string, atM: m.atM ?? 0 }));
  return { fixes, motion, fieldCorners };
}

/** Rohmessungen zusätzlich verrauschen (deterministisch je Seed). Der Fehler kommt zum echten GPS-Fehler der Aufnahme dazu. */
export function addFieldNoise(fixes: readonly SimFix[], level: NoiseLevel, seed: number): SimFix[] {
  const rng = makeRng(seed);
  let ex = level.driftM * gauss(rng), ey = level.driftM * gauss(rng);
  return fixes.map((f, i) => {
    if (i) {
      const dtS = Math.max(0.001, (f.tMs - fixes[i - 1].tMs) / 1000);
      ex = gaussMarkovStep(ex, level.driftM, DRIFT_TAU_S, dtS, rng);
      ey = gaussMarkovStep(ey, level.driftM, DRIFT_TAU_S, dtS, rng);
    }
    return { ...f, x: f.x + ex + level.jitterM * gauss(rng), y: f.y + ey + level.jitterM * gauss(rng) };
  });
}

export interface ReplaySummary { corners: { kind: AngleKind; atM: number }[]; linePoints: number; distanceM: number; rejects: LayRunResult['rejects'] }
export interface NoiseRow extends NoiseLevel {
  motion: boolean; runs: number;
  /** Gleiche Winkelfolge (Anzahl und Richtung) wie im Feld. */
  sameAsField: number; tooFew: number; tooMany: number; wrongDirection: number;
  countHistogram: Record<number, number>;
}
export interface FieldReplayReport {
  field: { kind: string; atM: number }[];
  withMotion: ReplaySummary | null;
  withoutMotion: ReplaySummary;
  noise: NoiseRow[];
}

const dirOf = (kind: string): 'rechts' | 'links' => (kind.includes('rechts') ? 'rechts' : 'links');
const summarize = (r: LayRunResult): ReplaySummary => ({
  corners: r.corners.map(c => ({ kind: c.kind, atM: Math.round(c.atM * 10) / 10 })),
  linePoints: r.line.length, distanceM: Math.round(r.distanceM * 10) / 10, rejects: r.rejects,
});

/** Aufnahme unverändert (mit und ohne Bewegungssensor) und je Rauschstufe `seeds`-mal durch die Engine. */
export function replayFieldExport(d: FieldExport, opts: { seeds?: number; levels?: readonly NoiseLevel[] } = {}): FieldReplayReport {
  const input = fieldInputFromExport(d);
  const seeds = Math.max(0, opts.seeds ?? 60);
  const levels = opts.levels ?? FIELD_NOISE_LEVELS;
  const hasMotion = input.motion.length > 0;
  const fieldDirs = input.fieldCorners.map(c => dirOf(c.kind));
  const report: FieldReplayReport = {
    field: input.fieldCorners,
    withMotion: hasMotion ? summarize(runLay({ fixes: input.fixes, motion: input.motion, motionActive: true })) : null,
    withoutMotion: summarize(runLay({ fixes: input.fixes, motion: [], motionActive: false })),
    noise: [],
  };
  if (!seeds) return report;
  for (const motion of hasMotion ? [true, false] : [false]) {
    levels.forEach((level, li) => {
      const row: NoiseRow = { ...level, motion, runs: seeds, sameAsField: 0, tooFew: 0, tooMany: 0, wrongDirection: 0, countHistogram: {} };
      for (let s = 1; s <= seeds; s++) {
        const r = runLay({ fixes: addFieldNoise(input.fixes, level, s * 7919 + li * 101), motion: motion ? input.motion : [], motionActive: motion });
        const dirs = r.corners.map(c => dirOf(c.kind));
        row.countHistogram[dirs.length] = (row.countHistogram[dirs.length] ?? 0) + 1;
        if (dirs.length < fieldDirs.length) row.tooFew++;
        else if (dirs.length > fieldDirs.length) row.tooMany++;
        else if (dirs.every((v, i) => v === fieldDirs[i])) row.sameAsField++;
        else row.wrongDirection++;
      }
      report.noise.push(row);
    });
  }
  return report;
}

/** Kurzer Textbericht für die Konsole. */
export function renderFieldReport(name: string, r: FieldReplayReport): string {
  const list = (c: { kind: string; atM: number }[]) => c.length ? c.map(x => `${x.kind}@${x.atM} m`).join(', ') : 'keine';
  const lines = [
    `Feldaufnahme ${name}`,
    `  Feld:            ${list(r.field)}`,
    `  mit Sensor:      ${r.withMotion ? list(r.withMotion.corners) : '(keine Sensordaten im Export)'}`,
    `  ohne Sensor:     ${list(r.withoutMotion.corners)}`,
  ];
  for (const n of r.noise) {
    lines.push(`  Drift ${n.driftM} m, Zittern ${n.jitterM} m, ${n.motion ? 'mit' : 'ohne'} Sensor: wie im Feld ${n.sameAsField}/${n.runs}, zu wenig ${n.tooFew}, zu viel ${n.tooMany}, andere Richtung ${n.wrongDirection}`);
  }
  return lines.join('\n');
}
