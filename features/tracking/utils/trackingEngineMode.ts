// QA-Golden-Reference-Schalter ENGINE=BUILD40/CURRENT (zweite, von der
// Location-Source unabhängige Achse — siehe locationSourceMode.ts).
//
// BUILD40 reproduziert die Verarbeitungslogik des letzten nachweislich
// funktionierenden Stands (Commit 82bd17c):
//   - Corner-Detection: legacyCornerDetection.ts (wörtlich aus 82bd17c), statt
//     autoCornerDetection.ts + cornerConfirmation.ts.
//   - Suchstart: kein SearchStartAcquisition-Fenster/Konsekutiv-Gate — der
//     erste akzeptierte Fix ist sofort der Referenzpunkt (wie im historischen
//     useSearchRecorder.onFix ohne dieses erst später hinzugefügte Modul).
//   - Core-Motion-Fusion blockiert NIE Position/Distanz/Linie/GPS-Fixes
//     (fusionBlocksGeometry wird ignoriert) — Motion darf weiterhin Daten/
//     Confidence liefern (Punkt 5 des Audits: "nur beobachten").
//
// CURRENT ist die heutige Pipeline (Default), unverändert.
//
// Kombinierbar mit locationSourceMode.ts (EXPO/PRECISION) zu vier QA-Kombis:
// BUILD40+EXPO (echte Golden Reference), CURRENT+EXPO, CURRENT+PRECISION,
// BUILD40+PRECISION (Motion/Precision mit alter Geometrie — Zusatzfall).
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TrackingEngineMode = 'build40' | 'current';

const STORAGE_KEY = 'anyvo.qa.trackingEngineMode';
const DEFAULT_MODE: TrackingEngineMode = 'current';

let currentMode: TrackingEngineMode = DEFAULT_MODE;
let loaded = false;
const listeners = new Set<(mode: TrackingEngineMode) => void>();

function isValidMode(v: unknown): v is TrackingEngineMode {
  return v === 'build40' || v === 'current';
}

export function getTrackingEngineMode(): TrackingEngineMode {
  return currentMode;
}

export function setTrackingEngineMode(mode: TrackingEngineMode): void {
  currentMode = mode;
  listeners.forEach(fn => fn(mode));
  AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
}

export function subscribeTrackingEngineMode(fn: (mode: TrackingEngineMode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function loadPersistedTrackingEngineMode(): Promise<TrackingEngineMode> {
  if (loaded) return currentMode;
  loaded = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (isValidMode(stored)) {
      currentMode = stored;
      listeners.forEach(fn => fn(currentMode));
    }
  } catch { /* Default bleibt aktiv */ }
  return currentMode;
}
