// T-184 ESLint-Fix (react-hooks/purity, react-hooks/refs): Timer-Zeit, Pause und
// stabile Unit-ID liegen jetzt in State statt in Refs. Diese Tests halten das
// sichtbare Verhalten und den idempotenten Speichern-Retry fest.
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Text } from 'react-native';
import TimerScreen from '@/app/unit/timer';

const mockCreateDocumentedUnit = jest.fn();
const mockReplace = jest.fn();
let mockUuidCounter = 0;
let mockParams: Record<string, string> = {};

jest.mock('expo-crypto', () => ({ randomUUID: () => `unit-${++mockUuidCounter}` }));
jest.mock('expo-router', () => ({
  Redirect: () => null,
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: (...args: unknown[]) => mockReplace(...args) }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/ui/AnimatedPressable', () => ({
  AnimatedPressable: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) => {
    const { TouchableOpacity } = jest.requireActual('react-native');
    return <TouchableOpacity onPress={onPress}>{children}</TouchableOpacity>;
  },
}));
jest.mock('@/lib/haptics', () => ({ tapHaptic: jest.fn(), successHaptic: jest.fn(), haptic: { error: jest.fn() } }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: [{ id: 'dog-1', name: 'Yam' }] }) }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'owner-1' } } }) }));
jest.mock('@/services/trainingUnitService', () => ({ createDocumentedUnit: (...args: unknown[]) => mockCreateDocumentedUnit(...args) }));
jest.mock('@/features/subscription/quotaUx', () => ({ handleQuotaBlock: () => false }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));

const mounted: ReactTestRenderer[] = [];
const render = () => { let node!: ReactTestRenderer; act(() => { node = TestRenderer.create(<TimerScreen />); }); mounted.push(node); return node; };
const shownTime = (node: ReactTestRenderer) =>
  node.root.findAllByType(Text).map(n => n.props.children).find(c => typeof c === 'string' && /^\d\d:\d\d$/.test(c));
const pressText = (node: ReactTestRenderer, key: string) => {
  const target = node.root.findAll(n => typeof n.props.onPress === 'function'
    && n.findAllByType(Text).some(c => c.props.children === key)).at(-1)!;
  act(() => { target.props.onPress(); });
};
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-11T10:00:00Z') });
  mockUuidCounter = 0; mockParams = { dogId: 'dog-1' };
  mockCreateDocumentedUnit.mockReset(); mockReplace.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  mounted.splice(0).forEach(n => act(() => n.unmount()));
  jest.useRealTimers(); jest.restoreAllMocks();
});

it('counts running time, freezes it while paused and continues after resume', () => {
  const node = render();
  expect(shownTime(node)).toBe('00:00');
  advance(5000);
  expect(shownTime(node)).toBe('00:05');
  pressText(node, 'timer.pause');
  advance(10_000);
  expect(shownTime(node)).toBe('00:05');
  pressText(node, 'timer.resume');
  advance(3000);
  expect(shownTime(node)).toBe('00:08');
});

it('passes the measured seconds to the documentation screen', () => {
  const node = render();
  advance(42_000);
  pressText(node, 'timer.done');
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
  act(() => { buttons.find(b => b.text === 'timer.document')!.onPress!(); });
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/unit/document', params: { duration: '42', dogId: 'dog-1' } });
});

it('saving without documentation retries with the same unit id and payload', async () => {
  mockCreateDocumentedUnit.mockResolvedValueOnce({ error: { code: 'NETWORK' } }).mockResolvedValueOnce({ error: null });
  const node = render();
  advance(30_000);
  for (let attempt = 0; attempt < 2; attempt++) {
    pressText(node, 'timer.done');
    const buttons = (Alert.alert as jest.Mock).mock.calls.filter(c => c[0] === 'timer.endTitle').at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => { buttons.find(b => b.text === 'timer.saveWithoutDoc')!.onPress!(); });
  }
  expect(mockCreateDocumentedUnit).toHaveBeenCalledTimes(2);
  const [first, second] = mockCreateDocumentedUnit.mock.calls;
  expect(first[3]).toBe('unit-1');
  expect(second[3]).toBe(first[3]);
  expect(second[1]).toBe(first[1]);
  expect(first[1]).toMatchObject({ dog_id: 'dog-1', duration_sec: 30 });
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
});
