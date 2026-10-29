import { auditPrimaryCornerWindows } from '../cornerWindowAudit';
import { legWindows, SCALES_M, type ShortLegPoint } from '../shortLegCornerDetection';
const points = (xy: number[][]): ShortLegPoint[] => xy.map(([x,y],i)=>({lat:y/111320,lng:x/111320,t:i*1000,accuracy:3,cumDist:i}));
it('explains missing length without claiming absent IMU',()=>{
  const p=points([[0,0],[0,1]]);
  expect(auditPrimaryCornerWindows(p,0,false).every(w=>w.outcome==='too_short')).toBe(true);
});
it('distinguishes insufficient samples from length',()=>{
 const p=points([[0,0],[0,3]]);p[1].cumDist=3;
 expect(auditPrimaryCornerWindows(p,0,true).find(w=>w.scaleM===3.5)?.outcome).toBe('too_few_samples');
});
it('reports directional spread using unchanged detector geometry',()=>{
 const p=points([[0,0],[0,1],[1,1],[1,2],[2,2],[2,3]]);
 expect(auditPrimaryCornerWindows(p,0,true).some(w=>w.outcome==='direction_spread'&&w.spreadDeg!>w.spreadLimitDeg)).toBe(true);
});
it('valid audited windows match the primary detector on every prefix and both sides',()=>{
 const p=points([[0,0],[0,1],[0,2],[0,3],[1,3],[2,3],[2,4],[2,5],[2,6],[3,6]]);
 const original=JSON.stringify(p);
 for(let n=1;n<=p.length;n++)for(let i=0;i<n;i++)for(const forward of [false,true]){
  const prefix=p.slice(0,n),audit=auditPrimaryCornerWindows(prefix,i,forward);
  const valid=[...new Set(audit.filter(w=>w.outcome==='valid').map(w=>w.endIndex))];
  expect(valid).toEqual(legWindows(prefix,i,forward).map(w=>w.endIndex));
  expect(audit.length).toBeLessThanOrEqual(SCALES_M.length);
  expect(JSON.stringify(audit)).not.toMatch(/latitude|longitude|"lat"|"lng"/);
 }
 expect(JSON.stringify(p)).toBe(original);
});
it.each([-1,100,NaN,1.5])('rejects invalid apex %s',i=>expect(auditPrimaryCornerWindows(points([[0,0]]),i,true)).toEqual([]));
