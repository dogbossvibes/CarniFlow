import React, {useEffect,useRef} from 'react';
import TestRenderer,{act,type ReactTestRenderer} from 'react-test-renderer';
import {TrackComparisonLines,SEARCH_RUN_COLOR,SEARCH_RUN_OUTLINE_WIDTH,SEARCH_RUN_WIDTH} from '../TrackComparisonLines';
import type {MapPolylineProps} from 'react-native-maps';
import {C} from '@/constants/colors';
const mounted=jest.fn(),removed=jest.fn();
function Polyline(p:MapPolylineProps){const first=useRef(p);useEffect(()=>{const initial=first.current;mounted(initial);return()=>{removed(initial);};},[]);return null;}
const line=Array.from({length:4},(_,i)=>({lat:i*0.00001,lng:0}));
const props={Polyline,layPoints:line,runPoints:line,segments:[],layColor:C.trackBlue};
let view:ReactTestRenderer;
const polys=()=>(view.root as unknown as {findAllByType:(type:typeof Polyline)=>{props:MapPolylineProps}[]}).findAllByType(Polyline).map(x=>x.props);
const tagged=(id:string)=>polys().filter(p=>p.testID===id);
afterEach(()=>{if(view)act(()=>view.unmount());jest.clearAllMocks();});
const render=(p=props)=>act(()=>{view=TestRenderer.create(<TrackComparisonLines {...p}/>);});
it('keeps both paths distinguishable even with exactly overlapping geometry and blue dog color',()=>{
 render();const lay=tagged('track-comparison-lay')[0],run=tagged('track-comparison-run')[0],outline=tagged('track-comparison-run-outline')[0];
 expect(lay.coordinates).toEqual(run.coordinates);expect(outline.coordinates).toBe(run.coordinates);
 // Gelaufene Absuche genau gleich breit wie die gelegte Linie (auch die Kontur); nie in der Fährtenfarbe des Hundes.
 expect(run.strokeWidth).toBe(lay.strokeWidth);expect(run.strokeWidth).toBe(SEARCH_RUN_WIDTH);
 expect(outline.strokeWidth).toBe(SEARCH_RUN_OUTLINE_WIDTH);expect(outline.strokeWidth).toBe(lay.strokeWidth!+2);
 expect(run.strokeColor).toBe(SEARCH_RUN_COLOR);expect(run.strokeColor).not.toBe(lay.strokeColor);
 expect(polys().map(p=>p.zIndex)).toEqual([10,11,12,13]);
});
it('ruhige Suchspur: kein Strichmuster, keine Bewegung, kein Timer (Apple Maps würde sonst blinken)',()=>{
 jest.useFakeTimers();
 try{
  render();expect(jest.getTimerCount()).toBe(0);
  polys().forEach(p=>{expect(p.lineDashPattern).toBeUndefined();expect(p.lineDashPhase).toBeUndefined();});
  act(()=>{jest.advanceTimersByTime(5000);});
  expect(mounted).toHaveBeenCalledTimes(4);expect(removed).not.toHaveBeenCalled();
  // auch mit dem früheren Pausen-Schalter bleibt alles still
  act(()=>view.update(<TrackComparisonLines {...props} paused/>));expect(jest.getTimerCount()).toBe(0);expect(removed).not.toHaveBeenCalled();
 }finally{jest.useRealTimers();}
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
