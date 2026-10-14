import { analyzeCorners, cornerSideSharpness } from '../../engine/trackAnalytics';
import { attachSpecialGeometry, countLaidCorners, projectAngleMarkers, specialAngleBadge, specialAngleKey } from '../specialAngleGeometry';
import { classifyManualAngleGeometry } from '../manualAngleGeometry';
import { buildTrackDetailMap } from '../trackDetailMap';
const base={id:'manual',type:'winkel',angleKind:'bw',lat:47,lng:8,distance_from_start:10};
const meta=(m=base,direction:'links'|'rechts'='links')=>({markerKey:specialAngleKey(m),manualMarkerType:m.angleKind,geometryDirection:direction,geometrySharpness:'sharp',geometrySource:'manual'});
it.each(['bw','ow','gw'])('%s retains its type and all four explicit geometric choices',angleKind=>{
 for(const geometryDirection of ['links','rechts'] as const)for(const geometrySharpness of ['normal','sharp'] as const){
  const m={...base,angleKind,geometryDirection,geometrySharpness,geometrySource:'manual' as const};
  const result=classifyManualAngleGeometry([m],[],[]).markers[0];
  expect(result).toMatchObject({manualMarkerType:angleKind,geometryDirection,geometrySharpness,classificationSource:'manual',confidence:null});
  expect(specialAngleBadge(m)).toBe(`${angleKind.toUpperCase()} ${geometrySharpness==='sharp'?'S':''}${geometryDirection==='links'?'L':'R'}`);
 }
});
it.each(['links','rechts'] as const)('Abriss %s is explicit and never inferred from unrelated GPS corners',geometryDirection=>{
 const m={...base,angleKind:'abriss',geometryDirection,geometrySharpness:'normal' as const,geometrySource:'manual' as const};
 expect(classifyManualAngleGeometry([m],[],[]).markers[0]).toMatchObject({geometryDirection,geometrySharpness:'unresolved'});
 expect(classifyManualAngleGeometry([{...base,angleKind:'abriss'}],[],[]).markers[0].geometryDirection).toBe('unresolved');
 expect(countLaidCorners([m])).toBe(0);
});
it('reordering metadata and changing local/cloud IDs does not change association',()=>{
 const other={...base,id:'second',distance_from_start:30};
 const result=attachSpecialGeometry([{...other,id:'remote2'},{...base,id:'remote1'}],[meta(base),meta(other,'rechts')]);
 expect(result.map(m=>m.geometryDirection)).toEqual(['rechts','links']);
});
it('duplicate or invalid identities never borrow a direction',()=>{
 expect(attachSpecialGeometry([base],[meta(base),meta(base,'rechts')])[0].geometryDirection).toBeUndefined();
 expect(attachSpecialGeometry([base,{...base,id:'duplicate'}],[meta(base)])[0].geometryDirection).toBeUndefined();
 expect(specialAngleKey({...base,lat:NaN})).toBeNull();
});
it('counts a uniquely matched Fachwinkel once, preserving originals and another later pass',()=>{
 const manual={...base,geometryDirection:'rechts' as const,geometrySharpness:'normal' as const};
 const auto={...base,id:'auto',angleKind:'rechts'};const later={...auto,id:'later',distance_from_start:40};
 const original=[manual,auto,later];const before=JSON.stringify(original);
 expect(projectAngleMarkers(original).map(m=>m.id)).toEqual(['manual','later']);expect(countLaidCorners(original)).toBe(2);expect(JSON.stringify(original)).toBe(before);
});
it('does not merge opposite, ambiguous or incompatible corners',()=>{
 const manual={...base,geometryDirection:'rechts' as const,geometrySharpness:'sharp' as const};
 expect(projectAngleMarkers([manual,{...base,id:'a',angleKind:'links'}])).toHaveLength(2);
 const auto={...base,id:'a',angleKind:'spitz_rechts'};
 expect(projectAngleMarkers([manual,auto,{...auto,id:'b'}])).toHaveLength(3);
});
it('stored map projects Fachtyp and direction with one corner per leg, retaining every raw row',()=>{
 const track={track_data:{manualAngleGeometry:[meta()]},markers:[
 {id:'remote',marker_type:'winkel',angle_kind:'bw',latitude:47,longitude:8,distance_from_start:10},
 {id:'auto',marker_type:'winkel',angle_kind:'spitz_links',latitude:47,longitude:8,distance_from_start:10},
 {id:'object',marker_type:'gegenstand',latitude:47.001,longitude:8,distance_from_start:20}],points:[]};
 const map=buildTrackDetailMap(track);expect(map.markers).toHaveLength(2);expect(map.markers[0]).toMatchObject({angleKind:'bw',geometryDirection:'links',geometrySharpness:'sharp'});
 expect(map.markers[1].legIndex).toBe(2);expect(track.markers).toHaveLength(3);
});

it.each(['bw','ow','gw'] as const)('%s keeps its type while both analytics generations receive its geometry', angleKind => {
  for (const geometryDirection of ['links','rechts'] as const) for (const geometrySharpness of ['normal','sharp'] as const) {
    const corner = { atM: 10, angleKind, geometryDirection, geometrySharpness };
    expect(analyzeCorners([], [corner])[0]).toMatchObject({ side: geometryDirection, sharpness: geometrySharpness === 'sharp' ? 'spitz' : 'rechtwinklig' });
    expect(corner.angleKind).toBe(angleKind);
  }
  expect(cornerSideSharpness({atM:10,angleKind,geometryDirection:'links'})).toEqual({side:'links',sharpness:'unbekannt'});
  expect(cornerSideSharpness({atM:10,angleKind})).toEqual({side:'unbekannt',sharpness:'unbekannt'});
});
it('retains the legacy 100-entry cap without inventing directions for the tail', () => {
 const markers=Array.from({length:101},(_,i)=>({...base,id:String(i),distance_from_start:i}));
 const entries=markers.slice(0,100).map(()=>({manualMarkerType:'bw',geometryDirection:'links',geometrySharpness:'sharp'}));
 const result=attachSpecialGeometry(markers,entries);
 expect(result[99].geometryDirection).toBe('links');expect(result[100].geometryDirection).toBeUndefined();
});

it('preserves validated legacy direction even when nullable coordinates prevent a new key', () => {
 const marker={...base,lat:null,lng:null};
 const entry={manualMarkerType:'bw',geometryDirection:'rechts',geometrySharpness:'sharp'};
 expect(attachSpecialGeometry([marker],[entry])[0]).toMatchObject({geometryDirection:'rechts',geometrySharpness:'sharp'});
 expect(attachSpecialGeometry([marker],[{...entry,markerKey:'unrelated'}])[0].geometryDirection).toBeUndefined();
});
