import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { rateTrackingWeather, type ObservedGround, type TrackWeatherRating } from './model';
import { rateTrainingWeather, type TrainingWeatherRating } from './trainingModel';
import { STALE_AFTER_MS, loadTrackWeather, requestTrackWeatherPermission, type TrackWeatherLoad } from './service';
import { useTrackWeatherSetting } from './setting';

export type TrackWeatherView =
  | { kind: 'off' }
  | { kind: 'loading' }
  | { kind: 'noPermission' }
  | { kind: 'unavailable' }
  | { kind: 'stale'; fetchedAtMs: number }
  | { kind: 'ready'; rating: TrackWeatherRating; training: TrainingWeatherRating | null; fetchedAtMs: number; fromCache: boolean };

/** Reine Ableitung der Anzeige aus dem Abrufergebnis (testbar). */
export function deriveTrackWeatherView(
  load: TrackWeatherLoad, nowMs: number, tzOffsetMin: number, ground: ObservedGround | null = null,
): TrackWeatherView {
  if (load.status === 'noPermission') return { kind: 'noPermission' };
  const cache = load.cache;
  if (!cache) return { kind: 'unavailable' };
  if (nowMs - cache.fetchedAtMs > STALE_AFTER_MS) return { kind: 'stale', fetchedAtMs: cache.fetchedAtMs };
  const rating = rateTrackingWeather(cache.hours, nowMs, cache, tzOffsetMin, ground);
  if (!rating) return { kind: 'stale', fetchedAtMs: cache.fetchedAtMs };
  const training = rateTrainingWeather(cache.hours, nowMs, cache, tzOffsetMin);
  return { kind: 'ready', rating, training, fetchedAtMs: cache.fetchedAtMs, fromCache: load.status === 'ok' && load.fromCache };
}

/** @param ground Beschaffenheit vor Ort (nur Lege-Screen); sonst Schätzung aus dem Regenverlauf. */
export function useTrackWeather(ground: ObservedGround | null = null) {
  const setting = useTrackWeatherSetting();
  // Zeitpunkt wird beim Abruf festgehalten (nicht beim Rendern gelesen).
  const [load, setLoad] = useState<{ result: TrackWeatherLoad; nowMs: number; tzOffsetMin: number } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const run = useCallback(async (force = false) => {
    const next = await loadTrackWeather(force);
    if (alive.current) setLoad({ result: next, nowMs: Date.now(), tzOffsetMin: -new Date().getTimezoneOffset() });
  }, []);

  useFocusEffect(useCallback(() => {
    if (setting.loaded && setting.enabled) void run();
  }, [setting.loaded, setting.enabled, run]));

  const requestPermission = useCallback(async () => {
    if (await requestTrackWeatherPermission()) { setLoad(null); await run(true); }
  }, [run]);

  // Neu bewerten, wenn Daten oder Beschaffenheit wechseln – ohne neuen Abruf.
  const view = useMemo<TrackWeatherView>(() => {
    if (!setting.loaded || !load) return { kind: 'loading' };
    if (!setting.enabled) return { kind: 'off' };
    return deriveTrackWeatherView(load.result, load.nowMs, load.tzOffsetMin, ground);
  }, [setting.loaded, setting.enabled, load, ground]);

  if (setting.loaded && !setting.enabled) return { view: { kind: 'off' } as TrackWeatherView, requestPermission, refresh: run };
  return { view, requestPermission, refresh: run };
}
