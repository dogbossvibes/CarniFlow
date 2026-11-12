import { canonicalReference,displayReference,parseFile,parseFileText,referenceFromMap,FILE_LIMIT } from '../contract';
import { reference,offer,returned } from './fixture';
it('round-trips gaps and special angle direction without notes, identities or search',()=>{const ref=reference();const map=displayReference(ref,'local','owner').map;expect(referenceFromMap(map,ref.date)).toEqual(ref);expect(map.lay[2].breakBefore).toBe(true);expect(map.markers[0].geometryDirection).toBe('rechts');expect(parseFileText(JSON.stringify(offer()))).toEqual(offer());});
it.each(['ownerId','dogId','run','audio','__proto__'])('rejects unrequested root field %s',key=>{const o=JSON.parse(JSON.stringify(offer()));Object.defineProperty(o,key,{value:'private',enumerable:true});expect(()=>parseFile(o)).toThrow('INVALID');});
it('rejects malformed, too large, discontinuous-only and unsupported versions',()=>{expect(()=>parseFileText('bad')).toThrow();expect(()=>parseFileText('x'.repeat(FILE_LIMIT+1))).toThrow('TOO_LARGE');const o=offer();o.reference.points[1].breakBefore=true;expect(()=>parseFile(o)).toThrow('INVALID');expect(()=>parseFile({...offer(),version:2})).toThrow('INVALID');});
it('rejects invalid coordinates, unknown marker types and duplicate IDs',()=>{const o=offer();o.reference.points[0].lat=91;expect(()=>parseFile(o)).toThrow();const m=offer();m.reference.markers.push(m.reference.markers[0]);expect(()=>parseFile(m)).toThrow();});
it('normalizes input key order into a stable reference digest input',()=>{const r=reference();expect(canonicalReference({...r,date:r.date,points:r.points.map(p=>({breakBefore:p.breakBefore,lng:p.lng,lat:p.lat}))})).toBe(canonicalReference(r));});
it('accepts finished return only for its task and rejects gap-only/duplicate time/unbounded accuracy',()=>{expect(parseFile(returned())).toEqual(returned());for(const edit of [(r:ReturnType<typeof returned>)=>{r.contribution.parentSessionId='00000000-0000-4000-8000-000000000000';},(r:ReturnType<typeof returned>)=>{r.contribution.finishedAtMs=null;},(r:ReturnType<typeof returned>)=>{r.contribution.points[1].breakBefore=true;},(r:ReturnType<typeof returned>)=>{r.contribution.points[1].t=1000;}]){const r=returned();edit(r);expect(()=>parseFile(r)).toThrow();}});

it('round-trips ball and rubber without losing any marker and numbers only scored objects', () => {
 const o=offer();o.reference.markers=(['duebel','ball','gummi'] as const).map((material,i)=>({id:`m${i}`,type:'gegenstand' as const,lat:47,lng:8,angleKind:null,material,distanceFromStart:i,geometryDirection:null,geometrySharpness:null}));
 const result=parseFileText(JSON.stringify(o));expect(result).toEqual(o);
 const map=displayReference(o.reference,'local','owner').map;
 expect(referenceFromMap(map,o.reference.date)).toEqual(o.reference);
 expect(map.markers.map(m=>m.objectIndex)).toEqual([null,null,1]);
});
