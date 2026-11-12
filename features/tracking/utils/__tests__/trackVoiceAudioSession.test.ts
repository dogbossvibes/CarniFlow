import { Platform } from 'react-native';
import { acquireTrackVoiceAudio, TRACK_VOICE_AUDIO_IDLE_MODE, TRACK_VOICE_AUDIO_MODE, trackVoiceAudioSettled } from '../trackVoiceAudioSession';

jest.mock('@/lib/greetingAudioSafety', () => ({ setAppAudioModeAsync: jest.fn(async () => {}) }));
const setMode = jest.requireMock('@/lib/greetingAudioSafety').setAppAudioModeAsync as jest.Mock;
const originalOS = Platform.OS;
afterEach(() => { setMode.mockReset(); setMode.mockImplementation(async () => {}); (Platform as { OS: string }).OS = originalOS; });

describe('Audio-Sitzung der Fährten-Ansage (T-204)', () => {
  it('iOS: hörbar trotz Stummschalter und bei gesperrtem Bildschirm, andere Apps laufen weiter', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const release = acquireTrackVoiceAudio();
    await trackVoiceAudioSettled();
    expect(setMode).toHaveBeenCalledTimes(1);
    expect(setMode).toHaveBeenLastCalledWith(expect.objectContaining({
      playsInSilentMode: true, shouldPlayInBackground: true, allowsRecording: false, interruptionMode: 'mixWithOthers' }));
    release();
    await trackVoiceAudioSettled();
    expect(setMode).toHaveBeenLastCalledWith(TRACK_VOICE_AUDIO_IDLE_MODE);
    expect(TRACK_VOICE_AUDIO_IDLE_MODE.shouldPlayInBackground).toBe(false);
    release();                                   // doppelte Freigabe ist unschädlich
    await trackVoiceAudioSettled();
    expect(setMode).toHaveBeenCalledTimes(2);
  });

  it('zwei Nutzer (z. B. Bildschirmwechsel): erst die letzte Freigabe schaltet zurück', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const a = acquireTrackVoiceAudio();
    const b = acquireTrackVoiceAudio();
    a();
    await trackVoiceAudioSettled();
    expect(setMode).toHaveBeenCalledTimes(1);
    expect(setMode).toHaveBeenLastCalledWith(TRACK_VOICE_AUDIO_MODE);
    b();
    await trackVoiceAudioSettled();
    expect(setMode).toHaveBeenCalledTimes(2);
  });

  it('ein Fehler der Audio-Sitzung wird geschluckt und blockiert spätere Umschaltungen nicht', async () => {
    (Platform as { OS: string }).OS = 'ios';
    setMode.mockRejectedValueOnce(new Error('session busy'));
    const release = acquireTrackVoiceAudio();
    await expect(trackVoiceAudioSettled()).resolves.toBeUndefined();
    release();
    await trackVoiceAudioSettled();
    expect(setMode).toHaveBeenCalledTimes(2);
  });

  it('Android: keine Umschaltung', async () => {
    (Platform as { OS: string }).OS = 'android';
    acquireTrackVoiceAudio()();
    await trackVoiceAudioSettled();
    expect(setMode).not.toHaveBeenCalled();
  });
});
