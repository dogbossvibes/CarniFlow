import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DogTrackingPanel } from '../DogTrackingPanel';
import { TrackResumeCta } from '../TrackResumeCta';
import { TrackColorPicker } from '@/components/dogs/TrackColorPicker';

const mockGetTracks = jest.fn(), mockRemote = jest.fn(), mockUpdate = jest.fn(), mockRefresh = jest.fn(), mockPush = jest.fn();
let mockDog: Record<string, unknown> | null = { id: 'd', owner_id: 'u', track_overlay_color_key: 'violet' };
let mockActive: Record<string, unknown> | null = null;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: (cb: () => void) => { const React = jest.requireActual('react'); React.useEffect(cb, [cb]); } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k, locale: 'de-CH' }) }));
jest.mock('@/features/tracking/hooks/useDogTrackColor', () => ({ useDogTrackColor: () => ({ dog: mockDog, color: '#A78BFA', colorKey: 'violet', storedKey: 'violet', loading: false, refresh: mockRefresh }) }));
jest.mock('@/features/tracking/hooks/useActiveFaehrte', () => ({ useDogActiveFaehrte: () => mockActive }));
jest.mock('@/features/tracking/services/dogTrackRecoveryService', () => ({ getDogRecoveryTracks: (...a: unknown[]) => mockGetTracks(...a) }));
jest.mock('@/features/tracking/services/trackService', () => ({ getTrackSessionById: (...a: unknown[]) => mockRemote(...a) }));
jest.mock('@/services/dogs', () => ({ updateDog: (...a: unknown[]) => mockUpdate(...a) }));
jest.mock('../TrackResumeCta', () => ({ TrackResumeCta: () => null }));
jest.mock('../ActiveFaehrteCard', () => ({ ActiveFaehrteCard: () => null }));
let view: any;
const mount = async () => { await act(async () => { view = TestRenderer.create(<DogTrackingPanel userId="u" dogId="d" dogName="Malu" />); }); };
beforeEach(() => {
  jest.clearAllMocks(); mockActive = null; mockDog = { id: 'd', owner_id: 'u', track_overlay_color_key: 'violet' };
  mockGetTracks.mockResolvedValue([{ id: 's', date: '2026-10-08', cancelled: true }]);
  mockRemote.mockResolvedValue({ data: null }); mockUpdate.mockResolvedValue({ data: mockDog, error: null });
  mockRefresh.mockResolvedValue(undefined); jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => { if (view) act(() => view.unmount()); jest.restoreAllMocks(); });
it('shows the original cancelled track recovery directly in its dog profile, bound to account and dog', async () => {
  await mount(); expect(mockGetTracks).toHaveBeenCalledWith('u', 'd');
  expect(view.root.findByType(TrackResumeCta).props).toMatchObject({ sessionId: 's', dogId: 'd', userId: 'u', hasRemoteSearchRun: false });
});
it('blocks recovery for a remotely completed search', async () => {
  mockRemote.mockResolvedValue({ data: { id: 's', dog_id: 'd', owner_id: 'u', runs: [{ ended_at: '2026-10-08' }] } });
  await mount(); expect(view.root.findAllByType(TrackResumeCta)).toHaveLength(0);
});
it('retains offline recovery when the server is unavailable', async () => {
  mockRemote.mockRejectedValue(new Error('offline')); await mount();
  expect(view.root.findByType(TrackResumeCta).props.sessionId).toBe('s');
});
const openColors = () => { const btn = view.root.findAll((n: any) => n.props.testID === 'dog-track-color-toggle')[0]; act(() => btn.props.onPress()); };
it('saves only the color field and refreshes the confirmed server value', async () => {
  await mount(); openColors(); await act(async () => { await view.root.findByType(TrackColorPicker).props.onChange('orange'); });
  expect(mockUpdate).toHaveBeenCalledWith('d', { track_overlay_color_key: 'orange' }); expect(mockRefresh).toHaveBeenCalledTimes(1);
});
it('does not pretend a failed color save succeeded', async () => {
  mockUpdate.mockResolvedValue({ error: new Error('offline') }); await mount(); openColors();
  await act(async () => { await view.root.findByType(TrackColorPicker).props.onChange('orange'); });
  expect(mockRefresh).not.toHaveBeenCalled(); expect(Alert.alert).toHaveBeenCalled();
  expect(view.root.findByType(TrackColorPicker).props.value).toBe('violet');
});
it('keeps color selection visible but disabled if the required server field is absent', async () => {
  mockDog = { id: 'd', owner_id: 'u' }; await mount(); openColors();
  expect(view.root.findByType(TrackColorPicker).props.disabled).toBe(true);
  await act(async () => { await view.root.findByType(TrackColorPicker).props.onChange('orange'); });
  expect(mockUpdate).not.toHaveBeenCalled();
});
it('ignores a late remote result from a previously selected track', async () => {
  let finish!: (v: unknown) => void;
  mockGetTracks.mockResolvedValue([{ id: 's', date: '2026-10-08' }, { id: 'older', date: '2026-09-01' }]);
  mockRemote.mockImplementation((id: string) => id === 's' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ data: null }));
  await mount();
  act(() => view.root.findAll((n: any) => n.props.testID === 'dog-recovery-choose')[0].props.onPress());
  await act(async () => { view.root.findAll((n: any) => n.props.testID === 'dog-recovery-track-older')[0].props.onPress(); });
  await act(async () => { finish({ data: { id: 's', dog_id: 'd', owner_id: 'u', runs: [{ ended_at: 'done' }] } }); });
  expect(view.root.findByType(TrackResumeCta).props.sessionId).toBe('older');
});

it('a late color save cannot refresh the previous account/dog context', async () => {
  let finish!: (result: unknown) => void;
  mockUpdate.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await mount(); openColors();
  let promise!: Promise<boolean>;
  act(() => { promise = view.root.findByType(TrackColorPicker).props.onChange('#ABCDEF'); });
  mockDog = { id: 'other', owner_id: 'other-user', track_overlay_color_key: 'orange' };
  await act(async () => { view.update(<DogTrackingPanel userId="other-user" dogId="other" dogName="Other" />); });
  await act(async () => { finish({ error: null }); await promise; });
  expect(mockUpdate).toHaveBeenCalledWith('d', { track_overlay_color_key: '#ABCDEF' });
  expect(mockRefresh).not.toHaveBeenCalled(); expect(Alert.alert).not.toHaveBeenCalled();
});
