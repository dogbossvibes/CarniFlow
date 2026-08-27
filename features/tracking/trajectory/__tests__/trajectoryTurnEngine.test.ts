import {
  analyzeTrajectory,
  TrajectoryTurnEngine,
  type MotionObservation,
  type TrajectoryTurnEvent,
} from '@/features/tracking/trajectory/trajectoryTurnEngine';
import { detectAutoCorner } from '@/features/tracking/utils/autoCornerDetection';

type XY = { x: number; y: number };

const ORIGIN = { lat: 47, lng: 8 };

function toObservation(p: XY, i: number, accuracy = 3, speed = 0.8): MotionObservation {
  return {
    t: i * 1000,
    lat: ORIGIN.lat + p.y / 110_540,
    lng: ORIGIN.lng + p.x / (111_320 * Math.cos(ORIGIN.lat * Math.PI / 180)),
    accuracy,
    speed,
  };
}

function trajectory(headings: number[], accuracy = 3, speed = 0.8): MotionObservation[] {
  const points: XY[] = [{ x: 0, y: 0 }];
  let current = { x: 0, y: 0 };
  for (const heading of headings) {
    const r = heading * Math.PI / 180;
    current = { x: current.x + Math.sin(r), y: current.y + Math.cos(r) };
    points.push(current);
  }
  return points.map((p, i) => toObservation(p, i, accuracy, speed));
}

function interpolatedTurn(turnDeg: number, turnLength = 4): MotionObservation[] {
  const headings = [
    ...Array.from({ length: 15 }, () => 0),
    ...Array.from({ length: turnLength }, (_, i) => turnDeg * (i + 1) / turnLength),
    ...Array.from({ length: 15 }, () => turnDeg),
  ];
  return trajectory(headings);
}

function noisy(source: readonly MotionObservation[], noise: readonly number[], accuracy = 7): MotionObservation[] {
  return source.map((o, i) => ({
    ...o,
    lat: o.lat + (noise[i % noise.length] ?? 0) / 110_540,
    lng: o.lng + (noise[(i + 2) % noise.length] ?? 0) / (111_320 * Math.cos(ORIGIN.lat * Math.PI / 180)),
    accuracy,
  }));
}

function straightWithDrift(): MotionObservation[] {
  return noisy(trajectory(Array.from({ length: 38 }, () => 0)), [0, 1, -1, 2, -2, 1], 6);
}

function sCurve(): MotionObservation[] {
  return trajectory([
    ...Array.from({ length: 14 }, () => 0),
    25, 50, 70, 45, 20, 0, -25, -50, -70, -45, -20, 0,
    ...Array.from({ length: 16 }, () => 0),
  ]);
}

function naturalArc(): MotionObservation[] {
  return trajectory([
    ...Array.from({ length: 10 }, () => 0),
    ...Array.from({ length: 24 }, (_, i) => 70 * (i + 1) / 24),
    ...Array.from({ length: 10 }, () => 70),
  ]);
}

function reverseMovement(): MotionObservation[] {
  return trajectory([...Array.from({ length: 16 }, () => 0), ...Array.from({ length: 16 }, () => 180)]);
}

function eventFor(points: readonly MotionObservation[]): TrajectoryTurnEvent | null {
  return analyzeTrajectory(points).events[0] ?? null;
}

function productionPoints(points: readonly MotionObservation[]) {
  let cumDist = 0;
  return points.map((point, index) => {
    if (index > 0) {
      const previous = points[index - 1];
      const dx = (point.lng - previous.lng) * 111_320 * Math.cos(ORIGIN.lat * Math.PI / 180);
      const dy = (point.lat - previous.lat) * 110_540;
      cumDist += Math.hypot(dx, dy);
    }
    return { lat: point.lat, lng: point.lng, cumDist, accuracy: point.accuracy ?? null, t: point.t };
  });
}

describe('trajectoryTurnEngine shadow state machine', () => {
  it.each([
    ['90 right', 90, 'right'],
    ['90 left', -90, 'left'],
    ['spitz right', 45, 'right'],
    ['spitz left', -45, 'left'],
    ['shallow right', 55, 'right'],
    ['shallow left', -55, 'left'],
    ['stumpfer 125-degree interior right', 55, 'right'],
  ])('%s is confirmed from a persistent new direction', (_name, turn, side) => {
    const event = eventFor(interpolatedTurn(turn));
    expect(event).not.toBeNull();
    expect(event?.side).toBe(side);
    expect(event?.turnMagnitudeDeg).toBeGreaterThan(Math.abs(turn) - 12);
    expect(event?.evidence.directionPersistence).toBeGreaterThan(0.55);
    expect(event?.confirmationDistanceM).toBeGreaterThanOrEqual(8);
  });

  it('survives 6-9 m accuracy and a noisy apex without becoming binary', () => {
    const clean = eventFor(interpolatedTurn(55));
    const noisyEvent = eventFor(noisy(interpolatedTurn(55), [2, -3, 1, -2, 3, -1], 8));
    expect(clean).not.toBeNull();
    expect(noisyEvent).not.toBeNull();
    expect(noisyEvent?.side).toBe('right');
    expect(noisyEvent?.evidence.gpsQuality).toBeLessThan(clean?.evidence.gpsQuality ?? 1);
    expect(noisyEvent?.confidence).toBeGreaterThan(0.45);
  });

  it('tolerates a 3-10 second stop around the apex', () => {
    const source = interpolatedTurn(90);
    const stop = source.slice(15, 20).map((o, i) => ({ ...o, t: o.t + i * 1500, speed: 0.02 }));
    const event = eventFor([...source.slice(0, 15), ...stop, ...source.slice(16)]);
    expect(event?.side).toBe('right');
  });

  it.each([0.2, 0.4, 0.8, 1.2])('does not reject slow walking at %sm/s', (speed) => {
    expect(eventFor(interpolatedTurn(90).map((o) => ({ ...o, speed })))).not.toBeNull();
  });

  it('keeps a retrospective apex near the concentrated turn, not at confirmation', () => {
    const event = eventFor(interpolatedTurn(90));
    expect(event).not.toBeNull();
    expect(event!.apexIndex).toBeLessThan(24);
    expect(event!.confirmationDistanceM).toBeGreaterThan(event!.turnMagnitudeDeg / 20);
  });

  it('exposes state progression without producing a marker or side effect', () => {
    const analysis = analyzeTrajectory(interpolatedTurn(90));
    expect(analysis.states).toContain('TURN_ENTER');
    expect(analysis.states).toContain('TURNING');
    expect(analysis.states).toContain('NEW_DIRECTION');
    expect(analysis.states).toContain('CONFIRMED');
  });

  it('confirms retrospectively in streaming mode only after the outgoing leg exists', () => {
    const engine = new TrajectoryTurnEngine();
    let confirmation: { state: string; event: TrajectoryTurnEvent | null } | null = null;
    for (const observation of interpolatedTurn(90)) {
      const result = engine.push(observation);
      if (result.event) confirmation = result;
    }
    expect(confirmation?.state).toBe('CONFIRMED');
    expect(confirmation?.event).not.toBeNull();
    expect(confirmation?.event?.confirmationDistanceM).toBeGreaterThanOrEqual(8);
  });
});

describe('trajectoryTurnEngine negative matrix', () => {
  const negatives: [string, MotionObservation[]][] = [
    ['straight drift', straightWithDrift()],
    ['single spike', noisy(trajectory(Array.from({ length: 35 }, () => 0)), [0, 0, 0, 18, 0, 0], 7)],
    ['zigzag', trajectory([...Array.from({ length: 12 }, () => 0), 35, -35, 35, -35, 35, -35, ...Array.from({ length: 15 }, () => 0)])],
    ['stop without turn', trajectory(Array.from({ length: 35 }, () => 0), 5, 0.01)],
    ['natural arc', naturalArc()],
    ['quarter circle', naturalArc()],
    ['S curve', sCurve()],
    ['snake', trajectory([...Array.from({ length: 10 }, () => 0), 30, -30, 30, -30, 30, -30, 30, -30, ...Array.from({ length: 18 }, () => 0)])],
    ['reverse movement', reverseMovement()],
    ['crossing without turn', trajectory([...Array.from({ length: 15 }, () => 0), ...Array.from({ length: 15 }, () => 180)])],
    ['parallel track', trajectory([...Array.from({ length: 16 }, () => 0), ...Array.from({ length: 16 }, () => 0)])],
  ];

  it.each(negatives)('%s produces no isolated confirmed turn', (_name, points) => {
    expect(analyzeTrajectory(points).events).toHaveLength(0);
  });
});

describe('trajectoryTurnEngine metrics', () => {
  it('reports matrix-level recall and false positives', () => {
    const positives = [90, -90, 45, -45, 55, -55].map((turn) => eventFor(interpolatedTurn(turn)));
    const negatives = [straightWithDrift(), naturalArc(), sCurve(), reverseMovement()];
    const recall = positives.filter(Boolean).length / positives.length;
    const falsePositiveRate = negatives.filter((points) => eventFor(points)).length / negatives.length;
    expect(recall).toBeGreaterThanOrEqual(0.83);
    expect(falsePositiveRate).toBe(0);
  });

  it('shows the intended Phase-1 gain on the 125-degree interior-angle field case', () => {
    const fixture = interpolatedTurn(55);
    const production = detectAutoCorner(productionPoints(fixture), -1);
    const shadow = eventFor(fixture);
    expect(production).toBeNull();
    expect(shadow).not.toBeNull();
    expect(shadow?.turnMagnitudeDeg).toBeGreaterThan(43);
    expect(shadow?.confirmationDistanceM).toBeGreaterThanOrEqual(8);
  });

  it('prints the clean fixture comparison used for the Phase-1 report', () => {
    const turns = [90, -90, 45, -45, 55, -55];
    const rows = turns.map((turn) => {
      const fixture = interpolatedTurn(turn);
      const production = detectAutoCorner(productionPoints(fixture), -1);
      const shadow = eventFor(fixture);
      return { turn, production: production != null, shadow: shadow != null, magnitude: shadow?.turnMagnitudeDeg ?? null };
    });
    expect(rows.filter((row) => row.production)).toHaveLength(2);
    expect(rows.every((row) => row.shadow)).toBe(true);
  });
});
