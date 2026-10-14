import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState, TextInput } from 'react-native';
import DistractionScreen from '../DistractionScreen';
import type { StoredDistraction } from '../repository';
import { fixture } from './fixture';
// Full rendered multi-step flow; give the shared CI/macOS host time to render.
jest.setTimeout(30000);
const mockTrack = fixture();
let mockRows: StoredDistraction[] = [], mockEmit: (sample: unknown) => void;
const mockStop = jest.fn(), mockRefresh = jest.fn(), mockSave = jest.fn(async (track, revision) => {
 const saved = { track, revision: revision + 1 }; mockRows = [...mockRows.filter(r => r.track.id !== track.id), saved]; return saved;
});
const mockScope = { current: { userId: 'owner', epoch: 0 } };
const mockRepository = { save: mockSave, list: async () => mockRows };
let mockMainRecording = false;
const mockParent = { id: mockTrack.parentSessionId, ownerId: 'owner', dogId: 'dog', date: '2026-10-14', distanceM: 223, map: { lay: [{ lat: 47, lng: 8 }, { lat: 47.001, lng: 8 }], markers: [{ id: 'g1', type: 'gegenstand', lat: 47, lng: 8 }], start: { lat: 47, lng: 8 }, end: { lat: 47.001, lng: 8 } } };
const mockLoad = jest.fn(async () => mockParent);
const mockParents = { load: mockLoad };
jest.mock('../ParentPicker', () => ({ ParentPicker: () => null }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: [{ id: 'dog', name: 'Yam' }] }) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: '22222222-2222-4222-8222-222222222222' }), useRouter: () => ({ back: jest.fn() }),
 useFocusEffect: (fn: () => void) => { const React = jest.requireActual('react'); React.useEffect(fn, [fn]); } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/features/training-groups/registerResources', () => ({ registerGroupResources: jest.fn() }));
jest.mock('../useDistractions', () => ({ useDistractions: () => ({ userId: 'owner', epoch: 0, repository: mockRepository, parents: mockParents, rows: mockRows, error: null, refresh: mockRefresh, scope: mockScope }),
 useDistractionVisibility: Object.assign((selector: (s: unknown) => unknown) => selector({ hidden: {}, toggle: jest.fn() }), { getState: () => ({ changed: jest.fn() }) }) }));
jest.mock('@/features/tracking/components/TrackingMap', () => ({ TrackingMap: (props: unknown) => jest.requireActual('react').createElement('Map', props) }));
jest.mock('@/features/tracking/hooks/useDogTrackColor', () => ({ useDogTrackColor: () => ({ color: '#aabbcc' }) }));
jest.mock('@/features/tracking/store/trackingStore', () => ({ useTrackingStore: { getState: () => ({ isRecording: mockMainRecording, isRunningTrack: false }) } }));
jest.mock('@/features/tracking/services/trackHistoryService', () => ({ getLocalTrackDetail: async () => ({ owner_id: 'owner' }) }));
jest.mock('@/features/tracking/utils/trackDetailMap', () => ({ buildTrackDetailMap: () => ({ lay: [{ lat: 47, lng: 8 }, { lat: 47.001, lng: 8 }] }) }));
jest.mock('../weather', () => ({ fetchDistractionWeather: async () => null }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('expo-location', () => ({ Accuracy: { BestForNavigation: 6 }, requestForegroundPermissionsAsync: async () => ({ status: 'granted' }) }));
jest.mock('@/features/tracking/utils/positionSource', () => ({ startPositionSource: async (emit: typeof mockEmit) => { mockEmit = emit; return { stop: mockStop }; } }));
let r: ReturnType<typeof TestRenderer.create>;
function button(label: string) { return r.root.findAll(n => n.props.accessibilityRole === 'button' && n.findAll(x => x.props.children === label).length > 0)[0]; }
async function press(label: string) { await act(async () => { button(label).props.onPress(); }); }
beforeEach(() => { mockRows = []; mockMainRecording = false; mockScope.current = { userId: 'owner', epoch: 0 }; jest.clearAllMocks(); mockLoad.mockResolvedValue(mockParent); Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' }); });
afterEach(() => { if (r) act(() => r.unmount()); jest.restoreAllMocks(); });
it('records a separately named draft, pauses, saves and leaves main-track geometry out of writes', async () => {
 const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
 await act(async () => { r = TestRenderer.create(<DistractionScreen />); });
 expect(r.root.findAll(n => n.props.layColor === '#aabbcc').length).toBeGreaterThan(0);
 act(() => r.root.findByType(TextInput).props.onChangeText('Querlinie'));
 await press('startNew');
 const now = 2000; clock.mockReturnValue(now);
 await act(async () => { mockEmit({ lat: 47, lng: 8, accuracy: 3, t: now }); });
 clock.mockReturnValue(now + 2000);
 try { await act(async () => { mockEmit({ lat: 47.00004, lng: 8, accuracy: 3, t: now + 2000 }); });
  await press('pause'); await press('finish');
 } finally { clock.mockReturnValue(now + 2000); }
 expect(mockRows[0].track.name).toBe('Querlinie'); expect(mockRows[0].track.parentSessionId).toBe(mockTrack.parentSessionId);
 expect(mockRows[0].track.points).toHaveLength(2); expect(mockRows[0].track.finishedAtMs).not.toBeNull(); expect(mockStop).toHaveBeenCalledTimes(1);
 expect(mockSave.mock.calls.every(call => !('score' in call[0]) && !('run' in call[0]))).toBe(true);
 expect(r.root.findAll(n => n.props.accessibilityLabel === 'Querlinie: visible').length).toBeGreaterThan(0);
 expect(r.root.findAll(n => n.props.children === 'weatherMissing').length).toBeGreaterThan(0);
});
it('refuses to start a second stream during an existing main-track recording', async () => {
 await act(async () => { r = TestRenderer.create(<DistractionScreen />); }); mockMainRecording = true;
 await press('startNew'); expect(r.root.findAll(n => n.props.children === 'busy').length).toBeGreaterThan(0); expect(mockRows[0].track.points).toHaveLength(0);
});

it('labels the loaded main track and passes original markers to the map before any recording', async () => {
 await act(async () => { r = TestRenderer.create(<DistractionScreen />); });
 const map = r.root.findAll(n => n.props.layColor === '#aabbcc')[0];
 expect(map.props.layPoints).toEqual([]); expect(map.props.mainReferencePoints).toEqual(mockParent.map.lay); expect(map.props.markers).toEqual(mockParent.map.markers);
 expect(r.root.findAll(n => n.props.children === 'mainTrack').length).toBeGreaterThan(0);
 expect(mockSave).not.toHaveBeenCalled();
});
it('failed parent load disables starting and offers retry without creating a phantom draft', async () => {
 mockLoad.mockRejectedValueOnce(new Error('missing'));
 await act(async () => { r = TestRenderer.create(<DistractionScreen />); });
 expect(button('startNew').props.disabled).toBe(true); expect(mockSave).not.toHaveBeenCalled();
 await press('refresh'); expect(button('startNew').props.disabled).toBe(false);
});
