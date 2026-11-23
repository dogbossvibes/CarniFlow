import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AudioRecorder } from '@/components/ui/AudioRecorder';
import { getUndoToastSnapshot, undoToast } from '@/lib/undoToast';
import type { AudioNote } from '@/types';

// Review OTA «Bedienung 2», Befund B4: Während Aufnahme, Stoppen und Hochladen
// schreibt der Baustein später mit dem Stand vom Stopp-Tipp zurück. In dieser
// Zeit darf es weder ein Entfernen mit Rückgängig noch einen offenen Hinweis
// geben – sonst wird eine als zurückgeholt gemeldete Sprachnotiz still entfernt.
let stopRecorder: () => void;
let finishUpload: (result: { url: string }) => void;
const mockStop = jest.fn(() => new Promise<void>(resolve => { stopRecorder = resolve; }));
const mockUpload = jest.fn((_uri: string) => new Promise<{ url: string }>(resolve => { finishUpload = resolve; }));

jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-file-system/legacy', () => ({ deleteAsync: jest.fn() }));
jest.mock('@/lib/greetingAudioSafety', () => ({ setAppAudioModeAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/mediaUrl', () => ({ signMediaUrl: jest.fn() }));
jest.mock('@/services/mediaService', () => ({ uploadAudio: (uri: string) => mockUpload(uri) }));
jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({ prepareToRecordAsync: () => Promise.resolve(), record: () => {}, stop: () => mockStop(), uri: 'file://neu.m4a' }),
  useAudioPlayer: () => ({ playing: false, pause: () => {}, play: () => {}, replace: () => {} }),
  useAudioPlayerStatus: () => ({ didJustFinish: false }),
  AudioModule: { requestRecordingPermissionsAsync: () => Promise.resolve({ granted: true }) },
  RecordingPresets: { HIGH_QUALITY: {} },
}));

const first: AudioNote = { url: 'a1', duration: '0:03', createdAt: 'x' };
let tree: ReactTestRenderer;
let value: AudioNote[];
function Form() {
  const [notes, setNotes] = React.useState<AudioNote[]>([first]);
  React.useEffect(() => { value = notes; }, [notes]);
  return <AudioRecorder value={notes} onChange={setNotes} removal="undo" undoScope="hund-a" />;
}
const iconButton = (names: string[]) => tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.activeOpacity != null
  && n.findAll(c => (c.type as unknown) === 'Ionicons' && names.includes(c.props.name)).length > 0)[0];
const tapRecord = () => act(async () => { await iconButton(['mic-outline', 'stop-circle']).props.onPress(); });
const tapTrash = () => act(() => { iconButton(['trash-outline']).props.onPress(); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

beforeEach(async () => {
  jest.useFakeTimers(); mockStop.mockClear(); mockUpload.mockClear();
  await act(async () => { tree = TestRenderer.create(<Form />); });
});
afterEach(() => {
  const open = getUndoToastSnapshot(); if (open) undoToast(open.id);
  act(() => tree.unmount()); jest.useRealTimers();
});

it('B4: während der Aufnahme lässt sich keine Sprachnotiz entfernen', async () => {
  await tapRecord();
  tapTrash();
  expect(value).toEqual([first]);
  expect(getUndoToastSnapshot()).toBeNull();
});

it('B4: auch während Stoppen und Hochladen nicht – die frühere Notiz bleibt erhalten', async () => {
  await tapRecord();
  act(() => { void iconButton(['stop-circle']).props.onPress(); }); // Stopp getippt, recorder.stop() läuft noch
  await flush();
  tapTrash();
  expect(getUndoToastSnapshot()).toBeNull();
  await act(async () => { stopRecorder(); });
  await flush();
  expect(mockUpload).toHaveBeenCalledTimes(1);
  tapTrash();                             // Upload läuft
  expect(getUndoToastSnapshot()).toBeNull();
  await act(async () => { finishUpload({ url: 'a2' }); });
  await flush();
  expect(value.map(n => n.url)).toEqual(['a1', 'a2']);
});

it('B4: ein vor der Aufnahme offener Hinweis ist beim Start geschlossen und nicht mehr wirksam', async () => {
  tapTrash();
  const open = getUndoToastSnapshot()!;
  expect(value).toEqual([]);
  await tapRecord();
  expect(getUndoToastSnapshot()).toBeNull();
  act(() => { undoToast(open.id); });
  expect(value).toEqual([]);
});

it('ohne laufende Aufnahme bleibt Entfernen mit Rückgängig möglich', () => {
  tapTrash();
  expect(value).toEqual([]);
  act(() => { undoToast(getUndoToastSnapshot()!.id); });
  expect(value).toEqual([first]);
});
