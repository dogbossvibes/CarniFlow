import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { keyForUser, markHelpSeen, resetHelpSeen, useHelpSeenState } from '../helpSeen';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let node: ReactTestRenderer;
let latest: ReturnType<typeof useHelpSeenState>;
function Probe({ user }: { user: string }) { latest = useHelpSeenState(user); return null; }
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
});
afterEach(() => { act(() => node?.unmount()); });
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

it('ignores late hydration and stale close/reset callbacks from a previous account', async () => {
  const reads = new Map<string, (value: string | null) => void>();
  jest.mocked(AsyncStorage.getItem).mockImplementation(key => new Promise(resolve => { reads.set(key, resolve); }));
  await act(async () => { node = TestRenderer.create(<Probe user="help-race-a" />); });
  await act(async () => node.update(<Probe user="help-race-b" />));
  await act(async () => { reads.get(keyForUser('help-race-b'))!(JSON.stringify(['track_laying'])); });
  expect(latest).toEqual({ seen: ['track_laying'], hydrated: true });
  await act(async () => { reads.get(keyForUser('help-race-a'))!(JSON.stringify(['home'])); });
  expect(latest).toEqual({ seen: ['track_laying'], hydrated: true });
  act(() => { markHelpSeen('track_gps', 'help-race-a'); resetHelpSeen('help-race-a'); });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  act(() => markHelpSeen('track_gps', 'help-race-b'));
  await flush();
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(keyForUser('help-race-b'), JSON.stringify(['track_laying', 'track_gps']));
  expect(jest.mocked(AsyncStorage.setItem).mock.calls.every(([key]) => key.startsWith('help_seen_topics:'))).toBe(true);
});

it('serializes seen/reset writes for the same account', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  let release!: () => void;
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  await act(async () => { node = TestRenderer.create(<Probe user="help-write-order" />); });
  act(() => markHelpSeen('track_gps', 'help-write-order')); await flush();
  act(() => resetHelpSeen('help-write-order')); await flush();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  release(); await flush(); await flush();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
  expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(keyForUser('help-write-order'), '[]');
});

it('handles an unreadable help state without writing an empty replacement on load', async () => {
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => { node = TestRenderer.create(<Probe user="help-unreadable" />); });
  expect(latest).toEqual({ seen: [], hydrated: true });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

it('waits for an earlier help write before loading the account again', async () => {
  const saved = new Map<string, string>();
  jest.mocked(AsyncStorage.getItem).mockImplementation(async key => saved.get(key) ?? null);
  let release!: () => void;
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce((key, value) => new Promise<void>(resolve => {
    release = () => { saved.set(key, value); resolve(); };
  }));
  await act(async () => { node = TestRenderer.create(<Probe user="help-return-a" />); });
  act(() => markHelpSeen('home', 'help-return-a')); await flush();
  await act(async () => node.update(<Probe user="help-return-b" />));
  await act(async () => node.update(<Probe user="help-return-a" />));
  expect(latest.hydrated).toBe(false);
  release(); await flush(); await flush();
  expect(latest).toEqual({ seen: ['home'], hydrated: true });
});
