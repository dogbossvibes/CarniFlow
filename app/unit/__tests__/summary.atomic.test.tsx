import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import SummaryScreen from '../summary';
const mockFinish = jest.fn(); const mockRead = jest.fn(); const mockRetry = jest.fn(); const mockPersist = jest.fn(); const mockReset = jest.fn(); const mockReplace = jest.fn();
let mockOwner = 'owner-a';
let mockActive: any;
const metrics = { motivation: null, konzentration: null, praezision: null, ausdauer: null, trieblage: null, impulskontrolle: null };
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-operation' }));
jest.mock('expo-router', () => ({ Redirect: () => null, useLocalSearchParams: () => ({ duration: '125' }), useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => { const { View } = jest.requireActual('react-native'); return { SafeAreaView: ({ children }: any) => <View>{children}</View> }; });
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockOwner } } }) }));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
jest.mock('@/stores/activeTraining', () => ({ useActiveTraining: () => mockActive, resetUnit: (...args: unknown[]) => mockReset(...args), updateSummaryDraft: (draft: unknown) => { mockActive.summaryDraft = draft; }, saveActiveTrainingDraft: (...args: unknown[]) => mockPersist(...args) }));
jest.mock('@/services/trainingUnitService', () => ({ finishTrainingUnit: (...args: unknown[]) => mockFinish(...args) }));
jest.mock('@/features/training/documentation/saveIntent', () => ({ readTrainingSaveIntent: (...args: unknown[]) => mockRead(...args), retryTrainingSave: (...args: unknown[]) => mockRetry(...args) }));
jest.mock('@/features/subscription/quotaUx', () => ({ handleQuotaBlock: () => false }));
jest.mock('@/components/ui/AnimatedPressable', () => { const { View } = jest.requireActual('react-native'); return { AnimatedPressable: ({ children, ...props }: any) => <View {...props} testID="summary-save">{children}</View> }; });
jest.mock('@/components/training/HeroImage', () => { const { View } = jest.requireActual('react-native'); return { HeroImage: ({ children }: any) => <View>{children}</View> }; });
jest.mock('@/components/training/MetricsInput', () => ({ MetricsInput: () => null }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/lib/haptics', () => ({ successHaptic: jest.fn(), tapHaptic: jest.fn() }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
let node: ReactTestRenderer;
const root = () => node.root as unknown as { findByProps: (p: object) => { props: any }; findAllByType: (type: unknown) => { props: any }[] };
const flush = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
async function render() { act(() => { node = TestRenderer.create(<SummaryScreen />); }); await flush(); }
const save = () => root().findByProps({ testID: 'summary-save' }).props.onPress();
beforeEach(() => {
  jest.clearAllMocks(); mockOwner = 'owner-a';
  mockActive = { ownerId: 'owner-a', unitId: 'unit-a', dogName: 'Dog', sourceFingerprint: 'original-source', exercises: [{ discipline: 'Obedience', exercise_name: 'Sit', rating: 3, notes: null, duration_sec: 37 }],
    summaryDraft: { operationId: 'operation-a', notes: 'draft note', rating: 4, metrics, durationSec: 120, pending: false } };
  mockRead.mockReset().mockResolvedValue(null); mockPersist.mockReset().mockResolvedValue(undefined); mockFinish.mockReset().mockResolvedValue({ data: {}, error: null }); mockReset.mockReset().mockReturnValue(true);
});
afterEach(() => { act(() => node?.unmount()); });

test('summary retains draft inputs and stops before transport when local persistence fails', async () => {
  await render(); const input = root().findAllByType(TextInput)[0]; act(() => input.props.onChangeText('new current note'));
  mockPersist.mockRejectedValueOnce(new Error('disk full'));
  await act(async () => { await save(); });
  expect(mockFinish).not.toHaveBeenCalled(); expect(root().findAllByType(TextInput)[0].props.value).toBe('new current note'); expect(mockReset).not.toHaveBeenCalled();
});
test('double press sends once with captured baseline, owner and stable operation', async () => {
  await render(); let resolve!: (v: unknown) => void; mockFinish.mockReturnValue(new Promise(done => { resolve = done; }));
  let a!: Promise<void>; let b!: Promise<void>;
  await act(async () => { a = save(); b = save(); for (let i = 0; i < 10; i++) await Promise.resolve(); });
  expect(mockFinish).toHaveBeenCalledTimes(1); expect(mockFinish.mock.calls[0][3]).toBe('owner-a'); expect(mockFinish.mock.calls[0][5]).toBe('original-source'); expect(mockFinish.mock.calls[0][6]).toBe('operation-a');
  expect(mockFinish.mock.calls[0][1].duration_sec).toBe(125);
  await act(async () => { resolve({ error: null, data: {} }); await a; await b; }); expect(mockReset).toHaveBeenCalledWith('owner-a');
});
test('restored pending completion retries its original request instead of adopting a new baseline', async () => {
  const request = { requestId: 'operation-a', unitId: 'unit-a', expectedToken: 'original-token', unit: { notes: 'confirmed original request', rating: 3, duration_sec: 97, ...metrics }, exercises: [{ id: 'row', exercise_name: 'Sit', discipline: 'Obedience', rating: 3, notes: null, duration_sec: 37, seq_index: 0 }] };
  mockRead.mockResolvedValue({ request, fingerprint: 'original-input', completed: false }); mockRetry.mockResolvedValue({ data: {}, error: null });
  await render(); expect(root().findAllByType(TextInput)[0].props.value).toBe('confirmed original request');
  await act(async () => { await save(); });
  expect(mockFinish).not.toHaveBeenCalled(); expect(mockRetry).toHaveBeenCalledWith('owner-a', 'unit-a', 'operation-a', expect.any(Function));
});
test('account switch during draft persistence cannot finish or reset the other account', async () => {
  await render(); let resolve!: () => void; mockPersist.mockReturnValue(new Promise<void>(done => { resolve = done; }));
  let pending!: Promise<void>; await act(async () => { pending = save(); await Promise.resolve(); });
  mockOwner = 'owner-b'; act(() => { (node as unknown as { update: (v: React.ReactElement) => void }).update(<SummaryScreen />); });
  await act(async () => { resolve(); await pending; });
  expect(mockFinish).not.toHaveBeenCalled(); expect(mockReset).not.toHaveBeenCalled();
});
