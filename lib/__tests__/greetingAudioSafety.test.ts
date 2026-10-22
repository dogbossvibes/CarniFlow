const mockMode = jest.fn();
jest.mock('expo-audio', () => ({ setAudioModeAsync: (...args: unknown[]) => mockMode(...args) }));
beforeEach(() => { jest.resetModules(); mockMode.mockReset().mockResolvedValue(undefined); });
test('does not mix a second greeting or reactivate after another audio user has claimed the session', async () => {
  const audio = jest.requireActual<typeof import('../greetingAudioSafety')>('../greetingAudioSafety'); const stop = jest.fn();
  expect(await audio.prepareGreetingAudio(stop, () => true)).toBe(true);
  expect(await audio.prepareGreetingAudio(jest.fn(), () => true)).toBe(false);
  expect(mockMode).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }));
  await audio.setAppAudioModeAsync({ playsInSilentMode: true, allowsRecording: true }); expect(stop).toHaveBeenCalledTimes(1);
  expect(await audio.prepareGreetingAudio(jest.fn(), () => true)).toBe(false);
});
test('a recording claim preempts a pending greeting; its original mode is applied last unchanged', async () => {
  const audio = jest.requireActual<typeof import('../greetingAudioSafety')>('../greetingAudioSafety'); let finish!: () => void;
  mockMode.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const stop = jest.fn(); const greeting = audio.prepareGreetingAudio(stop, () => true);
  const mode = { playsInSilentMode: true, allowsRecording: true }; const recording = audio.setAppAudioModeAsync(mode);
  expect(stop).toHaveBeenCalledTimes(1); expect(mockMode).toHaveBeenCalledTimes(1);
  finish(); expect(await greeting).toBe(false); await recording;
  expect(mockMode).toHaveBeenLastCalledWith(mode);
});
test('cleanup never resets a shared mode, and a failed initialization does not block recording', async () => {
  const audio = jest.requireActual<typeof import('../greetingAudioSafety')>('../greetingAudioSafety'); const stop = jest.fn();
  mockMode.mockRejectedValueOnce(new Error('audio unavailable'));
  await expect(audio.prepareGreetingAudio(stop, () => true)).rejects.toThrow();
  audio.finishGreetingAudio(stop); expect(mockMode).toHaveBeenCalledTimes(1);
  await audio.setAppAudioModeAsync({ allowsRecording: true }); expect(mockMode).toHaveBeenCalledTimes(2);
});

test('cleanup failures never prevent the existing audio mode request',async()=>{
 const audio=jest.requireActual<typeof import('../greetingAudioSafety')>('../greetingAudioSafety');
 await audio.prepareGreetingAudio(()=>{throw new Error('released');},()=>true);
 await expect(audio.setAppAudioModeAsync({allowsRecording:true})).resolves.toBeUndefined();
 expect(mockMode).toHaveBeenLastCalledWith({allowsRecording:true});
});

test('Android reserves priority without changing the shared Expo audio mode',async()=>{
 const audio=jest.requireActual<typeof import('../greetingAudioSafety')>('../greetingAudioSafety');
 expect(await audio.prepareGreetingAudio(jest.fn(),()=>true,false)).toBe(true);
 expect(mockMode).not.toHaveBeenCalled();
});
test('all concurrent recording/media claims wait for the native greeting stop acknowledgement',async()=>{
 const audio=jest.requireActual<typeof import('../greetingAudioSafety')>('../greetingAudioSafety');
 let finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});
 const stop=jest.fn(()=>{audio.finishGreetingAudio(stop,pending);return pending;});
 await audio.prepareGreetingAudio(stop,()=>true,false);
 const first=audio.setAppAudioModeAsync({allowsRecording:true});
 const second=audio.setAppAudioModeAsync({playsInSilentMode:true});
 expect(mockMode).not.toHaveBeenCalled();finish();await Promise.all([first,second]);
 expect(mockMode).toHaveBeenCalledTimes(2);
});
test('cleanup started by blur still gates a later recording claim until native stop completes',async()=>{
 const audio=jest.requireActual<typeof import('../greetingAudioSafety')>('../greetingAudioSafety');
 let finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});const stop=jest.fn(()=>pending);
 await audio.prepareGreetingAudio(stop,()=>true,false);audio.finishGreetingAudio(stop,pending);
 const recording=audio.setAppAudioModeAsync({allowsRecording:true});expect(mockMode).not.toHaveBeenCalled();
 finish();await recording;expect(mockMode).toHaveBeenCalledWith({allowsRecording:true});
});

test('stale account A cleanup cannot replace the still pending account B native stop barrier',async()=>{
 const audio=jest.requireActual<typeof import('../greetingAudioSafety')>('../greetingAudioSafety');
 const stoppedA=Promise.resolve();const stopA=jest.fn(()=>stoppedA);
 await audio.prepareGreetingAudio(stopA,()=>true,false);audio.finishGreetingAudio(stopA,stoppedA);
 let finishB!:()=>void;const stoppedB=new Promise<void>(resolve=>{finishB=resolve;});const stopB=jest.fn(()=>stoppedB);
 await audio.prepareGreetingAudio(stopB,()=>true,false);audio.finishGreetingAudio(stopB,stoppedB);
 audio.finishGreetingAudio(stopA,stoppedA);
 const recording=audio.setAppAudioModeAsync({allowsRecording:true});
 for(let i=0;i<10;i++)await Promise.resolve();expect(mockMode).not.toHaveBeenCalled();
 finishB();await recording;expect(mockMode).toHaveBeenCalledWith({allowsRecording:true});
});
