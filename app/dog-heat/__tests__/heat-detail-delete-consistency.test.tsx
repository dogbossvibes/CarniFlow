// ANYVO-wide long-press-delete standardization audit (29.09.2026): this
// screen was one of two PRE-EXISTING Läufigkeit delete entry points found to
// have two gaps — no ownership gating (delete shown even to a non-owner
// viewer, though dog_heat_cycles RLS grants DELETE to owner_id = auth.uid()
// only) and no .error check on deleteHeatCycle (silently navigated back
// even on failure). Both are fixed here; these tests cover the fix.
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Text } from 'react-native';
import DogHeatDetail from '@/app/dog-heat/[id]';
import type { HeatCycle } from '@/features/dogs/heatCycles';

const mockGetHeatCycle = jest.fn();
const mockDeleteHeatCycle = jest.fn();
const mockGetDogById = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'cyc-1' }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => ({ isPro: true, loading: false }) }));
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: 'owner-1' } }) }));
jest.mock('@/services/dogs', () => ({ getDogById: (...a: unknown[]) => mockGetDogById(...a) }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/dogs/heatCycles', () => {
  const actual = jest.requireActual('@/features/dogs/heatCycles');
  return {
    ...actual,
    getHeatCycle: (...a: unknown[]) => mockGetHeatCycle(...a),
    getHeatPhases: jest.fn().mockResolvedValue([]),
    getHeatObservations: jest.fn().mockResolvedValue([]),
    deleteHeatCycle: (...a: unknown[]) => mockDeleteHeatCycle(...a),
  };
});

const CYCLE: HeatCycle = { id: 'cyc-1', dogId: 'dog-1', startDate: '2026-08-12', endDate: '2026-09-01', status: 'completed', notes: null, phase: null, createdAt: '2026-08-12T00:00:00Z' };

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DogHeatDetail />); });
  return node;
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }

function findByText(node: ReactTestRenderer, text: string) {
  return (node.root as unknown as {
    findAll: (p: (c: { props: { onPress?: () => void }; findAllByType: (t: unknown) => { props: { children: unknown } }[] }) => boolean) => { props: { onPress: () => void } }[];
  }).findAll((c) => typeof c.props.onPress === 'function' && c.findAllByType(Text).some((t) => t.props.children === text))[0];
}

beforeEach(() => {
  mockBack.mockReset();
  mockGetHeatCycle.mockReset().mockResolvedValue(CYCLE);
  mockGetDogById.mockReset().mockResolvedValue({ data: { id: 'dog-1', owner_id: 'owner-1' }, error: null });
  mockDeleteHeatCycle.mockReset().mockResolvedValue({ data: null, error: null });
});

describe('dog-heat detail: ownership consistency fix', () => {
  it('the owner sees the delete button', async () => {
    const node = render();
    await flush();
    expect(findByText(node, 'common.delete')).toBeTruthy();
  });

  it('a non-owner (connected trainer, read-only per dog_heat_cycles RLS) never sees the delete button', async () => {
    mockGetDogById.mockResolvedValue({ data: { id: 'dog-1', owner_id: 'someone-else' }, error: null });
    const node = render();
    await flush();
    expect(findByText(node, 'common.delete')).toBeFalsy();
  });
});

describe('dog-heat detail: error-handling consistency fix', () => {
  it('a successful delete calls deleteHeatCycle with the exact cycle id and navigates back', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'destructive')?.onPress?.(); });
    const node = render();
    await flush();
    act(() => { findByText(node, 'common.delete').props.onPress(); });
    await flush();
    expect(mockDeleteHeatCycle).toHaveBeenCalledWith('cyc-1');
    expect(mockBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('a failed delete does NOT navigate back — no more silently pretending to have succeeded', async () => {
    mockDeleteHeatCycle.mockResolvedValue({ data: null, error: { message: 'network' } });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'destructive')?.onPress?.(); });
    const node = render();
    await flush();
    act(() => { findByText(node, 'common.delete').props.onPress(); });
    await flush();
    expect(mockDeleteHeatCycle).toHaveBeenCalledWith('cyc-1');
    expect(mockBack).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('cancelling the confirmation does not delete', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'cancel')?.onPress?.(); });
    const node = render();
    await flush();
    act(() => { findByText(node, 'common.delete').props.onPress(); });
    await flush();
    expect(mockDeleteHeatCycle).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
