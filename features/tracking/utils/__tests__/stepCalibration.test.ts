import {
  CALIBRATION_STEPS, calibrateStepLength, isPlausibleStepLength, isAcceptableCalibration,
  MIN_CALIBRATED_STEP_LENGTH_M, MAX_CALIBRATED_STEP_LENGTH_M, MIN_CALIBRATION_DISTANCE_M,
} from '@/features/tracking/utils/stepCalibration';

describe('stepCalibration', () => {
  it('CALIBRATION_STEPS = 50', () => expect(CALIBRATION_STEPS).toBe(50));

  it('1) 37,5 m / 50 = 0,75 m', () => expect(calibrateStepLength(37.5, 50)).toBe(0.75));
  it('2) 35 m / 50 = 0,70 m', () => expect(calibrateStepLength(35, 50)).toBe(0.7));
  it('3) 40 m / 50 = 0,80 m', () => expect(calibrateStepLength(40, 50)).toBe(0.8));

  it('4) Ergebnis wird NICHT gerundet', () => {
    expect(calibrateStepLength(34.8, 50)).toBeCloseTo(0.696, 6);
    expect(calibrateStepLength(34.8, 50)).not.toBe(0.7);
  });

  it('Default-Schrittzahl = 50, Guards', () => {
    expect(calibrateStepLength(37.5)).toBe(0.75);
    expect(Number.isNaN(calibrateStepLength(37.5, 0))).toBe(true);
    expect(Number.isNaN(calibrateStepLength(NaN, 50))).toBe(true);
  });

  it('Plausibilitätsgrenzen', () => {
    expect(isPlausibleStepLength(0.75)).toBe(true);
    expect(isPlausibleStepLength(0.696)).toBe(true);
    expect(isPlausibleStepLength(MIN_CALIBRATED_STEP_LENGTH_M)).toBe(true);
    expect(isPlausibleStepLength(MAX_CALIBRATED_STEP_LENGTH_M)).toBe(true);
    expect(isPlausibleStepLength(0.39)).toBe(false);
    expect(isPlausibleStepLength(1.21)).toBe(false);
    expect(isPlausibleStepLength(NaN)).toBe(false);
  });

  it('12) unplausible Messungen werden abgelehnt', () => {
    expect(isAcceptableCalibration(37.5, 50)).toBe(true);            // 0,75
    expect(isAcceptableCalibration(MIN_CALIBRATION_DISTANCE_M - 1, 50)).toBe(false);  // zu kurz
    expect(isAcceptableCalibration(7.5, 50)).toBe(false);           // 0,15 → zu klein
    expect(isAcceptableCalibration(100, 50)).toBe(false);          // 2,0 → zu groß
    expect(isAcceptableCalibration(20, 50)).toBe(true);            // 0,40 (Grenze)
    expect(isAcceptableCalibration(60, 50)).toBe(true);            // 1,20 (Grenze)
  });
});
