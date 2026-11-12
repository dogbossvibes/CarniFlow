// Fährten-Simulator (T-192) — reiner Testcode.
// Szenario-Matrix: welche Kombinationen laufen, wie werden sie zusammengefasst,
// und wie sieht der Bericht aus.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ANDROID_BATCH_30S, CARRY_LABEL, DEVICE_LABEL, ENV_LABEL, type DeviceClass, type Environment } from './profiles';
import { runScenario, type Scenario, type ScenarioOutcome } from './scenario';
import { EXAM_TRACKS, expectedKindFor, SHAPE_TRACKS, singleCornerTrack } from './truthTrack';
import { classifyAnnouncement, clearLayCache, PRACTICE_TRACK, runSearchScenario, type SearchOutcome, type SearchScenario } from './searchScenario';
import { DOGS } from './searchTruth';

export type LayGroupName = 'winkel' | 'geraet' | 'varianten' | 'pruefung';
export type SearchGroupName = 'suche' | 'suchvarianten' | 'formen' | 'unterbrechungen' | 'ablauf' | 'android' | 'ifh';
export type GroupName = LayGroupName | SearchGroupName;
export const LAY_GROUPS: LayGroupName[] = ['winkel', 'geraet', 'varianten', 'pruefung'];
export const SEARCH_GROUPS: SearchGroupName[] = ['suche', 'suchvarianten', 'formen', 'unterbrechungen', 'ablauf', 'android', 'ifh'];
/** Gruppen, die NICHT in FAEHRTEN_SIM=full laufen (zu langsam) — nur ausdrücklich, z. B. FAEHRTEN_SIM=ifh. */
export const OPT_IN_GROUPS: GroupName[] = ['ifh'];
export const GROUPS: GroupName[] = [...LAY_GROUPS, ...SEARCH_GROUPS];
export const isSearchGroup = (g: GroupName): g is SearchGroupName => (SEARCH_GROUPS as GroupName[]).includes(g);

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

/** Zusammenfassung einer Zelle der Such-Matrix (Summen über alle Läufe). */
export interface SearchCell {
  table: string; row: string; col: string;
  runs: number; startLocked: number; endReached: number;
  indicated: number; foundIndicated: number; analysisContactIndicated: number;
  notIndicated: number; foundNotIndicated: number;
  layObjectErrSumM: number; layObjectN: number;
  appDeviationSumM: number; dogDeviationSumM: number; handlerDeviationSumM: number;
  recorderScoreSum: number; analysisScoreSum: number; analysisScoreN: number;
  deviationEvents: number; breaks: number;
  // ── Führung (T-205)
  voiceFeatures: number; voiceOnTime: number; voiceShort: number; voiceLate: number; voiceMissing: number; voiceEarly: number;
  voiceDuplicate: number; spuriousAngleSpoken: number; interruptedSpoken: number; queueDropped: number;
  pawErrSumM: number; pawErrMaxM: number; pawJumps: number; wrongLegShareSum: number; wrongLegMaxM: number;
  lyingShareSum: number; lyingN: number; lyingAnnouncements: number;
  endFired: number; endRemainingSumM: number; endEarly: number; endDuplicate: number; endObjectN: number; endObjectFound: number;
  manualTaps: number; manualCorrect: number; manualMisattributed: number;
  losses: number; lossesDetected: number; breaksOutsideLoss: number;
  resumeRuns: number; resumePointsBefore: number; resumePointsRestored: number; resumeFoundLost: number;
  resumeVoiceRepeated: number; resumeObjectDetectedRepeated: number; resumeEndRepeated: number; resumePendingMissing: number;
}
export interface SearchCase { table: string; row: string; col: string; scenario: SearchScenario }

export interface GroupResult { group: GroupName; seeds: number; runs: number; elapsedS: number; cells: Cell[]; searchCells?: SearchCell[] }

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

export function buildGroup(group: LayGroupName, seeds: number, examTracks?: string[]): MatrixCase[] {
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

export function runGroup(group: LayGroupName, seeds: number, examTracks?: string[]): GroupResult {
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

// ── Absuche ─────────────────────────────────────────────────────────────────
export function buildSearchGroup(group: SearchGroupName, seeds: number): SearchCase[] {
  const cases: SearchCase[] = [];
  const seedList = Array.from({ length: seeds }, (_, i) => i + 1);
  const base = { track: PRACTICE_TRACK, platform: 'ios' } as const;
  if (group === 'suche') {
    const combos: [DeviceClass, Environment, string][] = [
      ['dual', 'open', 'Neueres Handy, offenes Feld'], ['single', 'open', 'Mittelklasse, offenes Feld'],
      ['single', 'edge', 'Mittelklasse, Feldrand'], ['single', 'forest', 'Mittelklasse, lichter Wald'],
    ];
    for (const dog of Object.values(DOGS)) for (const [device, env, label] of combos) for (const seed of seedList)
      cases.push({ table: 'Absuche — Hundetyp × Gerät/Umgebung (Übungsfährte 120 m, 10-m-Leine)', row: dog.name, col: label,
        scenario: { ...base, device, env, dog, seed } });
  } else if (group === 'formen') {
    const shapes: [string, SearchScenario['track']][] = [['Übungsfährte (Basis)', PRACTICE_TRACK], ...Object.entries(SHAPE_TRACKS)];
    for (const [label, track] of shapes) for (const dog of Object.values(DOGS)) for (const seed of seedList)
      cases.push({ table: 'Absuche — schwierige Fährtenformen × Hundetyp (Mittelklasse-Handy, offenes Feld, 10-m-Leine)', row: label, col: dog.name,
        scenario: { ...base, track, device: 'single', env: 'open', dog, seed } });
  } else if (group === 'unterbrechungen') {
    const variants: [string, Partial<SearchScenario>][] = [
      ['Basis (keine Unterbrechung)', {}],
      ['Bildschirm 20 s gesperrt (keine Positionen)', { interruptions: [{ kind: 'lock', atFrac: 0.45, durationS: 20 }] }],
      ['Bildschirm 60 s gesperrt (keine Positionen)', { interruptions: [{ kind: 'lock', atFrac: 0.45, durationS: 60 }] }],
      ['Anruf 45 s', { interruptions: [{ kind: 'call', atFrac: 0.45, durationS: 45 }] }],
      ['Pause 20 s, Hund läuft weiter', { interruptions: [{ kind: 'pause', atFrac: 0.45, durationS: 20 }] }],
      ['App beendet, nach 30 s fortgesetzt', { interruptions: [{ kind: 'kill', atFrac: 0.45, durationS: 30 }] }],
      ['App beendet, nach 5 s fortgesetzt', { interruptions: [{ kind: 'kill', atFrac: 0.6, durationS: 5 }] }],
    ];
    for (const [label, patch] of variants) for (const [device, name] of [['dual', 'Neueres Handy'], ['single', 'Mittelklasse']] as const) for (const seed of seedList)
      cases.push({ table: 'Absuche — Unterbrechungen (ruhiger Sporthund, offenes Feld, iOS)', row: label, col: name,
        scenario: { ...base, device, env: 'open', dog: DOGS.ruhig, ...patch, seed } });
  } else if (group === 'ablauf') {
    const variants: [string, Partial<SearchScenario>][] = [
      ['Basis (nur automatische Erkennung)', {}],
      ['Gegenstand angetippt, 2 s nach Ankunft beim Hund', { manualTap: { tapAfterS: 2 } }],
      ['Gegenstand angetippt, erst nach 7 s', { manualTap: { tapAfterS: 7 } }],
      ['Hund verliert die Fährte 1× (10 m seitlich)', { losses: [{ atM: 55, offsetM: 10, lengthM: 12 }] }],
      ['Hund verliert die Fährte 2× (15 m seitlich)', { losses: [{ atM: 30, offsetM: 15, lengthM: 15 }, { atM: 95, offsetM: 15, lengthM: 12 }] }],
      ['Hund verliert die Fährte kurz (5 m seitlich)', { losses: [{ atM: 55, offsetM: 5, lengthM: 8 }] }],
    ];
    for (const [label, patch] of variants) for (const dog of Object.values(DOGS)) for (const seed of seedList)
      cases.push({ table: 'Absuche — Ablauf: Antippen, Fährtenverlust, Fährtenende (Mittelklasse-Handy, offenes Feld)', row: label, col: dog.name,
        scenario: { ...base, device: 'single', env: 'open', dog, ...patch, seed } });
  } else if (group === 'android') {
    const variants: [string, Partial<SearchScenario>][] = [
      ['Android, Bildschirm an (live)', {}],
      ['Android, gebündelt 30 s', { searchDelivery: ANDROID_BATCH_30S }],
      ['Android, gebündelt 30 s, Hosentasche', { searchDelivery: ANDROID_BATCH_30S, searchCarry: 'pocket' }],
      ['Android, gebündelt 30 s, Spitzwinkel-Folge', { searchDelivery: ANDROID_BATCH_30S, track: SHAPE_TRACKS['Spitzwinkel-Folge'] }],
      ['Android live, Kreuzung', { track: SHAPE_TRACKS.Kreuzung }],
    ];
    for (const [label, patch] of variants) for (const [device, name] of [['dual', 'Neueres Handy'], ['single', 'Mittelklasse']] as const) for (const seed of seedList)
      cases.push({ table: 'Absuche — Android (ruhiger Sporthund, offenes Feld)', row: label, col: name,
        scenario: { ...base, platform: 'android', device, env: 'open', dog: DOGS.ruhig, ...patch, seed } });
  } else if (group === 'ifh') {
    const few = seedList.slice(0, Math.max(1, Math.min(2, seedList.length)));
    for (const name of ['IFH-1', 'IFH-2']) for (const [label, patch] of [['iOS', { platform: 'ios' }], ['Android, gebündelt 30 s', { platform: 'android', searchDelivery: ANDROID_BATCH_30S }]] as [string, Partial<SearchScenario>][]) for (const seed of few)
      cases.push({ table: 'Absuche — lange Prüfungsfährten IFH (neueres Handy, offenes Feld, ruhiger Sporthund)', row: name, col: label,
        scenario: { ...base, track: EXAM_TRACKS[name], device: 'dual', env: 'open', dog: DOGS.ruhig, ...patch, seed } });
  } else {
    const variants: [string, Partial<SearchScenario>][] = [
      ['Basis (10-m-Leine, App auf 10 m)', {}],
      ['5-m-Leine, App auf 5 m', { handler: { lineM: 5 } }],
      ['10-m-Leine, App fälschlich auf 5 m', { appHandlerDistanceM: 5 }],
      ['Kurzer Halt am Gegenstand (3 s)', { handler: { pickupS: 3 } }],
      ['Gegenstand beim Legen mit 3 s Halt abgelegt', { layWalk: { articleStopS: 3 }, tapDelayS: 1.5 }],
      ['Handy bei der Absuche in der Hosentasche', { searchCarry: 'pocket' }],
      ['Absuche ohne Bewegungssensor', { searchMotion: false }],
      ['Android, Absuche im Hintergrund gebündelt (30 s)', { platform: 'android', searchDelivery: ANDROID_BATCH_30S }],
    ];
    for (const [label, patch] of variants) for (const [device, name] of [['dual', 'Neueres Handy'], ['single', 'Mittelklasse']] as const) for (const seed of seedList)
      cases.push({ table: 'Absuche — Varianten (ruhiger Sporthund, offenes Feld)', row: label, col: name,
        scenario: { ...base, device, env: 'open', dog: DOGS.ruhig, ...patch, seed } });
  }
  return cases;
}

export function emptySearchCell(table: string, row: string, col: string): SearchCell {
  return { table, row, col, runs: 0, startLocked: 0, endReached: 0, indicated: 0, foundIndicated: 0, analysisContactIndicated: 0,
    notIndicated: 0, foundNotIndicated: 0, layObjectErrSumM: 0, layObjectN: 0, appDeviationSumM: 0, dogDeviationSumM: 0,
    handlerDeviationSumM: 0, recorderScoreSum: 0, analysisScoreSum: 0, analysisScoreN: 0, deviationEvents: 0, breaks: 0,
    voiceFeatures: 0, voiceOnTime: 0, voiceShort: 0, voiceLate: 0, voiceMissing: 0, voiceEarly: 0,
    voiceDuplicate: 0, spuriousAngleSpoken: 0, interruptedSpoken: 0, queueDropped: 0,
    pawErrSumM: 0, pawErrMaxM: 0, pawJumps: 0, wrongLegShareSum: 0, wrongLegMaxM: 0,
    lyingShareSum: 0, lyingN: 0, lyingAnnouncements: 0,
    endFired: 0, endRemainingSumM: 0, endEarly: 0, endDuplicate: 0, endObjectN: 0, endObjectFound: 0,
    manualTaps: 0, manualCorrect: 0, manualMisattributed: 0, losses: 0, lossesDetected: 0, breaksOutsideLoss: 0,
    resumeRuns: 0, resumePointsBefore: 0, resumePointsRestored: 0, resumeFoundLost: 0, resumeVoiceRepeated: 0, resumeObjectDetectedRepeated: 0, resumeEndRepeated: 0, resumePendingMissing: 0 };
}

export function addSearchOutcome(cell: SearchCell, o: SearchOutcome): void {
  const s = o.score;
  cell.runs++;
  if (s.startLocked) cell.startLocked++;
  if (s.progressPct >= 90) cell.endReached++;
  for (const obj of s.objects) {
    cell.layObjectErrSumM += obj.layErrM; cell.layObjectN++;
    if (obj.atEnd) { cell.endObjectN++; if (obj.appFound) cell.endObjectFound++; continue; }   // Ende-Gegenstand: eigene Ende-Logik
    if (obj.indicated) { cell.indicated++; if (obj.appFound) cell.foundIndicated++; if (obj.analysisStatus === 'likely_contact') cell.analysisContactIndicated++; }
    else { cell.notIndicated++; if (obj.appFound) cell.foundNotIndicated++; }
  }
  cell.appDeviationSumM += s.appDeviationM; cell.dogDeviationSumM += s.dogDeviationM; cell.handlerDeviationSumM += s.handlerDeviationM;
  cell.recorderScoreSum += s.recorderScore;
  if (s.analysisScore != null) { cell.analysisScoreSum += s.analysisScore; cell.analysisScoreN++; }
  cell.deviationEvents += s.deviationEvents; cell.breaks += s.breaks;
  const g = s.guidance;
  for (const f of g.features) {
    if (f.spokenCount > 1) cell.voiceDuplicate++;
    if (!f.reached && f.spokenAheadM == null) continue;   // nie erreicht und nicht angesagt: zählt nicht
    cell.voiceFeatures++;
    const c = classifyAnnouncement(f.spokenAheadM);
    if (c === 'rechtzeitig') cell.voiceOnTime++; else if (c === 'knapp') cell.voiceShort++; else if (c === 'zu_spaet') cell.voiceLate++;
    else if (c === 'zu_frueh') cell.voiceEarly++; else cell.voiceMissing++;
  }
  cell.spuriousAngleSpoken += g.spuriousAngleSpoken; cell.interruptedSpoken += g.interruptedSpoken; cell.queueDropped += g.queueDropped;
  cell.pawErrSumM += g.pawErrMeanM; cell.pawErrMaxM = Math.max(cell.pawErrMaxM, g.pawErrMaxM); cell.pawJumps += g.pawJumps;
  cell.wrongLegShareSum += g.wrongLegShare; cell.wrongLegMaxM = Math.max(cell.wrongLegMaxM, g.wrongLegMaxM);
  if (g.lyingPawAheadShare != null) { cell.lyingShareSum += g.lyingPawAheadShare; cell.lyingN++; }
  cell.lyingAnnouncements += g.lyingAnnouncements;
  if (g.endFired) { cell.endFired++; cell.endRemainingSumM += g.endRemainingM ?? 0; if ((g.endRemainingM ?? 0) > 5) cell.endEarly++; }
  if (g.endFiredCount > 1) cell.endDuplicate++;
  cell.manualTaps += g.manualTaps; cell.manualCorrect += g.manualTapsCorrect; cell.manualMisattributed += g.manualMisattributed;
  cell.losses += g.losses; cell.lossesDetected += g.lossesDetected; cell.breaksOutsideLoss += g.breaksOutsideLoss;
  for (const r of g.resume) {
    cell.resumeRuns++; cell.resumePointsBefore += r.pointsBefore; cell.resumePointsRestored += r.pointsRestored;
    cell.resumeFoundLost += r.foundLost; cell.resumeVoiceRepeated += r.voiceRepeated; cell.resumeObjectDetectedRepeated += r.objectDetectedRepeated;
    if (r.endRepeated) cell.resumeEndRepeated++; if (!r.pendingFound) cell.resumePendingMissing++;
  }
}

export async function runSearchGroup(group: SearchGroupName, seeds: number): Promise<GroupResult> {
  const started = Date.now();
  const cells = new Map<string, SearchCell>();
  const cases = buildSearchGroup(group, seeds);
  clearLayCache();
  for (const c of cases) {
    const key = `${c.table}|${c.row}|${c.col}`;
    if (!cells.has(key)) cells.set(key, emptySearchCell(c.table, c.row, c.col));
    addSearchOutcome(cells.get(key)!, await runSearchScenario(c.scenario));
  }
  clearLayCache();
  return { group, seeds, runs: cases.length, elapsedS: Math.round((Date.now() - started) / 1000), cells: [], searchCells: [...cells.values()] };
}

// ── Bericht ─────────────────────────────────────────────────────────────────
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '–');
const num = (v: number, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '–');

function renderTable<T extends { row: string; col: string }>(cells: T[], title: string, value: (c: T) => string): string {
  const rows = [...new Set(cells.map(c => c.row))], cols = [...new Set(cells.map(c => c.col))];
  const get = (r: string, c: string) => cells.find(x => x.row === r && x.col === c);
  const lines = [`**${title}**`, '', `| | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`];
  for (const r of rows) lines.push(`| ${r} | ${cols.map(c => { const cell = get(r, c); return cell ? value(cell) : '–'; }).join(' | ')} |`);
  return lines.join('\n');
}

export function renderReport(results: GroupResult[]): string {
  const out: string[] = ['# Fährten-Simulator — Matrixbericht', ''];
  const runs = results.reduce((s, r) => s + r.runs, 0);
  out.push(`${runs} simulierte Läufe durch die echte Lege- und Such-Verarbeitung der App. Gruppen: ${results.map(r => `${r.group} (${r.runs} Läufe, ${r.elapsedS} s)`).join(', ')}.`, '');
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
    const searchCells = result.searchCells ?? [];
    for (const table of [...new Set(searchCells.map(c => c.table))]) {
      const cells = searchCells.filter(c => c.table === table);
      out.push(`## ${table}`, '', `Läufe je Zelle: ${cells[0]?.runs ?? 0}. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.`, '');
      out.push(renderTable(cells, 'Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet',
        c => `${pct(c.foundIndicated, c.indicated)} · ${pct(c.analysisContactIndicated, c.indicated)}`), '');
      out.push(renderTable(cells, 'NICHT verwiesene Gegenstände, die die App trotzdem als gefunden zählt (Anzahl Fälle in Klammern)',
        c => `${pct(c.foundNotIndicated, c.notIndicated)} (${c.notIndicated})`), '');
      out.push(renderTable(cells, 'Mittlere Abweichung (m): von der App gemeldet · wahr beim Hund · wahr beim Hundeführer',
        c => `${num(c.appDeviationSumM / c.runs)} · ${num(c.dogDeviationSumM / c.runs)} · ${num(c.handlerDeviationSumM / c.runs)}`), '');
      out.push(renderTable(cells, 'Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf',
        c => `${num(c.recorderScoreSum / c.runs, 0)} · ${c.analysisScoreN ? num(c.analysisScoreSum / c.analysisScoreN, 0) : '–'} · ${num(c.deviationEvents / c.runs)} · ${num(c.breaks / c.runs)}`), '');
      out.push(renderTable(cells, 'Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)',
        c => `${pct(c.startLocked, c.runs)} · ${pct(c.endReached, c.runs)} · ${c.layObjectN ? num(c.layObjectErrSumM / c.layObjectN) : '–'}`), '');
      if (cells.some(c => c.voiceFeatures != null)) {
        out.push('**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.', '');
        out.push(renderTable(cells, 'Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh',
          c => `${pct(c.voiceOnTime, c.voiceFeatures)} · ${pct(c.voiceShort, c.voiceFeatures)} · ${pct(c.voiceLate, c.voiceFeatures)} · ${pct(c.voiceMissing, c.voiceFeatures)} · ${pct(c.voiceEarly, c.voiceFeatures)}`), '');
        out.push(renderTable(cells, 'Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt',
          c => `${num(c.interruptedSpoken / c.runs)} · ${num(c.queueDropped / c.runs)} · ${num(c.voiceDuplicate / c.runs)} · ${num(c.spuriousAngleSpoken / c.runs)}`), '');
        out.push(renderTable(cells, 'Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)',
          c => `${num(c.pawErrSumM / c.runs)} · ${num(c.pawErrMaxM, 0)} · ${num(c.pawJumps / c.runs)} · ${pct(c.wrongLegShareSum, c.runs)} · ${num(c.wrongLegMaxM, 0)}`), '');
        out.push(renderTable(cells, 'Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf',
          c => `${c.lyingN ? pct(c.lyingShareSum, c.lyingN) : '–'} · ${num(c.lyingAnnouncements / c.runs)}`), '');
        out.push(renderTable(cells, 'Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt',
          c => `${pct(c.endFired, c.runs)} · ${c.endFired ? num(c.endRemainingSumM / c.endFired) : '–'} · ${pct(c.endEarly, c.runs)} · ${pct(c.endDuplicate, c.runs)} · ${pct(c.endObjectFound, c.endObjectN)}`), '');
        if (cells.some(c => c.manualTaps > 0))
          out.push(renderTable(cells, 'Manuell angetippt: richtiger Gegenstand gefunden · Fehlzuordnungen (Gegenstand ohne Antippen als «manuell gefunden»)',
            c => c.manualTaps ? `${pct(c.manualCorrect, c.manualTaps)} · ${c.manualMisattributed}` : '–'), '');
        if (cells.some(c => c.losses > 0))
          out.push(renderTable(cells, 'Fährtenverlust des Hundes: als Abriss erkannt · Abrisse ausserhalb eines Verlusts je Lauf',
            c => `${c.losses ? pct(c.lossesDetected, c.losses) : '–'} · ${num(c.breaksOutsideLoss / c.runs)}`), '');
        if (cells.some(c => c.resumeRuns > 0))
          out.push(renderTable(cells, 'Wiederaufnahme nach App-Abbruch (Summen über alle Läufe): Suchpunkte wiederhergestellt · Funde verloren · Winkel/Gegenstand erneut angesagt · «Gegenstand erkannt» erneut · Ende doppelt · Zwischenstand fehlte',
            c => c.resumeRuns ? `${pct(c.resumePointsRestored, c.resumePointsBefore)} · ${c.resumeFoundLost} · ${c.resumeVoiceRepeated} · ${c.resumeObjectDetectedRepeated ?? 0} · ${c.resumeEndRepeated} · ${c.resumePendingMissing}` : '–'), '');
      }
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
