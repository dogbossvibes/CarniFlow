import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { AudioRecorder } from '@/components/ui/AudioRecorder';
import { MultiVideoUpload } from '@/components/training/MultiVideoUpload';
import type { AudioNote } from '@/types';

// Vorbestehender Befund (Review OTA «Bedienung», N2/N3): Der Upload schrieb mit dem
// Stand vom Start zurück. Eine Änderung während des Uploads ging dadurch verloren,
// und ein Hundewechsel konnte Medien beim falschen Hund ablegen. Neu: Zurückschreiben
// mit dem aktuellen Stand, und der Baustein meldet «beschäftigt» (onBusyChange),
// damit das Formular den Hundewechsel sperren kann.
type Deferred<T> = { resolve: (value: T) => void };
const photoUpload: Deferred<{ url: string }>[] = [];
const audioUpload: Deferred<{ url: string }>[] = [];
const videoUpload: Deferred<{ url: string }>[] = [];
const defer = <T,>(list: Deferred<T>[]) => new Promise<T>(resolve => { list.push({ resolve }); });

jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-file-system/legacy', () => ({ deleteAsync: jest.fn() }));
jest.mock('expo-video', () => ({ VideoView: 'VideoView', useVideoPlayer: () => ({ replace: () => {} }) }));
jest.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: (uri: string) => uri }));
jest.mock('@/lib/haptics', () => ({ tapHaptic: jest.fn() }));
jest.mock('@/lib/greetingAudioSafety', () => ({ setAppAudioModeAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/mediaUrl', () => ({ signMediaUrl: jest.fn() }));
jest.mock('@/components/ui/SignedImage', () => ({ SignedImage: 'SignedImage' }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: () => Promise.resolve({ status: 'granted' }),
  launchImageLibraryAsync: () => Promise.resolve({ canceled: false, assets: [{ uri: 'file://neu' }] }),
}));
jest.mock('@/services/mediaService', () => ({
  uploadImage: () => defer(photoUpload),
  uploadAudio: () => defer(audioUpload),
  uploadVideo: () => defer(videoUpload),
}));
jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({ prepareToRecordAsync: () => Promise.resolve(), record: () => {}, stop: () => Promise.resolve(), uri: 'file://neu.m4a' }),
  useAudioPlayer: () => ({ playing: false, pause: () => {}, play: () => {}, replace: () => {} }),
  useAudioPlayerStatus: () => ({ didJustFinish: false }),
  AudioModule: { requestRecordingPermissionsAsync: () => Promise.resolve({ granted: true }) },
  RecordingPresets: { HIGH_QUALITY: {} },
}));

let tree: ReactTestRenderer;
const busy = jest.fn();
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const byIcon = (names: string[]) => tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.activeOpacity != null
  && n.findAll(c => (c.type as unknown) === 'Ionicons' && names.includes(c.props.name)).length > 0)[0];
const tap = (names: string[]) => act(() => { void byIcon(names).props.onPress(); });
const confirmAlert = (spy: jest.SpyInstance) => act(() => { spy.mock.calls.at(-1)![2][1].onPress(); });

beforeEach(() => { jest.useFakeTimers(); photoUpload.length = 0; audioUpload.length = 0; videoUpload.length = 0; busy.mockClear(); });
afterEach(() => { act(() => tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });

describe('Foto', () => {
  let value: string[];
  function Form() {
    const [photos, setPhotos] = React.useState(['p1', 'p2']);
    React.useEffect(() => { value = photos; }, [photos]);
    return <PhotoPicker value={photos} onChange={setPhotos} onBusyChange={busy} />;
  }
  it('behält eine Änderung, die während des Uploads gemacht wurde', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    act(() => { tree = TestRenderer.create(<Form />); });
    tap(['add', 'add-outline', 'camera-outline', 'add-circle-outline']);
    await flush();
    expect(photoUpload).toHaveLength(1);
    expect(busy).toHaveBeenLastCalledWith(true);
    // Während des Uploads «p1» entfernen (Rückfrage bestätigt).
    tap(['close-circle']);
    confirmAlert(alert);
    expect(value).toEqual(['p2']);
    await act(async () => { photoUpload[0].resolve({ url: 'neu' }); });
    await flush();
    expect(value).toEqual(['p2', 'neu']);
    expect(busy).toHaveBeenLastCalledWith(false);
  });
});

describe('Sprachnotiz', () => {
  const first: AudioNote = { url: 'a1', duration: '0:03', createdAt: 'x' };
  let value: AudioNote[];
  function Form() {
    const [notes, setNotes] = React.useState<AudioNote[]>([first]);
    React.useEffect(() => { value = notes; }, [notes]);
    return <AudioRecorder value={notes} onChange={setNotes} onBusyChange={busy} />;
  }
  it('meldet «beschäftigt» ab Aufnahmebeginn und behält eine Änderung während des Uploads', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    act(() => { tree = TestRenderer.create(<Form />); });
    tap(['mic-outline']);
    await flush();
    expect(busy).toHaveBeenLastCalledWith(true);
    tap(['stop-circle']);
    await flush();
    expect(audioUpload).toHaveLength(1);
    tap(['trash-outline']);
    confirmAlert(alert);
    expect(value).toEqual([]);
    await act(async () => { audioUpload[0].resolve({ url: 'a2' }); });
    await flush();
    expect(value.map(n => n.url)).toEqual(['a2']);
    expect(busy).toHaveBeenLastCalledWith(false);
  });
});

describe('Video', () => {
  let value: string[];
  function Form() {
    const [videos, setVideos] = React.useState(['v1']);
    React.useEffect(() => { value = videos; }, [videos]);
    return <MultiVideoUpload value={videos} onChange={setVideos} onBusyChange={busy} />;
  }
  it('behält eine Änderung, die während des Uploads gemacht wurde', async () => {
    act(() => { tree = TestRenderer.create(<Form />); });
    tap(['videocam-outline']);
    await flush();
    expect(videoUpload).toHaveLength(1);
    expect(busy).toHaveBeenLastCalledWith(true);
    tap(['close']);
    expect(value).toEqual([]);
    await act(async () => { videoUpload[0].resolve({ url: 'v2' }); });
    await flush();
    expect(value).toEqual(['v2']);
    expect(busy).toHaveBeenLastCalledWith(false);
  });
});

// ── Review OTA «Rückgängig» (B5, N1) ────────────────────────────────────────
describe('B5: Aushängen während des Uploads', () => {
  let photos: string[];
  function Form({ show }: { show: boolean }) {
    const [value, setValue] = React.useState(['p1']);
    React.useEffect(() => { photos = value; }, [value]);
    return show ? <PhotoPicker value={value} onChange={setValue} onBusyChange={busy} /> : null;
  }
  it('meldet «beschäftigt» bis der Upload fertig ist, auch wenn der Baustein vorher verschwindet', async () => {
    act(() => { tree = TestRenderer.create(<Form show />); });
    tap(['add', 'camera-outline']);
    await flush();
    expect(busy).toHaveBeenLastCalledWith(true);
    act(() => { tree.update(<Form show={false} />); });
    expect(busy).not.toHaveBeenLastCalledWith(false);
    await act(async () => { photoUpload[0].resolve({ url: 'neu' }); });
    await flush();
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(photos).toEqual(['p1', 'neu']);
  });

  it('Sprachnotiz: verschwindet der Baustein während der Aufnahme, wird die Sperre gelöst', async () => {
    function AudioForm({ show }: { show: boolean }) {
      const [value, setValue] = React.useState<AudioNote[]>([]);
      return show ? <AudioRecorder value={value} onChange={setValue} onBusyChange={busy} /> : null;
    }
    act(() => { tree = TestRenderer.create(<AudioForm show />); });
    tap(['mic-outline']);
    await flush();
    expect(busy).toHaveBeenLastCalledWith(true);
    act(() => { tree.update(<AudioForm show={false} />); });
    expect(busy).toHaveBeenLastCalledWith(false);
  });
});

describe('N1: Rückfrage offen, während ein Upload fertig wird', () => {
  let photos: string[];
  function Form() {
    const [value, setValue] = React.useState(['p1', 'p2']);
    React.useEffect(() => { photos = value; }, [value]);
    return <PhotoPicker value={value} onChange={setValue} />;
  }
  it('Bestätigen entfernt nur das gewählte Foto, das neue bleibt', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    act(() => { tree = TestRenderer.create(<Form />); });
    tap(['add']);
    await flush();
    tap(['close-circle']);                  // Rückfrage zu «p1» offen
    await act(async () => { photoUpload[0].resolve({ url: 'neu' }); });
    await flush();
    expect(photos).toEqual(['p1', 'p2', 'neu']);
    confirmAlert(alert);
    expect(photos).toEqual(['p2', 'neu']);
  });
});
