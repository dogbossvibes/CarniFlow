import React from 'react';
import { Text, StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import Overview from '../index';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { FaehrtenHeader, StatTriple } from '@/features/tracking/components/FaehrtenChrome';
import { trackOverlayColor } from '@/features/tracking/utils/trackOverlayColors';

const mockHistory = jest.fn(), mockPreview = jest.fn(), mockRefresh = jest.fn();
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
const mockDogs = [{ id: 'd', owner_id: 'u', name: 'Malu', track_overlay_color_key: 'violet' }, { id: 'other', owner_id: 'u', name: 'Skadi', track_overlay_color_key: 'orange' }];
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: (cb: () => void) => { const React = jest.requireActual('react'); React.useEffect(cb, [cb]); } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockDogs, refresh: mockRefresh }) }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'u' } } }) }));
jest.mock('@/features/tracking/services/trackHistoryService', () => ({ getTrackHistory: (...a: unknown[]) => mockHistory(...a) }));
jest.mock('@/features/tracking/services/trackPreviewService', () => ({ getTrackPreview: (...a: unknown[]) => mockPreview(...a) }));
jest.mock('@/features/tracking/services/trackService', () => ({ deleteTrackSession: jest.fn() }));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({ markTrainingAsDeleted: jest.fn() }));
jest.mock('@/features/sync/services/syncEngine', () => ({ retryFailedSync: jest.fn() }));
jest.mock('@/features/tracking/components/GlobalActiveFaehrtenBar', () => ({ GlobalActiveFaehrtenBar: () => null }));
jest.mock('@/features/tracking/store/activeFaehrten', () => ({ useActiveFaehrten: () => false }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn(), toast: null }) }));
let view: any;
const row = (dog = 'd') => ({ id: `s-${dog}`, dog_id: dog, status: 'completed', distance_meters: 0, corners_total: null, articles_total: null, isLocalOnly: true, created_at: '2026-10-08' });
const gps = { lay: [{ lat: 47, lng: 8 }, { lat: 47.001, lng: 8.001 }], markers: [] };
const mount = async () => { await act(async () => { view = TestRenderer.create(<Overview />); }); };
const texts = () => view.root.findAllByType(Text).flatMap((n: any) => n.props.children);
beforeEach(() => { jest.clearAllMocks(); mockHistory.mockResolvedValue([row(), row('other')]); mockPreview.mockResolvedValue(null); });
afterEach(() => { if (view) act(() => view.unmount()); });
it('shows an honest unavailable-GPS state and never substitutes a count-based line', async () => {
  await mount(); expect(texts()).toContain('track.preview.noGps');
  expect(view.root.findAllByType(TrackSketch).every((n: any) => n.props.points == null)).toBe(true);
  expect(view.root.findByType(StatTriple).props.total).toBe(1);
});
it('loads local-only geometry and displays actual positions in the dog color', async () => {
  mockPreview.mockResolvedValue(gps); await mount();
  expect(mockPreview).toHaveBeenCalledWith('s-d', 'd', 'u', true);
  const hero = view.root.findAllByType(TrackSketch).find((n: any) => n.props.w === 344)!;
  expect(hero.props.points).toEqual(gps.lay); expect(hero.props.accent).toBe(trackOverlayColor('violet'));
  expect(texts()).toContain('track.preview.recorded');
  // Statistics occupy their own flow section instead of covering the recorded path.
  const statsContainer = view.root.findByType(StatTriple).parent!;
  expect(StyleSheet.flatten(statsContainer.props.style)?.position).not.toBe('absolute');
});
it('ignores a delayed previous-dog preview after a dog switch', async () => {
  let finish!: (v: unknown) => void;
  mockPreview.mockImplementation((id: string) => id === 's-d' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ ...gps, lay: [{ lat: 48, lng: 9 }] }));
  await mount(); await act(async () => { view.root.findByType(FaehrtenHeader).props.onDog('other'); });
  await act(async () => { finish(gps); });
  const hero = view.root.findAllByType(TrackSketch).find((n: any) => n.props.w === 344)!;
  expect(hero.props.points).toEqual([{ lat: 48, lng: 9 }]); expect(hero.props.accent).toBe(trackOverlayColor('orange'));
  expect(texts()).toContain('track.preview.singlePoint');
});
