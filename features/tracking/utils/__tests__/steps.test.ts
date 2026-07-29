import {
  DEFAULT_STEP_LENGTH_M, metersToSteps, stepsToMeters, normalizeStepLength,
} from '@/features/tracking/utils/steps';

describe('steps — zentrale Umrechnung', () => {
  it('Default-Schrittlänge = 0,75 m', () => {
    expect(DEFAULT_STEP_LENGTH_M).toBe(0.75);
  });

  it('1) metersToSteps(75, 0.75) = 100', () => {
    expect(metersToSteps(75, 0.75)).toBe(100);
  });

  it('2) stepsToMeters(100, 0.75) = 75', () => {
    expect(stepsToMeters(100, 0.75)).toBe(75);
  });

  it('3+13) ungültige/fehlende stepLengthM → Fallback 0,75 (auch für Alt-Sessions)', () => {
    expect(normalizeStepLength(undefined)).toBe(0.75);
    expect(normalizeStepLength(null)).toBe(0.75);
    expect(normalizeStepLength(0)).toBe(0.75);
    expect(normalizeStepLength(-0.7)).toBe(0.75);
    expect(normalizeStepLength(NaN)).toBe(0.75);
    expect(metersToSteps(75)).toBe(100);          // ohne Arg → Default
    expect(metersToSteps(75, undefined)).toBe(100);
    expect(metersToSteps(75, 0)).toBe(100);       // ungültig → Default
  });

  it('4) stepLengthM = 0.70 wird verwendet', () => {
    expect(metersToSteps(70, 0.70)).toBe(100);
    expect(stepsToMeters(100, 0.70)).toBeCloseTo(70);
  });

  it('5) stepLengthM = 0.80 wird verwendet', () => {
    expect(metersToSteps(80, 0.80)).toBe(100);
    expect(stepsToMeters(100, 0.80)).toBeCloseTo(80);
  });

  it('6) negative/ungültige Meter sicher behandelt → 0', () => {
    expect(metersToSteps(-10, 0.75)).toBe(0);
    expect(metersToSteps(NaN, 0.75)).toBe(0);
    expect(metersToSteps(0, 0.75)).toBe(0);
    expect(stepsToMeters(-5, 0.75)).toBe(0);
  });

  it('Rundung wie bisher (Math.round)', () => {
    expect(metersToSteps(1.1, 0.75)).toBe(1);   // 1.466 → 1
    expect(metersToSteps(1.2, 0.75)).toBe(2);   // 1.6 → 2
  });
});
