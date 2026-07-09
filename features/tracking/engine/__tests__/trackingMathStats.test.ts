import {
  calculateDistanceMeters, calculateSpeedMps, calculateBearingDegrees, medianCoordinate,
} from '@/features/tracking/engine/trackingMath';
import { computeSessionStats, type StatsPoint } from '@/features/tracking/engine/trackingStats';

const LAT = 47.0, LNG = 8.0;
const mNorth = (m: number) => m / 111_320;
const mEast  = (m: number) => m / (111_320 * Math.cos((LAT * Math.PI) / 180));
const north = (m: number) => ({ lat: LAT + mNorth(m), lng: LNG });
const east  = (m: number) => ({ lat: LAT, lng: LNG + mEast(m) });

describe('trackingMath', () => {
  describe('calculateDistanceMeters', () => {
    it('misst ~10 m', () => {
      expect(calculateDistanceMeters({ lat: LAT, lng: LNG }, north(10))).toBeCloseTo(10, 0);
    });
    it('Distanz zu sich selbst ist 0', () => {
      expect(calculateDistanceMeters({ lat: LAT, lng: LNG }, { lat: LAT, lng: LNG })).toBe(0);
    });
  });

  describe('calculateSpeedMps', () => {
    it('10 m in 2 s = 5 m/s', () => {
      expect(calculateSpeedMps({ lat: LAT, lng: LNG }, north(10), 2000)).toBeCloseTo(5, 1);
    });
    it('dt ≤ 0 → null', () => {
      expect(calculateSpeedMps({ lat: LAT, lng: LNG }, north(10), 0)).toBeNull();
      expect(calculateSpeedMps({ lat: LAT, lng: LNG }, north(10), -100)).toBeNull();
    });
  });

  describe('calculateBearingDegrees', () => {
    it('Norden ≈ 0°', () => {
      expect(calculateBearingDegrees({ lat: LAT, lng: LNG }, north(5))).toBeCloseTo(0, 0);
    });
    it('Osten ≈ 90°', () => {
      expect(calculateBearingDegrees({ lat: LAT, lng: LNG }, east(5))).toBeGreaterThan(89);
      expect(calculateBearingDegrees({ lat: LAT, lng: LNG }, east(5))).toBeLessThan(91);
    });
  });

  describe('medianCoordinate', () => {
    it('ignoriert Ausreisser (Komponenten-Median)', () => {
      expect(medianCoordinate([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 9 }]))
        .toEqual({ lat: 2, lng: 2 });
    });
    it('leere Menge → null', () => {
      expect(medianCoordinate([])).toBeNull();
    });
  });
});

describe('computeSessionStats', () => {
  const filtered: StatsPoint[] = [
    { lat: LAT, lng: LNG, accuracy: 5, t: 1000 },                 // excellent
    { ...north(2), accuracy: 12, t: 2000 },                       // good
    { ...north(4), accuracy: 20, t: 3000 },                       // poor
  ];
  const raw: StatsPoint[] = [
    { lat: LAT, lng: LNG, t: 1000 }, { ...north(2), t: 2000 }, { ...north(4), t: 3000 },
    { ...north(6), t: 4000 }, { ...north(8), t: 5000 },
  ];
  const rejected = [{ reason: 'ACCURACY_TOO_LOW' }, { reason: 'GPS_JUMP' }];

  it('Accuracy: Ø / best / worst aus gefilterten Punkten', () => {
    const r = computeSessionStats({ rawPoints: raw, filteredPoints: filtered, rejectedPoints: rejected, objectCount: 0 });
    expect(r.averageAccuracy).toBeCloseTo((5 + 12 + 20) / 3, 2);
    expect(r.bestAccuracy).toBe(5);
    expect(r.worstAccuracy).toBe(20);
  });

  it('Distanzen raw vs filtered', () => {
    const r = computeSessionStats({ rawPoints: raw, filteredPoints: filtered, rejectedPoints: rejected, objectCount: 0 });
    expect(r.rawDistanceMeters).toBeCloseTo(8, 0);       // 0..8 m
    expect(r.filteredDistanceMeters).toBeCloseTo(4, 0);  // 0..4 m
  });

  it('rejectedCount + rejectionRate', () => {
    const r = computeSessionStats({ rawPoints: raw, filteredPoints: filtered, rejectedPoints: rejected, objectCount: 0 });
    expect(r.rejectedCount).toBe(2);
    expect(r.rejectionRate).toBeCloseTo(2 / 5, 5);
  });

  it('gpsQualityDistribution', () => {
    const r = computeSessionStats({ rawPoints: raw, filteredPoints: filtered, rejectedPoints: rejected, objectCount: 0 });
    expect(r.gpsQualityDistribution).toEqual({ excellent: 1, good: 1, poor: 1, bad: 0 });
  });

  it('Status-Timeline: Stillstandsdauer, Drift- und Winkel-Zähler', () => {
    const r = computeSessionStats({
      rawPoints: raw, filteredPoints: filtered, rejectedPoints: rejected, objectCount: 2,
      statusTimeline: [
        { status: 'stationary', t: 0 },
        { status: 'stationary', t: 4000 },
        { status: 'moving', t: 5000 },
        { status: 'drift', t: 6000 },
        { status: 'sharp_turn', t: 7000 },
      ],
    });
    expect(r.stationaryDurationMs).toBe(5000); // 4000 + 1000
    expect(r.driftCount).toBe(1);
    expect(r.sharpTurnCount).toBe(1);
    expect(r.objectCount).toBe(2);
  });

  it('Fallback ohne Timeline: drift aus Reasons, sharp_turn aus Status', () => {
    const r = computeSessionStats({
      rawPoints: raw,
      filteredPoints: [...filtered, { ...north(6), accuracy: 6, t: 4000, status: 'sharp_turn' }],
      rejectedPoints: [{ reason: 'DRIFT_DETECTED' }, { reason: 'DRIFT_DETECTED' }, { reason: 'GPS_JUMP' }],
      objectCount: 0,
    });
    expect(r.driftCount).toBe(2);
    expect(r.sharpTurnCount).toBe(1);
    expect(r.stationaryDurationMs).toBe(0);
  });

  it('Android-GNSS-Mittelwerte (optional)', () => {
    const r = computeSessionStats({
      rawPoints: raw, filteredPoints: filtered, rejectedPoints: rejected, objectCount: 0,
      gnssSamples: [
        { satelliteCount: 10, usedInFixCount: 7, averageCn0DbHz: 30 },
        { satelliteCount: 12, usedInFixCount: 9, averageCn0DbHz: 34 },
      ],
    });
    expect(r.averageSatelliteCount).toBe(11);
    expect(r.averageUsedInFixCount).toBe(8);
    expect(r.averageCn0DbHz).toBe(32);
  });

  it('ohne GNSS → null', () => {
    const r = computeSessionStats({ rawPoints: raw, filteredPoints: filtered, rejectedPoints: rejected, objectCount: 0 });
    expect(r.averageSatelliteCount).toBeNull();
    expect(r.averageUsedInFixCount).toBeNull();
    expect(r.averageCn0DbHz).toBeNull();
  });

  it('leere Eingabe ist robust', () => {
    const r = computeSessionStats({ rawPoints: [], filteredPoints: [], rejectedPoints: [], objectCount: 0 });
    expect(r.averageAccuracy).toBeNull();
    expect(r.rejectionRate).toBe(0);
    expect(r.rawDistanceMeters).toBe(0);
    expect(r.gpsQualityDistribution).toEqual({ excellent: 0, good: 0, poor: 0, bad: 0 });
  });
});
