// Fährten-Simulator (T-192) — reiner Testcode.
// Ein Such-Szenario = Legen (mit Gegenständen) → Liegezeit → Absuche mit Hund und
// Hundeführer → echter Such-Recorder → Analyse → Bewertung gegen die Wahrheit.
import { simulateGps, type DeliverySpec, type GpsProfile } from './gpsModel';
import { runLay, SIM_T0_MS, type LayRunResult } from './layRunner';
import { simulateMotion } from './motionModel';
import { gpsProfile, motionProfile, LIVE_DELIVERY, type CarryMode, type DeviceClass, type Environment, type Platform } from './profiles';
import { makeRng, seedFrom } from './rng';
import { runSearch, type SearchRunResult } from './searchRunner';
import { buildSearchTruth, DEFAULT_HANDLER, type DogSpec, type HandlerSpec, type SearchTruth } from './searchTruth';
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
  seed: number;
}

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
  const truth = buildSearchTruth(lay.truth, s.dog, handler, makeRng(seedFrom(key, 'dog')));
  const carry = s.searchCarry ?? 'hand';
  const t0 = SIM_T0_MS + Math.round((lay.truth.durationS + (s.ageMin ?? 30) * 60) * 1000);
  const profile: GpsProfile = gpsProfile(s.device, s.env, carry);
  const fixes = simulateGps(truth.handlerTimeline, profile, s.searchDelivery ?? LIVE_DELIVERY, makeRng(seedFrom(key, 'gps')), t0);
  const motion = s.searchMotion === false ? [] : simulateMotion(truth.handlerTimeline, motionProfile(s.platform, carry, s.device), makeRng(seedFrom(key, 'motion')), seedFrom(key, 'chain'), t0);
  const appDistance = s.appHandlerDistanceM ?? (handler.lineM >= 8 ? 10 : handler.lineM >= 3 ? 5 : 1);
  const search = await runSearch({ lay: lay.run, fixes, motion, motionAvailable: s.searchMotion !== false, handlerDistanceM: appDistance });
  return { scenario: s, lay, truth, search, score: scoreSearch(lay, truth, search) };
}

export function scoreSearch(lay: LayPhase, truth: SearchTruth, search: SearchRunResult): SearchScore {
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
  };
}
