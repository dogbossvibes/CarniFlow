import {
  DEFAULT_APPROACH_CONFIG, INITIAL_APPROACH,
  effectiveRadiusM, isEligible, isFreshFix, isPlausibleSpeed,
  reduceApproach, fixesRemaining, classifyManualStart,
  MIN_START_RADIUS_M, MAX_START_RADIUS_M, ACCURACY_RADIUS_FACTOR,
  MAX_APPROACH_ACCURACY_M, REQUIRED_CONSECUTIVE_FIXES, MAX_LOCATION_AGE_MS,
  type ApproachState, type ApproachSample,
} from '@/features/tracking/engine/startApproach';

const cfg = DEFAULT_APPROACH_CONFIG;
const fix = (p: Partial<ApproachSample>): ApproachSample =>
  ({ distanceM: 0, accuracy: 2, t: 0, ageMs: 0, jumpSpeedMps: 0, ...p });

// N gültige Fixes hintereinander einspeisen.
function feed(n: number, sample: ApproachSample): ApproachState {
  let st = INITIAL_APPROACH;
  for (let i = 0; i < n; i++) st = reduceApproach(st, { ...sample, t: i * 1000 }, cfg);
  return st;
}

describe('startApproach — Konstanten & dynamischer Radius', () => {
  it('konservative Standardwerte (keine 1,5 m / 3 m Hardcodes mehr)', () => {
    expect(MIN_START_RADIUS_M).toBe(3);
    expect(MAX_START_RADIUS_M).toBe(12);
    expect(ACCURACY_RADIUS_FACTOR).toBe(1.5);
    expect(MAX_APPROACH_ACCURACY_M).toBe(12);
    expect(REQUIRED_CONSECUTIVE_FIXES).toBe(3);
    expect(MAX_LOCATION_AGE_MS).toBe(5000);
  });

  it('effectiveRadiusM = clamp(acc·1.5, 3, 12)', () => {
    expect(effectiveRadiusM(2, cfg)).toBe(3);      // 3.0 → min
    expect(effectiveRadiusM(4, cfg)).toBe(6);      // 6.0
    expect(effectiveRadiusM(7, cfg)).toBe(10.5);   // 10.5
    expect(effectiveRadiusM(20, cfg)).toBe(12);    // 30 → max
    expect(effectiveRadiusM(null, cfg)).toBeNull();
  });
});

describe('startApproach — isEligible (dynamischer Radius + Filter)', () => {
  it('1) accuracy 2 m, distance 2.5 m → eligible', () => {
    expect(isEligible(fix({ accuracy: 2, distanceM: 2.5 }), cfg)).toBe(true);
  });
  it('2) accuracy 4 m, distance 5 m → eligible', () => {
    expect(isEligible(fix({ accuracy: 4, distanceM: 5 }), cfg)).toBe(true);
  });
  it('3) accuracy 4 m, distance 8 m → not eligible', () => {
    expect(isEligible(fix({ accuracy: 4, distanceM: 8 }), cfg)).toBe(false);
  });
  it('4) accuracy 15 m → not eligible (noch nicht startbereit)', () => {
    expect(isEligible(fix({ accuracy: 15, distanceM: 1 }), cfg)).toBe(false);
  });
  it('null-Werte → not eligible', () => {
    expect(isEligible(fix({ accuracy: null, distanceM: 1 }), cfg)).toBe(false);
    expect(isEligible(fix({ accuracy: 2, distanceM: null }), cfg)).toBe(false);
  });
});

describe('startApproach — Stale / Ausreißer', () => {
  it('isFreshFix: > maxLocationAgeMs = stale', () => {
    expect(isFreshFix(0, cfg)).toBe(true);
    expect(isFreshFix(5000, cfg)).toBe(true);
    expect(isFreshFix(5001, cfg)).toBe(false);
    expect(isFreshFix(null, cfg)).toBe(true);   // unbekannt ⇒ nicht als stale werten
  });
  it('5) stale location → rejected', () => {
    expect(isEligible(fix({ accuracy: 2, distanceM: 1, ageMs: 9000 }), cfg)).toBe(false);
  });
  it('unplausible Sprunggeschwindigkeit → rejected', () => {
    expect(isPlausibleSpeed(12, cfg)).toBe(true);
    expect(isPlausibleSpeed(50, cfg)).toBe(false);
    expect(isEligible(fix({ accuracy: 2, distanceM: 1, jumpSpeedMps: 50 }), cfg)).toBe(false);
  });
});

describe('startApproach — reduceApproach (mehrere gültige Fixes)', () => {
  it('6) ein einzelner gültiger Fix → noch kein Start', () => {
    const st = feed(1, fix({ accuracy: 2, distanceM: 1 }));
    expect(st.consecutive).toBe(1);
    expect(st.armed).toBe(false);
  });
  it('7) drei aufeinanderfolgende gültige Fixes → startbereit', () => {
    const st = feed(3, fix({ accuracy: 2, distanceM: 1 }));
    expect(st.armed).toBe(true);
  });
  it('ein ungültiger Fix setzt den Zähler zurück (kein Start durch Ausreißer)', () => {
    let st = INITIAL_APPROACH;
    st = reduceApproach(st, fix({ accuracy: 2, distanceM: 1, t: 0 }), cfg);
    st = reduceApproach(st, fix({ accuracy: 2, distanceM: 1, t: 1000 }), cfg);
    expect(st.consecutive).toBe(2);
    st = reduceApproach(st, fix({ accuracy: 2, distanceM: 40, t: 2000 }), cfg);   // Ausreißer weit weg
    expect(st.consecutive).toBe(0);
    expect(st.armed).toBe(false);
  });
  it('einmal armed → bleibt armed', () => {
    const armed: ApproachState = { consecutive: 3, armed: true };
    const st = reduceApproach(armed, fix({ accuracy: 2, distanceM: 999, t: 9999 }), cfg);
    expect(st.armed).toBe(true);
  });
  it('fixesRemaining zählt nur die GPS-Stabilität bis zur manuellen Startbereitschaft', () => {
    expect(fixesRemaining(INITIAL_APPROACH, cfg)).toBe(3);
    expect(fixesRemaining({ consecutive: 2, armed: false }, cfg)).toBe(1);
    expect(fixesRemaining({ consecutive: 3, armed: true }, cfg)).toBe(0);
  });
});

describe('startApproach — classifyManualStart (Button „Jetzt starten")', () => {
  it('9) innerhalb des dynamischen Radius → at-start', () => {
    expect(classifyManualStart(2.5, 2, cfg)).toBe('at-start');   // Radius 3
    expect(classifyManualStart(5, 4, cfg)).toBe('at-start');     // Radius 6
  });
  it('10) außerhalb des Radius → override-needed (Bestätigungsdialog)', () => {
    expect(classifyManualStart(8, 4, cfg)).toBe('override-needed');   // Radius 6
  });
  it('unbekannte Position/Genauigkeit → override-needed', () => {
    expect(classifyManualStart(null, 4, cfg)).toBe('override-needed');
    expect(classifyManualStart(5, null, cfg)).toBe('override-needed');
  });
});
