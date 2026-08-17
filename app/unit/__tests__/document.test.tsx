import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import DocumentScreen from '@/app/unit/document';

const mockCreateDocumentedUnit = jest.fn();
const mockReplace = jest.fn();
let mockDogs: { id: string; name: string }[] = [];
let mockDogsLoading = false;

jest.mock('expo-crypto', () => ({ randomUUID: () => 'unit-id' }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: (...args: unknown[]) => mockReplace(...args) }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockDogs, loading: mockDogsLoading }) }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'owner-1' } } }) }));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
jest.mock('@/hooks/useCustomCategories', () => ({ useCustomCategories: () => ({ categories: [] }) }));
jest.mock('@/constants/disciplines', () => ({
  DISCIPLINES: [{ key: 'faehrte', label: 'Fährte', accent: '#00FFCC', icon: 'paw', exercises: ['Übung'], custom: false }],
  customToDiscipline: (category: unknown) => category,
  disciplineColor: () => '#00FFCC',
}));
jest.mock('@/constants/sparten', () => ({ DEFAULT_SPARTEN: ['Fährte'] }));
jest.mock('@/services/trainingUnitService', () => ({
  createDocumentedUnit: (...args: unknown[]) => mockCreateDocumentedUnit(...args),
  updateDocumentedUnit: jest.fn(),
  getTrainingUnitById: jest.fn(),
}));
jest.mock('@/features/subscription/quotaUx', () => ({ handleQuotaBlock: () => false }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/lib/haptics', () => ({ tapHaptic: jest.fn(), successHaptic: jest.fn() }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

jest.mock('@/components/ui/AnimatedPressable', () => ({
  AnimatedPressable: ({ children, disabled, onPress }: { children?: React.ReactNode; disabled?: boolean; onPress?: () => void }) => {
    const { Pressable: NativePressable } = jest.requireActual('react-native');
    return <NativePressable testID="document-save" disabled={disabled} onPress={onPress}>{children}</NativePressable>;
  },
}));
jest.mock('@/components/help/HelpButton', () => ({ HelpButton: () => null }));
jest.mock('@/components/ui/Glass', () => ({ Glass: ({ children }: { children?: React.ReactNode }) => children, isGlass: false }));
jest.mock('@/components/ui/PhotoPicker', () => ({ PhotoPicker: () => null }));
jest.mock('@/components/ui/AudioRecorder', () => ({ AudioRecorder: () => null }));
jest.mock('@/components/ui/DurationDrumPicker', () => ({ DurationDrumPicker: () => null }));
jest.mock('@/components/training/MultiVideoUpload', () => ({ MultiVideoUpload: () => null }));
jest.mock('@/components/training/MetricsInput', () => ({ MetricsInput: () => null }));
jest.mock('@/components/ui/DateField', () => ({ DateField: () => null }));
jest.mock('@/components/ui/DogIcon', () => ({ DogIcon: () => null }));

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DocumentScreen />); });
  return node;
}

function update(node: ReactTestRenderer) {
  act(() => {
    (node as unknown as { update: (element: React.ReactElement) => void }).update(<DocumentScreen />);
  });
}

function strings(node: ReactTestRenderer): string[] {
  return (node.root as unknown as {
    findAllByType: (type: unknown) => { props: { children: unknown } }[]
  }).findAllByType(Text)
    .flatMap((text) => (Array.isArray(text.props.children) ? text.props.children : [text.props.children]))
    .filter((child): child is string => typeof child === 'string');
}

function saveButton(node: ReactTestRenderer) {
  return (node.root as unknown as {
    findByProps: (props: { testID: string }) => { props: { disabled?: boolean; onPress: () => Promise<void> } };
  }).findByProps({ testID: 'document-save' });
}

function selectExercise(node: ReactTestRenderer) {
  const exercise = (node.root as unknown as {
    findAll: (predicate: (node: {
      props: { onPress?: () => void };
      findAllByType: (type: unknown) => { props: { children: unknown } }[];
    }) => boolean) => { props: { onPress: () => void } }[];
  }).findAll((child) => (
    typeof child.props.onPress === 'function' && child.findAllByType(Text).some((text) => text.props.children === 'Übung')
  ))[0];
  act(() => { exercise.props.onPress(); });
}

describe('DocumentScreen dog selection', () => {
  beforeEach(() => {
    mockDogs = [];
    mockDogsLoading = false;
    mockCreateDocumentedUnit.mockReset();
    mockReplace.mockReset();
  });

  it('blocks saving and shows the add-dog state with no dogs', () => {
    const node = render();

    expect(strings(node)).toContain('training.addFirstDog');
    expect(saveButton(node).props.disabled).toBe(true);
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });

  it('shows and persists the asynchronously loaded single dog', async () => {
    mockDogsLoading = true;
    const node = render();
    mockDogs = [{ id: 'dog-1', name: 'Yam' }];
    mockDogsLoading = false;
    update(node);
    selectExercise(node);

    mockCreateDocumentedUnit.mockResolvedValue({ error: null, data: { id: 'unit-1' } });
    await act(async () => { await saveButton(node).props.onPress(); });

    expect(strings(node)).toContain('Yam');
    expect(mockCreateDocumentedUnit).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({ dog_id: 'dog-1' }),
      expect.any(Array),
      'unit-id',
    );
  });

  it('keeps multiple dogs selectable instead of auto-selecting one', () => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }, { id: 'dog-2', name: 'Malu' }];
    const node = render();
    selectExercise(node);

    expect(strings(node)).toEqual(expect.arrayContaining(['Yam', 'Malu']));
    expect(saveButton(node).props.disabled).toBe(true);
  });
});
