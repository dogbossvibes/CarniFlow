import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import Screen from '../plans/GroupPlanScreen';

// Vereinsmodus PR B: Plan-Bildschirm aus Sicht Mitglied und Organisator:in.
const G = '10000000-0000-4000-8000-000000000001', P = '70000000-0000-4000-8000-000000000001';
const ME = 'c3333333-3333-4333-8333-333333333333', ANNA = 'a1111111-1111-4111-8111-111111111111', DANI = 'd4444444-4444-4444-8444-444444444444';
const mockGet = jest.fn(), mockRespond = jest.fn(), mockPublish = jest.fn(), mockLayer = jest.fn(), mockPush = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: '70000000-0000-4000-8000-000000000001', groupId: '10000000-0000-4000-8000-000000000001' }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => { const R = jest.requireActual('react'); R.useEffect(cb, [cb]); } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/components/ui/AnyvoCard', () => ({ AnyvoCard: 'AnyvoCard' }));
jest.mock('@/components/ui/AnyvoButton', () => ({ AnyvoButton: 'AnyvoButton' }));
jest.mock('@/features/contacts/ContactScreenHeader', () => ({ ContactScreenHeader: 'Header' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k) }) }));
jest.mock('@/i18n/format', () => ({ formatTime: () => '08:00' }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: [{ id: 'c0000000-0000-4000-8000-0000000000c1', name: 'Ivo' }, { id: 'c0000000-0000-4000-8000-0000000000c2', name: 'Mira' }] }) }));
let mockUser = ME;
const mockServices = {
  get userId() { return mockUser; },
  plans: { get: (...a: unknown[]) => mockGet(...a), respond: (...a: unknown[]) => mockRespond(...a), publish: (...a: unknown[]) => mockPublish(...a), layerRespond: (...a: unknown[]) => mockLayer(...a) },
  groups: { list: async () => ({ groups: [{ groupId: G, members: [] }] }) },
};
jest.mock('../groupHub', () => ({ ...jest.requireActual('../groupHub'), useGroupServices: () => mockServices }));

const entry = (over: Record<string, unknown> = {}) => ({ entryId: '80000000-0000-4000-8000-000000000003', position: 3, handlerUserId: ME, handlerName: 'Carla',
  layerUserId: DANI, layerName: 'Dani', dog: null, plannedLyingMinutes: 90, trackKind: 'mantrail', fieldNote: null, blind: false,
  handlerResponse: 'open', layerResponse: 'open', trackId: null, updatedAtMs: 1, ...over });
const plan = (over: Record<string, unknown> = {}) => ({ planId: P, groupId: G, createdByUserId: ANNA, title: 'Fährtentag', startsAtMs: 1_800_000_000_000,
  meetingPoint: 'Parkplatz Wald', meetingLat: null, meetingLng: null, notes: null, status: 'published', sessionId: null, createdAtMs: 1, updatedAtMs: 1,
  entries: [entry({ entryId: '80000000-0000-4000-8000-000000000001', position: 1, handlerUserId: ANNA, handlerName: 'Anna', layerUserId: null, layerName: null,
    handlerResponse: 'yes', dog: { dogId: 'a0', name: 'Luna', breed: null } }), entry(),
    entry({ entryId: '80000000-0000-4000-8000-000000000004', position: 4, handlerUserId: DANI, handlerName: null, layerUserId: ME, layerName: 'Carla' })], ...over });

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree.unmount()); jest.clearAllMocks(); mockUser = ME; });
const texts = (): string[] => tree.root.findAll(n => typeof n.props.children === 'string' || Array.isArray(n.props.children))
  .flatMap(n => ([] as unknown[]).concat(n.props.children)).filter((x): x is string => typeof x === 'string');
const button = (label: string) => tree.root.findAll(n => (n.type as unknown) === 'AnyvoButton' && n.props.label === label)[0];

it('Mitglied: eigene Zeile, eigenen Hund wählen und zusagen; als Leger:in bestätigen', async () => {
  mockGet.mockResolvedValue({ plan: plan(), canPlan: false });
  mockRespond.mockResolvedValue(plan());
  mockLayer.mockResolvedValue(plan());
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(texts()).toContain('plans.youAreIn:{"n":3}');
  expect(texts()).toContain('plans.dogPrivacy');
  expect(button('plans.edit')).toBeUndefined();          // kein Planen ohne Recht
  expect(button('plans.entryAdd')).toBeUndefined();
  act(() => { tree.root.findAll(n => n.props.testID === 'plan-dog-c0000000-0000-4000-8000-0000000000c2')[0].props.onPress(); });
  await act(async () => { button('plans.respondYes').props.onPress(); });
  expect(mockRespond).toHaveBeenCalledWith(P, '80000000-0000-4000-8000-000000000003', 'yes', 'c0000000-0000-4000-8000-0000000000c2');
  expect(texts()).toContain('plans.youLayFor:{"name":"plans.formerMember"}');   // Dani hat die Gruppe verlassen
  await act(async () => { button('plans.layYes:{"name":"plans.formerMember"}').props.onPress(); });
  expect(mockLayer).toHaveBeenCalledWith(P, '80000000-0000-4000-8000-000000000004', 'yes');
});

it('Startliste zeigt fremde Hunde nur, wenn vom Server mitgeliefert', async () => {
  mockGet.mockResolvedValue({ plan: plan(), canPlan: false });
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(texts()).toContain('1 Anna · Luna');
  expect(texts()).toContain('3 Carla · plans.dogOpen');
});

it('Organisator:in: Entwurf bearbeiten, veröffentlichen, Person eintragen; keine Zusage im Entwurf', async () => {
  mockUser = ANNA;
  mockGet.mockResolvedValue({ plan: plan({ status: 'draft' }), canPlan: true });
  mockPublish.mockResolvedValue(plan());
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(texts()).toContain('plans.draftHint');
  expect(button('plans.edit')).toBeDefined();
  expect(button('plans.entryAdd')).toBeDefined();
  expect(button('plans.respondYes')).toBeUndefined();     // Entwurf: keine Zusagen
  await act(async () => { button('plans.publish').props.onPress(); });
  expect(mockPublish).toHaveBeenCalledWith(P);
  act(() => { button('plans.edit').props.onPress(); });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/groups/plan/edit', params: { groupId: G, planId: P } });
});

it('Fehler des Servers wird angezeigt, nichts geht verloren', async () => {
  const { GroupApiError } = jest.requireActual('@/features/tracking-exchange/groups/groupRpc');
  mockGet.mockRejectedValue(new GroupApiError('GROUP_UNAVAILABLE'));
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(texts()).toContain('groups.errUnavailable');
});
