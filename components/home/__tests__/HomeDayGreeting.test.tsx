import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, Animated, AppState, Text } from 'react-native';
import { HomeDayGreeting } from '../HomeDayGreeting';
const mockPlay=jest.fn(),mockPause=jest.fn(),mockRemove=jest.fn(),mockCreate=jest.fn();
const mockSpeech=jest.fn(); const mockPrepare=jest.fn();
let mockEnabled=true, mockFocused=true, mockBusy=false, mockReduce=false, mockReader=false;
let mockVoiceRecording=false,mockVoiceListening=false,mockWarmup=false;
let mockStatus:(status:{didJustFinish?:boolean})=>void;
const mockVoiceListeners=new Set<()=>void>(),mockWarmupListeners=new Set<()=>void>();
const mockBusyListeners=new Set<()=>void>();
let appChange:(state:string)=>void;
let sequence=0;
jest.mock('expo-audio',()=>({createAudioPlayer:(...args:unknown[])=>mockCreate(...args)}));
jest.mock('expo-speech',()=>({isSpeakingAsync:()=>mockSpeech()}));
jest.mock('@/lib/greetingAudioSafety',()=>({prepareGreetingAudio:(...args:unknown[])=>mockPrepare(...args),finishGreetingAudio:jest.fn()}));
jest.mock('@/features/home/useGreetingSound',()=>({useGreetingSound:()=>({enabled:mockEnabled,ready:true})}));
jest.mock('@/features/tracking/store/trackingStore',()=>({useTrackingStore:{getState:()=>({isRecording:mockBusy,isRunningTrack:false}),subscribe:(f:()=>void)=>{mockBusyListeners.add(f);return()=>mockBusyListeners.delete(f);}}}));
jest.mock('@/features/voice/store/voiceStore',()=>({useVoiceStore:{getState:()=>({isRecording:mockVoiceRecording,isListening:mockVoiceListening}),subscribe:(f:()=>void)=>{mockVoiceListeners.add(f);return()=>mockVoiceListeners.delete(f);}}}));
jest.mock('@/features/tracking/utils/trackingWarmupState',()=>({getActiveTrackingModes:()=>({warmupActive:mockWarmup}),subscribeActiveTrackingModes:(f:()=>void)=>{mockWarmupListeners.add(f);return()=>mockWarmupListeners.delete(f);}}));
jest.mock('expo-router',()=>({useFocusEffect:(callback:()=>void|(()=>void))=>{const React=jest.requireActual('react');const focused=mockFocused;React.useEffect(()=>focused?callback():undefined,[callback,focused]);}}));
jest.mock('@/i18n',()=>({useT:()=>({t:(key:string)=>key})}));
let node:ReactTestRenderer;
let owner:string;
const render=async(extra:{ready?:boolean;name?:unknown;username?:unknown;ownerId?:string}={})=>{
 await act(async()=>{const element=<HomeDayGreeting ownerId={owner} ready name="Moyo" username="moyo" {...extra}/>;if(node)node.update(element);else node=TestRenderer.create(element);for(let i=0;i<10;i++)await Promise.resolve();});
};
beforeEach(()=>{
 jest.useFakeTimers(); owner=`component-${++sequence}`; mockEnabled=true;mockFocused=true;mockBusy=false;mockReduce=false;mockReader=false;mockVoiceRecording=false;mockVoiceListening=false;mockWarmup=false;
 mockPlay.mockReset();mockPause.mockReset();mockRemove.mockReset();mockSpeech.mockReset().mockResolvedValue(false);mockPrepare.mockReset().mockResolvedValue(true);
 mockCreate.mockReset().mockImplementation(()=>({play:mockPlay,pause:mockPause,remove:mockRemove,isLoaded:true,loop:false,addListener:(_event:string,callback:typeof mockStatus)=>{mockStatus=callback;return{remove:jest.fn()};}}));
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockImplementation(()=>Promise.resolve(mockReduce));
 jest.spyOn(AccessibilityInfo,'isScreenReaderEnabled').mockImplementation(()=>Promise.resolve(mockReader));
 jest.spyOn(AccessibilityInfo,'addEventListener').mockReturnValue({remove:jest.fn()} as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>);
 jest.spyOn(AppState,'addEventListener').mockImplementation((event,callback)=>{appChange=callback as (state:string)=>void;return{remove:jest.fn()};});
 Object.defineProperty(AppState,'currentState',{value:'active',configurable:true});
});
afterEach(()=>{act(()=>node?.unmount());node=undefined as unknown as ReactTestRenderer;jest.restoreAllMocks();jest.useRealTimers();mockBusyListeners.clear();mockVoiceListeners.clear();mockWarmupListeners.clear();});
test('renders five decorative dots, a safe header and a smaller optional handle',async()=>{
 mockEnabled=false;await render();expect(node.root.findAll(n=>String(n.props.testID).startsWith('greeting-dot-')&&(n as unknown as {type:unknown}).type===Animated.View)).toHaveLength(5);
 const text=node.root.findAll(n=>(n as unknown as {type:unknown}).type === Text).map(n=>Array.isArray(n.props.children)?n.props.children.join(''):n.props.children);expect(text).toContain('Moyo');expect(text).toContain('@moyo');expect(mockCreate).not.toHaveBeenCalled();
 await render({name:'private@example.com',username:'private@example.com'});expect(JSON.stringify((node as unknown as {toJSON():unknown}).toJSON())).not.toContain('private@example.com');
});
test('waits for profile readiness, plays once, and stops/reclaims resources on blur without replay',async()=>{
 await render({ready:false});expect(mockPlay).not.toHaveBeenCalled();await render();expect(mockPlay).toHaveBeenCalledTimes(1);
 await render({name:'Updated'});expect(mockPlay).toHaveBeenCalledTimes(1);
 mockFocused=false;await render();expect(mockPause).toHaveBeenCalled();expect(mockRemove).toHaveBeenCalled();mockFocused=true;await render();expect(mockPlay).toHaveBeenCalledTimes(1);
});
test('Reduced Motion leaves static dots and a screenreader suppresses sound',async()=>{
 mockReduce=true;mockReader=true;const start=jest.fn();jest.spyOn(Animated,'parallel').mockReturnValue({start,stop:jest.fn(),reset:jest.fn()});await render();expect(mockPlay).not.toHaveBeenCalled();expect(start).not.toHaveBeenCalled();
 // Constructing animation descriptors is inert; values stay at zero without start.
 expect(node.root.findAll(n=>n.props.testID==='greeting-dot-0')[0].props.style[1].transform[0].translateY.__getValue()).toBe(0);
});
test('prevents playback after a recording interrupts pending initialization, even when recording ends again',async()=>{
 let finish!:(value:boolean)=>void;mockPrepare.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await render();
 mockBusy=true;act(()=>mockBusyListeners.forEach(f=>f()));mockBusy=false;
 await act(async()=>{finish(true);});expect(mockCreate).not.toHaveBeenCalled();
});
test('background/resume and bounded native-completion fallback never replay',async()=>{
 await render();expect(mockPlay).toHaveBeenCalledTimes(1);act(()=>jest.advanceTimersByTime(4500));expect(mockRemove).toHaveBeenCalled();
 act(()=>appChange('background'));act(()=>appChange('active'));await render();expect(mockPlay).toHaveBeenCalledTimes(1);
});
test('turning sound off stops it and changing account creates an independent greeting',async()=>{
 await render();mockEnabled=false;await render();expect(mockRemove).toHaveBeenCalled();mockEnabled=true;await render();expect(mockPlay).toHaveBeenCalledTimes(1);
 await render({ownerId:`${owner}-B`});expect(mockPlay).toHaveBeenCalledTimes(2);
});
test('speech, busy tracking and audio errors leave Home usable without playback',async()=>{
 mockSpeech.mockResolvedValue(true);await render();expect(mockPrepare).not.toHaveBeenCalled();
 mockSpeech.mockResolvedValue(false);mockBusy=true;await render({ownerId:`${owner}-B`});expect(mockPlay).not.toHaveBeenCalled();
 mockBusy=false;mockPrepare.mockRejectedValueOnce(new Error('audio'));await render({ownerId:`${owner}-C`});expect(mockPlay).not.toHaveBeenCalled();
});

test('local daypart updates after the boundary without starting a second clip',async()=>{
 jest.setSystemTime(new Date(2026,9,21,10,59,50));await render();
 expect(JSON.stringify((node as unknown as {toJSON():unknown}).toJSON())).toContain('greeting.morning');
 await act(async()=>{jest.advanceTimersByTime(30_000);});
 expect(JSON.stringify((node as unknown as {toJSON():unknown}).toJSON())).toContain('greeting.day');expect(mockPlay).toHaveBeenCalledTimes(1);
});
test('unmount during an asynchronous speech check cannot create a late player',async()=>{
 let finish!:(value:boolean)=>void;mockSpeech.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await render();
 act(()=>node.unmount());node=undefined as unknown as ReactTestRenderer;
 await act(async()=>{finish(false);});expect(mockCreate).not.toHaveBeenCalled();
});

test('a late native playback error is contained and release still runs when pause fails',async()=>{
 let loaded=false;let status!:()=>void;
 mockCreate.mockImplementation(()=>({get isLoaded(){return loaded;},play:mockPlay,pause:mockPause,remove:mockRemove,addListener:(_event:string,callback:()=>void)=>{status=callback;return{remove:jest.fn()};}}));
 await render();expect(mockPlay).not.toHaveBeenCalled();loaded=true;mockPlay.mockImplementationOnce(()=>{throw new Error('interrupted');});mockPause.mockImplementationOnce(()=>{throw new Error('invalid player');});
 expect(()=>act(()=>status())).not.toThrow();expect(mockRemove).toHaveBeenCalledTimes(1);
});


test('four-second clip outlives the2040ms animation and releases on natural native completion',async()=>{
 const stopAnimation=jest.fn();jest.spyOn(Animated,'parallel').mockReturnValue({start:jest.fn(),stop:stopAnimation,reset:jest.fn()});
 await render();expect(mockPlay).toHaveBeenCalledTimes(1);
 act(()=>jest.advanceTimersByTime(2040));expect(stopAnimation).toHaveBeenCalled();expect(mockRemove).not.toHaveBeenCalled();
 act(()=>jest.advanceTimersByTime(1960));expect(mockRemove).not.toHaveBeenCalled();
 act(()=>mockStatus({didJustFinish:true}));expect(mockPause).toHaveBeenCalledTimes(1);expect(mockRemove).toHaveBeenCalledTimes(1);
 act(()=>jest.advanceTimersByTime(1000));expect(mockRemove).toHaveBeenCalledTimes(1);expect(mockPlay).toHaveBeenCalledTimes(1);
});
test('a player loaded during the visual window can finish four seconds from actual playback',async()=>{
 let loaded=false;mockCreate.mockImplementation(()=>({get isLoaded(){return loaded;},play:mockPlay,pause:mockPause,remove:mockRemove,addListener:(_e:string,cb:typeof mockStatus)=>{mockStatus=cb;return{remove:jest.fn()};}}));
 await render();act(()=>jest.advanceTimersByTime(1900));loaded=true;act(()=>mockStatus({}));expect(mockPlay).toHaveBeenCalledTimes(1);
 act(()=>jest.advanceTimersByTime(4000));expect(mockRemove).not.toHaveBeenCalled();act(()=>mockStatus({didJustFinish:true}));expect(mockRemove).toHaveBeenCalledTimes(1);
});
test('a player that misses its startup window is released and cannot start late',async()=>{
 let loaded=false;mockCreate.mockImplementation(()=>({get isLoaded(){return loaded;},play:mockPlay,pause:mockPause,remove:mockRemove,addListener:(_e:string,cb:typeof mockStatus)=>{mockStatus=cb;return{remove:jest.fn()};}}));
 await render();act(()=>jest.advanceTimersByTime(2040));expect(mockRemove).toHaveBeenCalledTimes(1);loaded=true;act(()=>mockStatus({}));expect(mockPlay).not.toHaveBeenCalled();
});
test.each(['tracking','voiceRecording','voiceListening','warmup','background'])('%s still interrupts immediately after the visual window',async kind=>{
 await render();act(()=>jest.advanceTimersByTime(2500));expect(mockRemove).not.toHaveBeenCalled();
 act(()=>{if(kind==='tracking'){mockBusy=true;mockBusyListeners.forEach(f=>f());}else if(kind==='voiceRecording'||kind==='voiceListening'){mockVoiceRecording=kind==='voiceRecording';mockVoiceListening=kind==='voiceListening';mockVoiceListeners.forEach(f=>f());}else if(kind==='warmup'){mockWarmup=true;mockWarmupListeners.forEach(f=>f());}else appChange('background');});
 expect(mockPause).toHaveBeenCalledTimes(1);expect(mockRemove).toHaveBeenCalledTimes(1);act(()=>jest.advanceTimersByTime(2500));expect(mockPlay).toHaveBeenCalledTimes(1);
});
