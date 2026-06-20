import {
  resolvePrecisionDebugStatus, buildDebugSnapshot,
} from '@/features/tracking/components/PrecisionDebugPanel';
import { EMPTY_GPS_STATS, type GpsStats } from '@/features/tracking/engine/types';

const stats = (over: Partial<GpsStats> = {}): GpsStats => ({ ...EMPTY_GPS_STATS, ...over });

describe('resolvePrecisionDebugStatus', () => {
  it('Warmup hat Vorrang', () => {
    expect(resolvePrecisionDebugStatus('warmup', 'moving', 5)).toBe('GPS_WARMUP');
  });
  it('Drift vor schlechtem GPS', () => {
    expect(resolvePrecisionDebugStatus('recording', 'drift', 40)).toBe('DRIFT');
  });
  it('schlechtes GPS überschreibt Bewegung', () => {
    expect(resolvePrecisionDebugStatus('recording', 'moving', 30)).toBe('GPS_POOR'); // > 25 m → bad
    expect(resolvePrecisionDebugStatus('recording', 'moving', 20)).toBe('GPS_POOR'); // poor
  });
  it('mappt Bewegungsstatus bei gutem GPS', () => {
    expect(resolvePrecisionDebugStatus('recording', 'moving', 5)).toBe('MOVING');
    expect(resolvePrecisionDebugStatus('recording', 'slow_moving', 5)).toBe('SLOW_MOVING');
    expect(resolvePrecisionDebugStatus('recording', 'stationary', 5)).toBe('STATIONARY');
    expect(resolvePrecisionDebugStatus('recording', 'sharp_turn', 5)).toBe('SHARP_TURN');
  });
  it('null ohne Status', () => {
    expect(resolvePrecisionDebugStatus('recording', null, 5)).toBeNull();
  });
});

describe('buildDebugSnapshot', () => {
  it('fasst alle Debug-Felder zusammen (inkl. Engine-Ableitung)', () => {
    const snap = buildDebugSnapshot({
      engineLabel: 'Native Precision',
      stats: stats({ rawCount: 10, filteredCount: 7, rejectedCount: 3, rejectionRate: 0.3, lastAccuracy: 6, bestAccuracy: 4 }),
      status: 'moving',
      platform: 'android',
      phase: 'recording',
      lastRejectedReason: 'GPS_JUMP',
      gnss: { satelliteCount: 12, usedInFixCount: 9, averageCn0DbHz: 32.5, maxCn0DbHz: 41, hasRawMeasurements: true, timestamp: 0 },
    });
    expect(snap.engine).toBe('native_precision');
    expect(snap.platform).toBe('android');
    expect(snap.status).toBe('MOVING');
    expect(snap.rawPoints).toBe(10);
    expect(snap.filteredPoints).toBe(7);
    expect(snap.rejectedPoints).toBe(3);
    expect(snap.lastRejected).toBe('GPS_JUMP');
    expect(snap.gpsQuality).toBe('excellent');
    expect(snap.rawGnssAvailable).toBe(true);
    expect(snap.gnss).toMatchObject({ satelliteCount: 12, usedInFixCount: 9, maxCn0DbHz: 41 });
  });

  it('leitet Expo-Fallback aus dem Label ab', () => {
    const snap = buildDebugSnapshot({ engineLabel: 'Fallback (expo-location)', stats: stats(), status: null });
    expect(snap.engine).toBe('expo_fallback');
  });
});
