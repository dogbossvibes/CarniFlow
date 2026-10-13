import { calculateDistance, MAX_ACCURACY_M, MAX_SPEED_MPS, MIN_STEP_M } from '@/features/tracking/utils/gpsFilter';
import { isRecordingGap, splitContinuousPoints } from '@/features/tracking/utils/trackContinuity';

export const DISTRACTION_LIMITS = { points: 20_000, tracks: 32, name: 60 } as const;
export interface DistractionPoint { lat: number; lng: number; t: number; accuracy: number | null; breakBefore: boolean }
export interface DistractionWeather { recordedAtMs: number; temperature: number | null; windSpeed: number | null; humidity: number | null; weatherCode: number | null }
export interface DistractionTrack {
  version: 1; id: string; parentSessionId: string; name: string;
  startedAtMs: number; finishedAtMs: number | null;
  points: DistractionPoint[]; weather: DistractionWeather | null;
}
export class DistractionError extends Error {
  constructor(readonly code: 'INVALID' | 'LIMIT' | 'ACCOUNT_CHANGED' | 'PARENT_UNAVAILABLE' | 'STORAGE' | 'BUSY' | 'PERMISSION' | 'EMPTY') {
    super(code); this.name = 'DistractionError';
  }
}
const valid = (condition: unknown): void => { if (!condition) throw new DistractionError('INVALID'); };
const finite = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const time = (v: unknown) => finite(v, 1, 8_640_000_000_000_000) && Number.isSafeInteger(v);
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const parentId = (v: unknown) => uuid(v) || typeof v === 'string' && v.startsWith('local_') && uuid(v.slice(6));
const nullable = (v: unknown, lo: number, hi: number) => v === null || finite(v, lo, hi);
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DistractionError('INVALID');
  const v = value as Record<string, unknown>; valid(Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))); return v;
}
/** Strict, bounded own-line contract. Never receives or changes a main track or search state. */
export function parseDistractionTrack(input: unknown): DistractionTrack {
  const v = object(input, ['version', 'id', 'parentSessionId', 'name', 'startedAtMs', 'finishedAtMs', 'points', 'weather']);
  valid(v.version === 1 && uuid(v.id) && parentId(v.parentSessionId) && v.id !== v.parentSessionId);
  valid(typeof v.name === 'string' && v.name.trim().length > 0 && v.name.length <= DISTRACTION_LIMITS.name && !/[\u0000-\u001f\u007f]/.test(v.name));
  valid(time(v.startedAtMs) && (v.finishedAtMs === null || time(v.finishedAtMs) && (v.finishedAtMs as number) >= (v.startedAtMs as number)));
  if (!Array.isArray(v.points)) throw new DistractionError('INVALID');
  if (v.points.length > DISTRACTION_LIMITS.points) throw new DistractionError('LIMIT');
  let previous = (v.startedAtMs as number) - 1;
  const points = v.points.map(raw => {
    const p = object(raw, ['lat', 'lng', 't', 'accuracy', 'breakBefore']);
    valid(finite(p.lat, -90, 90) && finite(p.lng, -180, 180) && time(p.t) && (p.t as number) > previous
      && (v.finishedAtMs === null || (p.t as number) <= (v.finishedAtMs as number))
      && nullable(p.accuracy, 0, 100_000) && typeof p.breakBefore === 'boolean');
    previous = p.t as number; return { lat: p.lat as number, lng: p.lng as number, t: p.t as number, accuracy: p.accuracy as number | null, breakBefore: p.breakBefore as boolean };
  });
  if (v.finishedAtMs !== null && points.length < 2) throw new DistractionError('EMPTY');
  let weather: DistractionWeather | null = null;
  if (v.weather !== null) {
    const w = object(v.weather, ['recordedAtMs', 'temperature', 'windSpeed', 'humidity', 'weatherCode']);
    valid(time(w.recordedAtMs) && (w.recordedAtMs as number) >= (v.startedAtMs as number)
      && nullable(w.temperature, -100, 100) && nullable(w.windSpeed, 0, 500) && nullable(w.humidity, 0, 100)
      && (w.weatherCode === null || Number.isInteger(w.weatherCode) && finite(w.weatherCode, 0, 99)));
    weather = { recordedAtMs: w.recordedAtMs as number, temperature: w.temperature as number | null, windSpeed: w.windSpeed as number | null, humidity: w.humidity as number | null, weatherCode: w.weatherCode as number | null };
  }
  return { version: 1, id: v.id as string, parentSessionId: v.parentSessionId as string, name: v.name as string,
    startedAtMs: v.startedAtMs as number, finishedAtMs: v.finishedAtMs as number | null, points, weather };
}
export function distractionDistance(points: readonly DistractionPoint[]): number {
  return splitContinuousPoints(points).reduce((total, part) => total + part.reduce((n, p, i) => n + (i ? calculateDistance(part[i - 1], p) : 0), 0), 0);
}
/** Good stationary fixes keep continuity alive without adding jitter distance. */
export function createDistractionSampler(existing: readonly DistractionPoint[] = []) {
  let last = existing.at(-1) ?? null, goodAt: number | null = null, pendingBreak = existing.length > 0;
  return {
    interrupt() { pendingBreak = true; goodAt = null; },
    accept(sample: { lat: number; lng: number; t: number; accuracy?: number | null }, now: number): DistractionPoint | null {
      if (!finite(sample.lat, -90, 90) || !finite(sample.lng, -180, 180) || !time(sample.t)
        || sample.t > now || now - sample.t > 5000 || sample.accuracy == null || !finite(sample.accuracy, 0, MAX_ACCURACY_M)
        || last && sample.t <= last.t || goodAt !== null && sample.t <= goodAt) return null;
      const gap = pendingBreak || isRecordingGap(goodAt, sample.t);
      const distance = last ? calculateDistance(last, sample) : 0;
      if (last && !gap && distance / ((sample.t - last.t) / 1000) > MAX_SPEED_MPS) return null;
      goodAt = sample.t;
      if (last && !gap && distance < MIN_STEP_M) return null;
      const point = { lat: sample.lat, lng: sample.lng, t: sample.t, accuracy: sample.accuracy, breakBefore: !!last && gap };
      last = point; pendingBreak = false; return point;
    },
  };
}
