import {
  evaluateFusion, DEFAULT_FUSION_CONFIG, confidenceBand,
  type LocationPoint, type MotionInput, type FusionHistory,
} from '@/features/tracking/engine/trackFusionEngine';

const cfg = DEFAULT_FUSION_CONFIG;
const M_PER_DEG = 111320;
function ll(xEastM: number, yNorthM: number): { latitude: number; longitude: number } {
  return { latitude: yNorthM / M_PER_DEG, longitude: xEastM / M_PER_DEG };
}
function loc(p: { latitude: number; longitude: number }, t: number, accuracy: number | null, speed: number | null = null, course: number | null = null): LocationPoint {
  return { latitude: p.latitude, longitude: p.longitude, timestamp: t, horizontalAccuracy: accuracy, speed, course };
}
function noHistory(): FusionHistory {
  return { prevAccepted: null, prevSpeedMps: null, prevCourseDeg: null };
}
function motion(overrides: Partial<MotionInput> = {}): MotionInput {
  return {
    movementState: 'walking', stepDelta: 1, accelerationMagnitude: 0.1,
    rotationMagnitude: 0.1, headingDelta: 5, motionConfidence: 0.9,
    ...overrides,
  };
}

describe('trackFusionEngine — Konstanten', () => {
  it('teilt dieselben physikalischen Grenzen wie searchFix.ts (eine Quelle der Wahrheit)', () => {
    expect(cfg.maxAccuracyM).toBe(45);
    expect(cfg.maxPlausibleSpeedMps).toBe(12);
  });
});

describe('trackFusionEngine — guter GPS-Punkt + passende Motion', () => {
  it('wird akzeptiert mit hoher Confidence', () => {
    const prev = loc(ll(0, 0), 1000, 5);
    const cur = loc(ll(0, 2), 2000, 5, 2, 0);
    const res = evaluateFusion(cur, motion(), { prevAccepted: prev, prevSpeedMps: 2, prevCourseDeg: 0 }, cfg);
    expect(res.classification).toBe('accepted');
    expect(res.confidence).toBeGreaterThanOrEqual(0.75);
    expect(res.acceptedLocation).toEqual(cur);
    expect(res.fusionMode).toBe('gps_motion');
    expect(confidenceBand(res.confidence)).toMatch(/excellent|good/);
  });

  it('erster Fix (keine Historie) wird akzeptiert', () => {
    const cur = loc(ll(0, 0), 1000, 5);
    const res = evaluateFusion(cur, motion(), noHistory(), cfg);
    expect(res.classification).toBe('accepted');
    expect(res.distanceSinceLastM).toBe(0);
  });
});

describe('trackFusionEngine — schlechter Accuracy-Fix', () => {
  it('ohne Motion-Gegenprobe: low_confidence, aber nicht verworfen', () => {
    const prev = loc(ll(0, 0), 1000, 5);
    const cur = loc(ll(0, 3), 2000, 40);   // schlecht, aber < maxAccuracyM
    const res = evaluateFusion(cur, null, { prevAccepted: prev, prevSpeedMps: null, prevCourseDeg: null }, cfg);
    expect(res.classification).toBe('low_confidence');
    expect(res.acceptedLocation).toEqual(cur);   // weiterhin verwendet, nur niedrige Confidence
  });

  it('jenseits maxAccuracyM: low_confidence (degradiert graziös, kein Absturz)', () => {
    const prev = loc(ll(0, 0), 1000, 5);
    const cur = loc(ll(0, 3), 2000, 60);
    const res = evaluateFusion(cur, motion(), { prevAccepted: prev, prevSpeedMps: null, prevCourseDeg: null }, cfg);
    expect(res.classification).toBe('low_confidence');
    expect(res.reasonFlags).toContain('accuracy_too_poor');
  });
});

describe('trackFusionEngine — physikalisch unmöglicher GPS-Sprung', () => {
  it('grosser Sprung + schlechte Accuracy + Motion widerspricht (Stillstand) → gps_outlier, Linie NICHT verschoben', () => {
    const prev = loc(ll(0, 0), 1000, 5);
    // 50 m in 1 s = 50 m/s, weit über maxPlausibleSpeedMps (12).
    const cur = loc(ll(0, 50), 2000, 40, 50, 90);
    const res = evaluateFusion(cur, motion({ movementState: 'stationary', accelerationMagnitude: 0.01, rotationMagnitude: 0.01, stepDelta: 0 }), { prevAccepted: prev, prevSpeedMps: 1, prevCourseDeg: 0 }, cfg);
    expect(res.classification).toBe('gps_outlier');
    expect(res.acceptedLocation).toEqual(prev);   // NICHT der Rohfix — Linie bleibt am letzten guten Punkt
    expect(res.rawLocation).toEqual(cur);         // Rohfix bleibt zur Diagnose erhalten
    expect(res.distanceSinceLastM).toBe(0);
    expect(res.confidence).toBeLessThan(0.5);
  });

  it('grosser Sprung, aber Motion zeigt passende Bewegung (z. B. Auto/Rad) → kein Outlier', () => {
    const prev = loc(ll(0, 0), 1000, 5);
    const cur = loc(ll(0, 15), 2000, 8, 15, 0);   // 15 m in 1 s = 15 m/s, leicht über der Fährten-Grenze
    const res = evaluateFusion(
      cur,
      motion({ movementState: 'automotive', accelerationMagnitude: 0.3, rotationMagnitude: 0.05, stepDelta: 0 }),
      { prevAccepted: prev, prevSpeedMps: 15, prevCourseDeg: 0 },
      cfg,
    );
    // Nicht als gps_outlier verworfen, da Motion NICHT "stationary" widerspricht —
    // physikalisch unplausibel für die Fährtenarbeit bleibt es trotzdem als
    // low_confidence markiert (kein Absturz, aber sichtbare Warnung).
    expect(res.classification).not.toBe('gps_outlier');
  });
});

describe('trackFusionEngine — Stillstand + GPS-Jitter', () => {
  it('Motion zeigt Stillstand, GPS wandert ein paar Meter → stationary, keine künstliche Distanz', () => {
    const prev = loc(ll(0, 0), 1000, 6);
    const cur = loc(ll(1.5, 0.5), 2000, 6);   // ~1.6 m Jitter
    const res = evaluateFusion(
      cur,
      motion({ movementState: 'stationary', accelerationMagnitude: 0.01, rotationMagnitude: 0.02, stepDelta: 0 }),
      { prevAccepted: prev, prevSpeedMps: 0, prevCourseDeg: null },
      cfg,
    );
    expect(res.classification).toBe('stationary');
    expect(res.distanceSinceLastM).toBe(0);
    expect(res.acceptedLocation).toEqual(prev);
    expect(res.reasonFlags).toContain('stationary_jitter_suppressed');
  });

  it('ohne Motion-Daten (gps_only) wird Stillstand-Jitter NICHT unterdrückt (keine Evidenz vorhanden)', () => {
    const prev = loc(ll(0, 0), 1000, 6);
    const cur = loc(ll(1.5, 0.5), 2000, 6);
    const res = evaluateFusion(cur, null, { prevAccepted: prev, prevSpeedMps: 0, prevCourseDeg: null }, cfg);
    expect(res.fusionMode).toBe('gps_only');
    expect(res.classification).not.toBe('stationary');
  });
});

describe('trackFusionEngine — Motion Permission denied / unavailable → gps_only Fallback', () => {
  it('motion=null (kein natives Modul / Permission verweigert) läuft normal weiter', () => {
    const prev = loc(ll(0, 0), 1000, 5);
    const cur = loc(ll(0, 2), 2000, 5);
    const res = evaluateFusion(cur, null, { prevAccepted: prev, prevSpeedMps: 1, prevCourseDeg: 0 }, cfg);
    expect(res.fusionMode).toBe('gps_only');
    expect(res.classification).toBe('accepted');
    expect(res.confidence).toBeGreaterThan(0);
  });
});

describe('trackFusionEngine — confidenceBand', () => {
  it('bildet die Stufen aus Punkt 8 exakt ab', () => {
    expect(confidenceBand(0.95)).toBe('excellent');
    expect(confidenceBand(0.90)).toBe('excellent');
    expect(confidenceBand(0.89)).toBe('good');
    expect(confidenceBand(0.75)).toBe('good');
    expect(confidenceBand(0.74)).toBe('limited');
    expect(confidenceBand(0.50)).toBe('limited');
    expect(confidenceBand(0.49)).toBe('unreliable');
    expect(confidenceBand(0)).toBe('unreliable');
  });
});
