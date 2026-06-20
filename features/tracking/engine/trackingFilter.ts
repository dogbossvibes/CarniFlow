// Track-Filter: entscheidet je Roh-Fix, ob er ein Linienpunkt wird, klassifiziert
// Bewegung/Drift/Stillstand und glättet behutsam (ohne echte Fährtenwinkel zu
// verrunden). `evaluateTrackPoint` ist rein/testbar; `TrackingFilter` hält die
// drei Sammlungen (raw / filtered / rejected) über eine Aufnahme hinweg.
import { distanceM, type LatLng } from '@/lib/trackGuidance';
import { PRECISION, classifyQuality } from '@/features/tracking/engine/gpsQuality';
import { isStationary, type StationarySample } from '@/features/tracking/engine/stationaryDetection';
import { isDrift } from '@/features/tracking/engine/driftDetection';
import { isSharpTurn } from '@/features/tracking/engine/turnDetection';
import type { RawFix, MotionState, TrackPointStatus, TrackPointQuality } from '@/features/tracking/engine/types';

export type { StationarySample };

// Stabile Reject-Codes (für Debug-Panel/Analytics gedacht).
export type RejectedReason =
  | 'ACCURACY_TOO_LOW'            // accuracy null oder > 25 m
  | 'SPEED_TOO_HIGH_FOR_TRACKING' // schneller als plausibel fürs Legen
  | 'GPS_JUMP'                    // > 8 m in < 1,5 s
  | 'DRIFT_DETECTED'             // Sensorik/GPS meldet Stillstand, Position springt
  | 'MOCK_LOCATION'             // gefälschter Standort
  | 'STATIONARY'               // Stillstand → kein neuer Linienpunkt
  | 'MIN_STEP'                // Schritt zu klein → kein neuer Linienpunkt
  | 'DRIFT_GUARD';           // Drift-Schutzfenster nach Objektsetzung aktiv

// GPS-Sprung-Schwellen.
const JUMP_DIST_M = 8;
const JUMP_DT_S   = 1.5;

// Status-Grenze: 1,5–3 m = langsam, > 3 m = normale Bewegung.
const SLOW_MAX_STEP_M = 3;

// Glättungs-Gewicht des Vorgängers (smoothed = prev*w + cur*(1-w)).
const SLOW_PREV_WEIGHT   = 0.7;  // langsam → kräftiger glätten
const MOVING_PREV_WEIGHT = 0.15; // Bewegung → nur sehr leicht

export interface FilterInput {
  last:         RawFix | null;
  candidate:    RawFix & { mocked?: boolean };
  sensorMotion: MotionState;
  recentRaw:    StationarySample[];
}

export interface FilterResult {
  accept:          boolean;
  status:          TrackPointStatus;
  quality:         TrackPointQuality;
  speedMps:        number | null;
  distanceM:       number;
  rejectedReason?: RejectedReason;
}

// Reine Bewertung eines einzelnen Fixes gegen den letzten akzeptierten Punkt.
export function evaluateTrackPoint(input: FilterInput): FilterResult {
  const { last, candidate: c, sensorMotion, recentRaw } = input;
  const acc = c.accuracy;
  const quality = classifyQuality(acc);

  const dist  = last ? distanceM(last, c) : 0;
  const dtSec = last ? (c.t - last.t) / 1000 : 0;
  const speed = last && dtSec > 0 ? dist / dtSec : (c.speed ?? null);
  const gpsStationary = isStationary(recentRaw, c.t);
  const stationary = gpsStationary || sensorMotion === 'stationary';

  // Bewegungsstatus aus der Schrittweite (für akzeptierte + manche Reject-Fälle).
  const moveStatus: TrackPointStatus =
    stationary ? 'stationary' : !last || dist > SLOW_MAX_STEP_M ? 'moving' : 'slow_moving';

  const base = { quality, speedMps: speed, distanceM: dist } as const;
  const reject = (status: TrackPointStatus, rejectedReason: RejectedReason): FilterResult =>
    ({ accept: false, status, rejectedReason, ...base });

  // --- Harte Reject-Regeln (Quelle → Genauigkeit → Drift → Sprung → Tempo) ---
  if (c.mocked) return reject('drift', 'MOCK_LOCATION');
  if (acc == null || acc > PRECISION.HARD_MAX_ACCURACY_M) return reject(moveStatus, 'ACCURACY_TOO_LOW');
  if (isDrift({ hasLast: !!last, dist, speed, sensorMotion, gpsStationary })) return reject('drift', 'DRIFT_DETECTED');
  if (last && dtSec > 0 && dtSec < JUMP_DT_S && dist > JUMP_DIST_M) return reject('drift', 'GPS_JUMP');
  if (last && speed != null && speed > PRECISION.MAX_SPEED_MPS) return reject('drift', 'SPEED_TOO_HIGH_FOR_TRACKING');

  // --- Kein neuer Linienpunkt (Stillstand / zu kleiner Schritt) ---
  if (stationary) return reject('stationary', 'STATIONARY');
  if (last && dist < PRECISION.MIN_STEP_M) return reject('slow_moving', 'MIN_STEP');

  return { accept: true, status: moveStatus, ...base };
}

// --- Stateful: hält raw / filtered / rejected über eine Aufnahme ---

export interface FilteredPoint extends RawFix {
  status:  TrackPointStatus;
  quality: TrackPointQuality;
}

export interface RejectedPoint extends RawFix {
  reason: RejectedReason;
}

const RAW_WINDOW_MS = 10_000; // Fenster für Stillstand-/Drift-Erkennung

export class TrackingFilter {
  readonly rawTrackPoints:      RawFix[]        = [];
  readonly filteredTrackPoints: FilteredPoint[] = [];
  readonly rejectedPoints:      RejectedPoint[] = [];

  private last: RawFix | null = null;
  private recentRaw: StationarySample[] = [];
  private sensorMotion: MotionState = 'unknown';

  reset(): void {
    this.rawTrackPoints.length = 0;
    this.filteredTrackPoints.length = 0;
    this.rejectedPoints.length = 0;
    this.last = null;
    this.recentRaw = [];
    this.sensorMotion = 'unknown';
  }

  setSensorMotion(m: MotionState): void { this.sensorMotion = m; }

  // Vom Aufrufer (Session) vorgegebene Höher-Ebenen-Entscheidungen.
  // - forceRejectReason: z. B. GNSS/Heading-Drift, das der reine Filter nicht sieht.
  // - suppressLinePoint: Drift-Schutzfenster nach Objektsetzung → kein Linienpunkt.
  add(
    fix: RawFix & { mocked?: boolean },
    opts?: { forceRejectReason?: RejectedReason; suppressLinePoint?: boolean },
  ): FilterResult {
    this.rawTrackPoints.push(fix);

    this.recentRaw.push({ lat: fix.lat, lng: fix.lng, t: fix.t });
    while (this.recentRaw.length > 0 && fix.t - this.recentRaw[0].t > RAW_WINDOW_MS) this.recentRaw.shift();

    // Erzwungener Reject (übersteuert die Filterregeln).
    if (opts?.forceRejectReason) {
      this.rejectedPoints.push({ ...fix, reason: opts.forceRejectReason });
      return { accept: false, status: 'drift', quality: classifyQuality(fix.accuracy), speedMps: null, distanceM: 0, rejectedReason: opts.forceRejectReason };
    }

    const res = evaluateTrackPoint({
      last: this.last, candidate: fix, sensorMotion: this.sensorMotion, recentRaw: this.recentRaw,
    });

    if (!res.accept) {
      this.rejectedPoints.push({ ...fix, reason: res.rejectedReason ?? 'STATIONARY' });
      return res;
    }

    // Drift-Schutz: akzeptierter Punkt, aber während des Fensters kein Linienpunkt.
    if (opts?.suppressLinePoint) {
      this.rejectedPoints.push({ ...fix, reason: 'DRIFT_GUARD' });
      return { ...res, accept: false, rejectedReason: 'DRIFT_GUARD' };
    }

    const smoothed = this.smooth(fix, res.status);
    this.filteredTrackPoints.push({ ...fix, ...smoothed, status: res.status, quality: res.quality });
    this.last = fix; // Distanz/Geschwindigkeit gegen die rohe Position rechnen (kein Aufschaukeln)
    return res;
  }

  // Winkel-erhaltende Glättung: scharfe Ecken bleiben unangetastet.
  private smooth(cur: RawFix, status: TrackPointStatus): LatLng {
    const n = this.filteredTrackPoints.length;
    if (n === 0) return { lat: cur.lat, lng: cur.lng };

    const prev = this.filteredTrackPoints[n - 1];
    // Echter Fährtenwinkel? → nicht glätten, sonst „verrundet" die Information.
    if (n >= 2 && isSharpTurn(this.filteredTrackPoints[n - 2], prev, cur)) {
      return { lat: cur.lat, lng: cur.lng };
    }

    const w =
      status === 'slow_moving' ? SLOW_PREV_WEIGHT :
      status === 'moving'      ? MOVING_PREV_WEIGHT :
      0; // stationary o. ä. → roh übernehmen
    if (w === 0) return { lat: cur.lat, lng: cur.lng };

    return {
      lat: prev.lat * w + cur.lat * (1 - w),
      lng: prev.lng * w + cur.lng * (1 - w),
    };
  }
}
