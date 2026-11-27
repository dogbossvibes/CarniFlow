import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { HOUR_MS, mergeHourHistory, type WeatherHour } from './model';

// Fährtenwetter — Abruf über die ANYVO-Funktion `track-weather` (MET Norway).
// Datenschutz: der Standort wird schon in der App auf ~1 km gerundet; es gehen
// weder Ortsname noch Hund oder Fährte mit. Ohne Standortrecht wird nichts
// abgefragt und nie automatisch nach dem Recht gefragt.

export const TRACK_WEATHER_CACHE_KEY = 'track_weather_cache_v1';
export const REFRESH_AFTER_MS = 30 * 60_000;
/** Älter als das → keine Ampel mehr, nur Hinweis. */
export const STALE_AFTER_MS = 3 * HOUR_MS;

export interface TrackWeatherCache {
  lat: number;
  lng: number;
  fetchedAtMs: number;
  hours: WeatherHour[];
}

export type TrackWeatherLoad =
  | { status: 'noPermission' }
  | { status: 'unavailable'; cache: TrackWeatherCache | null }
  | { status: 'ok'; cache: TrackWeatherCache; fromCache: boolean };

export const roundCoord = (v: number) => Math.round(v * 100) / 100;

/** Gleiche Gegend (~5 km): früherer Verlauf darf für «Regen zuvor» mitzählen. */
export function sameArea(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return Math.abs(a.lat - b.lat) <= 0.05 && Math.abs(a.lng - b.lng) <= 0.05;
}

export function shouldRefetch(cache: TrackWeatherCache | null, coords: { lat: number; lng: number }, nowMs: number): boolean {
  if (!cache) return true;
  if (!sameArea(cache, coords)) return true;
  return nowMs - cache.fetchedAtMs >= REFRESH_AFTER_MS || nowMs < cache.fetchedAtMs;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Antwort der Funktion prüfen; unbrauchbare Stunden fallen weg, fehlende Werte bleiben null. */
export function parseForecastResponse(raw: unknown): WeatherHour[] {
  const list = (raw as { hours?: unknown } | null)?.hours;
  if (!Array.isArray(list)) return [];
  const out: WeatherHour[] = [];
  for (const h of list) {
    if (!h || typeof h !== 'object') continue;
    const r = h as Record<string, unknown>;
    const timeMs = typeof r.time === 'string' ? Date.parse(r.time) : NaN;
    if (!Number.isFinite(timeMs)) continue;
    out.push({
      timeMs,
      temperature: num(r.temperature),
      humidity: num(r.humidity),
      windSpeed: num(r.windSpeed),
      windGust: num(r.windGust),
      cloudCover: num(r.cloudCover),
      uvIndex: num(r.uvIndex),
      precipitation: num(r.precipitation),
      thunderProbability: num(r.thunderProbability),
      symbol: typeof r.symbol === 'string' ? r.symbol.slice(0, 40) : null,
    });
  }
  return out;
}

export function parseCache(raw: string | null): TrackWeatherCache | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<TrackWeatherCache>;
    if (num(c.lat) == null || num(c.lng) == null || num(c.fetchedAtMs) == null || !Array.isArray(c.hours)) return null;
    const hours = c.hours.filter((h): h is WeatherHour => !!h && typeof h === 'object' && Number.isFinite((h as WeatherHour).timeMs));
    return { lat: c.lat as number, lng: c.lng as number, fetchedAtMs: c.fetchedAtMs as number, hours };
  } catch { return null; }
}

async function readCache(): Promise<TrackWeatherCache | null> {
  try { return parseCache(await AsyncStorage.getItem(TRACK_WEATHER_CACHE_KEY)); } catch { return null; }
}

async function writeCache(c: TrackWeatherCache): Promise<void> {
  try { await AsyncStorage.setItem(TRACK_WEATHER_CACHE_KEY, JSON.stringify(c)); } catch { /* nur Cache */ }
}

async function currentCoords(): Promise<{ lat: number; lng: number } | 'noPermission' | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return 'noPermission';
    const last = await Location.getLastKnownPositionAsync({ maxAge: 3 * HOUR_MS, requiredAccuracy: 5000 }).catch(() => null);
    const pos = last ?? await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 8000)),
    ]).catch(() => null);
    if (!pos) return null;
    return { lat: roundCoord(pos.coords.latitude), lng: roundCoord(pos.coords.longitude) };
  } catch { return null; }
}

let inFlight: Promise<TrackWeatherLoad> | null = null;

async function loadOnce(force: boolean): Promise<TrackWeatherLoad> {
  const now = Date.now();
  const [cache, coords] = await Promise.all([readCache(), currentCoords()]);
  if (coords === 'noPermission') return { status: 'noPermission' };
  if (!coords) return cache ? { status: 'ok', cache, fromCache: true } : { status: 'unavailable', cache: null };
  if (!force && cache && !shouldRefetch(cache, coords, now)) return { status: 'ok', cache, fromCache: true };
  try {
    // Erst beim Abruf laden: Bildschirme bleiben ohne Backend-Konfiguration importierbar.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('@/lib/supabase') as typeof import('@/lib/supabase');
    const { data, error } = await supabase.functions.invoke('track-weather', { body: coords });
    const hours = error ? [] : parseForecastResponse(data);
    if (hours.length === 0) {
      return cache && sameArea(cache, coords) ? { status: 'ok', cache, fromCache: true } : { status: 'unavailable', cache };
    }
    const history = cache && sameArea(cache, coords) ? cache.hours : [];
    const next: TrackWeatherCache = { ...coords, fetchedAtMs: now, hours: mergeHourHistory(history, hours, now) };
    await writeCache(next);
    return { status: 'ok', cache: next, fromCache: false };
  } catch {
    return cache && sameArea(cache, coords) ? { status: 'ok', cache, fromCache: true } : { status: 'unavailable', cache };
  }
}

/** Ein gemeinsamer Abruf, auch wenn Startbildschirm und Fährten gleichzeitig fragen. */
export function loadTrackWeather(force = false): Promise<TrackWeatherLoad> {
  if (!inFlight) inFlight = loadOnce(force).finally(() => { inFlight = null; });
  return inFlight;
}

/** Nur auf ausdrücklichen Tipp der Nutzer:in. */
export async function requestTrackWeatherPermission(): Promise<boolean> {
  try { return (await Location.requestForegroundPermissionsAsync()).status === 'granted'; } catch { return false; }
}
