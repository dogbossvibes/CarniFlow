import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { precisionLocationClient as client } from '@/features/tracking/native/precisionLocationClient';
import { PRECISION, classifyQuality } from '@/features/tracking/engine/gpsQuality';
import type { TrackPointQuality } from '@/features/tracking/engine/types';

// Phase des GPS-Warmups vor der Fährtenaufnahme.
export type WarmupPhase =
  | 'stabilizing'   // GPS sammelt sich noch
  | 'ready'         // accuracy ≤ 15 m → Aufnahme freigegeben (Auto-Start)
  | 'imprecise'     // > 15 s ohne Stabilisierung → manueller Start + Warnung
  | 'denied'        // Standortberechtigung verweigert
  | 'error';        // GPS konnte nicht gestartet werden

export interface WarmupState {
  phase:       WarmupPhase;
  accuracy:    number | null;
  quality:     TrackPointQuality | null;
  elapsedMs:   number;
  canStart:    boolean;          // ready ODER imprecise
  warning:     string | null;
  engineLabel: string;
}

const PERM_ERROR = 'Standortberechtigung fehlt. Bitte in den Einstellungen erlauben.';
const GPS_ERROR  = 'GPS konnte nicht gestartet werden. Bitte kurz im Freien erneut versuchen.';
const IMPRECISE_WARN = 'GPS ist noch ungenau. Die Fährte kann weniger exakt aufgezeichnet werden.';

// GPS-Warmup: prüft Native Engine (sonst expo-location-Fallback), fragt die
// Standortberechtigung ERST hier ab (Start der Fährtenfunktion), sammelt 5–10 s
// Standortdaten und gibt die Aufnahme erst nach Stabilisierung frei.
export function useGpsWarmup(active: boolean) {
  const [state, setState] = useState<WarmupState>(() => ({
    phase: 'stabilizing', accuracy: null, quality: null, elapsedMs: 0,
    canStart: false, warning: null,
    engineLabel: client.isNativeAvailable() ? 'Native Precision' : 'Fallback (expo-location)',
  }));

  const subRef   = useRef<{ remove: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMs  = useRef(0);
  const accRef   = useRef<number | null>(null);

  const stop = useCallback(async () => {
    subRef.current?.remove(); subRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { await client.stop(); } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      // 1) Berechtigung ERST jetzt (beim Start der Fährtenfunktion) anfragen.
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setState(s => ({ ...s, phase: 'denied', warning: PERM_ERROR }));
        return;
      }

      // 2) Native Engine (oder Fallback) starten und Genauigkeit beobachten.
      startMs.current = Date.now();
      subRef.current = client.onLocation(loc => { accRef.current = loc.accuracy ?? null; });
      try {
        await client.start({ intervalMs: 1000, mode: 'tracking_dog_sport', enableHeading: false, allowBackground: false });
      } catch {
        if (!cancelled) setState(s => ({ ...s, phase: 'error', warning: GPS_ERROR }));
        return;
      }

      // 3) Stabilisierung bewerten.
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startMs.current;
        const acc = accRef.current;
        const quality = acc != null ? classifyQuality(acc) : null;

        let phase: WarmupPhase = 'stabilizing';
        let canStart = false;
        let warning: string | null = null;

        if (acc != null && acc <= PRECISION.READY_ACCURACY_M && elapsed >= PRECISION.WARMUP_MIN_MS) {
          phase = 'ready'; canStart = true;
        } else if (elapsed >= PRECISION.WARMUP_MANUAL_MS) {
          phase = 'imprecise'; canStart = true; warning = IMPRECISE_WARN;
        }

        setState(s => ({ ...s, phase, accuracy: acc, quality, elapsedMs: elapsed, canStart, warning }));
      }, 500);
    })();

    return () => { cancelled = true; void stop(); };
  }, [active, stop]);

  return { ...state, stop };
}
