import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Text } from 'react-native';
import UnitStartScreen from '@/app/unit/start';

const mockReplace = jest.fn();
const mockCreateTrainingUnit = jest.fn();
const mockStartUnit = jest.fn();
const mockAddExercise = jest.fn();
const mockRefresh = jest.fn();
let mockDogs: { id: string; name: string }[] = [];
let mockDogsLoading = false;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => effect(),
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
jest.mock('@/hooks/useCustomCategories', () => ({
  useCustomCategories: () => ({ categories: [], refresh: () => mockRefresh() }),
}));
jest.mock('@/stores/activeTraining', () => ({
  useActiveTraining: () => ({ unitId: null, dogId: null, dogName: null }),
  startUnit: (input: unknown) => mockStartUnit(input),
  addExercise: (input: unknown) => mockAddExercise(input),
}));
jest.mock('@/services/trainingUnitService', () => ({
  createTrainingUnit: (ownerId: string, dogId: string) => mockCreateTrainingUnit(ownerId, dogId),
}));
jest.mock('@/lib/haptics', () => ({ tapHaptic: jest.fn() }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

jest.mock('@/components/training/HeroImage', () => {
  const { View } = jest.requireActual('react-native');
  return { HeroImage: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/components/training/DisciplineGridCard', () => {
  const { Pressable: NativePressable, Text } = jest.requireActual('react-native');
  return {
    DisciplineGridCard: ({ discipline, onPress }: { discipline: { label: string }; onPress: () => void }) => (
      <NativePressable testID={`discipline-${discipline.label}`} onPress={onPress}>
        <Text>{discipline.label}</Text>
      </NativePressable>
    ),
  };
});
jest.mock('@/components/help/HelpButton', () => ({ HelpButton: () => null }));
jest.mock('@/components/ui/DogIcon', () => ({ DogIcon: () => null }));

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<UnitStartScreen />); });
  return node;
}

function update(node: ReactTestRenderer) {
  act(() => {
    (node as unknown as { update: (element: React.ReactElement) => void }).update(<UnitStartScreen />);
  });
}

function strings(node: ReactTestRenderer): string[] {
  return (node.root as unknown as {
    findAllByType: (type: unknown) => { props: { children: unknown } }[]
  }).findAllByType(Text)
    .flatMap((text) => (Array.isArray(text.props.children) ? text.props.children : [text.props.children]))
    .filter((child): child is string => typeof child === 'string');
}

function pressDiscipline(node: ReactTestRenderer) {
  const discipline = (node.root as unknown as {
    findByProps: (props: { testID: string }) => { props: { onPress: () => Promise<void> } };
  }).findByProps({ testID: 'discipline-Fährte' });
  return act(async () => { await discipline.props.onPress(); });
}

describe('UnitStartScreen single-dog selection', () => {
  beforeEach(() => {
    mockDogs = [];
    mockDogsLoading = false;
    mockReplace.mockReset();
    mockCreateTrainingUnit.mockReset();
    mockStartUnit.mockReset();
    mockAddExercise.mockReset();
    mockRefresh.mockReset();
  });

  it('selects one asynchronously loaded dog before creating the training unit', async () => {
    mockDogsLoading = true;
    const node = render();
    mockDogs = [{ id: 'dog-1', name: 'Malu' }];
    mockDogsLoading = false;
    update(node);

    mockCreateTrainingUnit.mockResolvedValue({ data: { id: 'unit-1' }, error: null });
    await pressDiscipline(node);

    expect(strings(node)).toContain('Malu');
    expect(mockCreateTrainingUnit).toHaveBeenCalledWith('owner-1', 'dog-1');
    expect(mockStartUnit).toHaveBeenCalledWith({ unitId: 'unit-1', dogId: 'dog-1', dogName: 'Malu' });
    expect(mockReplace).toHaveBeenCalledWith('/unit/live');
  });

  it('does not create a training unit without a dog', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const node = render();

    await pressDiscipline(node);

    expect(mockCreateTrainingUnit).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('training.chooseDogFirstTitle', 'training.chooseDogFirstBody');
    alert.mockRestore();
  });

  it('keeps multiple dogs unselected until the user picks one', async () => {
    mockDogs = [{ id: 'dog-1', name: 'Malu' }, { id: 'dog-2', name: 'Yam' }];
    const node = render();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    expect(strings(node)).toContain('training.chooseDogTitle');
    const selector = (node.root as unknown as {
      findAll: (predicate: (node: { props: { accessibilityRole?: string; onPress?: () => void } }) => boolean) => { props: { onPress: () => void } }[]
    }).findAll((child) => child.props.accessibilityRole === 'button')[0];
    act(() => { selector.props.onPress(); });
    const yamChip = (node.root as unknown as {
      findAll: (predicate: (node: {
        props: { onPress?: () => void };
        findAllByType: (type: unknown) => { props: { children: unknown } }[];
      }) => boolean) => { props: { onPress: () => void } }[];
    }).findAll((child) => (
      typeof child.props.onPress === 'function' && child.findAllByType(Text).some((text) => text.props.children === 'Yam')
    ))[0];
    act(() => { yamChip.props.onPress(); });

    mockCreateTrainingUnit.mockResolvedValue({ data: { id: 'unit-2' }, error: null });
    await pressDiscipline(node);

    expect(alert).not.toHaveBeenCalled();
    expect(mockCreateTrainingUnit).toHaveBeenCalledWith('owner-1', 'dog-2');
    alert.mockRestore();
  });
});
