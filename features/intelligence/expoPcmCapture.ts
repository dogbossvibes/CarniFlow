import { useVoiceStore } from '@/features/voice/store/voiceStore';
import { Platform } from 'react-native';
import { AudioModule, AudioQuality, IOSOutputFormat, type NativeAudioModule } from 'expo-audio';
import { File } from 'expo-file-system';
import * as LegacyFiles from 'expo-file-system/legacy';
import { setAppAudioModeAsync } from '@/lib/greetingAudioSafety';
import type { ConsentStorage } from './consentOutbox';
import { createAudioCleanup } from './audioCleanup';
import { createPcmCapturePort } from './pcmCapture';

// Flattened native options match the INSTALLED expo-audio 1.1.1 iOS adapter.
// No new native dependency. Android remains unavailable in this iOS candidate.
export const IOS_PCM_OPTIONS = Object.freeze({ extension: '.wav', sampleRate: 16000,
  numberOfChannels: 1, bitRate: 256000, isMeteringEnabled: false,
  outputFormat: IOSOutputFormat.LINEARPCM, audioQuality: AudioQuality.HIGH,
  linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false });
export function intelligenceAudioIdle() {
  const voice = useVoiceStore.getState();
  return !voice.isRecording && !voice.isPaused && !voice.isListening && !voice.voiceCommandEnabled;
}
export function createExpoPcmCapture(storage: ConsentStorage, audioIdle: () => boolean = intelligenceAudioIdle) {
  const nativeAudio: NativeAudioModule = AudioModule;
  const files = {
    info: (uri: string) => LegacyFiles.getInfoAsync(uri),
    remove: (uri: string) => LegacyFiles.deleteAsync(uri, { idempotent: true }),
    bytes: (uri: string) => new File(uri).bytes(),
  };
  return createPcmCapturePort({
    onInterruption: listener => useVoiceStore.subscribe(() => { if (!audioIdle()) listener(); }),
    available: () => Platform.OS === 'ios' && !!LegacyFiles.cacheDirectory,
    permitted: async () => (await nativeAudio.requestRecordingPermissionsAsync()).granted === true,
    mode: () => setAppAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false }),
    create: () => new nativeAudio.AudioRecorder(IOS_PCM_OPTIONS), files, audioIdle,
    cleanup: createAudioCleanup(storage, files, LegacyFiles.cacheDirectory ?? ''),
  });
}
