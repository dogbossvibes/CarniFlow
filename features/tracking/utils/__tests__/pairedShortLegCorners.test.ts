import fs from 'fs';
import path from 'path';
import { fuseTurns, nearestCompatibleTurnEvidence } from '../turnFusion';
import { computeTurnEvidence } from '../motionTurnEvidence';
import type { ShortLegPoint } from '../shortLegCornerDetection';
import * as shortLeg from '../shortLegCornerDetection';
const meters = 111320;
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/yam-relative-20261021.json'), 'utf8'));
function points(mirror = false): ShortLegPoint[] {
  return source.detectorPoints.map((p: {x:number;y:number;accuracy:number;cumDistM:number;tMs:number}) => ({
    lat:47+p.y/meters, lng:8+(mirror ? -p.x : p.x)/(meters*Math.cos(47*Math.PI/180)),
    accuracy:p.accuracy,cumDist:p.cumDistM,t:p.tMs,
  }));
}
it('recovers the human-confirmed lower L/R while preserving all existing turns', () => {
  const result = fuseTurns(points());
  expect(result.corners.map(c => [c.apexIndex,c.kind])).toEqual([
    [22,'links'],[31,'rechts'],[81,'spitz_links'],[99,'rechts'],[125,'spitz_rechts'],
  ]);
  expect(result.turns.filter(t=>t.flags.includes('paired_short_leg_rescue')).map(t=>t.apexIndex)).toEqual([22,31]);
  for (const i of [22,31]) {
    expect(result.diagnostics.find(d=>d.apexIndex===i)?.rejectReason).toBeNull();
    expect(result.diagnostics.find(d=>d.apexIndex===i)?.classification).not.toBeNull();
  }
});
it('does not invent the unresolved upper right corner', () => {
  expect(fuseTurns(points()).corners.some(c=>c.apexIndex>=113&&c.apexIndex<=117)).toBe(false);
});
it('requires both turns and respects the rescue opt-out', () => {
  expect(fuseTurns(points().slice(0,29)).turns.some(t=>t.flags.includes('paired_short_leg_rescue'))).toBe(false);
  expect(fuseTurns(points(),{splitApexRescue:false}).turns.some(t=>t.flags.includes('paired_short_leg_rescue'))).toBe(false);
});
it('mirrors direction without changing the accepted apexes', () => {
  expect(fuseTurns(points(true)).corners.map(c=>[c.apexIndex,c.kind])).toEqual([
    [22,'rechts'],[31,'links'],[81,'spitz_rechts'],[99,'links'],[125,'spitz_links'],
  ]);
});
it('preserves the historical start-wobble counterexample at every prefix', () => {
  const d=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/realFieldV21/r1-qa-03d970ff.json'),'utf8'));
  const ps=d.detectorPoints.map((p:{x:number;y:number;accuracy:number;cumDistM:number;tMs:number})=>({
    lat:47+p.y/meters,lng:8+p.x/(meters*Math.cos(47*Math.PI/180)),accuracy:p.accuracy,cumDist:p.cumDistM,t:p.tMs,
  }));
  for(let n=3;n<=ps.length;n++)expect(fuseTurns(ps.slice(0,n)).turns.some(t=>t.flags.includes('paired_short_leg_rescue'))).toBe(false);
});

it('does not rescue a pair when reliable Motion contradicts one of its directions', () => {
  const ev = { ...computeTurnEvidence([], 0), available:true, evidence:1, netYawDeg:80,
    signedNetYawDeg:80, grossYawDeg:80, monotonicity:1 };
  const result = fuseTurns(points(), { turnEvidenceAt: () => ev });
  expect(result.turns.some(t=>t.flags.includes('paired_short_leg_rescue'))).toBe(false);
});

it('removes both additions and restores diagnostics/count when final Motion allocation separates a pair', () => {
  // Synthetic compressed timing, not actual retained Yam Motion observations.
  const ps = points().map(p => ({ ...p, t: p.t! / 10 }));
  const leftCenter = ps[22].t! + 500, rightCenter = ps[31].t! - 500;
  const event = (center: number, sign: number) => ({ ...computeTurnEvidence([], center),
    available:true, evidence:0.8, signedNetYawDeg:sign*70, netYawDeg:70, grossYawDeg:70,
    monotonicity:1, yawShare:0.9, steps:3, locomotionSource:'steps' as const,
    movementState:'running' as const, sampleCount:20, windowStartMs:center-1000, windowEndMs:center+1000 });
  const left = event(leftCenter, 1), right = event(rightCenter, -1);
  const result = fuseTurns(ps, { turnEvidenceForDirection: (t, dir) => nearestCompatibleTurnEvidence(t, dir,
    at => at == null ? null : Math.abs(at-leftCenter)<0.01 ? left : Math.abs(at-rightCenter)<0.01 ? right : null) });
  expect(result.corners.map(c=>c.apexIndex)).toEqual([81,99,125]);
  expect(result.turns.some(t=>t.flags.includes('paired_short_leg_rescue'))).toBe(false);
  expect(result.rescued).toBe(2); // unchanged two original split-apex rescues
  for (const apexIndex of [22,31]) {
    expect(result.diagnostics.find(d=>d.apexIndex===apexIndex)?.classification).toBeNull();
    expect(result.diagnostics.find(d=>d.apexIndex===apexIndex)?.rejectReason).toBe('no_window_before');
  }
});

it.each([0, 1, 3, 1000])('avoids extra full-buffer scans when %i straight points cannot supply an interior pair', count => {
  const ps = Array.from({length:count}, (_,i) => ({lat:47+i*0.65/meters,lng:8,cumDist:i*0.65,accuracy:6,t:i*1000}));
  const scan = jest.spyOn(shortLeg, 'detectShortLegCorners');
  try {
    expect(fuseTurns(ps).corners).toEqual([]);
    expect(scan).toHaveBeenCalledTimes(1);
  } finally { scan.mockRestore(); }
});
it('still evaluates both geometric views for eligible Yam short-leg pairs', () => {
  const scan = jest.spyOn(shortLeg, 'detectShortLegCorners');
  try {
    expect(fuseTurns(points()).corners.map(c=>c.apexIndex)).toEqual([22,31,81,99,125]);
    expect(scan).toHaveBeenCalledTimes(3);
  } finally { scan.mockRestore(); }
});
