// Fährten-Simulator (T-192) — reiner Testcode.
// Ein Such-Szenario = Legen (mit Gegenständen) → Liegezeit → Absuche mit Hund und
// Hundeführer → echter Such-Recorder → Analyse → Bewertung gegen die Wahrheit.
import { simulateGps, type DeliverySpec, type GpsProfile } from './gpsModel';
import { runLay, SIM_T0_MS, type LayRunResult } from './layRunner';
import { simulateMotion } from './motionModel';
import { gpsProfile, motionProfile, LIVE_DELIVERY, type CarryMode, type DeviceClass, type Environment, type Platform } from './profiles';
import { makeRng, seedFrom } from './rng';
import { runSearch, type SearchAction, type SearchRunResult } from './searchRunner';
import { buildSearchTruth, DEFAULT_HANDLER, progressOnTrack, type DogSpec, type HandlerSpec, type SearchTruth, type TrackLoss } from './searchTruth';
import { buildTruthTrack, DEFAULT_WALK, type TrackSpec, type TruthTrack, type WalkSpec } from './truthTrack';
import type { SearchHandlerDistanceM } from '../../utils/searchGeometry';

/** Übungsfährte: 3 Schenkel à 40 m, zwei rechte Winkel, Gegenstände auf Schenkel 1, Schenkel 2 und am Ende. */
export const PRACTICE_TRACK: TrackSpec = {
  name: 'uebungsfaehrte', parts: [{ leg: 40 }, { turn: -90 }, { leg: 40 }, { turn: 90 }, { leg: 40 }], articlesAtM: [20, 70, 120],
};

export interface SearchScenario {
  track: TrackSpec;
  layWalk?: Partial<WalkSpec>;
  device: DeviceClass;
  env: Environment;
  platform: Platform;
  /** Trageweise beim Legen und bei der Absuche. */
  layCarry?: CarryMode; searchCarry?: CarryMode;
  searchDelivery?: DeliverySpec;
  searchMotion?: boolean;
  dog: DogSpec;
  handler?: Partial<HandlerSpec>;
  /** In der App gewählter Abstand; Standard = tatsächliche Leinenlänge (1, 5 oder 10 m). */
  appHandlerDistanceM?: SearchHandlerDistanceM;
  /** Verzögerung zwischen Ablegen und Antippen des Gegenstands (s). */
  tapDelayS?: number;
  /** Liegezeit zwischen Legen und Absuche (Minuten) — die GPS-Fehler beider Läufe sind unabhängig. */
  ageMin?: number;
  /** Unterbrechungen während der Absuche (T-205). */
  interruptions?: Interruption[];
  /** Hundeführer tippt «Gegenstand», sobald er beim liegenden Hund ist (Aufnehmen beginnt + `tapAfterS`). */
  manualTap?: { tapAfterS: number };
  /** Der Hund verliert die Fährte (Abriss) und findet wieder hinein. */
  losses?: TrackLoss[];
  seed: number;
}

/**
 * Unterbrechung der Absuche. `atFrac` = Zeitpunkt als Anteil der Suchdauer.
 * - lock: Bildschirm gesperrt. Positionen kommen nur, wenn der Recorder Hintergrund-Ortung
 *   anfordert (seit T-206 ja); sonst liefert iOS in dieser Zeit keine.
 * - call: Anruf; App im Hintergrund wie lock, laufende Ansage bricht ab.
 * - pause: Nutzer tippt Pause und später Weiter; GPS läuft weiter.
 * - kill: App beendet; nach `durationS` wieder geöffnet und «Fortsetzen».
 */
export interface Interruption { kind: 'lock' | 'call' | 'pause' | 'kill'; atFrac: number; durationS: number }

export interface LayPhase { truth: TruthTrack; run: LayRunResult }

export interface SearchOutcome {
  scenario: SearchScenario;
  lay: LayPhase;
  truth: SearchTruth;
  search: SearchRunResult;
  score: SearchScore;
}

export interface SearchScore {
  startLocked: boolean;
  /** Erreichter Fortschritt in % der Fährtenlänge. */
  progressPct: number;
  /** atEnd = Gegenstand am Fährtenende; dafür hat die App eine eigene Ende-Logik, die hier nicht abgebildet ist. */
  objects: { index: number; atEnd: boolean; layErrM: number; indicated: boolean; appFound: boolean; status: string; analysisStatus: string | null }[];
  /** Von der App gemeldete mittlere Abweichung (m) und wahre mittlere Abweichung von Hund und Hundeführer. */
  appDeviationM: number; dogDeviationM: number; handlerDeviationM: number;
  recorderScore: number;
  analysisScore: number | null;
  deviationEvents: number;
  breaks: number;
  guidance: GuidanceScore;
}

/** Bewertung von Pfote, Fortschritt, Ansagen und Ende gegen die Wahrheit (T-205). */
export interface GuidanceScore {
  /** Je echtem Winkel/Gegenstand: wie weit der WAHRE Hund bei Sprechbeginn noch davor war (m); null = nie angesagt. */
  features: { kind: 'angle' | 'object'; trueAtM: number; spokenAheadM: number | null; spokenCount: number; reached: boolean }[];
  /** Ansagen eines Winkels, den es nicht gibt (Fehlerkennung beim Legen). */
  spuriousAngleSpoken: number;
  /** Ansagen, die mitten im Satz abgebrochen wurden; wartende, die verfielen. */
  interruptedSpoken: number; queueDropped: number;
  /** Mittlerer und grösster Fehler der Pfote (App-Hundeposition − wahre Hundeposition, m). */
  pawErrMeanM: number; pawErrMaxM: number;
  /** Sprünge der Pfote: > 8 m weiter als der wahre Hund in derselben Messung. */
  pawJumps: number;
  /** Anteil der Messungen, in denen der App-Fortschritt des Hundeführers > 8 m vom wahren abweicht («falscher Schenkel»). */
  wrongLegShare: number; wrongLegMaxM: number;
  /** Während der Hund am Gegenstand liegt: Anteil der Zeit, in der die Pfote > 3 m darüber hinaus steht. */
  lyingPawAheadShare: number | null;
  /** Ansagen eines Punkts hinter dem Gegenstand, während der Hund dort noch liegt. */
  lyingAnnouncements: number;
  /** Fährtenende: angesagt? wie viele Meter fehlten dem wahren Hund noch? doppelt? */
  endFired: boolean; endRemainingM: number | null; endFiredCount: number;
  /** Manuell angetippt: wurde jeweils der richtige Gegenstand gefunden? */
  manualTaps: number; manualTapsCorrect: number; manualMisattributed: number;
  /** Wahre Fährtenverluste des Hundes, von der App gemeldete Abrisse in diesen Fenstern / ausserhalb. */
  losses: number; lossesDetected: number; breaksOutsideLoss: number;
  /** Wiederaufnahme nach App-Abbruch. */
  resume: { pointsBefore: number; pointsRestored: number; foundLost: number; voiceRepeated: number; objectDetectedRepeated: number; endRepeated: boolean; pendingFound: boolean }[];
}

const layKey = (s: SearchScenario) => [s.track.name, JSON.stringify(s.layWalk ?? {}), s.device, s.env, s.platform, s.layCarry ?? 'hand', s.tapDelayS ?? 0.5, s.seed].join('|');
const layCache = new Map<string, LayPhase>();

/** Das Legen ist der teure Teil; gleiche Legeläufe werden innerhalb einer Matrixgruppe wiederverwendet. */
export function layPhase(s: SearchScenario): LayPhase {
  const key = layKey(s);
  const cached = layCache.get(key);
  if (cached) return cached;
  const walk: WalkSpec = { ...DEFAULT_WALK, ...s.layWalk };
  const truth = buildTruthTrack(s.track, walk, makeRng(seedFrom(key, 'walk')));
  const carry = s.layCarry ?? 'hand';
  const fixes = simulateGps(truth, gpsProfile(s.device, s.env, carry), LIVE_DELIVERY, makeRng(seedFrom(key, 'gps')), SIM_T0_MS);
  const motion = simulateMotion(truth, motionProfile(s.platform, carry, s.device), makeRng(seedFrom(key, 'motion')), seedFrom(key, 'chain'), SIM_T0_MS);
  const run = runLay({ fixes, motion, t0Ms: SIM_T0_MS, objectTapsMs: truth.articles.map(a => SIM_T0_MS + (a.tS + (s.tapDelayS ?? 0.5)) * 1000) });
  const phase = { truth, run };
  layCache.set(key, phase);
  return phase;
}
export function clearLayCache(): void { layCache.clear(); }

export async function runSearchScenario(s: SearchScenario): Promise<SearchOutcome> {
  const lay = layPhase(s);
  const handler: HandlerSpec = { ...DEFAULT_HANDLER, ...s.handler };
  const key = [layKey(s), s.dog.name, JSON.stringify(handler), s.searchCarry ?? 'hand', s.searchDelivery?.name ?? 'live', s.searchMotion === false ? 'nomotion' : 'motion'].join('|');
  const truth = buildSearchTruth(lay.truth, s.dog, handler, makeRng(seedFrom(key, 'dog')), { losses: s.losses });
  const carry = s.searchCarry ?? 'hand';
  const t0 = SIM_T0_MS + Math.round((lay.truth.durationS + (s.ageMin ?? 30) * 60) * 1000);
  const profile: GpsProfile = gpsProfile(s.device, s.env, carry);
  const fixes = simulateGps(truth.handlerTimeline, profile, s.searchDelivery ?? LIVE_DELIVERY, makeRng(seedFrom(key, 'gps')), t0);
  const motion = s.searchMotion === false ? [] : simulateMotion(truth.handlerTimeline, motionProfile(s.platform, carry, s.device), makeRng(seedFrom(key, 'motion')), seedFrom(key, 'chain'), t0);
  const appDistance = s.appHandlerDistanceM ?? (handler.lineM >= 8 ? 10 : handler.lineM >= 3 ? 5 : 1);
  // ── Unterbrechungen und Bedienung in Zeitfenster und Aktionen übersetzen.
  const actions: SearchAction[] = [];
  const backgroundWindows: { fromMs: number; toMs: number }[] = [];
  for (const i of s.interruptions ?? []) {
    const from = t0 + Math.round(i.atFrac * truth.durationS * 1000), to = from + i.durationS * 1000;
    if (i.kind === 'lock' || i.kind === 'call') backgroundWindows.push({ fromMs: from, toMs: to });
    if (i.kind === 'call') actions.push({ atMs: from, kind: 'interruptSpeech' });
    if (i.kind === 'pause') actions.push({ atMs: from, kind: 'pause' }, { atMs: to, kind: 'unpause' });
    if (i.kind === 'kill') actions.push({ atMs: from, kind: 'kill' }, { atMs: to, kind: 'restart' });   // Runner verwirft alles dazwischen
  }
  if (s.manualTap) for (const a of truth.articles) if (a.pickupStartTS != null) actions.push({ atMs: t0 + Math.round((a.pickupStartTS + s.manualTap.tapAfterS) * 1000), kind: 'markObject' });
  const search = await runSearch({ lay: lay.run, fixes, motion, motionAvailable: s.searchMotion !== false, handlerDistanceM: appDistance, actions, startMs: t0, backgroundWindows });
  return { scenario: s, lay, truth, search, score: scoreSearch(lay, truth, search, !!s.manualTap) };
}

export function scoreSearch(lay: LayPhase, truth: SearchTruth, search: SearchRunResult, manualTap = false): SearchScore {
  const { result, analytics } = search;
  // Gegenstände: Reihenfolge der Antipper = Reihenfolge der wahren Gegenstände.
  const paired = lay.run.objects.length === lay.truth.articles.length;
  const objects = paired ? lay.run.objects.map((o, i) => {
    const a = lay.truth.articles[i];
    return {
      index: i, atEnd: a.atM >= lay.truth.lengthM - 1, layErrM: Math.hypot(o.x - a.x, o.y - a.y), indicated: truth.articles[i]?.indicated ?? false,
      appFound: result.foundObjectIndices.includes(i), status: String(result.objectStatuses[i] ?? 'unbekannt'),
      analysisStatus: analytics?.objects.find(x => x.objectIndex === i + 1)?.status ?? null,
    };
  }) : [];
  return {
    startLocked: search.startLocked,
    progressPct: search.trackLengthM > 0 ? (search.progressM / search.trackLengthM) * 100 : 0,
    objects,
    appDeviationM: result.deviationAvgM, dogDeviationM: truth.dogMeanLateralM, handlerDeviationM: truth.handlerMeanLateralM,
    recorderScore: result.score, analysisScore: analytics ? analytics.trackScore : null,
    deviationEvents: analytics ? analytics.deviationEvents.length : 0,
    breaks: result.breaks.length,
    guidance: scoreGuidance(lay, truth, search, manualTap),
  };
}

const ANNOUNCE_TOO_EARLY_M = 15;

export function scoreGuidance(lay: LayPhase, truth: SearchTruth, search: SearchRunResult, manualTap = false): GuidanceScore {
  const t0 = search.startMs;
  const dog = truth.dogSamples;
  const dt = truth.handlerTimeline.dtS;
  const dogAt = (ms: number) => dog[Math.max(0, Math.min(dog.length - 1, Math.round((ms - t0) / 1000 / dt)))];
  const handlerAt = (ms: number) => truth.handlerTimeline.samples[Math.max(0, Math.min(truth.handlerTimeline.samples.length - 1, Math.round((ms - t0) / 1000 / dt)))];
  const L = lay.truth.lengthM;

  // Lage-Ereignisse ↔ Wahrheit: Winkel nach Lage (≤ 8 m), Gegenstände in Antipp-Reihenfolge.
  const featureTruth = new Map<string, { kind: 'angle' | 'object'; trueAtM: number }>();
  const usedCorner = new Set<number>();
  lay.run.corners.forEach((c, i) => {
    let best = -1, bestD = 8;
    lay.truth.corners.forEach((tc, j) => { const d = Math.hypot(tc.x - c.x, tc.y - c.y); if (!usedCorner.has(j) && d < bestD) { bestD = d; best = j; } });
    if (best >= 0) { usedCorner.add(best); featureTruth.set(`winkel-${i}`, { kind: 'angle', trueAtM: lay.truth.corners[best].sM }); }
  });
  if (lay.run.objects.length === lay.truth.articles.length)
    lay.run.objects.forEach((_, i) => featureTruth.set(`gegenstand-${i}`, { kind: 'object', trueAtM: lay.truth.articles[i].atM }));

  const spokenFeature = search.spoken.filter(e => e.key?.startsWith('feature:'));
  const finalDog = dog[dog.length - 1]?.progressM ?? 0;
  const features: GuidanceScore['features'] = [];
  for (const [id, f] of featureTruth) {
    const mine = spokenFeature.filter(e => e.key === `feature:${id}`);
    const first = mine[0];
    features.push({ kind: f.kind, trueAtM: f.trueAtM, spokenCount: mine.length, reached: finalDog >= f.trueAtM - 0.5,
      spokenAheadM: first ? f.trueAtM - dogAt(first.startMs).progressM : null });
  }
  const spuriousAngleSpoken = spokenFeature.filter(e => e.key!.startsWith('feature:winkel-') && !featureTruth.has(e.key!.slice('feature:'.length))).length;

  // Pfote, Fortschritt, falscher Schenkel.
  let errSum = 0, errMax = 0, n = 0, jumps = 0, wrong = 0, wrongMax = 0;
  let prev: { app: number; truth: number } | null = null;
  const lying = truth.articles.filter(a => a.arrivedTS != null && a.leftTS != null);
  let lyingN = 0, lyingAhead = 0;
  for (const tr of search.trace) {
    if (!tr.locked || tr.trackLengthM <= 0) { prev = null; continue; }
    const scale = L / tr.trackLengthM;
    const d = dogAt(tr.tMs);
    const appDog = tr.appDogM * scale, trueDog = d.progressM;
    const err = Math.abs(appDog - trueDog);
    errSum += err; errMax = Math.max(errMax, err); n++;
    if (prev && appDog - prev.app > (trueDog - prev.truth) + 8) jumps++;
    prev = { app: appDog, truth: trueDog };
    if (tr.handler) {
      const hTrue = handlerAt(tr.tMs);
      const trueHandler = progressOnTrack(lay.truth, hTrue.x, hTrue.y, Math.max(0, trueDog - truth.handler.lineM - 6), trueDog + 1).progressM;
      const off = Math.abs(tr.appHandlerM * scale - trueHandler);
      if (off > 8) wrong++;
      wrongMax = Math.max(wrongMax, off);
    }
    const tS = (tr.tMs - t0) / 1000;
    const lyingAt = lying.find(a => tS >= (a.arrivedTS as number) && tS <= (a.leftTS as number));
    if (lyingAt) { lyingN++; if (appDog > lyingAt.atM + 3) lyingAhead++; }
  }
  const lyingAnnouncements = spokenFeature.filter(e => {
    const tS = (e.startMs - t0) / 1000;
    const a = lying.find(x => tS >= (x.arrivedTS as number) && tS <= (x.leftTS as number));
    const f = featureTruth.get(e.key!.slice('feature:'.length));
    return !!a && !!f && f.trueAtM > a.atM + 1;
  }).length;

  // Ende.
  const endSpoken = search.spoken.filter(e => e.key?.startsWith('track-end'));
  const endMs = search.endFiredAtMs[0] ?? null;

  // Manuelles Antippen: richtig = der angetippte (wahre) Gegenstand steht als manuell gefunden.
  const statuses = search.result.objectStatuses.map(String);
  const tapped = truth.articles.filter(a => a.pickupStartTS != null);
  const manualTaps = manualTap ? tapped.length : 0;
  const manualTapsCorrect = manualTap ? tapped.filter(a => statuses[a.index] === 'manual_found' || statuses[a.index] === 'auto_dwell_found').length : 0;
  // Fehlzuordnung: ein Gegenstand, bei dem nie angetippt wurde, steht als «manuell gefunden».
  const manualMisattributed = manualTap ? truth.articles.filter(a => a.pickupStartTS == null && statuses[a.index] === 'manual_found').length : 0;

  // Abrisse.
  const breaks = search.result.breaks.map(b => b.startedAtSec);
  const inLoss = (sec: number) => truth.lossWindowsS.some(w => sec >= w.fromS - 5 && sec <= w.toS + 15);
  const searchOffsetS = 0;   // startedAtSec zählt ab Suchbeginn (= t0)
  const lossesDetected = truth.lossWindowsS.filter(w => breaks.some(b => b + searchOffsetS >= w.fromS - 5 && b + searchOffsetS <= w.toS + 15)).length;
  const breaksOutsideLoss = breaks.filter(b => !inLoss(b + searchOffsetS)).length;

  const resume = search.kills.map(k => {
    const after = search.spoken.filter(e => k.restartMs != null && e.startMs >= k.restartMs && e.key?.startsWith('feature:')).map(e => e.key!.slice('feature:'.length));
    // «Gegenstand erkannt» für einen Fund, der schon vor dem Abbruch angesagt war.
    const detectedBefore = new Set(search.spoken.filter(e => e.startMs < k.atMs && e.key?.startsWith('auto_dwell:')).map(e => e.key));
    const objectDetectedRepeated = search.spoken.filter(e => k.restartMs != null && e.startMs >= k.restartMs && detectedBefore.has(e.key)).length;
    return {
      pointsBefore: k.pointsBefore, pointsRestored: k.pointsRestored,
      foundLost: k.foundBefore.filter(id => !k.foundRestored.includes(id)).length,
      voiceRepeated: after.filter(id => k.voiceFiredBefore.includes(id)).length,
      objectDetectedRepeated,
      endRepeated: endSpoken.length > 1,
      pendingFound: k.pendingFound,
    };
  });

  return {
    features, spuriousAngleSpoken,
    interruptedSpoken: search.spoken.filter(e => e.stopped).length,
    queueDropped: search.voiceDiagnostics.filter(e => e.suppressedReason === 'queue_expired' || e.suppressedReason === 'queue_overflow').length,
    pawErrMeanM: n ? errSum / n : 0, pawErrMaxM: errMax, pawJumps: jumps,
    wrongLegShare: n ? wrong / n : 0, wrongLegMaxM: wrongMax,
    lyingPawAheadShare: lyingN ? lyingAhead / lyingN : null, lyingAnnouncements,
    endFired: endMs != null, endRemainingM: endMs != null ? Math.max(0, L - dogAt(endMs).progressM) : null, endFiredCount: endSpoken.length,
    manualTaps, manualTapsCorrect, manualMisattributed,
    losses: truth.lossWindowsS.length, lossesDetected, breaksOutsideLoss,
    resume,
  };
}

/** Einordnung einer Ansage nach der Distanz des wahren Hundes zum Punkt bei Sprechbeginn. */
export function classifyAnnouncement(aheadM: number | null): 'rechtzeitig' | 'knapp' | 'zu_spaet' | 'zu_frueh' | 'fehlt' {
  if (aheadM == null) return 'fehlt';
  if (aheadM > ANNOUNCE_TOO_EARLY_M) return 'zu_frueh';
  if (aheadM >= 3) return 'rechtzeitig';
  if (aheadM >= 0) return 'knapp';
  return 'zu_spaet';
}
