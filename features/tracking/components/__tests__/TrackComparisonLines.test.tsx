import React, {useEffect,useRef} from 'react';
import TestRenderer,{act,type ReactTestRenderer} from 'react-test-renderer';
import {Platform} from 'react-native';
import {TrackComparisonLines,searchRunBuildParts,SEARCH_RUN_BUILD,SEARCH_RUN_COLOR,SEARCH_RUN_WIDTH} from '../TrackComparisonLines';
import type {MapPolylineProps} from 'react-native-maps';
import {C} from '@/constants/colors';
let mockReduceMotion=true;
jest.mock('@/hooks/useReduceMotion',()=>({useReduceMotion:()=>mockReduceMotion}));
const mounted=jest.fn(),removed=jest.fn();
function Polyline(p:MapPolylineProps){const first=useRef(p);useEffect(()=>{const initial=first.current;mounted(initial);return()=>{removed(initial);};},[]);return null;}
const line=Array.from({length:4},(_,i)=>({lat:i*0.00001,lng:0}));
const props={Polyline,layPoints:line,runPoints:line,segments:[],layColor:C.trackBlue};
let view:ReactTestRenderer;
const polys=()=>(view.root as unknown as {findAllByType:(type:typeof Polyline)=>{props:MapPolylineProps}[]}).findAllByType(Polyline).map(x=>x.props);
const tagged=(id:string)=>polys().filter(p=>p.testID===id);
afterEach(()=>{if(view)act(()=>view.unmount());jest.clearAllMocks();mockReduceMotion=true;});
const render=(p=props)=>act(()=>{view=TestRenderer.create(<TrackComparisonLines {...p}/>);});
it('keeps both paths distinguishable even with exactly overlapping geometry and blue dog color',()=>{
 render();const lay=tagged('track-comparison-lay')[0],run=tagged('track-comparison-run')[0],build=tagged('track-comparison-run-build')[0];
 expect(lay.coordinates).toEqual(run.coordinates);expect(build.coordinates).toBe(run.coordinates);
 // Gelaufene Absuche gleich breit wie die gelegte Linie; nie in der Fährtenfarbe des Hundes.
 expect(run.strokeWidth).toBe(lay.strokeWidth);expect(run.strokeWidth).toBe(SEARCH_RUN_WIDTH);
 expect(run.strokeColor).not.toBe(lay.strokeColor);expect(build.strokeColor).toBe(SEARCH_RUN_COLOR);expect(build.strokeColor).not.toBe(lay.strokeColor);
 expect(build.strokeWidth).toBeLessThan(run.strokeWidth!);
 for(const p of polys())expect(p.lineDashPattern).toBeUndefined();
 expect(polys().map(p=>p.zIndex)).toEqual([10,11,12,13]);
});
describe('Aufbau',()=>{
 const os=Platform.OS;
 beforeEach(()=>{jest.useFakeTimers();});
 afterEach(()=>{jest.useRealTimers();Object.defineProperty(Platform,'OS',{configurable:true,get:()=>os});});
 const setOs=(value:string)=>Object.defineProperty(Platform,'OS',{configurable:true,get:()=>value});
 const build=()=>tagged('track-comparison-run-build');
 const tick=(n=1)=>act(()=>{jest.advanceTimersByTime(SEARCH_RUN_BUILD.tickMs*n);});
 it('iOS: die helle Linie wächst von Start bis Ende, bleibt stehen und beginnt neu',()=>{
  setOs('ios');mockReduceMotion=false;render();const run=tagged('track-comparison-run')[0];
  expect(build()).toHaveLength(0);                       // Schritt 0: noch nichts gezeichnet
  tick();const first=build()[0].coordinates;expect(first[0]).toEqual(run.coordinates[0]);
  tick(SEARCH_RUN_BUILD.drawSteps/2-1);const half=build()[0].coordinates;
  expect(half[0]).toEqual(run.coordinates[0]);expect(half[half.length-1].latitude).toBeGreaterThan(first[first.length-1].latitude);
  expect(half[half.length-1].latitude).toBeLessThan(run.coordinates[run.coordinates.length-1].latitude);
  tick(SEARCH_RUN_BUILD.drawSteps/2);expect(build()[0].coordinates).toBe(run.coordinates);   // fertig = ganze Spur
  tick(SEARCH_RUN_BUILD.holdSteps-1);expect(build()[0].coordinates).toBe(run.coordinates);   // steht
  tick();expect(build()).toHaveLength(0);                                                    // beginnt neu
  // gelegte Linie und dunkler Körper der Suchspur werden dabei nie neu eingehängt
  expect(removed.mock.calls.every(([p])=>p.testID==='track-comparison-run-build')).toBe(true);
 });
 it('«Bewegung reduzieren»: volle Länge, kein Timer',()=>{
  setOs('ios');mockReduceMotion=true;render();tick(5);
  expect(build()[0].coordinates).toBe(tagged('track-comparison-run')[0].coordinates);expect(jest.getTimerCount()).toBe(0);
 });
 it('Android: volle Länge, kein Timer',()=>{
  setOs('android');mockReduceMotion=false;render();tick(5);
  expect(build()[0].coordinates).toBe(tagged('track-comparison-run')[0].coordinates);expect(jest.getTimerCount()).toBe(0);
 });
 it('pausiert (Karte nicht sichtbar): volle Länge, kein Timer; läuft nach dem Fortsetzen wieder',()=>{
  setOs('ios');mockReduceMotion=false;act(()=>{view=TestRenderer.create(<TrackComparisonLines {...props} paused/>);});tick(5);
  expect(build()[0].coordinates).toBe(tagged('track-comparison-run')[0].coordinates);expect(jest.getTimerCount()).toBe(0);
  act(()=>view.update(<TrackComparisonLines {...props}/>));expect(jest.getTimerCount()).toBe(1);
  act(()=>view.update(<TrackComparisonLines {...props} paused/>));expect(jest.getTimerCount()).toBe(0);
 });
 it('nach dem Schliessen läuft kein Timer weiter',()=>{
  setOs('ios');mockReduceMotion=false;render();expect(jest.getTimerCount()).toBe(1);act(()=>view.unmount());expect(jest.getTimerCount()).toBe(0);
  render();
 });
 it('searchRunBuildParts: Anteil über Teilstücke hinweg, Lücken bleiben, Eingabe unverändert',()=>{
  const c=(i:number)=>({latitude:i*0.00001,longitude:0});
  const parts=[[c(0),c(1),c(2)],[c(5),c(6),c(7)]];const copy=JSON.stringify(parts);
  expect(searchRunBuildParts(parts,0)).toEqual([]);expect(searchRunBuildParts(parts,1)).toBe(parts);expect(searchRunBuildParts(parts,NaN)).toBe(parts);
  expect(searchRunBuildParts(parts,0.25)).toEqual([[c(0),c(1)]]);
  expect(searchRunBuildParts(parts,0.5)).toEqual([[c(0),c(1),c(2)]]);
  const r=searchRunBuildParts(parts,0.625);expect(r).toHaveLength(2);expect(r[1][0]).toEqual(c(5));expect(r[1][1].latitude).toBeCloseTo(0.000055,9);
  expect(JSON.stringify(parts)).toBe(copy);
 });
});
it('unrelated renders preserve coordinate identities and native overlay mounts',()=>{
 render();const before=polys();act(()=>view.update(<TrackComparisonLines {...props}/>));
 polys().forEach((p,i)=>expect(p.coordinates).toBe(before[i].coordinates));expect(mounted).toHaveBeenCalledTimes(4);expect(removed).not.toHaveBeenCalled();
});
it.each(['color','lay','run'] as const)('reinstalls BOTH layers in order when %s changes (MapKit overlay update protection)',kind=>{
 render();const next={...props,...(kind==='color'?{layColor:'#FAC123'}:kind==='lay'?{layPoints:[...line,{lat:0.00004,lng:0}]}:{runPoints:[...line,{lat:0.00004,lng:0.00001}]})};
 act(()=>view.update(<TrackComparisonLines {...next}/>));expect(removed).toHaveBeenCalledTimes(4);expect(mounted).toHaveBeenCalledTimes(8);
 expect(mounted.mock.calls.slice(-4).map(([p])=>p.zIndex)).toEqual([10,11,12,13]);
});
it('does not bridge genuine gaps in either layer or move any coordinates',()=>{
 const gap=line.map((p,i)=>({...p,breakBefore:i===2}));render({...props,layPoints:gap,runPoints:gap});
 for(const tag of ['track-comparison-lay','track-comparison-run']){
  const parts=tagged(tag);expect(parts).toHaveLength(2);
  expect(parts.map(p=>p.coordinates)).toEqual([line.slice(0,2),line.slice(2)].map(part=>part.map(p=>({latitude:p.lat,longitude:p.lng}))));
 }
});
it('singleton sections do not fabricate a path; the other complete layer remains visible',()=>{
 render({...props,layPoints:line.map(p=>({...p,breakBefore:true}))});
 expect(tagged('track-comparison-lay')).toHaveLength(0);expect(tagged('track-comparison-run')).toHaveLength(1);
});
