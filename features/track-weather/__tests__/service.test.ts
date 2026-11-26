jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(), requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { Low: 2 },
}));
jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import {
  REFRESH_AFTER_MS, STALE_AFTER_MS, TRACK_WEATHER_CACHE_KEY, loadTrackWeather, parseCache, parseForecastResponse,
  roundCoord, sameArea, shouldRefetch,
} from '../service';
import { deriveTrackWeatherView } from '../useTrackWeather';
import { parseTrackWeatherSetting } from '../setting';

const loc = Location as jest.Mocked<typeof Location>;
const invoke = supabase.functions.invoke as jest.Mock;

const iso = (ms: number) => new Date(ms).toISOString();
const hourMs = (ms: number) => ms - (ms % 3_600_000);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('reine Helfer', () => {
  it('rundet auf 2 Dezimalen (~1 km)', () => {
    expect(roundCoord(46.948123)).toBe(46.95);
    expect(roundCoord(7.44412)).toBe(7.44);
  });
  it('sameArea / shouldRefetch', () => {
    const c = { lat: 46.95, lng: 7.44, fetchedAtMs: 1_000_000, hours: [] };
    expect(sameArea(c, { lat: 46.97, lng: 7.44 })).toBe(true);
    expect(sameArea(c, { lat: 47.2, lng: 7.44 })).toBe(false);
    expect(shouldRefetch(null, c, 0)).toBe(true);
    expect(shouldRefetch(c, c, 1_000_000 + REFRESH_AFTER_MS - 1)).toBe(false);
    expect(shouldRefetch(c, c, 1_000_000 + REFRESH_AFTER_MS)).toBe(true);
    expect(shouldRefetch(c, { lat: 47.5, lng: 8.5 }, 1_000_001)).toBe(true);
  });
  it('parseForecastResponse verwirft Unbrauchbares und lässt fehlende Werte null', () => {
    const out = parseForecastResponse({ hours: [{ time: 'kaputt' }, { time: '2026-04-15T08:00:00Z', windSpeed: 12, temperature: 'x' }, null] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ windSpeed: 12, temperature: null, symbol: null });
    expect(parseForecastResponse(null)).toEqual([]);
  });
  it('parseCache ist robust', () => {
    expect(parseCache(null)).toBeNull();
    expect(parseCache('{kaputt')).toBeNull();
    expect(parseCache(JSON.stringify({ lat: 1, lng: 2, fetchedAtMs: 3, hours: [{ timeMs: 5 }, 'x'] }))?.hours).toHaveLength(1);
  });
  it('Einstellung: Standard an, nur "false" schaltet aus', () => {
    expect(parseTrackWeatherSetting(null)).toBe(true);
    expect(parseTrackWeatherSetting('true')).toBe(true);
    expect(parseTrackWeatherSetting('false')).toBe(false);
  });
});

describe('loadTrackWeather', () => {
  const grant = () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    loc.getLastKnownPositionAsync.mockResolvedValue({ coords: { latitude: 46.948123, longitude: 7.444119 } } as never);
  };

  it('ohne Standortrecht: kein Abruf, keine Rückfrage', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    expect(await loadTrackWeather()).toEqual({ status: 'noPermission' });
    expect(invoke).not.toHaveBeenCalled();
    expect(loc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('sendet nur gerundete Koordinaten und speichert die Antwort lokal', async () => {
    grant();
    const now = Date.now();
    invoke.mockResolvedValue({ data: { hours: [{ time: iso(hourMs(now)), windSpeed: 8 }] }, error: null });
    const res = await loadTrackWeather();
    expect(invoke).toHaveBeenCalledWith('track-weather', { body: { lat: 46.95, lng: 7.44 } });
    expect(res.status).toBe('ok');
    expect(parseCache(await AsyncStorage.getItem(TRACK_WEATHER_CACHE_KEY))?.hours).toHaveLength(1);
  });

  it('offline: frischer Cache bleibt, Fehler zerstört nichts', async () => {
    grant();
    const cache = { lat: 46.95, lng: 7.44, fetchedAtMs: Date.now() - REFRESH_AFTER_MS - 1, hours: [{ timeMs: hourMs(Date.now()) }] };
    await AsyncStorage.setItem(TRACK_WEATHER_CACHE_KEY, JSON.stringify(cache));
    invoke.mockRejectedValue(new Error('offline'));
    const res = await loadTrackWeather();
    expect(res).toMatchObject({ status: 'ok', fromCache: true });
    expect(parseCache(await AsyncStorage.getItem(TRACK_WEATHER_CACHE_KEY))?.fetchedAtMs).toBe(cache.fetchedAtMs);
  });

  it('nicht verfügbar, wenn weder Antwort noch Cache', async () => {
    grant();
    invoke.mockResolvedValue({ data: null, error: new Error('404') });
    expect(await loadTrackWeather()).toEqual({ status: 'unavailable', cache: null });
  });
});

describe('deriveTrackWeatherView', () => {
  it('älter als 3 h → keine Ampel', () => {
    const now = Date.UTC(2026, 3, 15, 8, 10);
    const cache = { lat: 46.95, lng: 7.44, fetchedAtMs: now - STALE_AFTER_MS - 1, hours: [] };
    expect(deriveTrackWeatherView({ status: 'ok', cache, fromCache: true }, now, 120)).toEqual({ kind: 'stale', fetchedAtMs: cache.fetchedAtMs });
  });
  it('gültige Daten → Ampel', () => {
    const now = Date.UTC(2026, 3, 15, 8, 10);
    const h = (ms: number) => ({ timeMs: ms, temperature: 12, humidity: 70, windSpeed: 4, windGust: 10, cloudCover: 70, uvIndex: 2, precipitation: 0, thunderProbability: null, symbol: 'cloudy' });
    const cache = { lat: 46.95, lng: 7.44, fetchedAtMs: now, hours: [h(Date.UTC(2026, 3, 15, 8)), h(Date.UTC(2026, 3, 15, 9))] };
    const v = deriveTrackWeatherView({ status: 'ok', cache, fromCache: false }, now, 120);
    expect(v.kind).toBe('ready');
    if (v.kind === 'ready') expect(v.rating.level).toBe('good');
    const frozen = deriveTrackWeatherView({ status: 'ok', cache, fromCache: false }, now, 120, 'frozen');
    if (frozen.kind === 'ready') expect(frozen.rating.level).toBe('medium');
    expect(frozen.kind).toBe('ready');
  });
  it('ohne Recht / ohne Daten', () => {
    expect(deriveTrackWeatherView({ status: 'noPermission' }, 0, 0)).toEqual({ kind: 'noPermission' });
    expect(deriveTrackWeatherView({ status: 'unavailable', cache: null }, 0, 0)).toEqual({ kind: 'unavailable' });
  });
});
