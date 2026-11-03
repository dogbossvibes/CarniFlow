import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import DogDocumentEditor from '../[id]';
import { AnyvoButton } from '@/components/ui/AnyvoButton';

const mockBack = jest.fn();
const mockUpload = jest.fn();
const mockInsert = jest.fn();
const mockPick = jest.fn();
const mockSuccess = jest.fn();
const mockToast = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: 'dog-1' }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: () => mockPick() }));
jest.mock('@/components/ui/AnyvoButton', () => ({ AnyvoButton: () => null }));
jest.mock('@/components/ui/KeyboardAwareScrollView', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
jest.mock('@/components/ui/DateField', () => ({ DateField: () => null }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast, toast: null }) }));
jest.mock('@/services/dogHub', () => ({ addDogDocument: (...args: unknown[]) => mockInsert(...args) }));
jest.mock('@/services/storage', () => ({ uploadDogDocument: (...args: unknown[]) => mockUpload(...args) }));
jest.mock('@/lib/haptics', () => ({ haptic: { success: () => mockSuccess() } }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

let node: ReactTestRenderer;
async function pickFile() {
  await act(async () => {
    const picker = node.root.findAllByType(TouchableOpacity).find(button =>
      button.findAll(child => child.props.name === 'cloud-upload-outline').length > 0);
    await picker!.props.onPress();
  });
}
async function saveWithFile() {
  await pickFile();
  await act(async () => { await node.root.findByType(AnyvoButton).props.onPress(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'local.pdf', name: 'plan.pdf', mimeType: 'application/pdf' }] });
  mockUpload.mockResolvedValue('dog-1/plan.pdf');
  mockInsert.mockResolvedValue({ error: null });
  act(() => { node = TestRenderer.create(<DogDocumentEditor />); });
});
afterEach(() => { act(() => node.unmount()); });

it('confirms only after both upload and document record succeed', async () => {
  let finishInsert!: (value: { error: null }) => void;
  mockInsert.mockImplementation(() => new Promise(resolve => { finishInsert = resolve; }));
  let pending!: Promise<void>;
  await pickFile();
  await act(async () => { pending = node.root.findByType(AnyvoButton).props.onPress(); });
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect(mockSuccess).not.toHaveBeenCalled();
  await act(async () => { finishInsert({ error: null }); await pending; });
  expect(mockSuccess).toHaveBeenCalledTimes(1);
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockSuccess.mock.invocationCallOrder[0]).toBeLessThan(mockBack.mock.invocationCallOrder[0]);
});

it.each(['upload', 'record'])('does not confirm a failed %s', async failure => {
  if (failure === 'upload') mockUpload.mockRejectedValue(new Error('upload failed'));
  else mockInsert.mockResolvedValue({ error: new Error('insert failed') });
  await saveWithFile();
  expect(mockSuccess).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith('media.uploadFailed');
});

it('does not confirm when validation blocks saving', async () => {
  await act(async () => { await node.root.findByType(AnyvoButton).props.onPress(); });
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockSuccess).not.toHaveBeenCalled();
});
