import React from 'react';
import { Alert, Platform } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DogTrackingPanel } from '../DogTrackingPanel';
import { TrackResumeCta } from '../TrackResumeCta';
import { ActiveFaehrteCard } from '../ActiveFaehrteCard';
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
jest.mock('@/features/tracking/services/trackService', () => ({ getTrackCompletionById: (...a: unknown[]) => mockRemote(...a) }));
jest.mock('@/services/dogs', () => ({ updateDog: (...a: unknown[]) => mockUpdate(...a) }));
jest.mock('../TrackResumeCta', () => ({ TrackResumeCta: () => null }));
jest.mock('../ActiveFaehrteCard', () => ({ ActiveFaehrteCard: () => null }));
let view: any;
const mount = async () => { await act(async () => { view = TestRenderer.create(<DogTrackingPanel userId="u" dogId="d" dogName="Malu" />); }); };
beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
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
it('keeps an unknown historical completion offline as retry, never as a verified open track', async () => {
  mockRemote.mockRejectedValue(new Error('offline')); await mount();
  expect(view.root.findAllByType(TrackResumeCta)).toHaveLength(0);
  expect(view.root.findAll((n: any) => n.props.testID === 'dog-recovery-retry-completion').length).toBeGreaterThan(0);
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

it('does not expose recovery after a failed run read and retries the same scoped track', async () => {
  mockRemote.mockResolvedValueOnce({ data: null, error: 'run timeout' })
    .mockResolvedValueOnce({ data: { id: 's', dog_id: 'd', owner_id: 'u', runs: [] }, error: null });
  await mount(); expect(view.root.findAllByType(TrackResumeCta)).toHaveLength(0);
  await act(async () => { view.root.findAll((n: any) => n.props.testID === 'dog-recovery-retry-completion')[0].props.onPress(); });
  expect(view.root.findByType(TrackResumeCta).props.sessionId).toBe('s');
  expect(mockRemote.mock.calls).toEqual([['s'], ['s']]);
});
it('does not trust another account or dog completion result', async () => {
  mockRemote.mockResolvedValue({ data: { id: 's', dog_id: 'd', owner_id: 'other', runs: [] } });
  await mount(); expect(view.root.findAllByType(TrackResumeCta)).toHaveLength(0);
});

it('retains the active local track card offline while historical completion needs retry', async () => {
  mockActive = { sessionId: 'active-local', status: 'resting' };
  mockRemote.mockRejectedValue(new Error('offline')); await mount();
  expect(view.root.findAllByType(ActiveFaehrteCard)).toHaveLength(1);
  expect(view.root.findAllByType(TrackResumeCta)).toHaveLength(0);
});

it('ignores late completion from the previous account and dog', async () => {
 let finish!: (value: unknown) => void;
 mockGetTracks.mockImplementation(async (user: string) => [{ id: user === 'u' ? 's' : 'new', date: 'today' }]);
 mockRemote.mockImplementation((id: string) => id === 's' ? new Promise(resolve => { finish = resolve; })
   : Promise.resolve({ data: { id:'new', owner_id:'other', dog_id:'other-dog', runs:[{ended_at:'done'}] }, error:null }));
 await mount();mockDog={id:'other-dog',owner_id:'other',track_overlay_color_key:'violet'};
 await act(async () => { view.update(<DogTrackingPanel userId="other" dogId="other-dog" dogName="Other" />); });
 await act(async () => { finish({data:{id:'s',owner_id:'u',dog_id:'d',runs:[]},error:null}); });
 expect(view.root.findAllByType(TrackResumeCta)).toHaveLength(0);
 expect(mockRemote.mock.calls.map(([id])=>id)).toContain('new');
});
