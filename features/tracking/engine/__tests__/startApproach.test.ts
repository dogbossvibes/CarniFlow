import {
  DEFAULT_APPROACH_CONFIG, INITIAL_APPROACH, isEligible, reduceApproach, stableRemainingS,
  APPROACH_HINT, type ApproachState,
} from '@/features/tracking/engine/startApproach';

const cfg = DEFAULT_APPROACH_CONFIG;   // radius 1.5 m, stable 2000 ms, acc ≤ 3 m

describe('Fährtenansatz-Arming (reduceApproach)', () => {
  it('Standardwerte: 1,5 m Radius, 2 s Stabilität, ≤ 3 m Genauigkeit', () => {
    expect(cfg).toEqual({ radiusM: 1.5, stableMs: 2000, accuracyMaxM: 3 });
  });

  it('isEligible: nur innerhalb Radius UND genau genug', () => {
    expect(isEligible(1.0, 2, cfg)).toBe(true);
    expect(isEligible(2.0, 2, cfg)).toBe(false);   // zu weit
    expect(isEligible(1.0, 5, cfg)).toBe(false);   // zu ungenau
    expect(isEligible(null, 2, cfg)).toBe(false);
    expect(isEligible(1.0, null, cfg)).toBe(false);
  });

  it('scharf erst NACH stableMs stabil im Radius', () => {
    let st: ApproachState = INITIAL_APPROACH;
    st = reduceApproach(st, { distanceM: 1.0, accuracy: 2, t: 1000 }, cfg);
    expect(st.armed).toBe(false);                 // gerade erst im Radius
    expect(st.withinSince).toBe(1000);
    st = reduceApproach(st, { distanceM: 0.8, accuracy: 2, t: 2500 }, cfg);
    expect(st.armed).toBe(false);                 // erst 1,5 s
    st = reduceApproach(st, { distanceM: 0.7, accuracy: 2, t: 3000 }, cfg);
    expect(st.armed).toBe(true);                  // 2,0 s erreicht → Auto-Start
  });

  it('Verlassen des Radius setzt den Stabilitäts-Timer zurück', () => {
    let st: ApproachState = INITIAL_APPROACH;
    st = reduceApproach(st, { distanceM: 1.0, accuracy: 2, t: 1000 }, cfg);
    st = reduceApproach(st, { distanceM: 3.0, accuracy: 2, t: 1500 }, cfg);   // rausgelaufen
    expect(st.withinSince).toBeNull();
    expect(st.armed).toBe(false);
    st = reduceApproach(st, { distanceM: 1.0, accuracy: 2, t: 2000 }, cfg);   // wieder rein → neu ab 2000
    expect(st.withinSince).toBe(2000);
    st = reduceApproach(st, { distanceM: 1.0, accuracy: 2, t: 3900 }, cfg);
    expect(st.armed).toBe(false);                 // erst 1,9 s
    st = reduceApproach(st, { distanceM: 1.0, accuracy: 2, t: 4000 }, cfg);
    expect(st.armed).toBe(true);
  });

  it('unzureichende Genauigkeit blockiert den Start trotz Nähe', () => {
    let st: ApproachState = INITIAL_APPROACH;
    st = reduceApproach(st, { distanceM: 0.5, accuracy: 8, t: 1000 }, cfg);
    st = reduceApproach(st, { distanceM: 0.5, accuracy: 8, t: 4000 }, cfg);
    expect(st.armed).toBe(false);
  });

  it('einmal scharf bleibt scharf (kein Zurückfallen)', () => {
    let st: ApproachState = { withinSince: 0, armed: true };
    st = reduceApproach(st, { distanceM: 50, accuracy: 2, t: 9999 }, cfg);   // weit weg
    expect(st.armed).toBe(true);
  });

  it('konfigurierbarer Radius', () => {
    const wide = { radiusM: 5, stableMs: 1000, accuracyMaxM: 10 };
    let st: ApproachState = INITIAL_APPROACH;
    st = reduceApproach(st, { distanceM: 4, accuracy: 8, t: 0 }, wide);
    st = reduceApproach(st, { distanceM: 4, accuracy: 8, t: 1000 }, wide);
    expect(st.armed).toBe(true);
  });

  it('stableRemainingS zählt herunter', () => {
    expect(stableRemainingS(INITIAL_APPROACH, 0, cfg)).toBe(2);
    expect(stableRemainingS({ withinSince: 1000, armed: false }, 2000, cfg)).toBe(1);   // 1 s verstrichen → 1 s übrig
    expect(stableRemainingS({ withinSince: 1000, armed: false }, 3000, cfg)).toBe(0);
  });

  it('Hinweistext ist vorgegeben', () => {
    expect(APPROACH_HINT).toBe('Bitte zum Fährtenansatz gehen. Die Suchzeit startet automatisch.');
  });
});
