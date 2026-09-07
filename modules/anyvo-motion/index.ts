// anyvo-motion — öffentliche API (Phase 1: iOS Core Motion).
//
// Zusatzsignal zur GPS-Fährtenaufzeichnung (Plausibilisierung, Outlier-
// Erkennung, Stillstand, Start-Acquisition) — ersetzt Core Location NICHT.
//
// Fällt automatisch auf `null`/gps_only zurück, wenn das native Modul (noch)
// nicht im Build steckt (Android, Expo Go, älterer Build) ODER wenn Motion
// Permission denied/restricted/unavailable ist — die Fährte funktioniert in
// jedem Fall vollständig ohne Motion, dasselbe Muster wie
// anyvo-precision-location.

import type { EventSubscription } from 'expo-modules-core';
import Native from './src/AnyvoMotionModule';
import type { MotionSample, MotionStatus, MotionError, MotionUpdateOptions } from './src/AnyvoMotion.types';

export type { MotionSample, MotionStatus, MotionError, MotionUpdateOptions, MovementState, ActivityConfidenceLevel } from './src/AnyvoMotion.types';

type Listener<T> = (event: T) => void;
const NOOP_SUB: EventSubscription = { remove: () => {} };

// Ist das native Modul im aktuellen Build vorhanden?
export function isMotionModuleAvailable(): boolean {
  return Native != null;
}

// Liefert `false` auch, wenn kein natives Modul im Build steckt (kein Fallback
// über eine JS-Sensor-API — Motion ist bewusst iOS/Core-Motion-exklusiv,
// Punkt 1 des Auftrags: "implementiere für iOS").
export function isMotionAvailable(): boolean {
  if (!Native) return false;
  try { return Native.isAvailable(); } catch { return false; }
}

export async function getMotionStatus(): Promise<MotionStatus> {
  if (!Native) {
    return {
      deviceMotionAvailable: false, stepCountingAvailable: false,
      activityAvailable: false, pedometerAuthorized: false, running: false,
    };
  }
  return Native.getStatus();
}

export async function startMotionUpdates(options: MotionUpdateOptions = {}): Promise<boolean> {
  if (!Native) return false;
  try {
    await Native.startMotionUpdates(options);
    return true;
  } catch {
    // Native Start-Fehler (z. B. Permission-Dialog abgelehnt) → gps_only,
    // niemals eine blockierende Fehlermeldung für die Fährte selbst.
    return false;
  }
}

export async function stopMotionUpdates(): Promise<void> {
  if (!Native) return;
  try { await Native.stopMotionUpdates(); } catch { /* best-effort */ }
}

export function addMotionSampleListener(listener: Listener<MotionSample>): EventSubscription {
  if (Native) return Native.addListener('onMotionSample', listener);
  return NOOP_SUB;
}

export function addMotionErrorListener(listener: Listener<MotionError>): EventSubscription {
  if (Native) return Native.addListener('onMotionError', listener);
  return NOOP_SUB;
}
