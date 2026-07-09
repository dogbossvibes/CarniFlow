// Objekt-Platzierung: Gegenstände werden NICHT auf den letzten (springenden)
// Rohfix gesetzt, sondern auf den robusten Median der letzten guten Punkte.
// Plus Drift-Schutz-Fenster direkt nach dem Setzen. Reine Funktionen.
import { classifyQuality, PRECISION } from '@/features/tracking/engine/gpsQuality';
import type { LatLng } from '@/lib/trackGuidance';
import type { PlacedObject, TrackPointQuality } from '@/features/tracking/engine/types';

export interface GoodPoint { lat: number; lng: number; accuracy: number | null; t: number }

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Robuster Medianpunkt (Ausreisser-fest).
export function medianPoint(points: LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  return { lat: median(points.map(p => p.lat)), lng: median(points.map(p => p.lng)) };
}

export function stabilizedObjectPosition(
  recentGood: GoodPoint[], now: number, trackPositionIndex: number,
  windowMs = PRECISION.OBJECT_WINDOW_MS, minPoints = PRECISION.OBJECT_MIN_POINTS,
): PlacedObject | null {
  let win = recentGood.filter(p => now - p.t <= windowMs);
  if (win.length < minPoints) win = recentGood.slice(-minPoints);
  if (win.length === 0) return null;

  const mp = medianPoint(win);
  if (!mp) return null;

  const accs = win.map(p => p.accuracy).filter((a): a is number => a != null);
  const accuracy = accs.length ? median(accs) : null;

  return {
    lat: mp.lat, lng: mp.lng, accuracy,
    timestamp: now, trackPositionIndex,
    gpsQuality: classifyQuality(accuracy),
  };
}

// Zeitpunkt, bis zu dem nach dem Setzen Linienpunkte unterdrückt werden.
export function driftGuardUntil(now: number, ms = PRECISION.OBJECT_DRIFT_GUARD_MS): number {
  return now + ms;
}

export function isWithinDriftGuard(now: number, guardUntil: number | null): boolean {
  return guardUntil != null && now < guardUntil;
}

// --- Gegenstand setzen (High-Level) ---

// Median-Fenster: die letzten 5–10 guten Punkte; ab 3 wird stabilisiert.
const OBJECT_GOOD_WINDOW_MAX = 10;
const OBJECT_MIN_GOOD        = 3;

export type ObjectPlacementSource = 'median_stabilized' | 'last_good_point';

// Punkt, wie er in den Verlauf einfliesst: Position/Qualität + optionale Marker.
export interface ObjectGoodPoint {
  lat:       number;
  lng:       number;
  accuracy:  number | null;
  t:         number;
  status?:   string | null;   // z. B. 'drift'
  rejected?: boolean;
}

export interface PlacedTrackingObject {
  id:              string;
  type:            string;
  label:           string;
  latitude:        number;
  longitude:       number;
  timestamp:       number;
  accuracy:        number | null;
  quality:         TrackPointQuality;
  source:          ObjectPlacementSource;
  trackPointIndex: number;
}

export interface PlaceTrackingObjectInput {
  type:                string;
  label:               string;
  recentGoodPoints:    ReadonlyArray<ObjectGoodPoint>;
  filteredTrackPoints: ReadonlyArray<unknown>;   // nur für den Index gebraucht
  now?:                number;                    // testbar; sonst Date.now()
  id?:                 string;                    // testbar; sonst generiert
}

export interface PlaceTrackingObjectResult {
  object:          PlacedTrackingObject;
  driftGuardUntil: number;                        // bis hierhin Zickzack unterdrücken
}

function generateObjectId(): string {
  return `obj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Setzt einen Gegenstand robust (Median statt letztem Rohfix) und gibt das
// 3-Sekunden-Drift-Fenster zurück. Null, wenn kein einziger guter Punkt vorliegt.
export function placeTrackingObject(input: PlaceTrackingObjectInput): PlaceTrackingObjectResult | null {
  const { type, label, recentGoodPoints, filteredTrackPoints } = input;
  const now = input.now ?? Date.now();

  // Nur saubere Punkte: ≤ 15 m, nicht rejected, nicht drift.
  const good = recentGoodPoints.filter(p =>
    p.accuracy != null && p.accuracy <= PRECISION.READY_ACCURACY_M &&
    !p.rejected && p.status !== 'drift',
  );
  if (good.length === 0) return null;

  const window = good.slice(-OBJECT_GOOD_WINDOW_MAX);

  let latitude: number;
  let longitude: number;
  let accuracy: number | null;
  let source: ObjectPlacementSource;

  if (window.length < OBJECT_MIN_GOOD) {
    // Zu wenige gute Punkte → letzten guten Punkt nehmen (nie den Rohfix).
    const lastGood = window[window.length - 1];
    latitude = lastGood.lat; longitude = lastGood.lng; accuracy = lastGood.accuracy;
    source = 'last_good_point';
  } else {
    // Robuster Median der letzten guten Punkte.
    const mp = medianPoint(window)!;
    const accs = window.map(p => p.accuracy).filter((a): a is number => a != null);
    latitude = mp.lat; longitude = mp.lng;
    accuracy = accs.length ? median(accs) : null;
    source = 'median_stabilized';
  }

  const object: PlacedTrackingObject = {
    id: input.id ?? generateObjectId(),
    type, label,
    latitude, longitude,
    timestamp: now,
    accuracy,
    quality: classifyQuality(accuracy),
    source,
    trackPointIndex: filteredTrackPoints.length,
  };

  return { object, driftGuardUntil: driftGuardUntil(now) };
}
