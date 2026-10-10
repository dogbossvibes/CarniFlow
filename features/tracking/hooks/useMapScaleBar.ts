import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppState } from 'react-native';
import { requestMapScaleMeasurement, type MapScale, type MapScaleProjection } from '../utils/mapScaleBar';

// Presentation sampling only. Continuous camera events must not debounce work forever.
export const MAP_SCALE_REFRESH = { intervalMs: 200, delayMs: 80, timeoutMs: 300, maxAgeMs: 500, retries: 2 } as const;
type Controller = { request: (moving: boolean) => void; invalidate: () => void };

export function useMapScaleBar({ mapRef, enabled, ready, width, height, bottom }: {
  mapRef: RefObject<MapScaleProjection | null>; enabled: boolean; ready: boolean;
  width: number; height: number; bottom: number;
}) {
  const [scale, setScale] = useState<MapScale | null>(null);
  const controller = useRef<Controller | null>(null);
  const refresh = useCallback(() => controller.current?.request(false), []);
  const onRegionChange = useCallback(() => controller.current?.request(true), []);
  const invalidate = useCallback(() => controller.current?.invalidate(), []);

  useEffect(() => {
    let alive = true;
    let active = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let generation = 0;
    let inFlight = false;
    let dirty = false;
    let moving = false;
    let failures = 0;
    let lastStart = -Infinity;
    let lastSample = -Infinity;
    let scheduled: ReturnType<typeof setTimeout> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    let expiry: ReturnType<typeof setTimeout> | null = null;
    let stopWaiting: (() => void) | null = null;
    const usable = () => alive && active && enabled && ready && width >= 120 && height - bottom >= 100;
    const clearExpiry = () => { if (expiry !== null) clearTimeout(expiry); expiry = null; };
    const expireMovingSample = () => {
      clearExpiry();
      if (!moving) return;
      const remaining = lastSample + MAP_SCALE_REFRESH.maxAgeMs - Date.now();
      if (remaining <= 0) { setScale(null); return; }
      expiry = setTimeout(() => { expiry = null; if (alive) setScale(null); }, remaining);
    };
    const cancel = () => {
      generation++;
      if (scheduled !== null) clearTimeout(scheduled);
      if (deadline !== null) clearTimeout(deadline);
      scheduled = deadline = null;
      stopWaiting?.();
      stopWaiting = null;
      clearExpiry();
      inFlight = dirty = moving = false;
      failures = 0;
      lastStart = lastSample = -Infinity;
      if (alive) setScale(null);
    };
    const schedule = () => {
      if (!usable() || scheduled !== null || inFlight || stopWaiting !== null) return;
      const wait = Math.max(MAP_SCALE_REFRESH.delayMs, lastStart + MAP_SCALE_REFRESH.intervalMs - Date.now());
      scheduled = setTimeout(sample, wait);
    };
    const finish = (token: number, next: MapScale | null) => {
      if (!alive || token !== generation) return;
      // A deadline also invalidates a native response that arrives afterwards.
      generation++;
      if (deadline !== null) clearTimeout(deadline);
      deadline = null;
      inFlight = false;
      setScale(next);
      if (next) { failures = 0; lastSample = lastStart; }
      else failures++;
      expireMovingSample();
      if (dirty || (!next && failures <= MAP_SCALE_REFRESH.retries)) schedule();
    };
    function sample() {
      scheduled = null;
      if (!usable()) return;
      dirty = false;
      inFlight = true;
      const startedAt = Date.now();
      const token = ++generation;
      const current = () => alive && active && token === generation;
      deadline = setTimeout(() => finish(token, null), MAP_SCALE_REFRESH.timeoutMs);
      const map = mapRef.current;
      if (!map || typeof map.coordinateForPoint !== 'function') { finish(token, null); return; }
      const measurement = requestMapScaleMeasurement(map, { x: 22, y: height - bottom - 9 }, Math.min(120, width - 70), current, () => {
        stopWaiting = null;
        if (usable()) { dirty = true; schedule(); }
      });
      if ('unsubscribe' in measurement) {
        // A previous deadline only hid the ruler. Wait for the real native calls to
        // settle; do not accumulate new calls or listeners during camera storms.
        clearTimeout(deadline);
        deadline = null;
        inFlight = false;
        stopWaiting = measurement.unsubscribe;
        setScale(null);
        return;
      }
      lastStart = startedAt;
      void measurement.promise.then(
        next => finish(token, Date.now() - startedAt <= MAP_SCALE_REFRESH.timeoutMs ? next : null),
        () => finish(token, null),
      );
    }
    const request = (isMoving: boolean) => {
      if (!usable()) return;
      moving = isMoving;
      dirty = true;
      failures = 0;
      expireMovingSample();
      schedule();
    };
    controller.current = { request, invalidate: cancel };
    cancel();
    request(false);
    const subscription = enabled ? AppState.addEventListener('change', state => {
      active = state === 'active';
      cancel();
      if (active) request(false);
    }) : null;
    return () => { alive = false; cancel(); controller.current = null; subscription?.remove(); };
  }, [mapRef, enabled, ready, width, height, bottom]);

  return { scale, refresh, onRegionChange, invalidate };
}
