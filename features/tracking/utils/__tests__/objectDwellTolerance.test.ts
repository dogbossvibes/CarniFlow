// T-196: genauigkeitsabhängige Nähe-Toleranz der automatischen Gegenstands-Erkennung.
import { INITIAL_OBJECT_DWELL, OBJECT_DWELL, objectReferenceToleranceM, stepObjectDwell, type ObjectDwellSample } from '../objectDwell';

const sample = (over: Partial<ObjectDwellSample>): ObjectDwellSample => ({
  tMs: 0, speedMps: 0, accuracyM: 5, progressM: 30, trackLengthM: 120, distanceToReferenceM: 0,
  driftFromStartM: 0, nearAngle: false, searchActive: true, gpsOutlier: false, ...over,
});
/** Steht `seconds` lang still im Abstand `distanceM`; liefert, ob ein Fund ausgelöst wurde. */
function dwell(distanceM: number, seconds: number, toleranceM?: number): boolean {
  let state = INITIAL_OBJECT_DWELL, accepted = false;
  for (let t = 0; t <= seconds; t++) {
    const next = stepObjectDwell(state, sample({ tMs: t * 1000, distanceToReferenceM: distanceM, ...(toleranceM != null ? { referenceToleranceM: toleranceM } : {}) }));
    state = next.state; accepted = accepted || next.acceptedNow;
  }
  return accepted;
}

describe('objectReferenceToleranceM', () => {
  test('ohne Genauigkeitsangaben bleibt es bei der bisherigen festen Grenze', () => {
    expect(objectReferenceToleranceM(null, null)).toBe(OBJECT_DWELL.maxReferenceM);
    expect(objectReferenceToleranceM(undefined, undefined)).toBe(2.5);
    expect(objectReferenceToleranceM(Number.NaN, -3)).toBe(2.5);
  });
  test('wächst mit der kombinierten Unsicherheit beider Messungen', () => {
    expect(objectReferenceToleranceM(4, 3)).toBeCloseTo(2.5 + 0.3 * 5, 6);   // √(4²+3²) = 5 → 4,0 m
    expect(objectReferenceToleranceM(5, null)).toBeCloseTo(4.0, 6);
    expect(objectReferenceToleranceM(3, 3)).toBeGreaterThan(objectReferenceToleranceM(2, 2));
  });
  test('ist nach oben gedeckelt und nie kleiner als die bisherige Grenze', () => {
    expect(objectReferenceToleranceM(20, 20)).toBe(OBJECT_DWELL.maxReferenceCapM);
    expect(objectReferenceToleranceM(100, 100)).toBe(5);
    expect(objectReferenceToleranceM(0.1, 0.1)).toBeGreaterThanOrEqual(2.5);
  });
});

describe('stepObjectDwell mit Toleranz', () => {
  test('ohne übergebene Toleranz unverändert: 3 m Abstand zählt nicht, 2 m zählt', () => {
    expect(dwell(3, 8)).toBe(false);
    expect(dwell(2, 8)).toBe(true);
  });
  test('mit Toleranz zählt ein Halt knapp ausserhalb von 2,5 m, weit daneben weiterhin nicht', () => {
    const tolerance = objectReferenceToleranceM(5, 5);   // ≈ 4,6 m
    expect(dwell(3.2, 8, tolerance)).toBe(true);
    expect(dwell(5.5, 8, tolerance)).toBe(false);
    expect(dwell(9, 8, OBJECT_DWELL.maxReferenceCapM)).toBe(false);
  });
  test('alle anderen Bedingungen gelten weiter: zu kurz, in Bewegung, driftend, schlechte Genauigkeit', () => {
    const tolerance = 4.5;
    expect(dwell(3, 4, tolerance)).toBe(false);
    const run = (over: Partial<ObjectDwellSample>) => {
      let state = INITIAL_OBJECT_DWELL, accepted = false;
      for (let t = 0; t <= 8; t++) { const n = stepObjectDwell(state, sample({ tMs: t * 1000, distanceToReferenceM: 3, referenceToleranceM: tolerance, ...over })); state = n.state; accepted = accepted || n.acceptedNow; }
      return accepted;
    };
    expect(run({ speedMps: 0.8 })).toBe(false);
    expect(run({ driftFromStartM: 2 })).toBe(false);
    expect(run({ accuracyM: 30 })).toBe(false);
    expect(run({ gpsOutlier: true })).toBe(false);
    expect(run({ progressM: 2 })).toBe(false);
    expect(run({})).toBe(true);
  });
});
