import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import DogDocumentEditor from '../[id]';
import { AnyvoButton } from '@/components/ui/AnyvoButton';

const mockBack = jest.fn();
const mockSave = jest.fn();
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
jest.mock('@/services/dogDocumentSave', () => ({ saveDogDocument: (...args: unknown[]) => mockSave(...args) }));
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
  mockSave.mockResolvedValue({ ok: true });
  act(() => { node = TestRenderer.create(<DogDocumentEditor />); });
});
afterEach(() => { act(() => node.unmount()); });

it('confirms only after the document is saved', async () => {
  let finish!: (value: { ok: true }) => void;
  mockSave.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await pickFile();
  await act(async () => { pending = node.root.findByType(AnyvoButton).props.onPress(); });
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockSave).toHaveBeenCalledWith('dog-1', { uri: 'local.pdf', name: 'plan.pdf', mime: 'application/pdf' },
    { kind: 'gesundheit', title: 'plan', issued_on: null, note: null });
  expect(mockSuccess).not.toHaveBeenCalled();
  await act(async () => { finish({ ok: true }); await pending; });
  expect(mockSuccess).toHaveBeenCalledTimes(1);
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockSuccess.mock.invocationCallOrder[0]).toBeLessThan(mockBack.mock.invocationCallOrder[0]);
});

// Der Fehlertext nennt den Schritt, der gescheitert ist – ein gescheiterter
// Eintrag darf nicht als «Upload fehlgeschlagen» erscheinen.
it.each([
  ['upload', 'media.uploadFailed'],
  ['record', 'dog.documentSaveFailed'],
])('does not confirm a failed %s and names it', async (stage, message) => {
  mockSave.mockResolvedValue({ ok: false, stage });
  await saveWithFile();
  expect(mockSuccess).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(message);
});

it('shows the save error when saving throws unexpectedly', async () => {
  mockSave.mockRejectedValue(new Error('boom'));
  await saveWithFile();
  expect(mockSuccess).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith('dog.documentSaveFailed');
});

it('does not confirm when validation blocks saving', async () => {
  await act(async () => { await node.root.findByType(AnyvoButton).props.onPress(); });
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockSuccess).not.toHaveBeenCalled();
});
