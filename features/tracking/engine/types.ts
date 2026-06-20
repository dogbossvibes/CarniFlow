// Domänen-Typen der Tracking-Engine (framework-agnostisch).
//
// Feld-Mapping: der Bestandscode nutzt lat/lng/t (ms) — wir behalten das bei.
//   latitude ↔ lat · longitude ↔ lng · timestamp ↔ t

export type TrackPointSource = 'gps' | 'fused' | 'manual';
export type TrackPointQuality = 'excellent' | 'good' | 'poor' | 'bad';

// Bewegungs-/Punktstatus.
export type TrackPointStatus = 'moving' | 'slow_moving' | 'stationary' | 'drift' | 'sharp_turn';

// Reine Bewegungs-Einstufung (ohne drift/sharp_turn).
export type MotionState = 'moving' | 'slow_moving' | 'stationary' | 'unknown';

// Roh-Fix direkt aus der Quelle (vor jeder Filterung).
export interface RawFix {
  lat:       number;
  lng:       number;
  t:         number;          // ms
  accuracy:  number | null;   // Meter
  altitude?: number | null;
  speed?:    number | null;   // m/s
  heading?:  number | null;   // °
}

// Stabilisierte Gegenstand-Position (Median der letzten guten Punkte).
export interface PlacedObject {
  lat:                number;
  lng:                number;
  accuracy:           number | null;
  timestamp:          number;
  trackPositionIndex: number;
  gpsQuality:         TrackPointQuality;
}

// Live-Qualitäts-/Statistik-Kennzahlen für die UI.
export interface GpsStats {
  rawCount:      number;
  filteredCount: number;
  rejectedCount: number;
  rejectionRate: number;       // 0..1
  lastAccuracy:  number | null;
  bestAccuracy:  number | null;
}

export const EMPTY_GPS_STATS: GpsStats = {
  rawCount: 0, filteredCount: 0, rejectedCount: 0, rejectionRate: 0,
  lastAccuracy: null, bestAccuracy: null,
};
