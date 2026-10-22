import { fuseTurns } from '../turnFusion';
import type { TurnEvidence } from '../motionTurnEvidence';
import type { ShortLegPoint } from '../shortLegCornerDetection';
import fs from 'fs';
import path from 'path';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';

// Synthetic north-to-east GPS corner with a single short diagonal apex gap.
// The regular one-apex detector has no clean pair; GPS split-apex rescue does.
function gpsCorner(mirror = false): ShortLegPoint[] {
  const xy: { x: number; y: number }[] = [];
  for (let i = 0; i <= 6; i++) xy.push({ x: 0, y: i * 0.75 });
  for (let i = 0; i <= 8; i++) xy.push({ x: 0.5 + i * 0.75, y: 5 });
  let distance = 0;
  return xy.map((p, i) => {
    if (i) distance += Math.hypot(p.x - xy[i - 1].x, p.y - xy[i - 1].y);
    return { lat: p.y / 111320, lng: (mirror ? -p.x : p.x) / 111320, accuracy: 2, cumDist: distance, t: i * 1000 };
  });
}

function motion(t: number, signedYaw: number, quality: number): TurnEvidence {
  return {
    available: true, evidence: quality, signedNetYawDeg: signedYaw, netYawDeg: Math.abs(signedYaw),
    grossYawDeg: Math.abs(signedYaw) / 0.7, monotonicity: 0.7, concentration: 1,
    peakYawRateDps: Math.abs(signedYaw), rotationDurationS: 1, yawShare: 0.7,
    totalRotationDeg: Math.abs(signedYaw) / 0.7, peakRotationRateRadS: 2,
    steps: quality === 0 ? 0 : 4, stepRate: quality === 0 ? 0 : 2, cadence: null,
    gaitAccelFraction: quality === 0 ? 0 : 1, gaitAccelThreshold: 0.1,
    locomotionSource: quality === 0 ? 'none' : 'steps', movementState: 'unknown', sampleCount: 8,
    windowStartMs: t - 1000, windowEndMs: t + 1000, windowDurationS: 2,
    gates: { netYaw: 0.6, monotonicity: 0.8, locomotion: quality === 0 ? 0 : 1, yawShare: 1 },
  };
}

const run = (points: ShortLegPoint[], quality: number | null, yaw = 35) => fuseTurns(points, quality == null ? {} : {
  turnEvidenceAt: t => t == null ? null : motion(t, yaw, quality),
  turnEvidenceForDirection: t => t == null ? null : motion(t, yaw, quality),
});

describe('Quality of opposing motion in GPS split-apex rescue', () => {
  it('does not veto independent GPS geometry with zero-quality opposing handset yaw', () => {
    const result = run(gpsCorner(), 0);
    expect(result.corners.map(c => c.kind)).toEqual(['rechts']);
    expect(result.turns[0]).toMatchObject({ source: 'gps_split_apex', direction: 'rechts' });
  });

  it.each([0.2, 0.49])('does not turn low-quality opposition (%s) into a reliable veto', quality => {
    expect(run(gpsCorner(), quality).corners.map(c => c.kind)).toEqual(['rechts']);
  });

  it.each([0.5, 1])('retains the existing veto for reliable opposite motion (%s)', quality => {
    expect(run(gpsCorner(), quality, 90).corners).toEqual([]);
  });

  it('remains symmetric for a left GPS corner and opposing right handset yaw', () => {
    expect(run(gpsCorner(true), 0, -35).corners.map(c => c.kind)).toEqual(['links']);
  });

  it('adds no confidence bonus when the handset evidence has zero quality', () => {
    const gpsOnly = run(gpsCorner(), null);
    const matchingWeak = run(gpsCorner(), 0, -35);
    const opposingWeak = run(gpsCorner(), 0, 35);
    expect(gpsOnly.turns).toHaveLength(1);
    expect(matchingWeak.turns[0].confidence).toBe(gpsOnly.turns[0].confidence);
    expect(opposingWeak.turns[0].confidence).toBe(gpsOnly.turns[0].confidence);
  });

  it('cannot create a GPS corner from reliable motion on a straight path', () => {
    const points = gpsCorner().map((p, i) => ({ ...p, lat: i / 111320, lng: 0, cumDist: i }));
    expect(run(points, 1, 90).corners).toEqual([]);
  });

  it('still requires reliable matching motion for the weaker two-segment episode', () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'fieldV61', 'V6.1-F1-02.json'), 'utf8'));
    const points = capturedDetectorBuffer(fixture.detectorPoints);
    const episodes = (quality: number | null) => run(points, quality, -85).turns
      .filter(t => t.flags.includes('turn_episode_pair'));
    expect(episodes(null)).toHaveLength(0);
    expect(episodes(0)).toHaveLength(0);
    expect(episodes(0.49)).toHaveLength(0);
    expect(episodes(0.5)).toHaveLength(1);
  });
});
