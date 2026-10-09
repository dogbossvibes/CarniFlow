import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppState } from 'react-native';
import { measureMapScale, type MapScale, type MapScaleProjection } from '../utils/mapScaleBar';

export function useMapScaleBar({ mapRef, enabled, ready, width, height, bottom }: {
  mapRef: RefObject<MapScaleProjection | null>; enabled: boolean; ready: boolean;
  width: number; height: number; bottom: number;
}) {
  const [scale, setScale] = useState<MapScale | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const cancel = useCallback(() => {
    generation.current++;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const invalidate = useCallback(() => { cancel(); setScale(null); }, [cancel]);
  const refresh = useCallback(() => {
    invalidate();
    if (!enabled || !ready || !active.current || width < 120 || height - bottom < 100) return;
    const token = generation.current;
    const probeWidth = Math.min(120, width - 70);
    const attempt = async (retry: number) => {
      if (token !== generation.current) return;
      try {
        const map = mapRef.current;
        const next = map && typeof map.coordinateForPoint === 'function'
          ? await measureMapScale(map, { x: 22, y: height - bottom - 9 }, probeWidth) : null;
        if (token !== generation.current) return;
        if (next) { setScale(next); return; }
      } catch { /* Native projection may be unavailable while the map mounts. */ }
      if (token === generation.current && retry > 0) timer.current = setTimeout(() => { void attempt(retry - 1); }, 250);
    };
    timer.current = setTimeout(() => { void attempt(2); }, 80);
  }, [invalidate, enabled, ready, width, height, bottom, mapRef]);
  useEffect(() => { refresh(); return cancel; }, [refresh, cancel]);
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', state => {
      active.current = state === 'active';
      if (active.current) refresh(); else invalidate();
    });
    return () => subscription.remove();
  }, [enabled, refresh, invalidate]);
  return { scale, refresh, invalidate };
}
