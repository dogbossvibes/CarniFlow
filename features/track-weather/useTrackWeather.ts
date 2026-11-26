import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { rateTrackingWeather, type TrackWeatherRating } from './model';
import { STALE_AFTER_MS, loadTrackWeather, requestTrackWeatherPermission, type TrackWeatherLoad } from './service';
import { useTrackWeatherSetting } from './setting';

export type TrackWeatherView =
  | { kind: 'off' }
  | { kind: 'loading' }
  | { kind: 'noPermission' }
  | { kind: 'unavailable' }
  | { kind: 'stale'; fetchedAtMs: number }
  | { kind: 'ready'; rating: TrackWeatherRating; fetchedAtMs: number; fromCache: boolean };

/** Reine Ableitung der Anzeige aus dem Abrufergebnis (testbar). */
export function deriveTrackWeatherView(load: TrackWeatherLoad, nowMs: number, tzOffsetMin: number): TrackWeatherView {
  if (load.status === 'noPermission') return { kind: 'noPermission' };
  const cache = load.cache;
  if (!cache) return { kind: 'unavailable' };
  if (nowMs - cache.fetchedAtMs > STALE_AFTER_MS) return { kind: 'stale', fetchedAtMs: cache.fetchedAtMs };
  const rating = rateTrackingWeather(cache.hours, nowMs, cache, tzOffsetMin);
  if (!rating) return { kind: 'stale', fetchedAtMs: cache.fetchedAtMs };
  return { kind: 'ready', rating, fetchedAtMs: cache.fetchedAtMs, fromCache: load.status === 'ok' && load.fromCache };
}

export function useTrackWeather() {
  const setting = useTrackWeatherSetting();
  const [view, setView] = useState<TrackWeatherView>({ kind: 'loading' });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const run = useCallback(async (force = false) => {
    const load = await loadTrackWeather(force);
    if (alive.current) setView(deriveTrackWeatherView(load, Date.now(), -new Date().getTimezoneOffset()));
  }, []);

  useFocusEffect(useCallback(() => {
    if (setting.loaded && setting.enabled) void run();
  }, [setting.loaded, setting.enabled, run]));

  const requestPermission = useCallback(async () => {
    if (await requestTrackWeatherPermission()) { setView({ kind: 'loading' }); await run(true); }
  }, [run]);

  if (!setting.loaded) return { view: { kind: 'loading' } as TrackWeatherView, requestPermission, refresh: run };
  if (!setting.enabled) return { view: { kind: 'off' } as TrackWeatherView, requestPermission, refresh: run };
  return { view, requestPermission, refresh: run };
}
