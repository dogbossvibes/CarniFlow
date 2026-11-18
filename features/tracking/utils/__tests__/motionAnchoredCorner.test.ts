// T-215: sensorverankerter Winkel — der Sensor liefert den Zeitpunkt, das GPS muss die Drehung bestätigen.
import { detectMotionTurnEpisodes, evaluateMotionAnchoredCorner, type MotionTurnEpisode } from '../motionAnchoredCorner';
import type { MotionWindowSample } from '../motionTurnEvidence';
import type { ShortLegPoint } from '../shortLegCornerDetection';
import { HAND, POCKET, T0, WALK, ZERO, box, simulate, type Program } from './helpers/motionScenarioSim';

const LAT0 = 47.3, M_LAT = 111320, M_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
/** Gegangener Weg mit 1 m/s und 1 Punkt je Meter; Abschnitte = [Kurs in Grad, Länge in m]. */
function path(sections: readonly (readonly [number, number])[], noise: (i: number) => [number, number] = () => [0, 0]): ShortLegPoint[] {
  const points: ShortLegPoint[] = [];
  let x = 0, y = 0, cum = 0;
  const push = () => { const [nx, ny] = noise(points.length); points.push({ lat: LAT0 + (y + ny) / M_LAT, lng: 8.5 + (x + nx) / M_LNG, cumDist: cum, accuracy: 6, t: T0 + points.length * 1000 }); };
  push();
  for (const [courseDeg, lengthM] of sections) {
    const r = (courseDeg * Math.PI) / 180;
    for (let i = 0; i < lengthM; i++) { x += Math.sin(r); y += Math.cos(r); cum += 1; push(); }
  }
  return points;
}
/** Körperdrehung um `deg` (positiv = links) in der Sekunde um `atS`. */
const turn = (deg: number, atS: number, stepRate: Program['stepRate'] = WALK): Program => ({
  yawRateDps: t => box(t, atS - 0.5, atS + 0.5, deg), offAxisRadS: ZERO, stepRate,
});
const STRAIGHT: Program = { yawRateDps: ZERO, offAxisRadS: ZERO, stepRate: WALK };
const episodeAt = (s: number, yawDeg: number): MotionTurnEpisode => ({ tMs: T0 + s * 1000, yawDeg, direction: yawDeg > 0 ? 'links' : 'rechts' });

describe('Dreh-Episoden im Bewegungssensor (T-215)', () => {
  it('Körperdrehung beim Gehen: genau eine Episode mit Richtung und Zeitpunkt', () => {
    for (const [deg, dir] of [[90, 'links'], [-90, 'rechts'], [135, 'links'], [-75, 'rechts']] as const) for (const carry of [HAND, POCKET]) {
      const eps = detectMotionTurnEpisodes(simulate(20, turn(deg, 10), carry, 4));
      expect(eps).toHaveLength(1);
      expect(eps[0].direction).toBe(dir);
      expect(Math.abs(eps[0].tMs - (T0 + 10_000))).toBeLessThanOrEqual(1000);
      expect(Math.abs(eps[0].yawDeg)).toBeGreaterThan(Math.abs(deg) * 0.7);
    }
  });

  it('geradeaus gehen (auch mit Taschen-Wackeln) und flacher 30°-Knick: keine Episode', () => {
    for (const carry of [HAND, POCKET]) for (let seed = 1; seed <= 10; seed++) {
      expect(detectMotionTurnEpisodes(simulate(20, STRAIGHT, carry, seed))).toHaveLength(0);
      expect(detectMotionTurnEpisodes(simulate(20, turn(30, 10), carry, seed))).toHaveLength(0);
    }
  });

  it('Drehung im Stand ohne Schritte und ohne Gehbewegung: keine Episode', () => {
    const still: MotionWindowSample[] = Array.from({ length: 80 }, (_, i) => ({
      t: T0 + i * 250, headingDelta: i >= 40 && i < 44 ? 22.5 : 0, rotationMagnitude: 0.1, accelerationMagnitude: 0.01, stepDelta: 0, cadence: null, movementState: 'unknown' as never,
    }));
    expect(detectMotionTurnEpisodes(still)).toHaveLength(0);
  });

  it('zwei Winkel im Abstand von 8 s: zwei Episoden', () => {
    const two: Program = { yawRateDps: t => box(t, 5.5, 6.5, 90) + box(t, 13.5, 14.5, -90), offAxisRadS: ZERO, stepRate: WALK };
    const eps = detectMotionTurnEpisodes(simulate(20, two, HAND, 9));
    expect(eps.map(e => e.direction)).toEqual(['links', 'rechts']);
  });
});

describe('GPS-Bestätigung der Dreh-Episode (T-215)', () => {
  it('rechter Winkel und Spitzwinkel mit passender Episode: Treffer am Scheitel', () => {
    const right = evaluateMotionAnchoredCorner(path([[0, 30], [90, 30]]), episodeAt(30, -90));
    expect(right).toMatchObject({ status: 'hit', hit: { direction: 'rechts' } });
    if (right.status === 'hit') expect(Math.abs(right.hit.atM - 30)).toBeLessThanOrEqual(1);
    expect(evaluateMotionAnchoredCorner(path([[0, 30], [-135, 30]]), episodeAt(30, 120))).toMatchObject({ status: 'hit', hit: { direction: 'links' } });
  });

  it('verrauschte Spur (±3 m quer), in der der Regelpfad keinen Winkel sieht: Treffer', () => {
    const wobble = (i: number): [number, number] => [3 * Math.sin(i * 1.9), 3 * Math.cos(i * 2.3)];
    expect(evaluateMotionAnchoredCorner(path([[0, 30], [90, 30]], wobble), episodeAt(30, -90)).status).toBe('hit');
  });

  it('Handy im Gehen gedreht, GPS-Spur gerade: kein Winkel', () => {
    expect(evaluateMotionAnchoredCorner(path([[0, 60]]), episodeAt(30, -90))).toEqual({ status: 'rejected', reason: 'gps_turn_small' });
    expect(evaluateMotionAnchoredCorner(path([[0, 30], [25, 30]]), episodeAt(30, -90))).toEqual({ status: 'rejected', reason: 'gps_turn_small' });
  });

  it('Sensor und GPS widersprechen sich in der Richtung: kein Winkel', () => {
    expect(evaluateMotionAnchoredCorner(path([[0, 30], [90, 30]]), episodeAt(30, 90))).toEqual({ status: 'rejected', reason: 'direction_conflict' });
  });

  it('GPS-Drehung weit neben dem Sensor-Drehwinkel: kein Winkel', () => {
    expect(evaluateMotionAnchoredCorner(path([[0, 30], [150, 30]]), episodeAt(30, -50))).toEqual({ status: 'rejected', reason: 'yaw_mismatch' });
  });

  it('noch zu wenig Weg hinter dem Scheitel: warten; zu wenig davor: abgelehnt', () => {
    expect(evaluateMotionAnchoredCorner(path([[0, 30], [90, 8]]), episodeAt(30, -90))).toEqual({ status: 'wait' });
    expect(evaluateMotionAnchoredCorner(path([[0, 30]]), episodeAt(33, -90))).toEqual({ status: 'wait' });
    expect(evaluateMotionAnchoredCorner(path([[0, 6], [90, 30]]), episodeAt(6, -90))).toEqual({ status: 'rejected', reason: 'short_before' });
  });

  it('kein Detektorpunkt in der Nähe der Episode (GPS-Lücke): kein Winkel', () => {
    const points = path([[0, 30], [90, 30]]).filter(p => Math.abs((p.t ?? 0) - (T0 + 30_000)) > 6000);
    expect(evaluateMotionAnchoredCorner(points, episodeAt(30, -90))).toEqual({ status: 'rejected', reason: 'no_apex' });
  });
});
