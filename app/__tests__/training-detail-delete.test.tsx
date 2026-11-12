import React from 'react';
import { Alert, TouchableOpacity } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { setGpsCaptureAccount } from '@/features/tracking/storage/gpsCaptureScope';

const mockDelete = jest.fn();
const mockRouter = { back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ id: 'session' }) }));
jest.mock('@/services/training', () => ({
  getTrainingSessionById: async () => ({ data: { id: 'session', category: 'IGP', training_type: 'privat', session_date: '2026-11-01', photo_urls: [], audio_urls: [] }, error: null }),
  deleteTrainingSession: (...args: unknown[]) => mockDelete(...args),
  updateTrainingSession: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'Gradient' }));
jest.mock('@/components/ui/KeyboardAwareScrollView', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
for (const name of ['DateField', 'AnimatedPressable', 'DogIcon', 'DurationDrumPicker', 'PhotoPicker', 'VideoUpload', 'AudioRecorder']) {
  jest.doMock(`@/components/ui/${name}`, () => ({ [name]: name }));
}
jest.mock('@/components/ShareSheet', () => ({ ShareSheet: 'ShareSheet' }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Screen = require('@/app/training/[id]').default;
let view: ReactTestRenderer;
beforeEach(() => {
  mockDelete.mockReset().mockResolvedValue({ error: null }); mockRouter.back.mockClear();
  setGpsCaptureAccount('a', true); jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => { act(() => view?.unmount()); jest.restoreAllMocks(); setGpsCaptureAccount(null); });
async function mount() { await act(async () => { view = TestRenderer.create(<Screen />); }); }
function confirmDelete() {
  const button = view.root.findAll(n => (n as unknown as { type: unknown }).type === TouchableOpacity)
    .find(n => n.findAll(t => t.props.children === 'Einheit löschen').length > 0)!;
  act(() => button.props.onPress());
  return (Alert.alert as jest.Mock).mock.calls.at(-1)[2].find((b: { style: string }) => b.style === 'destructive').onPress;
}
it.each(['rejected', 'returned'])('keeps the screen retryable after %s deletion failure', async mode => {
  if (mode === 'rejected') mockDelete.mockRejectedValueOnce(new Error('RAW_WRITE_FAILED'));
  else mockDelete.mockResolvedValueOnce({ error: { message: 'offline' } });
  await mount();
  await act(async () => { await confirmDelete()(); });
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('Fehler', 'Einheit konnte nicht entfernt werden. Bitte erneut versuchen.');
  await act(async () => { await confirmDelete()(); });
  expect(mockDelete).toHaveBeenCalledTimes(2); expect(mockRouter.back).toHaveBeenCalledTimes(1);
});
it('does not navigate when an in-flight deletion completes after account changes and returns', async () => {
  let finish!: (value: unknown) => void;
  mockDelete.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount(); const action = confirmDelete(); let pending: Promise<void>;
  await act(async () => { pending = action(); });
  setGpsCaptureAccount('b'); setGpsCaptureAccount('a');
  await act(async () => { finish({ error: null }); await pending; });
  expect(mockRouter.back).not.toHaveBeenCalled();
});
it('deduplicates repeated confirmations while deletion is pending', async () => {
  let finish!: (value: unknown) => void;
  mockDelete.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount(); const action = confirmDelete(); let pending: Promise<void>;
  await act(async () => { pending = action(); await action(); });
  expect(mockDelete).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ error: null }); await pending; });
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});
it('ignores confirmation after the screen has unmounted', async () => {
  await mount(); const action = confirmDelete(); act(() => view.unmount());
  await act(async () => { await action(); });
  expect(mockDelete).not.toHaveBeenCalled(); expect(mockRouter.back).not.toHaveBeenCalled();
});
