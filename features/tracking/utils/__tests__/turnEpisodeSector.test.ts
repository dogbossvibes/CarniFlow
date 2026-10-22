import { fuseTurns } from '../turnFusion';
import type { ShortLegPoint } from '../shortLegCornerDetection';
import type { TurnEvidence } from '../motionTurnEvidence';

// Synthetic geometry: north -> two short, forward moving transition segments
// -> east. Segment bearings may wobble while remaining inside the turn sector.
// No customer coordinates, timestamps, captured samples or identifiers.
function route(headings = [60, 35], stepM = 0.8, before = 6, after = 7, finalHeading = 90): ShortLegPoint[] {
  const xy: { x: number; y: number; distance: number }[] = [{ x: 0, y: 0, distance: 0 }];
  const step = (heading: number, length: number) => {
    const last = xy[xy.length - 1], angle = heading * Math.PI / 180;
    xy.push({ x: last.x + length * Math.sin(angle), y: last.y + length * Math.cos(angle), distance: last.distance + length });
  };
  for (let i = 0; i < before; i++) step(0, 1);
  for (const heading of headings) step(heading, stepM);
  for (let i = 0; i < after; i++) step(finalHeading, 1);
  return xy.map((p, i) => ({ lat: p.y / 111320, lng: p.x / 111320, cumDist: p.distance, t: i * 1000, accuracy: 5 }));
}

function evidence(t: number, yaw: number): TurnEvidence {
  return {
    available: true, evidence: 1, signedNetYawDeg: yaw, netYawDeg: Math.abs(yaw), grossYawDeg: Math.abs(yaw),
    monotonicity: 1, concentration: 1, peakYawRateDps: 90, rotationDurationS: 1,
    yawShare: 1, totalRotationDeg: Math.abs(yaw), peakRotationRateRadS: 2,
    steps: 4, stepRate: 2, cadence: 120, gaitAccelFraction: 1, gaitAccelThreshold: 0.1,
    locomotionSource: 'steps', movementState: 'walking', sampleCount: 8,
    windowStartMs: t - 1000, windowEndMs: t + 1000, windowDurationS: 2,
    gates: { netYaw: 1, monotonicity: 1, locomotion: 1, yawShare: 1 },
  };
}
const run = (points: ShortLegPoint[], yaw: number | null) => fuseTurns(points, yaw == null ? {} : {
  turnEvidenceAt: t => t == null ? null : evidence(t, yaw),
  turnEvidenceForDirection: t => t == null ? null : evidence(t, yaw),
});
const episodes = (result: ReturnType<typeof run>) => result.turns.filter(t => t.flags.includes('turn_episode_pair'));

describe('Two-segment GPS episode with directional motion confirmation', () => {
  it('recognizes a right corner when transition bearings wobble inside the turn sector', () => {
    const result = run(route(), -90);
    expect(result.corners.map(c => c.kind)).toEqual(['rechts']);
    expect(episodes(result)).toHaveLength(1);
    expect(episodes(result)[0]).toMatchObject({ direction: 'rechts', source: 'gps_split_apex' });
  });

  it('recognizes the mirrored left corner with the same spatial and evidence limits', () => {
    const result = run(route().map(p => ({ ...p, lng: -p.lng })), 90);
    expect(result.corners.map(c => c.kind)).toEqual(['links']);
    expect(episodes(result)).toHaveLength(1);
  });

  it('requires independent motion agreement for the weaker episode pairing', () => {
    expect(run(route(), null).corners).toEqual([]);
    expect(run(route(), 90).corners).toEqual([]);
  });

  it('does not create a GPS corner from a handset turn during a straight walk', () => {
    expect(run(route([0, 0], 0.8, 6, 7, 0), -90).corners).toEqual([]);
  });

  it('retains the existing 2.5 metre episode bound', () => {
    expect(episodes(run(route([60, 35], 1.4), -90))).toHaveLength(0);
  });

  it.each([[135, 35], [-40, 35]])('rejects a transition outside the turn sector: %j', (...headings) => {
    expect(episodes(run(route(headings), -90))).toHaveLength(0);
  });

  it('rejects a large reversal even when both segments remain inside the turn sector', () => {
    expect(episodes(run(route([85, 10]), -90))).toHaveLength(0);
  });

  it('bounds relative bearing wobble by the existing two-segment spread tolerance', () => {
    expect(episodes(run(route([65, 30]), -90))).toHaveLength(1);
    expect(episodes(run(route([67, 30]), -90))).toHaveLength(0);
  });

  it('requires measured incoming and outgoing GPS legs', () => {
    expect(run(route([60, 35], 0.8, 1), -90).corners).toEqual([]);
    expect(run(route([60, 35], 0.8, 6, 1), -90).corners).toEqual([]);
  });
});
