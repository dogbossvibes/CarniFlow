import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { GroupPlansCard } from '../plans/GroupPlansCard';

const G = '10000000-0000-4000-8000-000000000001';
const mockList = jest.fn(), mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: () => void | (() => void)) => { const R = jest.requireActual('react'); R.useEffect(cb, [cb]); } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/components/ui/AnyvoCard', () => ({ AnyvoCard: 'AnyvoCard' }));
jest.mock('@/components/ui/AnyvoButton', () => ({ AnyvoButton: 'AnyvoButton' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/i18n/format', () => ({ formatTime: () => '08:00' }));
const mockServices = { userId: 'u', plans: { list: (...a: unknown[]) => mockList(...a) } };
jest.mock('../groupHub', () => ({ ...jest.requireActual('../groupHub'), useGroupServices: () => mockServices }));

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree.unmount()); jest.clearAllMocks(); });
const plan = { planId: '70000000-0000-4000-8000-000000000001', groupId: G, title: 'Fährtentag', startsAtMs: 1_800_000_000_000, meetingPoint: 'Wald', status: 'published' };

it('Liste und «Trainingstag planen» nur mit Planungsrecht', async () => {
  mockList.mockResolvedValue({ plans: [plan], canPlan: true, serverNowMs: 1_700_000_000_000 });
  await act(async () => { tree = renderer.create(<GroupPlansCard groupId={G} />); });
  act(() => { tree.root.findAll(n => n.props.testID === `plan-row-${plan.planId}`)[0].props.onPress(); });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/groups/plan/[id]', params: { id: plan.planId, groupId: G } });
  const create = tree.root.findAll(n => (n.type as unknown) === 'AnyvoButton' && n.props.label === 'plans.create');
  expect(create).toHaveLength(1);
});
it('ohne Planungsrecht kein Knopf; Server ohne Pläne → Abschnitt fehlt', async () => {
  mockList.mockResolvedValue({ plans: [], canPlan: false, serverNowMs: 1 });
  await act(async () => { tree = renderer.create(<GroupPlansCard groupId={G} />); });
  expect(tree.root.findAll(n => (n.type as unknown) === 'AnyvoButton')).toHaveLength(0);
  act(() => tree.unmount());
  mockList.mockRejectedValue(new Error('PGRST202'));
  await act(async () => { tree = renderer.create(<GroupPlansCard groupId={G} />); });
  expect(tree.toJSON()).toBeNull();
});
