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
