import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDogTrackColor } from '../useDogTrackColor';
import { autoTrackOverlayColorKey, trackOverlayColor } from '@/features/tracking/utils/trackOverlayColors';

let mockUser = 'u';
const mockGetDog = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => { const React = jest.requireActual('react'); React.useEffect(cb, [cb]); } }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockUser } } }) }));
jest.mock('@/services/dogs', () => ({ getDogById: (...a: unknown[]) => mockGetDog(...a) }));
let latest: ReturnType<typeof useDogTrackColor>;
function Probe({ dogId }: { dogId: string }) { latest = useDogTrackColor(dogId); return null; }
let view: any;
beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); mockUser = 'u'; });
afterEach(() => { if (view) act(() => view.unmount()); });
it('keeps a confirmed dog color available across an offline restart', async () => {
  mockGetDog.mockResolvedValue({ data: { id: 'd', owner_id: 'u', track_overlay_color_key: 'violet' } });
  await act(async () => { view = TestRenderer.create(<Probe dogId="d" />); });
  expect(latest.color).toBe(trackOverlayColor('violet'));
  act(() => view.unmount()); mockGetDog.mockRejectedValue(new Error('offline'));
  await act(async () => { view = TestRenderer.create(<Probe dogId="d" />); });
  expect(latest.color).toBe(trackOverlayColor('violet')); expect(latest.dog).toBeNull();
});
it('does not read another account’s cached color or accept an out-of-scope server row', async () => {
  await AsyncStorage.setItem('anyvo.dogTrackColor.v1::other::d', '"lime"');
  mockGetDog.mockResolvedValue({ data: { id: 'd', owner_id: 'other', track_overlay_color_key: 'lime' } });
  await act(async () => { view = TestRenderer.create(<Probe dogId="d" />); });
  expect(latest.dog).toBeNull(); expect(latest.colorKey).toBe(autoTrackOverlayColorKey('d'));
});
it('a delayed previous-dog response cannot overwrite the newly selected dog or its cache', async () => {
  let finish!: (value: unknown) => void;
  mockGetDog.mockImplementation((id: string) => id === 'old' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ data: { id, owner_id: 'u', track_overlay_color_key: 'orange' } }));
  await act(async () => { view = TestRenderer.create(<Probe dogId="old" />); });
  await act(async () => { view.update(<Probe dogId="new" />); });
  await act(async () => { finish({ data: { id: 'old', owner_id: 'u', track_overlay_color_key: 'lime' } }); });
  expect(latest.dog?.id).toBe('new'); expect(latest.colorKey).toBe('orange');
  expect(await AsyncStorage.getItem('anyvo.dogTrackColor.v1::u::old')).toBeNull();
});

it('restores a normalized custom color offline without using another dog cache', async () => {
  mockGetDog.mockResolvedValue({ data: { id: 'd', owner_id: 'u', track_overlay_color_key: '#a1b2c3' } });
  await act(async () => { view = TestRenderer.create(<Probe dogId="d" />); });
  expect(latest.color).toBe('#A1B2C3');
  expect(await AsyncStorage.getItem('anyvo.dogTrackColor.v1::u::d')).toBe('"#A1B2C3"');
  act(() => view.unmount()); mockGetDog.mockRejectedValue(new Error('offline'));
  await act(async () => { view = TestRenderer.create(<Probe dogId="d" />); });
  expect(latest.color).toBe('#A1B2C3');
  await act(async () => { view.update(<Probe dogId="another" />); });
  expect(latest.colorKey).toBe(autoTrackOverlayColorKey('another'));
});
