import { useSyncExternalStore } from 'react';
import * as Location from 'expo-location';
import type { TrackPoint } from '@/types/tracking';

// Zentrale GPS-Aufzeichnung für die Fährte. Läuft im Hintergrund über
// expo-task-manager (Background-Location), sonst als Vordergrund-Watch.
// expo-task-manager ist nativ → defensiv laden, damit ein Dev-Client ohne das
// Modul nicht crasht (dann automatisch Vordergrund-Fallback).
let TaskManager: typeof import('expo-task-manager') | null = null;
try { TaskManager = require('expo-task-manager'); } catch { TaskManager = null; }
export const BACKGROUND_AVAILABLE = TaskManager != null;

const TASK = 'anyvo-track-location';

interface RecState { points: TrackPoint[]; accuracy: number | null; }

let state: RecState = { points: [], accuracy: null };
const listeners = new Set<() => void>();
let watchSub: Location.LocationSubscription | null = null;
let externalMode = false;   // true = Punkte kommen von externem BLE-GPS

// Externes GPS aktiv? Dann überspringt startRecording das Telefon-GPS.
export function setExternalMode(on: boolean) { externalMode = on; }
export function isExternalMode() { return externalMode; }

// Einzelnen Punkt von extern (BLE-GPS / NMEA) einspeisen.
export function pushPoint(lat: number, lng: number, accuracy: number | null = null) {
  const pts = state.points.slice();
  pts.push({
    lat, lng,
    accuracy_m: accuracy,
    altitude_m: null,
    timestamp:  new Date().toISOString(),
    seq:        pts.length,
  });
  state = { points: pts, accuracy: accuracy != null ? Math.round(accuracy) : state.accuracy };
  emit();
}

function emit() { for (const l of listeners) l(); }

// Neue Punkte anhängen (neue Array-Referenz → Re-Render & memo-sicher).
function appendLocations(locs: Location.LocationObject[]) {
  if (!locs.length) return;
  const pts = state.points.slice();
  let acc = state.accuracy;
  for (const loc of locs) {
    pts.push({
      lat:        loc.coords.latitude,
      lng:        loc.coords.longitude,
      accuracy_m: loc.coords.accuracy,
      altitude_m: loc.coords.altitude,
      timestamp:  new Date(loc.timestamp).toISOString(),
      seq:        pts.length,
    });
    if (loc.coords.accuracy != null) acc = Math.round(loc.coords.accuracy);
  }
  state = { points: pts, accuracy: acc };
  emit();
}

// Hintergrund-Task registrieren (nur wenn das native Modul vorhanden ist).
if (TaskManager) {
  // Signatur über das (defensiv geladene) Modul ableiten, statt sie zu importieren.
  const define = TaskManager.defineTask as (task: string, executor: (body: any) => void) => void;
  define(TASK, ({ data, error }) => {
    if (error) return;
    const locs = (data as { locations?: Location.LocationObject[] } | null)?.locations;
    if (locs?.length) appendLocations(locs);
  });
}

const UPDATE_OPTS = {
  accuracy:         Location.Accuracy.BestForNavigation,
  timeInterval:     2000,
  distanceInterval: 1,
} as const;

export interface StartResult { ok: boolean; background: boolean; }

export async function startRecording(): Promise<StartResult> {
  // Externes GPS liefert die Punkte selbst (über pushPoint) — kein Telefon-GPS.
  if (externalMode) return { ok: true, background: false };

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, background: false };

  // Bevorzugt: echte Hintergrund-Aufzeichnung.
  if (BACKGROUND_AVAILABLE) {
    let bgGranted = false;
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      bgGranted = bg.status === 'granted';
    } catch { bgGranted = false; }

    if (bgGranted) {
      try {
        const running = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
        if (running) await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
        await Location.startLocationUpdatesAsync(TASK, {
          ...UPDATE_OPTS,
          showsBackgroundLocationIndicator: true,
          pausesUpdatesAutomatically:       false,
          activityType:                     Location.ActivityType.Fitness,
          foregroundService: {
            notificationTitle: 'ANYVO – Fährte wird aufgezeichnet',
            notificationBody:  'GPS-Aufzeichnung läuft.',
          },
        });
        return { ok: true, background: true };
      } catch {
        // Fällt unten auf Vordergrund zurück.
      }
    }
  }

  // Fallback: Vordergrund-Watch (Display an).
  watchSub = await Location.watchPositionAsync(UPDATE_OPTS, loc => appendLocations([loc]));
  return { ok: true, background: false };
}

export async function stopRecording() {
  watchSub?.remove();
  watchSub = null;
  if (BACKGROUND_AVAILABLE) {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(TASK)) {
        await Location.stopLocationUpdatesAsync(TASK);
      }
    } catch { /* egal */ }
  }
}

export function resetRecorder() {
  state = { points: [], accuracy: null };
  emit();
}

export function getRecordedPoints(): TrackPoint[] {
  return state.points;
}

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
function getSnapshot() { return state; }

// Für den neuen Fährten-Flow: auf eingehende (auch externe BLE-) Punkte hören.
export const subscribeRecorder = subscribe;

export function useRecorder(): RecState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
