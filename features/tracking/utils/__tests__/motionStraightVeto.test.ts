// T-214: Geradeaus-Sperre — der Bewegungssensor kann einen schwachen GPS-Winkel zurückhalten, nie erzeugen.
import {
  evaluateStraightWalk, STRAIGHT_VETO_LOOKBACK_S, STRAIGHT_VETO_MAX_AGE_S, STRAIGHT_VETO_MAX_YAW_DEG,
} from '../motionStraightVeto';
import type { MotionWindowSample } from '../motionTurnEvidence';
import { HAND, POCKET, T0, WALK, ZERO, box, simulate, type Program } from './helpers/motionScenarioSim';

/** Drehung um `deg` Grad, gleichmässig zwischen `from` und `to` (s). */
const turn = (deg: number, from: number, to: number): Program => ({
  yawRateDps: t => box(t, from, to, deg / (to - from)), offAxisRadS: ZERO, stepRate: WALK,
});
const STRAIGHT: Program = { yawRateDps: ZERO, offAxisRadS: ZERO, stepRate: WALK };
const at = (s: number) => T0 + s * 1000;

describe('Geradeaus-Sperre (T-214)', () => {
  it('geradeaus gehen (Hand und Hosentasche, mehrere Zufallsläufe): entschieden, keine Drehung', () => {
    for (const carry of [HAND, POCKET]) for (let seed = 1; seed <= 12; seed++) {
      const r = evaluateStraightWalk(simulate(20, STRAIGHT, carry, seed), at(14), at(17));
      expect(r.decided).toBe(true);
      expect(r.straight).toBe(true);
      expect(Math.abs(r.maxWindowYawDeg!)).toBeLessThan(STRAIGHT_VETO_MAX_YAW_DEG);
    }
  });

  it('rechter Winkel, Spitzwinkel und flacher 45°-Winkel am Scheitel: Drehung gesehen', () => {
    for (const deg of [45, -45, 90, -90, 135, -135]) for (const carry of [HAND, POCKET]) {
      const r = evaluateStraightWalk(simulate(20, turn(deg, 13.5, 14.5), carry, 3), at(14), at(17));
      expect(r.decided).toBe(true);
      expect(r.straight).toBe(false);
    }
  });

  it('GPS-Scheitel liegt mehrere Sekunden neben dem echten Winkel: Drehung im Rückblick zählt', () => {
    // echte Drehung bei 8 s, GPS meldet den Scheitel erst bei 14 s (≈ 6 m daneben)
    expect(evaluateStraightWalk(simulate(20, turn(90, 7.5, 8.5), HAND, 5), at(14), at(17)).straight).toBe(false);
    // echte Drehung NACH dem gemeldeten Scheitel, aber vor der Entscheidung
    expect(evaluateStraightWalk(simulate(20, turn(90, 15, 16), HAND, 5), at(14), at(17)).straight).toBe(false);
  });

  it('mit Richtung des GPS-Winkels (T-215): nur eine Drehung in dieselbe Richtung hebt die Sperre auf', () => {
    // positive Drehrate = links
    const left = simulate(20, turn(90, 13.5, 14.5), HAND, 3);
    expect(evaluateStraightWalk(left, at(14), at(17), 'links').straight).toBe(false);
    expect(evaluateStraightWalk(left, at(14), at(17), 'rechts')).toMatchObject({ decided: true, straight: true });
    const right = simulate(20, turn(-90, 13.5, 14.5), POCKET, 3);
    expect(evaluateStraightWalk(right, at(14), at(17), 'rechts').straight).toBe(false);
    expect(evaluateStraightWalk(right, at(14), at(17), 'links')).toMatchObject({ decided: true, straight: true });
    // geradeaus bleibt geradeaus, egal welche Richtung das GPS behauptet
    const none = simulate(20, STRAIGHT, HAND, 3);
    for (const dir of ['links', 'rechts'] as const) expect(evaluateStraightWalk(none, at(14), at(17), dir).straight).toBe(true);
  });

  it('langsam gelaufener Bogen (60° über 6 s): gilt als Drehung', () => {
    expect(evaluateStraightWalk(simulate(20, turn(60, 9, 15), HAND, 7), at(14), at(17)).straight).toBe(false);
  });

  it('ohne Daten, mit Lücke oder nicht abgedecktem Rückblick: keine Aussage', () => {
    const samples = simulate(20, STRAIGHT, HAND, 2);
    expect(evaluateStraightWalk([], at(14), at(17)).decided).toBe(false);
    expect(evaluateStraightWalk(samples, null, at(17)).decided).toBe(false);
    // Lücke von 3 s mitten im Zeitraum
    const gap = samples.filter(s => s.t < at(10) || s.t > at(13));
    expect(evaluateStraightWalk(gap, at(14), at(17))).toMatchObject({ decided: false, reason: 'gap' });
    // Puffer beginnt erst nach dem Rückblick-Anfang
    const late = samples.filter(s => s.t > at(14 - STRAIGHT_VETO_LOOKBACK_S + 3));
    expect(evaluateStraightWalk(late, at(14), at(17))).toMatchObject({ decided: false, reason: 'not_covered' });
    // Sensor-Strom endet vor der Entscheidung
    const stale = samples.filter(s => s.t < at(15));
    expect(evaluateStraightWalk(stale, at(14), at(17))).toMatchObject({ decided: false, reason: 'not_covered' });
  });

  it('Scheitel zu alt für den Ringpuffer: keine Aussage', () => {
    const samples = simulate(40, STRAIGHT, HAND, 2);
    expect(evaluateStraightWalk(samples, at(14), at(14 + STRAIGHT_VETO_MAX_AGE_S + 1))).toMatchObject({ decided: false, reason: 'too_old' });
  });

  it('stiller Sensor-Strom ohne Schritte und ohne Gehbewegung beweist kein Geradeausgehen', () => {
    const silent: MotionWindowSample[] = Array.from({ length: 80 }, (_, i) => ({
      t: T0 + i * 250, headingDelta: 0, rotationMagnitude: 0, accelerationMagnitude: 0, stepDelta: 0, cadence: null, movementState: 'unknown' as never,
    }));
    expect(evaluateStraightWalk(silent, at(14), at(17))).toMatchObject({ decided: false, reason: 'no_locomotion' });
  });
});
