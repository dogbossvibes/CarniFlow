import fs from 'fs';
import { fuseTurns } from '../turnFusion';
import { detectShortLegCorners, type ShortLegPoint } from '../shortLegCornerDetection';
function points(build: 49 | 55): ShortLegPoint[] {
  const fixture = JSON.parse(fs.readFileSync(`features/tracking/utils/__tests__/fixtures/field-20261026-build${build}.json`, 'utf8'));
  return fixture.detectorPoints.map((p: {x:number;y:number;accuracy:number;tMs:number;cumDistM:number}) => ({
    lat:47+p.y/111320,lng:8+p.x/(111320*Math.cos(47*Math.PI/180)),accuracy:p.accuracy,t:p.tMs,cumDist:p.cumDistM,
  }));
}
it('reproduces the unresolved Build55 left acute turn without fabricated Motion', () => {
  const result = fuseTurns(points(55));
  expect(result.corners.map(c=>c.kind)).toEqual(['links','rechts','spitz_rechts']);
  expect(result.diagnostics.find(d=>d.apexIndex===17)?.rejectReason).toBe('no_window_after');
  expect(result.diagnostics.find(d=>d.apexIndex===18)?.rejectReason).toBe('no_window_before');
});
it('retains the left acute turn in the separate Build49 GPS measurement', () => {
  expect(fuseTurns(points(49)).corners.some(c=>c.apexIndex===14&&c.kind==='spitz_links')).toBe(true);
});
it('records why a global spatial-heading change is not a safe release fix', () => {
  const ps=points(55);
  expect(detectShortLegCorners(ps,null,undefined,undefined,0.75).corners.some(c=>c.kind==='spitz_rechts'&&c.apexIndex===16)).toBe(true);
  expect(detectShortLegCorners(ps,null,undefined,undefined,1.5).corners.filter(c=>c.kind==='spitz_links')).toHaveLength(2);
});
