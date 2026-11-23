import React, {useEffect,useRef} from 'react';
import TestRenderer,{act,type ReactTestRenderer} from 'react-test-renderer';
import {Platform} from 'react-native';
import {TrackComparisonLines,searchRunDashPattern,SEARCH_RUN_COLOR,SEARCH_RUN_FLOW,SEARCH_RUN_WIDTH} from '../TrackComparisonLines';
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
 render();const lay=tagged('track-comparison-lay')[0],run=tagged('track-comparison-run')[0],flow=tagged('track-comparison-run-flow')[0];
 expect(lay.coordinates).toEqual(run.coordinates);expect(flow.coordinates).toBe(run.coordinates);
 // Gelaufene Absuche gleich breit wie die gelegte Linie; nie in der Fährtenfarbe des Hundes.
 expect(run.strokeWidth).toBe(lay.strokeWidth);expect(run.strokeWidth).toBe(SEARCH_RUN_WIDTH);
 expect(run.strokeColor).not.toBe(lay.strokeColor);expect(flow.strokeColor).toBe(SEARCH_RUN_COLOR);expect(flow.strokeColor).not.toBe(lay.strokeColor);
 expect(flow.strokeWidth).toBeLessThan(run.strokeWidth!);
 expect(lay.lineDashPattern).toBeUndefined();expect(run.lineDashPattern).toBeUndefined();expect(flow.lineDashPattern).toEqual(SEARCH_RUN_FLOW.dash);
 expect(polys().map(p=>p.zIndex)).toEqual([10,11,12,13]);
});
describe('Laufband',()=>{
 const os=Platform.OS;
 beforeEach(()=>{jest.useFakeTimers();});
 afterEach(()=>{jest.useRealTimers();Object.defineProperty(Platform,'OS',{configurable:true,get:()=>os});});
 const setOs=(value:string)=>Object.defineProperty(Platform,'OS',{configurable:true,get:()=>value});
 const flow=()=>tagged('track-comparison-run-flow')[0];
 const tick=(n=1)=>act(()=>{jest.advanceTimersByTime(SEARCH_RUN_FLOW.tickMs*n);});
 it('iOS: die Striche wandern; die Spur bleibt immer in voller Länge und nichts wird neu eingehängt',()=>{
  setOs('ios');mockReduceMotion=false;render();const before=polys();expect(flow().lineDashPhase).toBe(0);
  tick();const first=flow().lineDashPhase!;expect(first).not.toBe(0);
  tick();expect(flow().lineDashPhase!).toBeLessThan(first);expect(flow().lineDashPhase!).toBeGreaterThanOrEqual(0);
  tick(40);   // über mehrere Strich-Zyklen: Koordinaten bleiben dieselben, die Linie verschwindet nie
  expect(tagged('track-comparison-run-flow')).toHaveLength(1);
  polys().forEach((p,i)=>expect(p.coordinates).toBe(before[i].coordinates));
  expect(mounted).toHaveBeenCalledTimes(4);expect(removed).not.toHaveBeenCalled();
  polys().filter(p=>p.testID!=='track-comparison-run-flow').forEach(p=>expect(p.lineDashPhase).toBeUndefined());
 });
 it('«Bewegung reduzieren»: Striche stehen still, kein Timer',()=>{
  setOs('ios');mockReduceMotion=true;render();tick(5);expect(flow().lineDashPhase).toBe(0);expect(jest.getTimerCount()).toBe(0);
 });
 it('Android (kein lineDashPhase): Striche stehen still, kein Timer',()=>{
  setOs('android');mockReduceMotion=false;render();tick(5);expect(flow().lineDashPhase).toBe(0);expect(jest.getTimerCount()).toBe(0);
 });
 it('pausiert (Karte nicht sichtbar): kein Timer, Striche bleiben stehen; läuft nach dem Fortsetzen weiter',()=>{
  setOs('ios');mockReduceMotion=false;act(()=>{view=TestRenderer.create(<TrackComparisonLines {...props} paused/>);});tick(5);
  expect(flow().lineDashPhase).toBe(0);expect(jest.getTimerCount()).toBe(0);
  act(()=>view.update(<TrackComparisonLines {...props}/>));expect(jest.getTimerCount()).toBe(1);tick(2);const moving=flow().lineDashPhase;
  act(()=>view.update(<TrackComparisonLines {...props} paused/>));expect(jest.getTimerCount()).toBe(0);tick(5);
  expect(flow().lineDashPhase).toBe(moving);   // kein Sprung beim Anhalten
 });
 it('Strichmuster: iOS unverändert, Android in Pixel umgerechnet (sonst winzige Striche)',()=>{
  expect(searchRunDashPattern('ios',3)).toBe(SEARCH_RUN_FLOW.dash);
  expect(searchRunDashPattern('android',3)).toEqual([30,42]);
  expect(searchRunDashPattern('android',2.625)).toEqual([26,37]);
  expect(searchRunDashPattern('android',0)).toBe(SEARCH_RUN_FLOW.dash);
  expect(searchRunDashPattern('android',NaN)).toBe(SEARCH_RUN_FLOW.dash);
 });
 it('nach dem Schliessen läuft kein Timer weiter',()=>{
  setOs('ios');mockReduceMotion=false;render();expect(jest.getTimerCount()).toBe(1);act(()=>view.unmount());expect(jest.getTimerCount()).toBe(0);
  render();
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
