import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { PlanDayCard } from '../plans/PlanDayCard';

const G = '10000000-0000-4000-8000-000000000001', P = '70000000-0000-4000-8000-000000000001', S = '30000000-0000-4000-8000-000000000001';
const ANNA = 'a1111111-1111-4111-8111-111111111111', BEA = 'b2222222-2222-4222-8222-222222222222';
const mockPush = jest.fn(), mockAssign = jest.fn(), mockLinkTrack = jest.fn(), mockOpen = jest.fn(), mockLinkSession = jest.fn(), mockJoin = jest.fn();
let mockTracks: unknown[] = [], mockParticipants: unknown[] = [], mockEvals: unknown[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: () => void | (() => void)) => { const R = jest.requireActual('react'); R.useEffect(cb, [cb]); } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/components/ui/AnyvoCard', () => ({ AnyvoCard: 'AnyvoCard' }));
jest.mock('@/components/ui/AnyvoButton', () => ({ AnyvoButton: 'AnyvoButton' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k) }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: [{ id: 'a0000000-0000-4000-8000-00000000000a', name: 'Ayla' }] }) }));
let mockUser = ANNA;
const mockServices = {
  get userId() { return mockUser; },
  tracks: { list: async () => ({ tracks: mockTracks, serverNowMs: 3_600_000, ownTracks: true }), assign: (...a: unknown[]) => mockAssign(...a) },
  groups: { session: async () => ({ session: { participants: mockParticipants } }), sessions: async () => ({ sessions: [], serverNowMs: 1 }),
    open: (...a: unknown[]) => mockOpen(...a), join: (...a: unknown[]) => mockJoin(...a) },
  evaluations: { list: async () => mockEvals },
  plans: { linkTrack: (...a: unknown[]) => mockLinkTrack(...a), linkSession: (...a: unknown[]) => mockLinkSession(...a), finish: jest.fn() },
};
jest.mock('../groupHub', () => ({ ...jest.requireActual('../groupHub'), useGroupServices: () => mockServices }));

const part = (userId: string, dogId: string) => ({ participationId: `40000000-0000-4000-8000-${dogId.slice(-12)}`, userId, displayName: 'x', dogId, dogName: 'x', colorKey: null });
const entry = (over: Record<string, unknown> = {}) => ({ entryId: '80000000-0000-4000-8000-000000000001', position: 1, handlerUserId: BEA, handlerName: 'Bea',
  layerUserId: ANNA, layerName: 'Anna', dog: { dogId: 'b0000000-0000-4000-8000-0000000000b1', name: 'Luna', breed: null }, plannedLyingMinutes: 30, trackKind: 'igp1',
  fieldNote: null, blind: true, handlerResponse: 'yes', layerResponse: 'yes', trackId: null, updatedAtMs: 1, ...over });
const plan = (over: Record<string, unknown> = {}) => ({ planId: P, groupId: G, createdByUserId: ANNA, title: 'Fährtentag', startsAtMs: 1, meetingPoint: null,
  meetingLat: null, meetingLng: null, notes: null, status: 'started', sessionId: S, createdAtMs: 1, updatedAtMs: 1, entries: [entry()], ...over });

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree.unmount()); jest.clearAllMocks(); mockUser = ANNA; mockTracks = []; mockParticipants = []; mockEvals = []; });
const button = (label: string) => tree.root.findAll(n => (n.type as unknown) === 'AnyvoButton' && n.props.label === label)[0];
const texts = (): string[] => tree.root.findAll(n => typeof n.props.children === 'string' || Array.isArray(n.props.children))
  .flatMap(n => ([] as unknown[]).concat(n.props.children)).filter((x): x is string => typeof x === 'string');

it('Leger:in legt über den bestehenden Weg: Fährte zuteilen, Zeile verbinden, Aufzeichnung öffnen', async () => {
  mockParticipants = [part(BEA, 'b0000000-0000-4000-8000-0000000000b1'), part(ANNA, 'a0000000-0000-4000-8000-00000000000a')];
  mockAssign.mockResolvedValue({ trackId: '50000000-0000-4000-8000-000000000001' });
  mockLinkTrack.mockResolvedValue(plan());
  const onPlan = jest.fn();
  await act(async () => { tree = renderer.create(<PlanDayCard plan={plan() as never} canPlan={false} onPlan={onPlan} />); });
  expect(texts()).toContain('plans.dayPlanned');
  await act(async () => { button('plans.layForName:{"name":"Bea"}').props.onPress(); });
  expect(mockAssign).toHaveBeenCalledWith(S, '40000000-0000-4000-8000-0000000000b1', true, 'track');
  expect(mockLinkTrack).toHaveBeenCalledWith(P, '80000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001');
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/track/legen', params: { dogId: 'a0000000-0000-4000-8000-00000000000a',
    groupTrackId: '50000000-0000-4000-8000-000000000001', groupId: G, groupSessionId: S } });
});

it('Liegezeit erreicht und Tagesauswertung «nicht geteilt»', async () => {
  mockTracks = [{ trackId: '50000000-0000-4000-8000-000000000001', status: 'lying', laidAtMs: 0, searchStartedAtMs: null, searchedAtMs: null }];
  await act(async () => { tree = renderer.create(<PlanDayCard plan={plan({ entries: [entry({ trackId: '50000000-0000-4000-8000-000000000001' })] }) as never} canPlan={false} onPlan={jest.fn()} />); });
  expect(texts().some(x => x.includes('plans.lyingReached'))).toBe(true);
  expect(texts()).toContain('plans.evalNotSearched');
});

it('Hundeführer:in noch nicht im Training: mit dem zugesagten Hund beitreten', async () => {
  mockUser = BEA;
  mockJoin.mockResolvedValue({});
  await act(async () => { tree = renderer.create(<PlanDayCard plan={plan() as never} canPlan={false} onPlan={jest.fn()} />); });
  expect(texts()).toContain('plans.dayNotJoined');
  await act(async () => { button('plans.joinWith:{"dog":"Luna"}').props.onPress(); });
  expect(mockJoin).toHaveBeenCalledWith(S, 'b0000000-0000-4000-8000-0000000000b1');
});

it('Organisator:in startet den Tag: Gruppentraining öffnen und Plan verbinden', async () => {
  mockOpen.mockResolvedValue({ session: { sessionId: S, groupId: G, ownerUserId: ANNA, title: 'Fährtentag', status: 'active', expiresAtMs: 9, participants: [] } });
  mockLinkSession.mockResolvedValue(plan());
  const onPlan = jest.fn();
  await act(async () => { tree = renderer.create(<PlanDayCard plan={plan({ status: 'published', sessionId: null }) as never} canPlan onPlan={onPlan} />); });
  expect(texts()).toContain('plans.confirmed:{"yes":1,"total":1}');
  await act(async () => { button('plans.startDay').props.onPress(); });
  expect(mockOpen).toHaveBeenCalledWith(G, 'Fährtentag', 'a0000000-0000-4000-8000-00000000000a', expect.any(Number));
  expect(mockLinkSession).toHaveBeenCalledWith(P, S);
  expect(onPlan).toHaveBeenCalled();
});

it('Mitglied ohne Planungsrecht sieht keinen Start; Entwurf zeigt nichts', async () => {
  mockUser = BEA;
  await act(async () => { tree = renderer.create(<PlanDayCard plan={plan({ status: 'published', sessionId: null }) as never} canPlan={false} onPlan={jest.fn()} />); });
  expect(button('plans.startDay')).toBeUndefined();
  act(() => tree.unmount());
  await act(async () => { tree = renderer.create(<PlanDayCard plan={plan({ status: 'draft', sessionId: null }) as never} canPlan onPlan={jest.fn()} />); });
  expect(tree.toJSON()).toBeNull();
});

it('Mantrailing-Zeile: Trail über die Gruppen-Übergabe, Aufzeichnung im Mantrailing-Bildschirm', async () => {
  mockParticipants = [part(BEA, 'b0000000-0000-4000-8000-0000000000b1'), part(ANNA, 'a0000000-0000-4000-8000-00000000000a')];
  mockAssign.mockResolvedValue({ trackId: '50000000-0000-4000-8000-000000000002' });
  mockLinkTrack.mockResolvedValue(plan());
  await act(async () => { tree = renderer.create(<PlanDayCard plan={plan({ entries: [entry({ trackKind: 'mantrail' })] }) as never} canPlan={false} onPlan={jest.fn()} />); });
  await act(async () => { button('plans.layTrailForName:{"name":"Bea"}').props.onPress(); });
  expect(mockAssign).toHaveBeenCalledWith(S, '40000000-0000-4000-8000-0000000000b1', true, 'mantrail');   // blind = Doppelblind
  expect(mockLinkTrack).toHaveBeenCalledWith(P, '80000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002');
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/mantrail/legen', params: { dogId: 'a0000000-0000-4000-8000-00000000000a',
    groupTrackId: '50000000-0000-4000-8000-000000000002', groupId: G, groupSessionId: S } });
});
