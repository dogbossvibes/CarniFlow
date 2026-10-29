import { createExpoPcmCapture, IOS_PCM_OPTIONS } from '../expoPcmCapture';
import { AudioModule, type NativeAudioModule } from 'expo-audio';
import * as Files from 'expo-file-system/legacy';
import { setAppAudioModeAsync } from '@/lib/greetingAudioSafety';
const nativeAudio: NativeAudioModule = AudioModule;
const mockPrepare = jest.fn(async () => {}); const mockRecord = jest.fn(); const mockStop = jest.fn(async () => {}); const mockRelease = jest.fn();
const mockUri = 'file:///cache/ExpoAudio/recording-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.wav';
jest.mock('expo-audio', () => ({ AudioQuality: { HIGH: 96 }, IOSOutputFormat: { LINEARPCM: 'lpcm' }, AudioModule: {
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  AudioRecorder: jest.fn().mockImplementation(() => ({ uri: mockUri, prepareToRecordAsync: mockPrepare, record: mockRecord, stop: mockStop, release: mockRelease })),
} }));
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation(() => ({ bytes: async () => new Uint8Array(46) })) }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', getInfoAsync: jest.fn(async () => ({ exists: false })), deleteAsync: jest.fn(async () => {}) }));
jest.mock('@/lib/greetingAudioSafety', () => ({ setAppAudioModeAsync: jest.fn(async () => {}) }));
const mockSubscribe = jest.fn((..._args: unknown[]) => jest.fn());
jest.mock('@/features/voice/store/voiceStore', () => ({ useVoiceStore: { getState: () => ({ isRecording: false }), subscribe: (...args: unknown[]) => mockSubscribe(...args) } }));
function storage() { const map = new Map<string,string>(); return { getItem: async (k:string) => map.get(k) ?? null, setItem: async(k:string,v:string) => { map.set(k,v); } }; }
beforeEach(() => jest.clearAllMocks());
it('constructing the adapter creates no recorder, permission request, mode change or deletion', () => {
  createExpoPcmCapture(storage()); expect(nativeAudio.AudioRecorder).not.toHaveBeenCalled();
  expect(AudioModule.requestRecordingPermissionsAsync).not.toHaveBeenCalled(); expect(setAppAudioModeAsync).not.toHaveBeenCalled(); expect(Files.deleteAsync).not.toHaveBeenCalled();
});
it('passes the exact flattened PCM contract to installed SDK and prepares without allocating another URI', async () => {
  const port = createExpoPcmCapture(storage(), () => true); const take = await port.prepare(new AbortController().signal);
  expect(nativeAudio.AudioRecorder).toHaveBeenCalledWith({ extension: '.wav', sampleRate: 16000, numberOfChannels: 1, bitRate: 256000,
    isMeteringEnabled: false, outputFormat: 'lpcm', audioQuality: 96, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false });
  expect(IOS_PCM_OPTIONS).not.toHaveProperty('ios'); expect(mockPrepare).toHaveBeenCalledWith();
  take.start(); expect(mockRecord).toHaveBeenCalledWith({ forDuration: 60 });
  expect(await take.close()).toBe(true); expect(Files.deleteAsync).toHaveBeenCalledWith(mockUri, { idempotent: true });
  expect(Files.getInfoAsync).toHaveBeenCalledWith(mockUri); expect(mockRelease).toHaveBeenCalledTimes(1);
});
it('does not restore a guessed shared audio mode after its own recorder closes', async () => {
  const port = createExpoPcmCapture(storage(), () => true); const take = await port.prepare(new AbortController().signal); await take.close();
  expect(setAppAudioModeAsync).toHaveBeenCalledTimes(1); expect(setAppAudioModeAsync).toHaveBeenCalledWith({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
});
