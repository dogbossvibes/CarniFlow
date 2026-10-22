import { buildTrackDetailDisplay } from '../trackDetailDisplay';
import { buildTrackDetailMap } from '../trackDetailMap';
const line = Array.from({length:4},(_,i)=>({lat:i/100000,lng:0,t:i}));
const saved = () => ({id:'s',owner_id:'u',dog_id:'d',distance_meters:83,score:92,
 points:line.map(p=>({latitude:p.lat,longitude:p.lng,timestamp:new Date(p.t*1000).toISOString(),point_type:'lay'})),
 markers:[],runs:[{id:'r',ended_at:'2026-10-22',run_points:line}],
 track_data:{run:{run_id:'r',ended_at:'2026-10-22',run_points:line,replay_points:line}}});
const copy = <T,>(v:T):T=>JSON.parse(JSON.stringify(v));
it('extends a partial persisted lay prefix without changing input, score, distance or markers',()=>{
 const local=saved(),remote={...saved(),points:saved().points.slice(0,1)},before=copy({local,remote});
 const result=buildTrackDetailDisplay(remote,local,'u');
 expect(result.lay).toHaveLength(4);expect(result.start).toEqual(result.lay[0]);expect(result.end).toEqual(result.lay[3]);
 expect(result.totalDistanceM).toBe(83);expect(result.markers).toEqual(buildTrackDetailMap(remote).markers);
 expect({local,remote}).toEqual(before);
});
it.each([undefined,null,'other'])('no local supplementation for user %s',user=>{
 const remote={...saved(),points:[]};expect(buildTrackDetailDisplay(remote,saved(),user).lay).toEqual([]);
});
it.each(['id','owner_id','dog_id'] as const)('rejects a mismatching local %s',key=>{
 const remote={...saved(),points:[]};expect(buildTrackDetailDisplay(remote,{...saved(),[key]:'other'},'u').lay).toEqual([]);
});
it('does not merge a local lay with a divergent remote route',()=>{
 const remote=saved();remote.points[0].latitude=9;expect(buildTrackDetailDisplay(remote,saved(),'u').lay).toEqual(buildTrackDetailMap(remote).lay);
});
it('accepts only longer prefixes, preserving complete or newer remote geometry',()=>{
 const remote=saved(),local=saved();local.points=local.points.slice(0,2);
 expect(buildTrackDetailDisplay(remote,local,'u')).toEqual(buildTrackDetailMap(remote));
});
it('retains a remote gap even if the device prefix would remove it',()=>{
 const remote=saved();remote.points=remote.points.slice(0,2);Object.assign(remote.points[1],{breakBefore:true});
 expect(buildTrackDetailDisplay(remote,saved(),'u').lay).toEqual(buildTrackDetailMap(remote).lay);
});
it('preserves device gaps during an allowed lay extension',()=>{
 const local=saved();Object.assign(local.points[2],{breakBefore:true});
 const remote={...saved(),points:saved().points.slice(0,1)};
 expect(buildTrackDetailDisplay(remote,local,'u').lay[2].breakBefore).toBe(true);
});
it('fills an existing empty row with replay from the same finalized local run',()=>{
 const remote={...saved(),runs:[{id:'r',ended_at:'2026-10-22',run_points:[]}],track_data:{run:{run_id:'r'}}};
 expect(buildTrackDetailDisplay(remote,saved(),'u').run).toHaveLength(4);expect(remote.runs[0].run_points).toEqual([]);
});
it('can use a detailed local replay when matching canonical run points are already synced',()=>{
 const local=saved(),remote=saved();delete (remote.track_data.run as Partial<typeof remote.track_data.run>).replay_points;
 local.track_data.run.replay_points=[line[0],{lat:0.000005,lng:0,t:0.5},...line.slice(1)];
 expect(buildTrackDetailDisplay(remote,local,'u').run).toHaveLength(5);
});
it.each(['different','missing'])('never guesses the run identity (%s)',kind=>{
 const remote={...saved(),track_data:{run:{run_id:kind==='different'?'different':undefined}},runs:[]};
 expect(buildTrackDetailDisplay(remote,saved(),'u').run).toEqual([]);
});
it('a local run without a finalized timestamp cannot replace missing remote search',()=>{
 const remote={...saved(),runs:[],track_data:{run:{run_id:'r'}}},local=saved();local.track_data.run.ended_at='';local.runs[0].ended_at='';
 expect(buildTrackDetailDisplay(remote,local,'u').run).toEqual([]);
});
it('does not replace divergent remote replay or canonical geometry',()=>{
 const remote=saved();remote.track_data.run.replay_points=[{lat:9,lng:0,t:0},...line.slice(1,2)];
 expect(buildTrackDetailDisplay(remote,saved(),'u').run).toEqual(buildTrackDetailMap(remote).run);
 delete (remote.track_data.run as Partial<typeof remote.track_data.run>).replay_points;
 remote.runs[0].run_points=[{lat:8,lng:0,t:0},...line.slice(1)];
 expect(buildTrackDetailDisplay(remote,saved(),'u').run).toEqual(buildTrackDetailMap(remote).run);
});
it('never bypasses a canonical continuity boundary with local replay',()=>{
 const remote=saved();delete (remote.track_data.run as Partial<typeof remote.track_data.run>).replay_points;
 remote.runs[0].run_points=line.map((p,i)=>({...p,...(i===2?{breakBefore:true}:{})}));
 expect(buildTrackDetailDisplay(remote,saved(),'u').run).toEqual(buildTrackDetailMap(remote).run);
});
it.each([{points:'broken'}, {runs:[{run_points:'broken'}]}, {runs:[{run_points:[null]}]}, {points:[null]}, {points:[{latitude:NaN,longitude:0}]}])('a corrupt local shape leaves usable remote display intact: %p',bad=>{
 const remote=saved();expect(buildTrackDetailDisplay(remote,{...saved(),...bad},'u')).toEqual(buildTrackDetailMap(remote));
});

it('does not mix a parent replay with a different selected track_runs row',()=>{
 const remote=saved();delete (remote.track_data.run as Partial<typeof remote.track_data.run>).replay_points;
 remote.runs[0].id='older-run';remote.runs[0].run_points=[];
 expect(buildTrackDetailDisplay(remote,saved(),'u').run).toEqual([]);
});

it('map supplementation retains the canonical marker geometry and metre assignments',()=>{
 const remote={...saved(),points:saved().points.slice(0,1),markers:[{id:'g',marker_type:'gegenstand',latitude:0.00002,longitude:0,material:'holz',distance_from_start:6}]};
 const result=buildTrackDetailDisplay(remote,saved(),'u');
 expect(result.lay).toHaveLength(4);expect(result.markers).toEqual(buildTrackDetailMap(remote).markers);
});

it('rejects local replay if a separately persisted parent canonical run diverges from it',()=>{
 const remote={...saved(),runs:[{id:'r',ended_at:'2026-10-22',run_points:[]}],track_data:{run:{run_id:'r',run_points:[{lat:9,lng:0,t:0},line[1]]}}};
 expect(buildTrackDetailDisplay(remote,saved(),'u').run).toEqual([]);
});

it('keeps parent-only canonical geometry when local canonical geometry differs, including legacy display',()=>{
 const remote={...saved(),runs:[{id:'r',ended_at:'2026-10-22',run_points:[]}],track_data:{run:{run_id:'r',run_points:[{lat:9,lng:0,t:0},line[1]]}}};
 const local=saved();delete (local.track_data.run as Partial<typeof local.track_data.run>).replay_points;
 expect(buildTrackDetailDisplay(remote,local,'u').run).toEqual([]);
});
it('can fill the display when the same-run parent canonical points match the device',()=>{
 const remote={...saved(),runs:[],track_data:{run:{run_id:'r',run_points:line}}};
 expect(buildTrackDetailDisplay(remote,saved(),'u').run).toHaveLength(4);
});
it('preserves a parent canonical continuity boundary even while the separate run row is empty',()=>{
 const remote={...saved(),runs:[{id:'r',ended_at:'2026-10-22',run_points:[]}],track_data:{run:{run_id:'r',run_points:line.map((p,i)=>({...p,breakBefore:i===2}))}}};
 expect(buildTrackDetailDisplay(remote,saved(),'u').run).toEqual([]);
});
it.each([null,'broken',[null]])('malformed parent canonical geometry is never bypassed: %p',bad=>{
 const remote={...saved(),runs:[],track_data:{run:{run_id:'r',run_points:bad}}};
 expect(buildTrackDetailDisplay(remote,saved(),'u').run).toEqual([]);
});

it('a replay extension cannot bypass a known canonical gap even when both sides use replay',()=>{
 const canonical=line.map((p,i)=>({...p,breakBefore:i===2}));
 const local={...saved(),runs:[{id:'r',ended_at:'2026-10-22',run_points:canonical}]};
 const remote={...saved(),runs:[{id:'r',ended_at:'2026-10-22',run_points:canonical}],track_data:{run:{run_id:'r',run_points:canonical,replay_points:line.slice(0,2)}}};
 expect(buildTrackDetailDisplay(remote,local,'u').run).toEqual(buildTrackDetailMap(remote).run);
});
