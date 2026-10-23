import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, StyleSheet, Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import Overview from '../index';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { FaehrtenHeader, StatTriple, TrackRow } from '@/features/tracking/components/FaehrtenChrome';
import { trackOverlayColor } from '@/features/tracking/utils/trackOverlayColors';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

let mockParams: Record<string, string> = { tab: 'tracks' };
let mockActive: any[] = [];
let mockUser = 'u';
let mockHydrated = true;
const mockDelete = jest.fn();
const mockHistory = jest.fn(), mockPreview = jest.fn(), mockRefresh = jest.fn();
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
const mockDogs = [{ id: 'd', owner_id: 'u', name: 'Malu', track_overlay_color_key: 'violet' }, { id: 'other', owner_id: 'u', name: 'Skadi', track_overlay_color_key: 'orange' }];
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams, useFocusEffect: (cb: () => void) => { const React = jest.requireActual('react'); React.useEffect(cb, [cb]); } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockDogs, refresh: mockRefresh }) }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockUser } } }) }));
jest.mock('@/features/tracking/services/trackHistoryService', () => ({ getTrackHistory: (...a: unknown[]) => mockHistory(...a) }));
jest.mock('@/features/tracking/services/trackPreviewService', () => ({ getRecentTrackPreviews: (...a: unknown[]) => mockPreview(...a), getTrackPreview: async () => null }));
jest.mock('@/features/tracking/services/trackService', () => ({ deleteTrackSession: (...a: unknown[]) => mockDelete(...a) }));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({ markTrainingAsDeleted: jest.fn() }));
jest.mock('@/features/sync/services/syncEngine', () => ({ retryFailedSync: jest.fn() }));
jest.mock('@/features/tracking/components/GlobalActiveFaehrtenBar', () => ({ GlobalActiveFaehrtenBar: () => null }));
jest.mock('@/features/tracking/store/activeFaehrten', () => ({ useActiveFaehrten: Object.assign(() => mockHydrated, { getState: () => ({ list: () => [] }) }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn(), toast: null }) }));
jest.mock('@/features/tracking/hooks/useActiveFaehrte', () => ({ useActiveFaehrtenList: () => mockActive, useFaehrteElapsed: () => 0 }));
let view: any;
const row = (dog = 'd') => ({ id: `s-${dog}`, dog_id: dog, status: 'completed', distance_meters: 0, corners_total: null, articles_total: null, isLocalOnly: true, created_at: '2026-10-08' });
const gps = { lay: [{ lat: 47, lng: 8 }, { lat: 47.001, lng: 8.001 }], markers: [] };
const mount = async () => { await act(async () => { view = TestRenderer.create(<Overview />); }); };
const texts = () => view.root.findAllByType(Text).flatMap((n: any) => n.props.children);
beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); mockActive = []; mockParams = { tab: 'tracks' }; mockUser = 'u'; mockHydrated = true; mockHistory.mockResolvedValue([row(), row('other')]); mockPreview.mockResolvedValue({}); });
afterEach(() => { if (view) act(() => view.unmount()); });
it('shows an honest unavailable-GPS state and never substitutes a count-based line', async () => {
  await mount(); expect(texts()).toContain('track.preview.noGps');
  expect(view.root.findAllByType(TrackSketch).every((n: any) => n.props.points == null)).toBe(true);
  expect(view.root.findByType(StatTriple).props.total).toBe(1);
});
it('loads local-only geometry and displays actual positions in the dog color', async () => {
  mockPreview.mockResolvedValue({ 's-d': gps }); await mount();
  expect(mockPreview).toHaveBeenCalledWith([row()], 'd', 'u');
  const hero = view.root.findAllByType(TrackSketch).find((n: any) => n.props.w === 344)!;
  expect(hero.props.points).toEqual(gps.lay); expect(hero.props.accent).toBe(trackOverlayColor('violet'));
  expect(texts()).toContain('track.preview.recorded');
  // Statistics occupy their own flow section instead of covering the recorded path.
  const statsContainer = view.root.findByType(StatTriple).parent!;
  expect(StyleSheet.flatten(statsContainer.props.style)?.position).not.toBe('absolute');
});
it('gives both visible history rows their own recorded path', async () => {
  const older = { ...row(), id: 's-older' };
  const olderGps = { ...gps, lay: [{ lat: 46, lng: 7 }, { lat: 46.001, lng: 7.001 }] };
  mockHistory.mockResolvedValue([row(), older, row('other')]);
  mockPreview.mockResolvedValue({ 's-d': gps, 's-older': olderGps });
  await mount();
  expect(mockPreview).toHaveBeenCalledWith([row(), older], 'd', 'u');
  const histories = view.root.findAllByType(TrackRow);
  expect(histories.map((n: any) => [n.props.h.id, n.props.points])).toEqual([
    ['s-d', gps.lay], ['s-older', olderGps.lay],
  ]);
});
it('ignores a delayed previous-dog preview after a dog switch', async () => {
  let finish!: (v: unknown) => void;
  mockPreview.mockImplementation((_rows: unknown, dogId: string) => dogId === 'd' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ 's-other': { ...gps, lay: [{ lat: 48, lng: 9 }] } }));
  await mount(); await act(async () => { view.root.findByType(FaehrtenHeader).props.onDog('other'); });
  await act(async () => { finish({ 's-d': gps }); });
  const hero = view.root.findAllByType(TrackSketch).find((n: any) => n.props.w === 344)!;
  expect(hero.props.points).toEqual([{ lat: 48, lng: 9 }]); expect(hero.props.accent).toBe(trackOverlayColor('orange'));
  expect(texts()).toContain('track.preview.singlePoint');
});

it('routes new laying to the selected dog and search to selection without starting a recording', async () => {
  mockParams = { dogId: 'other' }; await mount();
  const pressText = (label: string) => {
    const node = view.root.findAllByType(Text).find((n: any) => n.props.children === label);
    let button = node; while (button && !button.props.onPress) button = button.parent;
    act(() => button.props.onPress());
  };
  pressText('track.lay'); expect(mockRouter.push).toHaveBeenCalledWith('/track/legen?dogId=other');
  mockRouter.push.mockClear(); pressText('Fährte absuchen');
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(view.root.findAll((n: any) => n.props.testID === 'track-hub-tracks')[0].props.accessibilityState.selected).toBe(true);
});
it('retains the selected dog when opening Gemeinsam', async () => {
  mockParams = { dogId: 'other' }; await mount();
  act(() => view.root.findAll((n: any) => n.props.testID === 'track-hub-together')[0].props.onPress());
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/track/sharing', params: { dogId: 'other' } });
});
it('does not classify completed laying as a completed search', async () => {
  await mount(); expect(texts()).not.toContain('Absuche gespeichert · Auswertung ansehen');
  expect(texts()).toContain('Gespeichert · Details und Fortsetzen prüfen');
});
it('blocks deletion of a registered open track, including after the confirmation was opened', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await mount();
  act(() => view.root.findByType(TrackRow).props.onLongPress());
  const confirm = (alert.mock.calls[0][2] as any[]).find(b => b.style === 'destructive');
  mockActive = [{ dogId: 'd', sessionId: 's-d', status: 'resting', distanceMeters: 0, objektCount: 0 }];
  await act(async () => { view.update(<Overview />); });
  await act(async () => { await confirm.onPress(); });
  expect(mockDelete).not.toHaveBeenCalled(); alert.mockClear();
  act(() => view.root.findByType(TrackRow).props.onLongPress());
  expect(alert).not.toHaveBeenCalled(); alert.mockRestore();
});
it('hides the previous account rows while its replacement is still loading', async () => {
  await mount(); expect(view.root.findAllByType(TrackRow)).toHaveLength(1);
  let resolve!: (value: unknown) => void;
  mockUser = 'new-user'; mockHistory.mockImplementation(() => new Promise(r => { resolve = r; }));
  await act(async () => { view.update(<Overview />); });
  expect(view.root.findAllByType(TrackRow)).toHaveLength(0);
  await act(async () => { resolve([]); });
  expect(view.root.findAllByType(TrackRow)).toHaveLength(0);
});

it('does not expose destructive confirmation before active-track hydration', async () => {
  mockHydrated = false; const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await mount(); act(() => view.root.findByType(TrackRow).props.onLongPress());
  expect(alert).not.toHaveBeenCalled(); expect(mockDelete).not.toHaveBeenCalled(); alert.mockRestore();
});
