import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import Screen from '../GroupSessionScreen';

const ME = 'a1111111-1111-4111-8111-111111111111', BEA = 'b2222222-2222-4222-8222-222222222222', CARL = 'c3333333-3333-4333-8333-333333333333';
const GROUP = '10000000-0000-4000-8000-000000000001', SESSION = '30000000-0000-4000-8000-000000000001';
let mockJoined = true;
const mockJoin = jest.fn(async () => ({}));
const group = { groupId: GROUP, title: 'G', ownerUserId: ME, status: 'active', createdAtMs: 1, members: [
  { membershipId: GROUP, userId: ME, displayName: 'Sandra', role: 'owner', isOrganizer: false, joinedAtMs: 1 },
  { membershipId: 'm2', userId: BEA, displayName: 'Bea', role: 'member', isOrganizer: false, joinedAtMs: 2 },
  { membershipId: 'm3', userId: CARL, displayName: 'Carl', role: 'member', isOrganizer: false, joinedAtMs: 3 }] };
const participants = [
  { participationId: 'p-me', userId: ME, displayName: 'Sandra', dogId: 'dog-a', dogName: 'Ayla', colorKey: null },
  { participationId: 'p-b1', userId: BEA, displayName: 'Bea', dogId: 'dog-b1', dogName: 'Luna', colorKey: null },
  { participationId: 'p-b2', userId: BEA, displayName: 'Bea', dogId: 'dog-b2', dogName: 'Kira', colorKey: null },
  { participationId: 'p-c', userId: CARL, displayName: 'Carl', dogId: 'dog-c', dogName: 'Rex', colorKey: null }];
const track = (over: Record<string, unknown>) => ({ trackId: 't', sessionId: SESSION, layerUserId: ME, handlerUserId: BEA, handlerParticipationId: 'p-b1',
  dogId: 'dog-b1', blind: false, status: 'lying', createdAtMs: 0, laidAtMs: 100_000, searchStartedAtMs: null, searchedAtMs: null,
  area: { centerLat: 47.37, centerLng: 8.54, radiusM: 75 }, distanceM: 120, ...over });
const mockServices = {
  userId: ME,
  groups: {
    list: async () => ({ groups: [group], invitations: [], serverNowMs: 760_000 }),
    sessions: async () => ({ sessions: [{ sessionId: SESSION, groupId: GROUP, ownerUserId: ME, title: 'Samstag', status: 'active', expiresAtMs: 99_999_999 }], serverNowMs: 760_000 }),
    session: async () => {
      if (!mockJoined) { const { GroupApiError } = jest.requireActual('@/features/tracking-exchange/groups/groupRpc'); throw new GroupApiError('GROUP_UNAVAILABLE'); }
      return { session: { sessionId: SESSION, groupId: GROUP, ownerUserId: ME, title: 'Samstag', status: 'active', expiresAtMs: 99_999_999, participants }, serverNowMs: 760_000 };
    },
    join: (...args: unknown[]) => mockJoin(...(args as [])),
  },
  tracks: { fetch: async () => { throw new Error('offline'); }, searched: async () => ({}), list: async () => ({ tracks: [
    track({ trackId: '1' }),
    track({ trackId: '2', layerUserId: CARL, handlerUserId: ME, handlerParticipationId: 'p-me', dogId: 'dog-a', blind: true, status: 'laying', laidAtMs: null, area: null, distanceM: null }),
    track({ trackId: '3', layerUserId: CARL, handlerUserId: BEA, handlerParticipationId: 'p-b2', dogId: 'dog-b2', status: 'searched', searchStartedAtMs: 400_000, searchedAtMs: 500_000, distanceM: null }),
    track({ trackId: '4', layerUserId: CARL, handlerUserId: BEA, status: 'revoked', laidAtMs: null, area: null }),
  ], serverNowMs: 760_000 }) },
};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({ id: '30000000-0000-4000-8000-000000000001', groupId: '10000000-0000-4000-8000-000000000001' }),
  useFocusEffect: (cb: () => void | (() => void)) => { const React = jest.requireActual('react'); React.useEffect(cb, [cb]); } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea' }));
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Circle: 'Circle' }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'x' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string, params?: Record<string, unknown>) => params ? `${key} ${Object.values(params).join(' ')}` : key }) }));
jest.mock('@/i18n/format', () => ({ formatTime: () => '23:59' }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: [{ id: 'dog-a', name: 'Ayla' }, { id: 'dog-z', name: 'Zora' }] }) }));
jest.mock('@/features/tracking-exchange/live/LiveShareProvider', () => ({ useGroupLiveShare: () => ({ stop: jest.fn(async () => {}), client: {} }) }));
jest.mock('../groupTrackLocal', () => ({ findImportedGroupTrack: async () => null, importGroupTrack: async () => null,
  flushPendingHandovers: async () => {}, listPendingHandovers: async () => [] }));
jest.mock('../groupHub', () => ({ ...jest.requireActual('../groupHub'), useGroupServices: () => mockServices }));

const text = (tree: ReactTestRenderer) => tree.root.findAll(n => n.type === 'Text')
  .map(n => ([] as unknown[]).concat(n.props.children).filter((c): c is string => typeof c === 'string').join('')).join('\n')
  + (tree.root.findAll(n => n.type === 'Circle').length ? '\nCIRCLE' : '');
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree.unmount()); jest.clearAllMocks(); mockJoined = true; });

it('zeigt Status, laufende Liegezeit und nur Fläche für fremde Fährten', async () => {
  await act(async () => { tree = renderer.create(<Screen />); });
  const out = text(tree);
  expect(out).toContain('groups.trackFor Bea Luna');
  expect(out).toContain('groups.statusLying 11:00');
  expect(out).toContain('groups.trackForYou Ayla');
  expect(out).toContain('groups.statusLaying');
  expect(out).toContain('groups.trackOther Carl Bea Kira');
  expect(out).toContain('groups.trackAreaOnly');
  expect(out).toContain('groups.statusSearched 5:00');
  expect(out).not.toContain('groups.statusRevoked');
  expect(out).toContain('CIRCLE');
  expect(out).not.toContain('groups.layForSoon');
});

it('zeigt Bea mit zwei Hunden unter einer Person', async () => {
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(text(tree).split('\n').filter(l => l === 'Bea').length).toBe(1);
});

it('beitreten mit mehreren Hunden ruft join je Hund auf', async () => {
  mockJoined = false;
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(text(tree)).toContain('groups.notJoined');
  const boxes = [...new Map(tree.root.findAll(n => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function').map(n => [n.props.onPress, n])).values()];
  act(() => { boxes[0].props.onPress(); boxes[1].props.onPress(); });
  const join = tree.root.find(n => n.props.label === 'groups.join' && typeof n.props.onPress === 'function');
  await act(async () => { join.props.onPress(); });
  expect(mockJoin).toHaveBeenNthCalledWith(1, SESSION, 'dog-a');
  expect(mockJoin).toHaveBeenNthCalledWith(2, SESSION, 'dog-z');
});
