import fs from 'fs';
import { createLocalDirectionState, confirmLocalDirections } from '../localDirectionConfirmation';
import { fuseTurns, appendLocalDirectionTurns } from '../turnFusion';
import type { ShortLegPoint } from '../shortLegCornerDetection';
function field(build: number): ShortLegPoint[] {
  const q = JSON.parse(fs.readFileSync(`features/tracking/utils/__tests__/fixtures/field-20261026-build${build}.json`, 'utf8'));
  return q.detectorPoints.map((p: { x: number; y: number; accuracy: number; tMs: number; cumDistM: number }) => ({
    lat: 47 + p.y / 111320, lng: 8 + p.x / (111320 * Math.cos(47 * Math.PI / 180)), t: p.tMs, accuracy: p.accuracy, cumDist: p.cumDistM,
  }));
}
function replay(points: ShortLegPoint[]) {
  const state = createLocalDirectionState();
  const accepted = new Map<number, string>();
  for (let n = 3; n <= points.length; n++) {
    const result = fuseTurns(points.slice(0, n), { localDirectionState: state });
    for (const turn of result.turns) accepted.set(turn.apexIndex, turn.kind);
  }
  return { state, accepted, result: fuseTurns(points, { localDirectionState: state }) };
}
it('recovers only SL with new measured support; original input and baseline remain unchanged', () => {
  const points = field(55), before = JSON.stringify(points);
  expect(fuseTurns(points).corners.map(c => c.kind)).toEqual(['links', 'rechts', 'spitz_rechts']);
  const r = replay(points);
  expect(r.result.corners.map(c => c.kind)).toEqual(['links', 'rechts', 'spitz_links', 'spitz_rechts']);
  expect(r.result.turns.filter(t => t.flags.includes('local_direction_confirmed'))).toHaveLength(1);
  expect(r.state.confirmed.size).toBe(1);
  expect(JSON.stringify(points)).toBe(before);
});
it('preserves the separate Build49 recording', () => {
  const points = field(49);
  expect(replay(points).result.corners).toEqual(fuseTurns(points).corners);
});
it('repeated calls on unchanged geometry never confirm a pending corner', () => {
  const points = field(55), state = createLocalDirectionState();
  for (let n = 3; n <= 23; n++) fuseTurns(points.slice(0, n), { localDirectionState: state });
  expect(state.pending.size).toBeGreaterThan(0);
  for (let n = 0; n < 30; n++) fuseTurns(points.slice(0, 23), { localDirectionState: state });
  expect(state.confirmed.size).toBe(0);
});
it.each([null, 0, NaN, Infinity])('rejects unverifiable accuracy %s', accuracy => {
  expect(replay(field(55).map(p => ({ ...p, accuracy }))).state.confirmed.size).toBe(0);
});
it.each([18, 20, 23])('cannot confirm across reset at %s', split => {
  const points = field(55);
  expect(replay(points.slice(0, split)).state.confirmed.size).toBe(0);
  expect(replay(points.slice(split)).state.confirmed.size).toBe(0);
});
it('preserves all other available detector-field fixtures', () => {
  const root = 'features/tracking/utils/__tests__/fixtures';
  function visit(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { visit(name); continue; }
      if (!name.endsWith('.json') || name.endsWith('field-20261026-build55.json')) continue;
      const q = JSON.parse(fs.readFileSync(name, 'utf8'));
      if (!Array.isArray(q.detectorPoints) || !q.detectorPoints.length) continue;
      const points: ShortLegPoint[] = q.detectorPoints.map((p: { x: number; y: number; accuracy: number; tMs: number; cumDistM: number }) => ({
        lat: 47 + p.y / 111320, lng: 8 + p.x / (111320 * Math.cos(47 * Math.PI / 180)), t: p.tMs, accuracy: p.accuracy, cumDist: p.cumDistM,
      }));
      if (points.some(p => ![p.lat, p.lng, p.t, p.cumDist].every(Number.isFinite))) continue;
      expect({ name, confirmed: replay(points).state.confirmed.size }).toEqual({ name, confirmed: 0 });
    }
  }
  visit(root);
}, 120000);

it('a contradictory reliable Motion direction blocks the extra GPS candidate', () => {
  const points = field(55), state = createLocalDirectionState();
  const motion = {
    available: true, evidence: 1, signedNetYawDeg: -90,
  } as import('../motionTurnEvidence').TurnEvidence;
  // motionTurnDirection convention: positive device yaw is left.
  for (let n = 3; n <= points.length; n++) {
    const prefix = points.slice(0, n), base = fuseTurns(prefix);
    confirmLocalDirections(state, prefix, base.diagnostics, base.corners, () => motion);
  }
  expect(state.confirmed.size).toBe(0);
});

it('does not report Motion matching the extra GPS corner as IMU-only', () => {
  const points = field(55), { state } = replay(points), base = fuseTurns(points);
  const matching = { t: points[18].t!, direction: 'links' as const, signedNetYawDeg: 90, evidence: 1,
    persisted: false as const, reason: 'imu_only_no_gps_corner' as const };
  const unmatched = { ...matching, t: points.at(-1)!.t! + 60000 };
  base.imuOnly = [matching, unmatched];
  expect(appendLocalDirectionTurns(points, base, state).imuOnly).toEqual([unmatched]);
});
