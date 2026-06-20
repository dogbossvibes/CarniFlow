// Tracking-Session-Engine: kapselt die komplette Aufnahme-Pipeline pro Fix
// (Roh → Filter → Fusion → Clean) framework-agnostisch. Die UI/der Hook füttert
// rohe Samples ein und schreibt das Ergebnis in Store/DB.
import { evaluateTrackPoint, TrackingFilter } from '@/features/tracking/engine/trackingFilter';
import { TrackingStats } from '@/features/tracking/engine/trackingStats';
import {
  stabilizedObjectPosition, driftGuardUntil, isWithinDriftGuard, placeTrackingObject,
  type GoodPoint, type PlacedTrackingObject,
} from '@/features/tracking/engine/objectPlacement';
import {
  updateStationaryState, INITIAL_STATIONARY_STATE, type StationarySample, type StationaryState,
} from '@/features/tracking/engine/stationaryDetection';
import { detectDrift } from '@/features/tracking/engine/driftDetection';
import { detectSharpTurn } from '@/features/tracking/engine/turnDetection';
import { getGpsQuality, type GpsQuality } from '@/features/tracking/engine/gpsQuality';
import type { RawFix, GpsStats, TrackPointStatus, PlacedObject, MotionState } from '@/features/tracking/engine/types';
import { precisionLocationClient } from '@/features/tracking/native/precisionLocationClient';
import type {
  PrecisionLocation, HeadingPoint, GnssStatusAndroid, TrackingError, ProviderStatus,
  PrecisionTrackingOptions,
} from '@/features/tracking/native/types';

// Vereinfachter, accuracy-gewichteter 1D-Kalman je Achse (lat/lng getrennt).
// Gute Fixes (kleine accuracy → kleines R → großes K) werden stark übernommen,
// schlechte kaum. Für Fährten-Distanzen ausreichend ruhig.
// TODO(native): vollwertiges 2D-Kalman mit Geschwindigkeit.
class GpsKalman {
  private lat: { x: number; P: number } | null = null;
  private lng: { x: number; P: number } | null = null;
  constructor(private processNoise = 1.5) {}

  update(lat: number, lng: number, accuracy: number | null): { lat: number; lng: number } {
    const R = Math.pow(Math.max(accuracy ?? 30, 1), 2);
    this.lat = this.step(this.lat, lat, R);
    this.lng = this.step(this.lng, lng, R);
    return { lat: this.lat.x, lng: this.lng.x };
  }
  private step(a: { x: number; P: number } | null, meas: number, R: number) {
    if (!a) return { x: meas, P: R };
    const P = a.P + this.processNoise;
    const K = P / (P + R);
    return { x: a.x + K * (meas - a.x), P: (1 - K) * P };
  }
}

export { GpsKalman };

// Eingehende Probe (von positionStream).
export interface IngestSample {
  lat: number; lng: number;
  accuracy?: number | null; altitude?: number | null;
  speed?: number | null; course?: number | null; t?: number;
}

// Ein angereicherter Punkt (strukturell kompatibel zu TrackPointSample).
export interface EnginePoint {
  lat: number; lng: number;
  accuracy: number | null; altitude: number | null;
  speed: number | null; heading: number | null; t: number;
}

export interface IngestResult {
  raw:    EnginePoint;          // immer (Raw Track)
  clean:  EnginePoint | null;   // nur wenn akzeptiert (Clean Track)
  stats:  GpsStats;
  status: TrackPointStatus;
}

const RAW_WINDOW_MS = 10_000;   // Stillstand/Drift-Fenster
const GOOD_WINDOW_MS = 12_000;  // gute Punkte für Objekt-Median

export class TrackingSessionEngine {
  private kalman = new GpsKalman();
  private last: RawFix | null = null;
  private recentRaw: StationarySample[] = [];
  private good: GoodPoint[] = [];
  private driftGuard: number | null = null;
  private stats = new TrackingStats();
  private sensorMotion: MotionState = 'unknown';

  reset(): void {
    this.kalman = new GpsKalman();
    this.last = null;
    this.recentRaw = [];
    this.good = [];
    this.driftGuard = null;
    this.stats.reset();
  }

  // Optional: echte Sensorik (Accelerometer) einspeisen (sonst GPS-Inferenz).
  setSensorMotion(m: MotionState): void { this.sensorMotion = m; }

  ingest(sample: IngestSample): IngestResult {
    const now = sample.t ?? Date.now();
    const rawFix: RawFix = {
      lat: sample.lat, lng: sample.lng, t: now,
      accuracy: sample.accuracy ?? null, altitude: sample.altitude ?? null,
      speed: sample.speed ?? null, heading: sample.course ?? null,
    };
    const raw: EnginePoint = {
      lat: rawFix.lat, lng: rawFix.lng, accuracy: rawFix.accuracy,
      altitude: rawFix.altitude ?? null, speed: rawFix.speed ?? null, heading: rawFix.heading ?? null, t: now,
    };

    // Stillstand/Drift-Fenster pflegen.
    this.recentRaw.push({ lat: rawFix.lat, lng: rawFix.lng, t: now });
    while (this.recentRaw.length > 0 && now - this.recentRaw[0].t > RAW_WINDOW_MS) this.recentRaw.shift();

    const res = evaluateTrackPoint({
      last: this.last, candidate: rawFix, sensorMotion: this.sensorMotion, recentRaw: this.recentRaw,
    });
    this.stats.record(res.accept, rawFix.accuracy);
    const stats = this.stats.snapshot(rawFix.accuracy);

    let clean: EnginePoint | null = null;
    // Während Drift-Schutz (nach Marker) keine neuen Linienpunkte.
    if (res.accept && !isWithinDriftGuard(now, this.driftGuard)) {
      this.last = rawFix;
      this.good.push({ lat: rawFix.lat, lng: rawFix.lng, accuracy: rawFix.accuracy, t: now });
      while (this.good.length > 0 && now - this.good[0].t > GOOD_WINDOW_MS) this.good.shift();

      const fused = this.kalman.update(rawFix.lat, rawFix.lng, rawFix.accuracy);
      clean = {
        lat: fused.lat, lng: fused.lng, accuracy: rawFix.accuracy,
        altitude: rawFix.altitude ?? null, speed: rawFix.speed ?? null, heading: rawFix.heading ?? null, t: now,
      };
    }

    return { raw, clean, stats, status: res.status };
  }

  // Stabilisierte Marker-/Gegenstand-Position + Drift-Schutz aktivieren.
  beginObjectPlacement(now: number, trackPositionIndex: number): PlacedObject | null {
    const placed = stabilizedObjectPosition(this.good, now, trackPositionIndex);
    this.driftGuard = driftGuardUntil(now);
    return placed;
  }
}

// =====================================================================
// High-Level-Orchestrator: kapselt den kompletten Lebenszyklus einer
// Aufnahme (Warmup → Recording → Pause/Resume → Stop), abonniert die nativen
// Events und entfernt sie sauber wieder. Hält raw/filtered/rejected (über
// TrackingFilter), Status, GPS-Qualität, Debug-Stats und gesetzte Objekte.
// =====================================================================

export type SessionPhase = 'idle' | 'warmup' | 'recording' | 'paused' | 'stopped';

// Minimal-Abo (entkoppelt von expo-modules-core, testbar).
interface Unsubscribe { remove: () => void }

// Vom Orchestrator genutzter Ausschnitt des Native-Clients (injizierbar).
export interface SessionNativeClient {
  start(options?: PrecisionTrackingOptions): Promise<void>;
  stop(): Promise<void>;
  onLocation(l: (p: PrecisionLocation) => void): Unsubscribe;
  onHeading(l: (h: HeadingPoint) => void): Unsubscribe;
  onGnssStatus(l: (g: GnssStatusAndroid) => void): Unsubscribe;
  onProviderStatus(l: (s: ProviderStatus) => void): Unsubscribe;
  onError(l: (e: TrackingError) => void): Unsubscribe;
}

export interface SessionStats {
  phase:              SessionPhase;
  sessionId:          string | null;
  rawCount:           number;
  filteredCount:      number;
  rejectedCount:      number;
  rejectionRate:      number;
  rejectionsByReason: Record<string, number>;
  gpsQuality:         GpsQuality | null;
  gpsAccuracy:        number | null;
  bestAccuracy:       number | null;
  currentStatus:      TrackPointStatus | null;
  objectCount:        number;
  driftGuardActive:   boolean;
}

export interface TrackingSessionConfig {
  client?:          SessionNativeClient;
  trackingOptions?: PrecisionTrackingOptions;
  onUpdate?:        (stats: SessionStats) => void;
}

const DEFAULT_TRACKING_OPTIONS: PrecisionTrackingOptions = {
  intervalMs: 1000, enableRawGnssAndroid: true, enableHeading: true,
};

export class TrackingSession {
  private readonly filter = new TrackingFilter();
  private readonly stats  = new TrackingStats();

  private phase: SessionPhase = 'idle';
  private sessionId: string | null = null;

  private stationaryState: StationaryState = INITIAL_STATIONARY_STATE;
  private lastAccepted: RawFix | null = null;
  private lastHeading: HeadingPoint | null = null;
  private lastGnss: GnssStatusAndroid | null = null;
  private driftGuard: number | null = null;
  private objects: PlacedTrackingObject[] = [];

  private gpsQuality: GpsQuality | null = null;
  private gpsAccuracy: number | null = null;
  private currentStatus: TrackPointStatus | null = null;

  private subs: Unsubscribe[] = [];
  private nativeRunning = false;

  private readonly client: SessionNativeClient;
  private readonly trackingOptions: PrecisionTrackingOptions;
  private readonly onUpdate?: (stats: SessionStats) => void;

  constructor(config: TrackingSessionConfig = {}) {
    this.client = config.client ?? (precisionLocationClient as unknown as SessionNativeClient);
    this.trackingOptions = config.trackingOptions ?? DEFAULT_TRACKING_OPTIONS;
    this.onUpdate = config.onUpdate;
  }

  // Öffentliche, lesende Sichten (für UI/DB-Persistenz/Tests).
  get rawTrackPoints()      { return this.filter.rawTrackPoints; }
  get filteredTrackPoints() { return this.filter.filteredTrackPoints; }
  get rejectedPoints()      { return this.filter.rejectedPoints; }
  get trackingObjects()     { return this.objects; }

  // --- Lebenszyklus ---

  // Setzt alles auf Anfang. Entfernt sicherheitshalber alte Listener.
  initializeSession(sessionId: string | null = null): void {
    this.unsubscribe();
    this.filter.reset();
    this.stats.reset();
    this.stationaryState = INITIAL_STATIONARY_STATE;
    this.lastAccepted = null;
    this.lastHeading = null;
    this.lastGnss = null;
    this.driftGuard = null;
    this.objects = [];
    this.gpsQuality = null;
    this.gpsAccuracy = null;
    this.currentStatus = null;
    this.sessionId = sessionId;
    this.phase = 'idle';
    this.emit();
  }

  // Warmup: Native + Listener starten, nur GPS-Qualität sammeln (keine Linie).
  async startWarmup(): Promise<void> {
    this.subscribe();           // idempotent (entfernt erst alte)
    this.phase = 'warmup';
    await this.safeStart();
    this.emit();
  }

  // Recording: frische Linie, Listener sicherstellen, Native läuft.
  async startRecording(): Promise<void> {
    if (this.subs.length === 0) this.subscribe();
    this.filter.reset();
    this.stats.reset();
    this.lastAccepted = null;
    this.stationaryState = INITIAL_STATIONARY_STATE;
    this.driftGuard = null;
    this.phase = 'recording';
    await this.safeStart();
    this.emit();
  }

  pauseRecording(): void {
    if (this.phase === 'recording') { this.phase = 'paused'; this.emit(); }
  }

  resumeRecording(): void {
    if (this.phase !== 'paused') return;
    // Sauberer Neustart der Linienlogik (sonst riesiger „Sprung" nach Pause).
    this.lastAccepted = null;
    this.stationaryState = INITIAL_STATIONARY_STATE;
    this.phase = 'recording';
    this.emit();
  }

  // Stop: Listener entfernen, Native stoppen, Phase 'stopped'. Idempotent.
  async stopRecording(): Promise<SessionStats> {
    this.unsubscribe();
    await this.safeStop();
    this.phase = 'stopped';
    this.emit();
    return this.getSessionStats();
  }

  // --- Native-Event-Handler (defensiv: dürfen nie crashen) ---

  handleIncomingLocationPoint(point: PrecisionLocation | null | undefined): void {
    try {
      if (!point || typeof point.latitude !== 'number' || typeof point.longitude !== 'number') return;

      const fix = toRawFix(point);
      this.gpsAccuracy = fix.accuracy;
      this.gpsQuality = getGpsQuality(fix.accuracy);

      // Außerhalb der Aufnahme nur Qualität aktualisieren (Warmup/Pause).
      if (this.phase !== 'recording') { this.emit(); return; }

      this.stationaryState = updateStationaryState(this.stationaryState, { lat: fix.lat, lng: fix.lng, t: fix.t });

      // Drift mit Heading/GNSS-Wissen (über den reinen Filter hinaus).
      const drift = detectDrift({
        previousAcceptedPoint: this.lastAccepted,
        currentPoint: fix,
        headingPoint: this.lastHeading,
        stationaryState: { isStationary: this.stationaryState.status === 'STATIONARY' },
        gnssStatus: this.lastGnss,
      });
      const guardActive = isWithinDriftGuard(fix.t, this.driftGuard);

      const res = this.filter.add(fix, {
        forceRejectReason: drift.isDrift ? 'DRIFT_DETECTED' : undefined,
        suppressLinePoint: guardActive,
      });
      this.stats.record(res.accept, fix.accuracy);

      let status: TrackPointStatus = res.status;
      if (res.accept) {
        this.lastAccepted = fix;
        const pts = this.filter.filteredTrackPoints;
        if (pts.length >= 3 && detectSharpTurn(pts.slice(0, -1), pts[pts.length - 1]).isSharpTurn) {
          status = 'sharp_turn';   // echten Winkel im Status spiegeln
        }
      }
      this.currentStatus = status;
      this.emit();
    } catch (e) {
      console.warn('[TrackingSession] location handler', e);
    }
  }

  handleHeadingUpdate(heading: HeadingPoint | null | undefined): void {
    try { if (heading) this.lastHeading = heading; } catch (e) { console.warn('[TrackingSession] heading handler', e); }
  }

  handleGnssStatusUpdate(gnss: GnssStatusAndroid | null | undefined): void {
    try { if (gnss) this.lastGnss = gnss; } catch (e) { console.warn('[TrackingSession] gnss handler', e); }
  }

  // --- Objekte ---

  // Setzt einen Gegenstand robust (Median statt letztem Rohfix) und aktiviert
  // das 3-Sekunden-Drift-Fenster (kein Zickzack durch Stillstand).
  placeObject(input: { type: string; label: string }): PlacedTrackingObject | null {
    try {
      const result = placeTrackingObject({
        type: input.type,
        label: input.label,
        recentGoodPoints: this.filter.filteredTrackPoints,
        filteredTrackPoints: this.filter.filteredTrackPoints,
        now: Date.now(),
      });
      if (!result) return null;
      this.objects.push(result.object);
      this.driftGuard = result.driftGuardUntil;
      this.emit();
      return result.object;
    } catch (e) {
      console.warn('[TrackingSession] placeObject', e);
      return null;
    }
  }

  // --- Stats ---

  getSessionStats(): SessionStats {
    const snap = this.stats.snapshot(this.gpsAccuracy);
    const rejectionsByReason: Record<string, number> = {};
    for (const p of this.filter.rejectedPoints) {
      rejectionsByReason[p.reason] = (rejectionsByReason[p.reason] ?? 0) + 1;
    }
    return {
      phase:              this.phase,
      sessionId:          this.sessionId,
      rawCount:           snap.rawCount,
      filteredCount:      snap.filteredCount,
      rejectedCount:      snap.rejectedCount,
      rejectionRate:      snap.rejectionRate,
      rejectionsByReason,
      gpsQuality:         this.gpsQuality,
      gpsAccuracy:        this.gpsAccuracy,
      bestAccuracy:       snap.bestAccuracy,
      currentStatus:      this.currentStatus,
      objectCount:        this.objects.length,
      driftGuardActive:   isWithinDriftGuard(Date.now(), this.driftGuard),
    };
  }

  // --- Intern: Listener & Native ---

  // Abonniert alle nativen Events. Entfernt vorher bestehende → nie doppelt.
  private subscribe(): void {
    this.unsubscribe();
    this.subs.push(
      this.client.onLocation(p => this.handleIncomingLocationPoint(p)),
      this.client.onHeading(h => this.handleHeadingUpdate(h)),
      this.client.onGnssStatus(g => this.handleGnssStatusUpdate(g)),
      this.client.onProviderStatus(() => { /* reserviert; kein Crash bei Event */ }),
      this.client.onError(e => console.warn('[TrackingSession] native error', e)),
    );
  }

  // Entfernt alle Listener. Idempotent, fehlertolerant (kein Leak).
  private unsubscribe(): void {
    for (const s of this.subs) { try { s.remove(); } catch { /* schon entfernt */ } }
    this.subs = [];
  }

  private async safeStart(): Promise<void> {
    if (this.nativeRunning) return;
    try { await this.client.start(this.trackingOptions); this.nativeRunning = true; }
    catch (e) { console.warn('[TrackingSession] native start', e); }
  }

  private async safeStop(): Promise<void> {
    if (!this.nativeRunning) return;
    try { await this.client.stop(); } catch (e) { console.warn('[TrackingSession] native stop', e); }
    finally { this.nativeRunning = false; }
  }

  private emit(): void {
    if (!this.onUpdate) return;
    try { this.onUpdate(this.getSessionStats()); } catch (e) { console.warn('[TrackingSession] onUpdate', e); }
  }
}

// PrecisionLocation → RawFix (inkl. Mock-Flag). Defensiv gegen fehlende Felder.
function toRawFix(p: PrecisionLocation): RawFix & { mocked?: boolean } {
  return {
    lat:      p.latitude,
    lng:      p.longitude,
    t:        typeof p.timestamp === 'number' ? p.timestamp : Date.now(),
    accuracy: p.accuracy ?? null,
    altitude: p.altitude ?? null,
    speed:    p.speed ?? null,
    heading:  p.heading ?? p.bearing ?? null,
    mocked:   p.isMocked ?? false,
  };
}
