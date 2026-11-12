import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';
import DogHeatNew from '../dog-heat-new';
const mockAdd = jest.fn(); const mockReplace = jest.fn(); const mockDog = jest.fn();
let mockHistorical = '1'; let mockOwner = 'owner';
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return { useRouter: () => ({ replace: mockReplace, back: jest.fn() }), useLocalSearchParams: () => ({ id: 'dog', historical: mockHistorical }), useFocusEffect: (fn: () => unknown) => React.useEffect(fn, [fn]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@/components/ui/DateField', () => ({ DateField: 'DateField' }));
jest.mock('@/components/ui/AnyvoButton', () => ({ AnyvoButton: 'AnyvoButton' }));
jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => ({ isPro: true, loading: false }) }));
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: mockOwner } }) }));
jest.mock('@/services/dogs', () => ({ getDogById: (...a: unknown[]) => mockDog(...a) }));
jest.mock('@/i18n', () => ({ useT: () => ({ locale: 'de', t: (key: string) => key }) }));
jest.mock('@/lib/haptics', () => ({ haptic: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@/features/dogs/heatCycles', () => ({ addHeatCycle: (...a: unknown[]) => mockAdd(...a) }));
let node: ReactTestRenderer;
async function render() { await act(async () => { node = TestRenderer.create(<DogHeatNew />); }); }
const fields = () => node.root.findAll(n => (n as unknown as { type: unknown }).type === ('DateField' as any));
const save = () => node.root.findAll(n => (n as unknown as { type: unknown }).type === ('AnyvoButton' as any)).find(n => n.props.icon === 'checkmark')!;
beforeEach(() => { mockHistorical = '1'; mockOwner = 'owner'; mockReplace.mockReset(); mockAdd.mockReset().mockResolvedValue({ data: { id: 'new-cycle' }, error: null }); mockDog.mockReset().mockResolvedValue({ data: { id: 'dog', owner_id: 'owner', name: 'Luna', gender: 'female' }, error: null }); });
afterEach(() => { if (node) act(() => node.unmount()); });
it('requires an end date for a historical cycle and creates it completed without modifying existing cycles', async () => {
  await render(); await act(async () => save().props.onPress()); expect(mockAdd).not.toHaveBeenCalled();
  await act(async () => { fields()[0].props.onChange(new Date(2026, 0, 1)); fields()[1].props.onChange(new Date(2026, 0, 20)); });
  await act(async () => save().props.onPress());
  expect(mockAdd).toHaveBeenCalledWith('dog', expect.objectContaining({ startDate: '2026-01-01', endDate: '2026-01-20', status: 'completed' }));
  expect(mockReplace).toHaveBeenCalledWith('/dog-heat-overview/dog');
});
it('rejects an end date before the start', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(); await act(async () => { fields()[0].props.onChange(new Date(2026, 0, 20)); fields()[1].props.onChange(new Date(2026, 0, 1)); });
  await act(async () => save().props.onPress()); expect(mockAdd).not.toHaveBeenCalled(); spy.mockRestore();
});
it('keeps a new current cycle active and open-ended', async () => {
  mockHistorical = '0'; await render(); await act(async () => save().props.onPress());
  expect(mockAdd).toHaveBeenCalledWith('dog', expect.objectContaining({ endDate: null, status: 'active' }));
});
it('never offers a write form to a trainer', async () => { mockOwner = 'trainer'; await render(); expect(save()).toBeUndefined(); expect(mockAdd).not.toHaveBeenCalled(); });
it('never offers a write form for a male dog', async () => { mockDog.mockResolvedValue({ data: { id: 'dog', gender: 'male', owner_id: 'owner' }, error: null }); await render(); expect(save()).toBeUndefined(); });
