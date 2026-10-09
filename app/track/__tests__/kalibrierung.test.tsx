import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';
import StepCalibrationScreen from '../kalibrierung';

const mockBack = jest.fn(), mockToast = jest.fn(), mockSave = jest.fn(), mockReload = jest.fn();
const mockT = (key: string) => key;
let mockBlocked = false;
let mockLoaded = true;
let mockMeasurement: Record<string, unknown>;
jest.mock('@/features/tracking/store/trackingStore', () => {
  const getState = () => ({ isRecording: mockBlocked, sessionStatus: 'completed' });
  return { useTrackingStore: Object.assign((select: (v: unknown) => unknown) => select(getState()), { getState }) };
});
jest.mock('@/features/tracking/hooks/useStepCalibration', () => ({ useStepCalibration: () => mockMeasurement }));
jest.mock('@/hooks/useStepLengthSetting', () => ({ useStepLengthSetting: () => ({ stepLengthM: .68, loaded: mockLoaded, loadError: false, reload: mockReload, setStepLengthM: mockSave }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast, toast: null }) }));
jest.mock('@/components/help/HelpButton', () => ({ HelpButton: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: mockT }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => true, back: mockBack, replace: mockBack }),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SafeAreaView: require('react-native').View,
}));
let tree: ReactTestRenderer;
async function render() { await act(async () => { tree = TestRenderer.create(<StepCalibrationScreen />); }); }
function button(label: string) { return tree.root.findAll(n => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label && n.props.onPress)[0]; }
beforeEach(() => {
  jest.clearAllMocks(); mockBlocked = false; mockLoaded = true;
  mockSave.mockResolvedValue(undefined);
  mockMeasurement = { phase: 'idle', distanceM: 0, accuracy: null, stepLengthM: null, issue: null,
    start: jest.fn(), begin: jest.fn(), finish: jest.fn(), interrupt: jest.fn(), reset: jest.fn() };
});
afterEach(async () => { if (tree) await act(async () => { tree.unmount(); }); jest.restoreAllMocks(); });
it('does not permit calibration while personal data is loading or a track is active', async () => {
  mockLoaded = false; await render(); expect(button('track.startCalibration').props.disabled).toBe(true);
  mockLoaded = true; mockBlocked = true;
  await act(async () => { tree.update(<StepCalibrationScreen />); });
  expect(button('track.startCalibration').props.disabled).toBe(true);
  expect(mockSave).not.toHaveBeenCalled();
});
it('resets only after the explicit destructive alert confirmation', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(); act(() => button('track.resetToDefault').props.onPress());
  expect(mockSave).not.toHaveBeenCalled();
  const actions = alert.mock.calls[0][2]!;
  await act(async () => { actions[1].onPress?.(); });
  expect(mockSave).toHaveBeenCalledWith(null); expect(mockBack).not.toHaveBeenCalled();
});
it('shows save failure and keeps the result available for retry', async () => {
  mockMeasurement = { ...mockMeasurement, phase: 'result', distanceM: 37.5, stepLengthM: .75 };
  mockSave.mockRejectedValueOnce(new Error('disk full')); await render();
  await act(async () => { button('track.applyStepLength').props.onPress(); });
  expect(mockToast).toHaveBeenCalledWith('track.calibrationSaveFailed'); expect(mockBack).not.toHaveBeenCalled();
  expect(button('track.applyStepLength').props.disabled).toBe(false);
});
it('guards double save immediately and does not navigate from a late completion after unmount', async () => {
  mockMeasurement = { ...mockMeasurement, phase: 'result', distanceM: 37.5, stepLengthM: .75 };
  let resolve!: () => void; mockSave.mockReturnValueOnce(new Promise<void>(r => { resolve = r; }));
  await render(); const press = button('track.applyStepLength').props.onPress;
  act(() => { press(); press(); }); expect(mockSave).toHaveBeenCalledTimes(1);
  expect(button('common.saving').props.accessibilityState.busy).toBe(true);
  await act(async () => { tree.unmount(); }); await act(async () => { resolve(); });
  expect(mockBack).not.toHaveBeenCalled(); expect(mockToast).not.toHaveBeenCalled();
});
it('never offers an apply action for an uncertain result or writes a preference on cancel', async () => {
  mockMeasurement = { ...mockMeasurement, phase: 'result', distanceM: 30, issue: 'uncertain' };
  await render(); expect(button('track.applyStepLength')).toBeUndefined();
  act(() => button('common.cancel').props.onPress()); expect(mockSave).not.toHaveBeenCalled(); expect(mockBack).toHaveBeenCalledTimes(1);
});
