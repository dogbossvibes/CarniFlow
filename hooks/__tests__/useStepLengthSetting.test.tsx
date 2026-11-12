import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStepLengthSetting } from '../useStepLengthSetting';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

it('does not erase an existing personal value on invalid input or report failed writes as saved', async () => {
  await AsyncStorage.setItem('track_step_length_m', '0.68');
  let api!: ReturnType<typeof useStepLengthSetting>;
  let recording!: ReturnType<typeof useStepLengthSetting>;
  function Harness() { api = useStepLengthSetting(); recording = useStepLengthSetting({ freezeWhileMounted: true }); return null; }
  let tree!: ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(<Harness />); });
  expect(api.stepLengthM).toBe(0.68);
  await act(async () => { await expect(api.setStepLengthM(NaN)).rejects.toThrow(); });
  expect(await AsyncStorage.getItem('track_step_length_m')).toBe('0.68');
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
  await act(async () => { await expect(api.setStepLengthM(0.79)).rejects.toThrow('disk full'); });
  expect(api.stepLengthM).toBe(0.68);
  await act(async () => { await api.setStepLengthM(0.79); });
  expect(api.stepLengthM).toBe(0.79);
  expect(recording.stepLengthM).toBe(0.68); // Existing mounted recorder keeps its measurement convention.
  await act(async () => { tree.unmount(); });
});
