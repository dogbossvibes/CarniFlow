import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, BackHandler, Text, TextInput, TouchableOpacity, type AppStateStatus } from 'react-native';
import DocumentScreen from '@/app/unit/document';
import { TrainingPreparation } from '@/components/training/TrainingPreparation';

const mockCreateDocumentedUnit = jest.fn();
const mockAtomicSave = jest.fn();
const mockListIdentities = jest.fn();
const mockListFocuses = jest.fn();
const mockCompleteFocus = jest.fn();
const mockReplaySave = jest.fn();
let mockUuidCounter = 0;
const mockUpdateDocumentedUnit = jest.fn();
const mockGetTrainingUnitById = jest.fn();
const mockGetRecentExerciseNames = jest.fn();
const mockGetTrainingUnits = jest.fn();
const mockUpdateCustomCategory = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockDogs: { id: string; name: string }[] = [];
let mockDogsLoading = false;
let mockCategories: { id: string; name: string; icon: string; color: string; exercises: string[]; key: string; label: string; accent: string; custom: boolean }[] = [];
let mockParams: Record<string, string> = {};
let mockOwner = 'owner-1';
let mockDocumentFocused = true;

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: () => mockUuidCounter++ === 0 ? 'unit-id' : `uuid-${mockUuidCounter}` }));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { const React = jest.requireActual('react'); const focused = mockDocumentFocused; React.useEffect(() => focused ? effect() : undefined, [effect, focused]); },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args) }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockDogs, loading: mockDogsLoading }) }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockOwner } } }) }));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
jest.mock('@/hooks/useCustomCategories', () => ({ useCustomCategories: () => ({ categories: mockCategories }) }));
jest.mock('@/constants/disciplines', () => ({
  DISCIPLINES: [{ key: 'faehrte', label: 'Fährte', accent: '#00FFCC', icon: 'paw', exercises: ['Übung'], custom: false }],
  customToDiscipline: (category: unknown) => category,
  disciplineColor: () => '#00FFCC',
}));
jest.mock('@/constants/sparten', () => ({ DEFAULT_SPARTEN: ['Fährte'] }));
jest.mock('@/services/trainingDocumentService', () => ({
  saveAtomicTrainingDocument: (...args: unknown[]) => mockReplaySave(...args),
  listExerciseIdentities: (...args: unknown[]) => mockListIdentities(...args),
  listServerTrainingFocuses: (...args: unknown[]) => mockListFocuses(...args),
  updateServerTrainingFocus: (...args: unknown[]) => mockCompleteFocus(...args),
}));
const mockLegacySessions = jest.fn();
jest.mock('@/services/training', () => ({ getTrainingSessions: (...args: unknown[]) => mockLegacySessions(...args) }));
jest.mock('@/services/trainingUnitService', () => ({
  saveDocumentedUnitAtomic: (owner: string, id: string, unit: unknown, exercises: unknown, mode: string, options: { current: () => boolean }) => {
    const override = mockAtomicSave(owner, id, unit, exercises, mode, options);
    if (override !== undefined) return override;
    return mode === 'edit' ? mockUpdateDocumentedUnit(id, unit, exercises, options.current) : mockCreateDocumentedUnit(owner, unit, exercises, id, options.current);
  },
  createDocumentedUnit: (...args: unknown[]) => mockCreateDocumentedUnit(...args),
  updateDocumentedUnit: (...args: unknown[]) => mockUpdateDocumentedUnit(...args),
  getTrainingUnitById: (...args: unknown[]) => mockGetTrainingUnitById(...args),
  getRecentExerciseNames: (...args: unknown[]) => mockGetRecentExerciseNames(...args),
  getTrainingPreparationUnits: (...args: unknown[]) => mockGetTrainingUnits(...args),
}));
jest.mock('@/services/customCategoryService', () => ({
  updateCustomCategory: (...args: unknown[]) => mockUpdateCustomCategory(...args),
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
jest.mock('@/components/ui/PhotoPicker', () => ({ PhotoPicker: () => null }));
jest.mock('@/components/ui/AudioRecorder', () => ({ AudioRecorder: () => null }));
jest.mock('@/components/training/MultiVideoUpload', () => ({ MultiVideoUpload: () => null }));
jest.mock('@/components/training/MetricsInput', () => ({ MetricsInput: () => null }));
jest.mock('@/components/ui/DateField', () => ({ DateField: () => null }));
jest.mock('@/components/ui/DogIcon', () => ({ DogIcon: () => null }));
// CompactDurationStepper, SelectedExerciseCard, CustomExerciseSheet bleiben UNGEMOCKT:
// ihr Interaktionsverhalten (Bewertung/Notiz, Sheet-Validierung, Speichern-für-
// Zukunft) ist Teil dessen, was diese Tests abdecken sollen.

// React Native exposes primitives through lazy getters. Resolve the preset's
// native mocks during module setup so first-render assertions do not also time
// Babel-transforming Modal/Animated internals. Keep the real component behavior.
for (const name of ['Modal', 'TouchableOpacity', 'TextInput', 'KeyboardAvoidingView', 'ScrollView']) {
  Reflect.get(jest.requireActual('react-native'), name);
}
// TouchableOpacity's native animation resolves the renderer lazily on disabled
// changes. Initialize that existing binding without rendering a product component.
jest.requireActual<typeof import('react-native')>('react-native').findNodeHandle(null);

const mounted: ReactTestRenderer[] = [];
afterEach(async () => { await act(async () => { for (const node of mounted.splice(0)) node.unmount(); await Promise.resolve(); }); });
function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DocumentScreen />); });
  mounted.push(node);
  return node;
}

// Lässt den Vorschläge-aus-Historie-Effekt (getRecentExerciseNames, async)
// vor dem Testende abschliessen — sonst landet das setState nach der
// act()-Grenze (React-Warnung / potenzieller Zugriff nach Teardown).
async function flush() {
  await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); });
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
    .filter((child): child is string | number => typeof child === 'string' || typeof child === 'number')
    .map(String);
}

function saveButton(node: ReactTestRenderer) {
  return (node.root as unknown as {
    findByProps: (props: { testID: string }) => { props: { disabled?: boolean; onPress: () => Promise<void> } };
  }).findByProps({ testID: 'document-save' });
}

// Findet die erste druckbare Zeile (TouchableOpacity o. ä. mit onPress), die
// irgendwo in ihrem Unterbaum genau den angegebenen Text als Kind rendert —
// dasselbe Muster wie die bereits bestehenden Helfer in dieser Datei.
function pressableWithText(node: ReactTestRenderer, text: string) {
  return (node.root as unknown as {
    findAll: (predicate: (child: {
      props: { onPress?: () => void };
      findAllByType: (type: unknown) => { props: { children: unknown } }[];
    }) => boolean) => { props: { onPress: () => void } }[];
  }).findAll((child) => (
    typeof child.props.onPress === 'function' && child.findAllByType(Text).some((t) => t.props.children === text)
  ))[0];
}

function tap(node: ReactTestRenderer, text: string) {
  act(() => { pressableWithText(node, text).props.onPress(); });
}

async function openExercisePicker(node: ReactTestRenderer) {
  if (strings(node).includes('trainingFlow.prepareTitle')) {
    await act(async () => { await saveButton(node).props.onPress(); });
    await flush();
  }
  const label = strings(node).includes('trainingFlow.addExercise') ? 'trainingFlow.addExercise' : 'trainingFlow.chooseExercise';
  if (!strings(node).includes('training.exercisesFor') && pressableWithText(node, label)) { tap(node, label); await flush(); }
  await flush();
}
async function selectExercise(node: ReactTestRenderer) {
  await openExercisePicker(node);
  tap(node, 'Übung');
  await flush();
}
async function advanceToSave(node: ReactTestRenderer) {
  if (strings(node).includes('trainingFlow.observeTitle')) {
    await act(async () => { await saveButton(node).props.onPress(); });
    await flush();
  }
}
async function submitTraining(node: ReactTestRenderer) {
  await advanceToSave(node);
  await act(async () => { await saveButton(node).props.onPress(); });
}
function showContext(node: ReactTestRenderer) {
  const trigger = pressableWithText(node, 'trainingFlow.changeContext');
  if (trigger) act(() => trigger.props.onPress());
}


function inputByPlaceholder(node: ReactTestRenderer, placeholder: string) {
  return (node.root as unknown as {
    findAllByType: (type: unknown) => { props: { placeholder?: string; value?: string; onChangeText: (v: string) => void } }[];
  }).findAllByType(TextInput).find((i) => i.props.placeholder === placeholder)!;
}

// Default: keine Vorschläge, ausser ein Test setzt bewusst etwas anderes.
beforeEach(async () => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  mockDocumentFocused = true;
  mockListFocuses.mockReset().mockResolvedValue({ data: [], error: null });
  mockCompleteFocus.mockReset().mockResolvedValue({ data: null, error: null });
  mockListIdentities.mockReset().mockResolvedValue({ data: [], error: null });
  mockOwner = 'owner-1'; mockUuidCounter = 0; mockAtomicSave.mockReset(); mockReplaySave.mockReset();
  await AsyncStorage.clear();
  const legacyQuery = { eq: jest.fn(), or: jest.fn(), limit: jest.fn().mockResolvedValue({ data: [], error: null }) };
  legacyQuery.eq.mockReturnValue(legacyQuery); legacyQuery.or.mockReturnValue(legacyQuery);
  mockLegacySessions.mockReset().mockReturnValue(legacyQuery);
  mockGetTrainingUnits.mockReset().mockReturnValue({ limit: () => Promise.resolve({ data: [], error: null }) });
  mockGetRecentExerciseNames.mockReset().mockResolvedValue({ data: [], error: null });
});

describe('DocumentScreen dog selection', () => {
  beforeEach(() => {
    mockDogs = [];
    mockDogsLoading = false;
    mockCreateDocumentedUnit.mockReset();
    mockReplace.mockReset();
    mockPush.mockReset();
  });

  it('blocks saving and shows the add-dog state with no dogs', async () => {
    const node = render();
    await flush();

    expect(strings(node)).toContain('training.addFirstDog');
    expect(saveButton(node).props.disabled).toBe(true);
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });

  it('shows and persists the asynchronously loaded single dog', async () => {
    mockDogsLoading = true;
    const node = render();
    await flush();
    mockDogs = [{ id: 'dog-1', name: 'Yam' }];
    mockDogsLoading = false;
    update(node);
    await selectExercise(node);

    mockCreateDocumentedUnit.mockResolvedValue({ error: null, data: { id: 'unit-1' } });
    await submitTraining(node);

    expect(strings(node).join(' ')).toContain('Yam');
    expect(mockCreateDocumentedUnit).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({ dog_id: 'dog-1' }),
      expect.any(Array),
      'unit-id', expect.any(Function),
    );
  });

  it('keeps multiple dogs selectable instead of auto-selecting one', async () => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }, { id: 'dog-2', name: 'Malu' }];
    const node = render();
    await flush();
    expect(strings(node)).toEqual(expect.arrayContaining(['Yam', 'Malu']));
    expect(saveButton(node).props.disabled).toBe(true);
  });
});

// Eigene Trainings-Sparte: „+ Eigene Sparte hinzufügen" beim nachträglichen
// Dokumentieren führt zur selben Route/Logik wie in app/unit/start.tsx —
// keine zweite Anlege-Implementierung.
describe('DocumentScreen — eigene Sparte anlegen', () => {
  beforeEach(() => {
    mockDogs = [];
    mockDogsLoading = false;
    mockCreateDocumentedUnit.mockReset();
    mockReplace.mockReset();
    mockPush.mockReset();
  });

  it('navigiert beim Tap auf „Eigene Sparte hinzufügen" zur bestehenden Anlege-Route', async () => {
    const node = render();
    await flush();
    expect(strings(node)).toContain('training.createCategory');

    tap(node, 'training.createCategory');

    expect(mockPush).toHaveBeenCalledWith('/unit/new-category');
    // Kein zweiter, eigener Anlege-Flow — dieselbe Route wie start.tsx.
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });
});

// Ausgewählte Übungen: Bewertung + Notiz landen unverändert in genau den
// bestehenden Spalten training_exercises.rating/.notes.
describe('DocumentScreen — Übungsbewertung & Notiz', () => {
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }];
    mockDogsLoading = false;
    mockCategories = [];
    mockParams = {};
    mockCreateDocumentedUnit.mockReset();
    mockGetRecentExerciseNames.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it('speichert Bewertung und Notiz pro Übung statt hartem null', async () => {
    const node = render();
    await flush();
    await selectExercise(node);
    await flush();

    tap(node, 'trainingDoc.exerciseDetails');
    // 5-Sterne-Reihe der SelectedExerciseCard: 3. Stern antippen (das Icon
    // selbst trägt kein onPress — das sitzt auf der umschliessenden Touchable).
    // findAllByType(TouchableOpacity) statt eines typ-agnostischen findAll, da
    // TouchableOpacity Press-Handling intern an Pressable weiterreicht und ein
    // typ-offener onPress-Scan sonst dieselbe Taste doppelt zählen kann.
    const stars = (node.root as unknown as {
      findAllByType: (type: unknown) => {
        props: { onPress: () => void };
        findAllByProps: (props: { name: string }) => unknown[];
      }[];
    }).findAllByType(TouchableOpacity).filter((btn) => btn.findAllByProps({ name: 'star-outline' }).length > 0);
    act(() => { stars[2].props.onPress(); });

    const note = inputByPlaceholder(node, 'training.exerciseNotePlaceholder');
    act(() => { note.props.onChangeText('War heute unruhig'); });

    mockCreateDocumentedUnit.mockResolvedValue({ error: null, data: { id: 'unit-1' } });
    await submitTraining(node);

    expect(mockCreateDocumentedUnit).toHaveBeenCalledWith(
      'owner-1',
      expect.anything(),
      [expect.objectContaining({ exercise_name: 'Übung', rating: 3, notes: 'War heute unruhig', seq_index: 0 })],
      'unit-id', expect.any(Function),
    );
  });
});

// Eigene Übung: Sheet statt permanentem Freitextfeld.
describe('DocumentScreen — Eigene Übung Sheet', () => {
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }];
    mockDogsLoading = false;
    mockCategories = [];
    mockParams = {};
    mockCreateDocumentedUnit.mockReset();
    mockUpdateCustomCategory.mockReset();
    mockGetRecentExerciseNames.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it('öffnet das Sheet, blockiert leeren Namen, fügt gültigen Namen zur Auswahl hinzu', async () => {
    const node = render();
    await flush();

    await openExercisePicker(node); tap(node, 'training.addCustomExercise');
    // Feste Sparte: kein Toggle, sondern ehrlicher Hinweistext.
    expect(strings(node)).toContain('training.saveForFutureAutoHint');

    // Leerer Name: kein Effekt.
    act(() => { pressableWithText(node, 'common.save').props.onPress(); });
    expect(strings(node)).not.toContain('Sitz aus der Ferne');

    act(() => { inputByPlaceholder(node, 'training.customExercisePlaceholder').props.onChangeText('Sitz aus der Ferne'); });
    act(() => { pressableWithText(node, 'common.save').props.onPress(); });

    expect(strings(node)).toContain('Sitz aus der Ferne');
    // Feste Sparte: keine Persistenz-Schreiboperation ausgelöst.
    expect(mockUpdateCustomCategory).not.toHaveBeenCalled();
  });

  it('4. Whitespace am Anfang/Ende wird vor der Übernahme entfernt', async () => {
    const node = render();
    await flush();
    await openExercisePicker(node); tap(node, 'training.addCustomExercise');

    act(() => { inputByPlaceholder(node, 'training.customExercisePlaceholder').props.onChangeText('   Slalom   '); });
    act(() => { pressableWithText(node, 'common.save').props.onPress(); });

    expect(strings(node)).toContain('Slalom');
    expect(strings(node)).not.toContain('   Slalom   ');
  });

  it('11. doppeltes Auslösen von „Hinzufügen" erzeugt keine doppelte Übung', async () => {
    const node = render();
    await flush();
    await openExercisePicker(node); tap(node, 'training.addCustomExercise');
    act(() => { inputByPlaceholder(node, 'training.customExercisePlaceholder').props.onChangeText('Cavaletti'); });

    // Zwei schnelle Aufrufe von onSave (z. B. Doppel-Tap), wie es das Sheet
    // selbst über handleSave auslösen würde — der Zähler in der Überschrift
    // ("N ausgewählt") muss trotzdem bei 1 bleiben, keine zweite Karte.
    const onPress = pressableWithText(node, 'common.save').props.onPress;
    act(() => { onPress(); onPress(); });

    expect(strings(node)).toContain('training.selectedCount');
    const cavalettiCount = strings(node).filter((txt) => txt === 'Cavaletti').length;
    expect(cavalettiCount).toBe(1);
  });

  it('4 (Design). eigene Übung wird optisch als „Eigene Übung" gekennzeichnet', async () => {
    const node = render();
    await flush();
    await openExercisePicker(node); tap(node, 'training.addCustomExercise');
    act(() => { inputByPlaceholder(node, 'training.customExercisePlaceholder').props.onChangeText('Cavaletti / Balance'); });
    act(() => { pressableWithText(node, 'common.save').props.onPress(); });

    // Badge nutzt bewusst denselben, bereits übersetzten Begriff wie der
    // Sheet-Titel — keine neue i18n-Zeichenkette.
    expect(strings(node)).toContain('training.customExerciseSheetTitle');
    expect(strings(node)).toContain('Cavaletti / Balance');
  });

  it('5. eigene Übung ist mit normalen Übungen derselben Sparte kombinierbar und wird gemeinsam gespeichert', async () => {
    const node = render();
    await flush();
    await selectExercise(node);   // vorhandene Preset-Übung „Übung" (siehe DISCIPLINES-Mock)

    await openExercisePicker(node); tap(node, 'training.addCustomExercise');
    act(() => { inputByPlaceholder(node, 'training.customExercisePlaceholder').props.onChangeText('Cavaletti / Balance'); });
    act(() => { pressableWithText(node, 'common.save').props.onPress(); });

    expect(strings(node)).toContain('Übung');
    expect(strings(node)).toContain('Cavaletti / Balance');

    mockCreateDocumentedUnit.mockResolvedValue({ error: null, data: { id: 'unit-1' } });
    await submitTraining(node);

    const [, , exercises] = mockCreateDocumentedUnit.mock.calls[0];
    expect(exercises).toEqual(expect.arrayContaining([
      expect.objectContaining({ exercise_name: 'Übung' }),
      expect.objectContaining({ exercise_name: 'Cavaletti / Balance' }),
    ]));
  });
});

// Eigene Sparte: „für zukünftige Trainings speichern" hängt an die bestehende
// exercises[]-Liste der Kategorie an (updateCustomCategory) — dieselbe
// Persistenz wie im Kategorie-Editor, keine Parallel-Implementierung.
describe('DocumentScreen — Eigene Übung für eigene Sparte speichern', () => {
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }];
    mockDogsLoading = false;
    mockCategories = [{
      id: 'cat-1', name: 'Trickdogging', icon: 'paw', color: '#00FFCC',
      exercises: ['Pfote geben'], key: 'custom:cat-1', label: 'Trickdogging', accent: '#00FFCC', custom: true,
    }];
    mockParams = {};
    mockCreateDocumentedUnit.mockReset();
    mockUpdateCustomCategory.mockReset();
    mockGetRecentExerciseNames.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it('hängt eine neue eigene Übung an die bestehende Kategorie an, wenn der Schalter aktiv ist', async () => {
    const node = render();
    await flush();
    showContext(node); tap(node, 'Trickdogging');

    await openExercisePicker(node); tap(node, 'training.addCustomExercise');
    // Eigene Sparte: der Schalter ist echt interaktiv (Default an).
    expect(strings(node)).toContain('training.saveForFuture');

    const nameInput = inputByPlaceholder(node, 'training.customExercisePlaceholder');
    act(() => { nameInput.props.onChangeText('Rolle'); });
    mockUpdateCustomCategory.mockResolvedValue({ error: null, data: {} });
    await act(async () => { await pressableWithText(node, 'common.save').props.onPress(); });

    expect(mockUpdateCustomCategory).toHaveBeenCalledWith('cat-1', {
      name: 'Trickdogging', icon: 'paw', color: '#00FFCC', exercises: ['Pfote geben', 'Rolle'],
    });
  });

  it('hängt nichts an, wenn der Schalter ausgeschaltet wird', async () => {
    const node = render();
    await flush();
    showContext(node); tap(node, 'Trickdogging');
    await openExercisePicker(node); tap(node, 'training.addCustomExercise');

    tap(node, 'training.saveForFuture'); // Schalter aus.
    const nameInput = inputByPlaceholder(node, 'training.customExercisePlaceholder');
    act(() => { nameInput.props.onChangeText('Rolle'); });
    await act(async () => { await pressableWithText(node, 'common.save').props.onPress(); });

    expect(mockUpdateCustomCategory).not.toHaveBeenCalled();
  });
});

// Vorschläge aus der eigenen Trainingshistorie: nur für feste Sparten, keine
// neue Tabelle — siehe getRecentExerciseNames (services/trainingUnitService.ts).
describe('DocumentScreen — Vorschläge aus Historie', () => {
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }];
    mockDogsLoading = false;
    mockCategories = [];
    mockParams = {};
    mockGetRecentExerciseNames.mockReset();
  });

  it('zeigt zusätzliche Chips aus der Historie für eine feste Sparte', async () => {
    mockGetRecentExerciseNames.mockResolvedValue({ data: ['Distanzkontrolle'], error: null });
    const node = render();
    await flush();
    update(node);

    expect(mockGetRecentExerciseNames).toHaveBeenCalledWith('owner-1', 'Fährte', 20, 'dog-1');
    await openExercisePicker(node);
    expect(strings(node)).toContain('Distanzkontrolle');
  });

  it('fragt für eine eigene Sparte keine Vorschläge ab', async () => {
    mockCategories = [{
      id: 'cat-1', name: 'Trickdogging', icon: 'paw', color: '#00FFCC',
      exercises: ['Pfote geben'], key: 'custom:cat-1', label: 'Trickdogging', accent: '#00FFCC', custom: true,
    }];
    mockGetRecentExerciseNames.mockResolvedValue({ data: [], error: null });
    const node = render();
    // Initialer Mount steht noch auf der festen Standard-Sparte (Fährte) →
    // ruft einmal ab. Erst der Wechsel auf die eigene Sparte ist relevant.
    await flush();
    mockGetRecentExerciseNames.mockClear();

    showContext(node); tap(node, 'Trickdogging');
    await flush();

    expect(mockGetRecentExerciseNames).not.toHaveBeenCalled();
  });
});

// Bearbeiten: bestehende Einheit inkl. bereits gesetzter Bewertung/Notiz pro
// Übung wird unverändert geladen und vorbefüllt.
describe('DocumentScreen — bestehende Einheit bearbeiten', () => {
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }];
    mockDogsLoading = false;
    mockCategories = [];
    mockParams = { id: 'unit-1' };
    mockGetRecentExerciseNames.mockReset().mockResolvedValue({ data: [], error: null });
    mockUpdateDocumentedUnit.mockReset();
    mockGetTrainingUnitById.mockReset().mockResolvedValue({
      data: {
        owner_id: 'owner-1', dog_id: 'dog-1', notes: 'Altes Training', score: 7, session_date: '2026-05-01',
        duration_sec: 1200, photos: [], videos: [], audio_files: [],
        motivation: null, konzentration: null, praezision: null, ausdauer: null, trieblage: null, impulskontrolle: null,
        exercises: [{ discipline: 'Fährte', exercise_name: 'Übung', rating: 4, notes: 'Gut gelaufen' }],
      },
      error: null,
    });
  });

  afterEach(() => { mockParams = {}; });

  it('lädt Bewertung und Notiz der alten Übung unverändert vor', async () => {
    const node = render();
    await flush();
    update(node);

    // TextInput-Inhalte sind kein <Text>-Kind (strings() greift hier nicht) —
    // direkt am kontrollierten value der jeweiligen Felder prüfen.
    tap(node, 'trainingDoc.exerciseDetails');
    expect(inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.value).toBe('Gut gelaufen');
    expect(inputByPlaceholder(node, 'training.descriptionPlaceholder').props.value).toBe('Altes Training');

    mockUpdateDocumentedUnit.mockResolvedValue({ error: null });
    await submitTraining(node);

    expect(mockUpdateDocumentedUnit).toHaveBeenCalledWith(
      'unit-1',
      expect.anything(),
      [expect.objectContaining({ exercise_name: 'Übung', rating: 4, notes: 'Gut gelaufen' })], expect.any(Function),
    );
  });

  it('8. eine zuvor gespeicherte eigene Übung erscheint beim erneuten Öffnen weiterhin korrekt (inkl. Kennzeichnung) und bleibt beim Speichern erhalten', async () => {
    mockGetTrainingUnitById.mockReset().mockResolvedValue({
      data: {
        owner_id: 'owner-1', dog_id: 'dog-1', notes: null, score: null, session_date: '2026-05-01',
        duration_sec: 1200, photos: [], videos: [], audio_files: [],
        motivation: null, konzentration: null, praezision: null, ausdauer: null, trieblage: null, impulskontrolle: null,
        // „Cavaletti / Balance" steht NICHT in der festen Übungsliste des Mocks
        // (nur 'Übung') — muss dennoch unverändert geladen und als eigene
        // Übung erkannt werden, rein aus dem Nicht-Vorkommen in der Liste.
        exercises: [{ discipline: 'Fährte', exercise_name: 'Cavaletti / Balance', rating: null, notes: null }],
      },
      error: null,
    });
    const node = render();
    await flush();
    update(node);

    expect(strings(node)).toContain('Cavaletti / Balance');
    expect(strings(node)).toContain('training.customExerciseSheetTitle'); // Kennzeichnung sichtbar

    mockUpdateDocumentedUnit.mockResolvedValue({ error: null });
    await submitTraining(node);

    expect(mockUpdateDocumentedUnit).toHaveBeenCalledWith(
      'unit-1',
      expect.anything(),
      [expect.objectContaining({ exercise_name: 'Cavaletti / Balance' })], expect.any(Function),
    );
  });
});

// Kompakter Dauer-Stepper: gleiche Minuten-Signatur, sinnvolle Grenzen.
describe('DocumentScreen — Dauer-Stepper', () => {
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }];
    mockDogsLoading = false;
    mockCategories = [];
    mockParams = {};
    mockGetRecentExerciseNames.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it('erhöht und verringert die Dauer in 5-Minuten-Schritten', async () => {
    const node = render();
    await flush();
    await openExercisePicker(node); tap(node, 'trainingFlow.optionalDetails');
    expect(strings(node)).toContain('trainingDoc.optionalDuration');
    const durationAction = (node.root as unknown as { findByProps: (props: { accessibilityLabel: string }) => { props: { onPress: () => void } } }).findByProps({ accessibilityLabel: 'trainingDoc.enterDuration' });
    act(() => durationAction.props.onPress());
    expect(strings(node)).toContain('5');

    const findBtn = (label: string) => (node.root as unknown as {
      findByProps: (p: { accessibilityLabel: string }) => { props: { onPress: () => void } };
    }).findByProps({ accessibilityLabel: label });

    act(() => { findBtn('training.durationDecrease').props.onPress(); });
    expect(strings(node)).toContain('5');

    act(() => { findBtn('training.durationIncrease').props.onPress(); });
    expect(strings(node)).toContain('10');
  });
});

describe('DocumentScreen — safe preparation and draft flow', () => {
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }, { id: 'dog-2', name: 'Malu' }];
    mockDogsLoading = false; mockCategories = []; mockParams = { dogId: 'dog-1' };
    mockCreateDocumentedUnit.mockReset();
    mockGetTrainingUnitById.mockReset();
  });
  const past = () => ({ id: 'past-unit', owner_id: 'owner-1', dog_id: 'dog-1', status: 'completed',
    session_date: '2026-10-14', created_at: '2026-10-14T12:00:00Z', notes: 'Past observation',
    shared_with_trainer: true, photos: ['private-past-photo'], videos: ['private-video'],
    exercises: [{ id: 'past-ex', discipline: 'Fährte', exercise_name: 'Übung', rating: 5, notes: 'Past result', seq_index: 0, duration_sec: 123 }],
  });
  it('reuses exercises as a plan with no old performance, media or invented duration', async () => {
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    tap(node, 'trainingDoc.buildOn'); await flush();
    expect(saveButton(node).props.disabled).toBe(true);
    expect(strings(node)).toContain('trainingDoc.planned');
    tap(node, 'trainingDoc.planned'); await flush();
    mockCreateDocumentedUnit.mockResolvedValue({ error: null, data: { id: 'new' } });
    await submitTraining(node);
    expect(mockCreateDocumentedUnit).toHaveBeenCalledWith('owner-1', expect.objectContaining({ duration_sec: null, photos: [], videos: [], shared_with_trainer: false }),
      [expect.objectContaining({ rating: null, notes: null, duration_sec: null })], 'unit-id', expect.any(Function));
  });
  it('keeps the summary and user-selected exercises after a late preparation reuse response', async () => {
    const old = { ...past(), exercises: [{ ...past().exercises[0], exercise_name: 'Old planned exercise' }] };
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [old], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    let finish!: (value: unknown) => void;
    mockGetTrainingUnits.mockReturnValueOnce({ limit: () => new Promise(resolve => { finish = resolve; }) });
    tap(node, 'trainingDoc.buildOn');
    // Continue through the real footer, choose today's exercise, then reach summary.
    await selectExercise(node); await advanceToSave(node);
    expect(strings(node)).toContain('trainingFlow.nextTitle');
    expect(strings(node)).toContain('Übung');
    await act(async () => { finish({ data: [old], error: null }); }); await flush();
    expect(strings(node)).toContain('trainingFlow.nextTitle');
    expect(strings(node)).not.toContain('trainingFlow.observeTitle');
    expect(strings(node)).not.toContain('Old planned exercise');
    expect(strings(node)).not.toContain('trainingDoc.planned');
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });
  it('permits a fresh reuse after leaving and returning, without reviving the superseded request', async () => {
    const old = { ...past(), exercises: [{ ...past().exercises[0], exercise_name: 'Superseded plan' }] };
    const fresh = { ...past(), exercises: [{ ...past().exercises[0], exercise_name: 'Fresh plan' }] };
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [old], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    let finish!: (value: unknown) => void;
    mockGetTrainingUnits.mockReturnValueOnce({ limit: () => new Promise(resolve => { finish = resolve; }) });
    tap(node, 'trainingDoc.buildOn');
    await act(async () => { await saveButton(node).props.onPress(); }); await flush();
    expect(strings(node)).toContain('trainingFlow.observeTitle');
    const back = node.root.findAll(n => n.props.accessibilityLabel === 'common.back' && typeof n.props.onPress === 'function')[0];
    act(() => { back.props.onPress(); }); await flush();
    expect(strings(node)).toContain('trainingFlow.prepareTitle');
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [fresh], error: null }) });
    tap(node, 'trainingDoc.buildOn'); await flush();
    expect(strings(node)).toContain('trainingFlow.observeTitle');
    expect(strings(node)).toContain('Fresh plan');
    await act(async () => { finish({ data: [old], error: null }); }); await flush();
    expect(strings(node)).toContain('Fresh plan');
    expect(strings(node)).not.toContain('Superseded plan');
    expect(strings(node).filter(value => value === 'trainingDoc.planned')).toHaveLength(1);
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });
  it('does not seed a deleted history source and offers the existing history retry', async () => {
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [], error: null }) });
    tap(node, 'trainingDoc.buildOn'); await flush();
    expect(strings(node)).toContain('trainingDoc.historyError');
    expect(strings(node)).not.toContain('trainingDoc.planned');
    expect(strings(node)).not.toContain('Past observation');
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });
  it('does not reuse a cached source after a failed reload', async () => {
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: null, error: new Error('network') }) });
    tap(node, 'trainingDoc.buildOn'); await flush();
    expect(strings(node)).toContain('trainingDoc.historyError');
    expect(strings(node)).not.toContain('trainingDoc.planned');
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });
  it('deduplicates double taps while revalidating a history selection', async () => {
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    let finish!: (value: unknown) => void;
    mockGetTrainingUnits.mockReturnValue({ limit: () => new Promise(resolve => { finish = resolve; }) });
    const calls = mockGetTrainingUnits.mock.calls.length;
    tap(node, 'trainingDoc.buildOn'); tap(node, 'trainingDoc.buildOn');
    expect(mockGetTrainingUnits).toHaveBeenCalledTimes(calls + 1);
    await act(async () => { finish({ data: [past()], error: null }); }); await flush();
    // Only one planned row; saving remains an explicit separate action.
    expect(strings(node).filter(value => value === 'trainingDoc.planned')).toHaveLength(1);
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });
  it('ignores a history draft that resolves after changing dogs', async () => {
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    let finish!: (value: unknown) => void;
    mockGetTrainingUnits.mockReturnValueOnce({ limit: () => new Promise(resolve => { finish = resolve; }) });
    tap(node, 'trainingDoc.buildOn');
    showContext(node); tap(node, 'Malu'); await flush();
    await act(async () => { finish({ data: [past()], error: null }); }); await flush();
    expect(strings(node)).not.toContain('trainingDoc.planned');
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });
  it('ignores history draft results when navigation loses focus', async () => {
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    let finish!: (value: unknown) => void;
    mockGetTrainingUnits.mockReturnValue({ limit: () => new Promise(resolve => { finish = resolve; }) });
    tap(node, 'trainingDoc.buildOn');
    mockDocumentFocused = false;
    act(() => { node.update(<DocumentScreen />); }); await flush();
    await act(async () => { finish({ data: [past()], error: null }); }); await flush();
    expect(strings(node)).not.toContain('trainingDoc.planned');
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });
  it('discards an in-flight history draft after switching accounts', async () => {
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    let finish!: (value: unknown) => void;
    mockGetTrainingUnits.mockReturnValueOnce({ limit: () => new Promise(resolve => { finish = resolve; }) });
    tap(node, 'trainingDoc.buildOn');
    mockOwner = 'owner-2'; update(node); await flush();
    await act(async () => { finish({ data: [past()], error: null }); }); await flush();
    expect(strings(node)).not.toContain('trainingDoc.planned');
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });
  it('invalidates a reuse on background and permits a new attempt without waiting for the old response', async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      listeners.push(callback); return { remove: jest.fn() };
    });
    try {
      mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
      const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
      let finish!: (value: unknown) => void;
      mockGetTrainingUnits.mockReturnValueOnce({ limit: () => new Promise(resolve => { finish = resolve; }) });
      tap(node, 'trainingDoc.buildOn');
      act(() => { for (const listener of listeners) listener('background'); });
      act(() => { for (const listener of listeners) listener('active'); }); await flush();
      tap(node, 'trainingDoc.buildOn'); await flush();
      expect(strings(node)).toContain('trainingDoc.planned');
      await act(async () => { finish({ data: [past()], error: null }); }); await flush();
      expect(strings(node).filter(value => value === 'trainingDoc.planned')).toHaveLength(1);
      expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
  it('zeigt gespeicherte Übungsnotizen schon in der Vorbereitung', async () => {
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    expect(strings(node)).toContain('Past result');
  });
  it('verknüpft Vorhistorie nur nach Auswahl und behält die neue Beobachtung', async () => {
    const old = past();
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [old], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining'); await selectExercise(node); await flush();
    tap(node, 'trainingDoc.exerciseDetails');
    act(() => { inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.onChangeText('Today only'); });
    const choose = node.root.findAll(n => n.props.testID === 'exercise-history-past-unit-past-ex' && typeof n.props.onPress === 'function')[0];
    expect(choose).toBeDefined();
    act(() => { choose.props.onPress(); }); await flush();
    expect(inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.value).toBe('Today only');
    const card = node.root.findAll(n => n.props.name === 'Übung' && n.props.historical)[0];
    expect(card.props.historical).toMatchObject({ notes: 'Past result', trainingNotes: 'Past observation' });
    mockCreateDocumentedUnit.mockResolvedValue({ error: null, data: { id: 'new' } });
    await submitTraining(node);
    expect(mockAtomicSave.mock.calls[0][3][0]).toEqual(expect.objectContaining({ notes: 'Today only' }));
  });
  it('does not display another dog history even when a stale response contains it', async () => {
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    expect(strings(node)).toContain('Past observation');
    showContext(node); tap(node, 'Malu'); await flush();
    expect(strings(node)).not.toContain('Past observation');
    tap(node, 'trainingFlow.previousTraining');
    expect(strings(node)).toContain('trainingDoc.noHistory');
  });
  it('zeigt allgemeine Notizen älterer Trainings getrennt von Übungsbeobachtungen im ausgeklappten Verlauf', async () => {
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past(), { ...past(), id: 'older-unit', session_date: '2026-10-13', notes: 'Older general note' }], error: null }) });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    expect(strings(node)).not.toContain('Older general note');
    tap(node, 'trainingDoc.selectPast'); await flush();
    expect(strings(node)).toContain('Older general note');
    expect(strings(node)).toContain('trainingDoc.historySessionNote');
    expect(strings(node)).toContain('trainingDoc.historyExerciseNote');
  });
  it('lädt nach Rückkehr und Resume neu, erhält heutige Eingaben und entfernt den Listener beim Verlassen', async () => {
    const remove = jest.fn();
    let handler!: (state: AppStateStatus) => void;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => { handler = callback; return { remove }; });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining'); await selectExercise(node); tap(node, 'trainingDoc.exerciseDetails');
    act(() => { inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.onChangeText('Unsaved today'); });
    const update = () => (node as unknown as { update(element: React.ReactElement): void }).update(<DocumentScreen />);
    const oldCalls = mockGetTrainingUnits.mock.calls.length;
    mockDocumentFocused = false; act(update); await flush();
    expect(remove).toHaveBeenCalled();
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
    expect(mockGetTrainingUnits).toHaveBeenCalledTimes(oldCalls);
    mockDocumentFocused = true; act(update); await flush();
    expect(strings(node)).toContain('Past result');
    const focusedCalls = mockGetTrainingUnits.mock.calls.length;
    act(() => handler('background')); await flush(); expect(mockGetTrainingUnits).toHaveBeenCalledTimes(focusedCalls);
    act(() => handler('active')); await flush(); expect(mockGetTrainingUnits).toHaveBeenCalledTimes(focusedCalls + 1);
    expect(inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.value).toBe('Unsaved today');
    spy.mockRestore();
  });
  it('verwirft eine überholte Resume-Antwort und behält Historie bei einem späteren Ladefehler', async () => {
    let handler!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => { handler = callback; return { remove: jest.fn() }; });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    let oldResolve!: (value: unknown) => void; let newResolve!: (value: unknown) => void;
    mockGetTrainingUnits.mockReturnValueOnce({ limit: () => new Promise(resolve => { oldResolve = resolve; }) })
      .mockReturnValueOnce({ limit: () => new Promise(resolve => { newResolve = resolve; }) });
    act(() => handler('active')); await flush();
    act(() => handler('active')); await flush();
    await act(async () => { newResolve({ data: [{ ...past(), notes: 'Latest history' }], error: null }); }); await flush();
    await act(async () => { oldResolve({ data: [{ ...past(), notes: 'Stale history' }], error: null }); }); await flush();
    expect(strings(node)).toContain('Latest history'); expect(strings(node)).not.toContain('Stale history');
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: null, error: new Error('offline') }) });
    act(() => handler('active')); await flush();
    expect(strings(node)).toContain('Latest history'); expect(strings(node)).toContain('trainingDoc.historyError');
  });
  it('zeigt ältere Sessions und öffnet ihre bestehende Detailroute', async () => {
    const q = mockLegacySessions();
    q.limit.mockResolvedValue({ data: [{ id: 'legacy-id', owner_id: 'owner-1', dog_id: 'dog-1', category: 'Fährte', title: 'Übung',
      session_date: '2026-10-13', created_at: '2026-10-13T08:00:00Z', notes: 'Legacy observation' }], error: null });
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining');
    expect(strings(node)).toContain('Legacy observation');
    const preparation = node.root.findByType(TrainingPreparation);
    act(() => preparation.props.onOpen(preparation.props.units[0]));
    expect(mockPush).toHaveBeenCalledWith('/training/legacy-id');
  });
  it('guards two presses in the same render and preserves draft after a thrown save', async () => {
    const node = render(); await flush(); tap(node, 'trainingFlow.previousTraining'); await selectExercise(node); await flush();
    let rejectSave!: (reason: Error) => void;
    mockCreateDocumentedUnit.mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject; }));
    await advanceToSave(node);
    const press = saveButton(node).props.onPress;
    await act(async () => {
      const first = press(); const second = press();
      rejectSave(new Error('offline')); await Promise.all([first, second]);
    });
    expect(mockCreateDocumentedUnit).toHaveBeenCalledTimes(1);
    expect(saveButton(node).props.disabled).toBe(false);
    act(() => node.unmount()); await flush();
    const reopened = render(); await flush();
    expect(strings(reopened)).toContain('trainingFlow.nextTitle');
    expect(saveButton(reopened).props.disabled).toBe(false);
  });
  it('keeps existing media/transcript, measured times and trainer permission when editing', async () => {
    mockParams = { id: 'edit-unit' };
    mockGetTrainingUnitById.mockResolvedValue({ data: { ...past(), started_at: '2026-10-14T10:00:00Z', ended_at: '2026-10-14T10:02:00Z', duration_sec: 120,
      audio_files: [{ url: 'audio-a', duration: '0:10', transcript: 'Existing transcript' }] }, error: null });
    mockUpdateDocumentedUnit.mockResolvedValue({ error: null });
    const node = render(); await flush();
    await submitTraining(node);
    expect(mockUpdateDocumentedUnit).toHaveBeenCalledWith('edit-unit', expect.objectContaining({ shared_with_trainer: true,
      started_at: '2026-10-14T10:00:00Z', ended_at: '2026-10-14T10:02:00Z',
      audio_files: [{ url: 'audio-a', duration: '0:10', transcript: 'Existing transcript' }],
    }), [expect.objectContaining({ duration_sec: 123, rating: 5, notes: 'Past result' })], expect.any(Function));
  });
});


describe('DocumentScreen — asynchronous identity and edit reconciliation', () => {
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }]; mockDogsLoading = false;
    mockCategories = []; mockParams = { dogId: 'dog-1' };
    mockCreateDocumentedUnit.mockReset(); mockUpdateDocumentedUnit.mockReset(); mockGetTrainingUnitById.mockReset();
  });
  it('rejects a late history response after switching accounts', async () => {
    let resolveOld!: (value: unknown) => void;
    mockGetTrainingUnits.mockReturnValueOnce({ limit: () => new Promise(resolve => { resolveOld = resolve; }) });
    const node = render(); await flush();
    mockOwner = 'owner-2';
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [], error: null }) });
    update(node); await flush();
    await act(async () => { resolveOld({ data: [{ id: 'old', owner_id: 'owner-1', dog_id: 'dog-1', status: 'completed',
      session_date: '2026-10-14', created_at: '2026-10-14', notes: 'PRIVATE OLD OWNER',
      exercises: [{ id: 'row', discipline: 'Fährte', exercise_name: 'Übung' }] }], error: null }); });
    expect(strings(node)).not.toContain('PRIVATE OLD OWNER');
  });
  it('does not overwrite an edit whose server aggregate changed during entry', async () => {
    mockParams = { id: 'existing' };
    const source = { id: 'existing', owner_id: 'owner-1', dog_id: 'dog-1', status: 'completed', session_date: '2026-10-14',
      notes: 'original', photos: [], videos: [], audio_files: [], exercises: [{ id: 'row', discipline: 'Fährte', exercise_name: 'Übung', rating: 3, notes: null }] };
    mockGetTrainingUnitById.mockResolvedValue({ data: source, error: null });
    const node = render(); await flush();
    mockGetTrainingUnitById.mockResolvedValue({ data: { ...source, notes: 'changed on another device' }, error: null });
    await submitTraining(node);
    expect(mockUpdateDocumentedUnit).not.toHaveBeenCalled();
    expect(strings(node)).toContain('trainingDoc.reviewSave');
  });
  it('includes new focus and identity in one atomic request, keeps inputs on failure, and never uploads device-only focus data', async () => {
    mockReplace.mockClear();
    const node = render(); await flush(); await selectExercise(node); await flush();
    await advanceToSave(node);
    const focusInput = inputByPlaceholder(node, 'trainingDoc.sessionNextFocus');
    act(() => { focusInput.props.onChangeText('Keep some distance'); }); await flush();
    mockCreateDocumentedUnit.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await submitTraining(node); await flush();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(inputByPlaceholder(node, 'trainingDoc.sessionNextFocus').props.value).toBe('Keep some distance');
    const options = mockAtomicSave.mock.calls[0][5];
    expect(options.focusChanges).toEqual([expect.objectContaining({ action: 'create', request: expect.objectContaining({ text: 'Keep some distance', disciplineKey: 'system:faehrte' }) })]);
    expect(options.identityChanges).toHaveLength(1);
    mockCreateDocumentedUnit.mockResolvedValueOnce({ data: { id: 'unit-id' }, error: null });
    await submitTraining(node); await flush();
    expect(mockAtomicSave.mock.calls[1][5].focusChanges).toEqual(options.focusChanges);
    expect(await AsyncStorage.getItem('training_focus_device_v1:owner-1')).toBeNull();
  });});

describe('DocumentScreen — final storage guards', () => {
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }]; mockDogsLoading = false; mockCategories = [];
    mockParams = { dogId: 'dog-1' }; mockReplace.mockReset(); mockCreateDocumentedUnit.mockReset();
  });
  it('does not navigate after an account switch during draft removal', async () => {
    const node = render(); await flush(); await selectExercise(node); await flush();
    const remove = AsyncStorage.removeItem as jest.Mock;
    const original = remove.getMockImplementation()!;
    let resolveRemove!: () => void;
    remove.mockImplementationOnce((key: string) => new Promise<void>(resolve => { resolveRemove = () => { void original(key).then(resolve); }; }));
    mockCreateDocumentedUnit.mockResolvedValue({ data: { id: 'unit-id' }, error: null });
    let pending!: Promise<void>;
    await advanceToSave(node);
    await act(async () => { pending = saveButton(node).props.onPress(); for (let i = 0; i < 20; i++) await Promise.resolve(); });
    expect(resolveRemove).toBeDefined();
    mockOwner = 'owner-2'; update(node); await flush();
    await act(async () => { resolveRemove(); await pending; });
    expect(mockReplace).not.toHaveBeenCalled();
    remove.mockImplementation(original);
  });
  it('preserves an unreadable draft instead of overwriting it with an empty form', async () => {
    const key = `training_document_v1:owner-1:new:${encodeURIComponent(JSON.stringify(['dog-1', null]))}`;
    await AsyncStorage.setItem(key, '{broken draft');
    const node = render(); await flush();
    expect(strings(node)).toContain('trainingDoc.draftError');
    expect(await AsyncStorage.getItem(key)).toBe('{broken draft');
    expect(mockCreateDocumentedUnit).not.toHaveBeenCalled();
  });
});


describe('DocumentScreen — atomic restore and exact duration', () => {
  const source = { id: 'existing', owner_id: 'owner-1', dog_id: 'dog-1', status: 'completed', session_date: '2026-10-14',
    notes: 'original', duration_sec: 125, photos: ['old-photo'], videos: [], audio_files: [], score: 4,
    exercises: [{ id: 'row', discipline: 'Fährte', exercise_name: 'Übung', rating: 3, notes: 'old exercise', duration_sec: 37, seq_index: 0 }] };
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }]; mockDogsLoading = false; mockCategories = []; mockParams = { id: 'existing' };
    mockGetTrainingUnitById.mockReset().mockResolvedValue({ data: source, error: null });
    mockReplace.mockReset(); mockUpdateDocumentedUnit.mockReset().mockResolvedValue({ data: { id: 'existing' }, error: null });
  });
  it('preserves125seconds on a note-only edit and uses manual minutes only after explicit change', async () => {
    const node = render(); await flush();
    act(() => { inputByPlaceholder(node, 'training.descriptionPlaceholder').props.onChangeText('new observation'); });
    await submitTraining(node);
    expect(mockAtomicSave.mock.calls[0][2].duration_sec).toBe(125);
    expect(mockAtomicSave.mock.calls[0][3][0].duration_sec).toBe(37);
  });
  it('captures an explicit duration change instead of retaining the old seconds', async () => {
    const node = render(); await flush();
    const button = (node.root as unknown as { findByProps: (p: object) => { props: { onPress: () => void } } }).findByProps({ accessibilityLabel: 'training.durationIncrease' });
    act(() => button.props.onPress());
    await submitTraining(node);
    expect(mockAtomicSave.mock.calls[0][2].duration_sec).toBe(420);
  });
  it('restores a lost-ack edit from its exact durable intent even if the form snapshot is older', async () => {
    let originalRequest: any;
    mockAtomicSave.mockImplementation(async (_owner, id, unit, exercises, _mode, options) => {
      originalRequest = { requestId: options.operationId, unitId: id, expectedToken: 'original-token', unit,
        exercises, focusChanges: options.focusChanges, identityChanges: options.identityChanges };
      await AsyncStorage.setItem('training_atomic_save_v1:owner-1:existing', JSON.stringify({ version: 1, value: { fingerprint: 'original-input', request: originalRequest, completed: false } }));
      return { data: null, error: { message: 'reply lost' } };
    });
    const first = render(); await flush();
    act(() => { inputByPlaceholder(first, 'training.descriptionPlaceholder').props.onChangeText('COMMITTED NEW NOTE'); });
    await act(async () => { await saveButton(first).props.onPress(); }); await flush();
    await act(async () => { first.unmount(); }); mounted.splice(mounted.indexOf(first), 1);
    const key = 'training_document_v1:owner-1:edit:existing';
    const oldDraft = JSON.parse((await AsyncStorage.getItem(key))!);
    expect(oldDraft.value.unitId).toBe('existing');
    oldDraft.value.description = 'OLDER LOCAL SNAPSHOT';
    await AsyncStorage.setItem(key, JSON.stringify(oldDraft));
    mockGetTrainingUnitById.mockResolvedValue({ data: { ...source, notes: 'COMMITTED NEW NOTE' }, error: null });
    const second = render(); await flush();
    expect(inputByPlaceholder(second, 'training.descriptionPlaceholder').props.value).toBe('COMMITTED NEW NOTE');
    expect(saveButton(second).props.disabled).toBe(false);
    mockReplaySave.mockResolvedValue({ data: { version: 1, unitId: 'existing', token: 'saved-token', currentToken: 'saved-token', duplicate: true, exerciseIds: ['row'] }, error: null });
    await act(async () => { await saveButton(second).props.onPress(); });
    expect(mockReplaySave).toHaveBeenCalledWith('owner-1', originalRequest, expect.any(Function));
    expect(mockAtomicSave).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/unit/detail', params: { id: 'existing' } });
  });
  it('preserves exact remote seconds when restoring an older draft without the seconds field', async () => {
    const first = render(); await flush(); await act(async () => first.unmount()); mounted.splice(mounted.indexOf(first), 1);
    const key = 'training_document_v1:owner-1:edit:existing'; const saved = JSON.parse((await AsyncStorage.getItem(key))!);
    delete saved.value.recordedDurationSec; saved.value.durationMin = 2; saved.value.description = 'legacy draft note';
    await AsyncStorage.setItem(key, JSON.stringify(saved));
    const second = render(); await flush(); await act(async () => { await saveButton(second).props.onPress(); });
    expect(mockAtomicSave.mock.calls[0][2].duration_sec).toBe(125);
  });
  it('tapping the already selected dog leaves results and exercise duration intact', async () => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }, { id: 'dog-2', name: 'Other' }];
    const node = render(); await flush(); tap(node, 'Yam');
    await submitTraining(node);
    expect(mockAtomicSave.mock.calls[0][3][0]).toMatchObject({ notes: 'old exercise', duration_sec: 37, rating: 3 });
  });
  it('keeps the real timer seconds instead of replacing97seconds with rounded minutes', async () => {
    mockParams = { dogId: 'dog-1', duration: '97' }; mockCreateDocumentedUnit.mockResolvedValue({ data: {}, error: null });
    const node = render(); await flush(); await selectExercise(node); await flush();
    await submitTraining(node);
    expect(mockAtomicSave.mock.calls[0][2].duration_sec).toBe(97);
  });

});


describe('DocumentScreen — unified saved exercise selection', () => {
  it('continues the latest real identity and preserves the separate old hint, observation and next hint', async () => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }]; mockDogsLoading = false; mockCategories = []; mockParams = { dogId: 'dog-1' };
    mockCreateDocumentedUnit.mockReset().mockResolvedValue({ data: { id: 'unit-id' }, error: null });
    mockListIdentities.mockResolvedValue({ data: ['a', 'b'].map(id => ({ id, owner_id: 'owner-1', discipline_key: 'system:faehrte', display_name: 'Übung', revision: 1, archived_at: null })), error: null });
    const oldUnits = ['a', 'b'].map((identity, i) => ({ id: `past-${identity}`, owner_id: 'owner-1', dog_id: 'dog-1', status: 'completed',
      session_date: `2026-10-${18 + i}`, created_at: `2026-10-${18 + i}T12:00:00Z`, notes: null,
      exercises: [{ id: `ex-${identity}`, discipline: 'Fährte', exercise_name: 'Übung', exercise_identity_id: identity,
        discipline_key: 'system:faehrte', rating: 4, notes: `Old result ${identity}`, seq_index: 0 }] }));
    const before = JSON.stringify(oldUnits);
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: oldUnits, error: null }) });
    mockListFocuses.mockResolvedValue({ data: [{ id: 'old-hint', owner_id: 'owner-1', dog_id: 'dog-1', discipline_key: 'system:faehrte',
      exercise_identity_id: 'a', source_unit_id: 'past-a', source_unit_snapshot_id: 'past-a', source_date_snapshot: '2026-10-18',
      exercise_name_snapshot: 'Übung', text: 'Remember calm start', status: 'open', revision: 1 }], error: null });
    const node = render(); await flush();
    expect(strings(node)).toContain('Remember calm start');
    await selectExercise(node);
    expect(inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.value).toBe('');
    const card = node.root.findAll(n => n.props.name === 'Übung' && n.props.historical)[0];
    expect(card.props.historical.notes).toBe('Old result b');
    act(() => inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.onChangeText('Today improved'));
    await advanceToSave(node);
    act(() => inputByPlaceholder(node, 'trainingFlow.hintPlaceholder').props.onChangeText('Next calm finish'));
    await submitTraining(node);
    expect(mockAtomicSave.mock.calls[0][3]).toEqual([expect.objectContaining({ exercise_identity_id: 'b', notes: 'Today improved', rating: null })]);
    expect(mockAtomicSave.mock.calls[0][5].identityChanges).toEqual([]);
    expect(mockAtomicSave.mock.calls[0][5].focusChanges[0].request.text).toBe('Next calm finish');
    expect(mockCompleteFocus).not.toHaveBeenCalled();
    expect(JSON.stringify(oldUnits)).toBe(before);
  });
  it('keeps one exercise and its observation after double press and choosing the same group again', async () => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }]; mockDogsLoading = false; mockCategories = []; mockParams = { dogId: 'dog-1' };
    mockCreateDocumentedUnit.mockReset().mockResolvedValue({ data: { id: 'unit-id' }, error: null });
    mockListIdentities.mockResolvedValue({ data: ['a', 'b'].map(id => ({ id, owner_id: 'owner-1', discipline_key: 'system:faehrte', display_name: 'Übung', revision: 1, archived_at: null })), error: null });
    const node = render(); await flush(); await openExercisePicker(node);
    const choose = node.root.findAll(n => n.props.testID === 'exercise-group-übung' && typeof n.props.onPress === 'function')[0].props.onPress;
    act(() => { choose(); choose(); }); await flush();
    act(() => inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.onChangeText('Keep my observation'));
    await selectExercise(node);
    expect(inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.value).toBe('Keep my observation');
    await submitTraining(node);
    expect(mockAtomicSave.mock.calls[0][3]).toEqual([expect.objectContaining({ exercise_identity_id: 'a', notes: 'Keep my observation' })]);
  });
  it('uses the selected existing identity in an atomic save without inserting another identity', async () => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }]; mockDogsLoading = false; mockCategories = []; mockParams = { dogId: 'dog-1' };
    mockCreateDocumentedUnit.mockReset().mockResolvedValue({ data: { id: 'unit-id' }, error: null });
    mockListIdentities.mockResolvedValue({ data: ['a', 'b'].map(id => ({ id, owner_id: 'owner-1', discipline_key: 'system:faehrte', display_name: 'Übung', revision: 1, archived_at: null })), error: null });
    const node = render(); await flush();
    await openExercisePicker(node);
    expect(strings(node).filter(text => text === 'Übung')).toHaveLength(1);
    await selectExercise(node);
    expect(node.root.findAll(child => String(child.props.testID).startsWith('exercise-variant-'))).toHaveLength(0);
    expect(strings(node)).toContain('trainingFlow.trainedToday');
    await submitTraining(node); await flush();
    expect(mockAtomicSave).toHaveBeenCalledTimes(1);
    expect(mockAtomicSave.mock.calls[0][3]).toEqual([expect.objectContaining({ exercise_identity_id: 'a', exercise_name: 'Übung' })]);
    expect(mockAtomicSave.mock.calls[0][5].identityChanges).toEqual([]);
  });
});


describe('DocumentScreen — approved three-step training flow', () => {
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }, { id: 'dog-2', name: 'Malu' }];
    mockDogsLoading = false; mockCategories = []; mockParams = { dogId: 'dog-1' };
    mockCreateDocumentedUnit.mockReset(); mockReplace.mockReset();
  });
  const hint = (text = 'Start with a calm pause') => ({ id: 'hint-1', owner_id: 'owner-1', dog_id: 'dog-1',
    discipline_key: 'system:faehrte', exercise_identity_id: 'identity-a', source_unit_id: 'past',
    source_unit_snapshot_id: 'past', source_date_snapshot: '2026-10-19', exercise_name_snapshot: 'Übung',
    source_text_snapshot: text, text, status: 'open', revision: 1 });

  it('shows the previous hint first, stores today separately, and shows the saved hint on next entry', async () => {
    mockListFocuses.mockResolvedValue({ data: [hint()], error: null });
    const node = render(); await flush();
    expect(strings(node)).toContain('trainingFlow.prepareTitle');
    expect(strings(node)).toContain('Start with a calm pause');
    expect(node.root.findAll(n => n.props.multiline !== undefined || n.props.placeholder !== undefined).filter(n => typeof n.props.onChangeText === 'function')).toHaveLength(0);
    expect(strings(node)).not.toContain('training.exercisesFor');
    await selectExercise(node);
    const observation = inputByPlaceholder(node, 'training.exerciseNotePlaceholder');
    expect(observation.props.value).toBe('');
    act(() => observation.props.onChangeText('More confident today'));
    expect(strings(node)).not.toContain('trainingDoc.exerciseNextFocus');
    await advanceToSave(node);
    expect(strings(node)).toContain('More confident today');
    act(() => inputByPlaceholder(node, 'trainingFlow.hintPlaceholder').props.onChangeText('Practise the second hide calmly'));
    mockCreateDocumentedUnit.mockResolvedValue({ data: { id: 'unit-id' }, error: null });
    await submitTraining(node); await flush();
    expect(mockAtomicSave).toHaveBeenCalledTimes(1);
    expect(mockAtomicSave.mock.calls[0][3][0].notes).toBe('More confident today');
    expect(mockAtomicSave.mock.calls[0][5].focusChanges[0].request).toMatchObject({ text: 'Practise the second hide calmly', sourceExerciseId: mockAtomicSave.mock.calls[0][3][0].id });
    expect(mockCompleteFocus).not.toHaveBeenCalled();
    expect(strings(node)).toContain('trainingFlow.saved');
    expect(strings(node)).toContain('Practise the second hide calmly');
    mockListFocuses.mockResolvedValue({ data: [hint('Practise the second hide calmly')], error: null });
    act(() => node.unmount());
    const next = render(); await flush();
    expect(strings(next)).toContain('trainingFlow.prepareTitle');
    expect(strings(next)).toContain('Practise the second hide calmly');
    await selectExercise(next);
    expect(inputByPlaceholder(next, 'training.exerciseNotePlaceholder').props.value).toBe('');
  });

  it('keeps step, observation and future hint after restart and a failed save', async () => {
    const node = render(); await flush(); await selectExercise(node);
    act(() => inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.onChangeText('Today only'));
    await advanceToSave(node);
    act(() => inputByPlaceholder(node, 'trainingFlow.hintPlaceholder').props.onChangeText('Remember next time'));
    mockCreateDocumentedUnit.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await submitTraining(node); await flush();
    expect(strings(node)).not.toContain('trainingFlow.saved');
    act(() => node.unmount());
    const restored = render(); await flush();
    expect(strings(restored)).toContain('trainingFlow.nextTitle');
    expect(strings(restored)).toContain('Today only');
    expect(inputByPlaceholder(restored, 'trainingFlow.hintPlaceholder').props.value).toBe('Remember next time');
    act(() => restored.root.findAll(n => n.props.accessibilityLabel === 'common.back' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(inputByPlaceholder(restored, 'training.exerciseNotePlaceholder').props.value).toBe('Today only');
  });

  it('persists isolated drafts and request identities for each dog across switching and restart', async () => {
    const node = render(); await flush(); await selectExercise(node);
    act(() => inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.onChangeText('Belongs to Yam'));
    showContext(node); tap(node, 'Malu'); await flush();
    expect(strings(node)).toContain('trainingFlow.prepareTitle');
    expect(strings(node).join(' ')).not.toContain('Belongs to Yam');
    await selectExercise(node);
    act(() => inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.onChangeText('Belongs to Malu'));
    await flush(); act(() => node.unmount());
    const restored = render(); await flush();
    expect(inputByPlaceholder(restored, 'training.exerciseNotePlaceholder').props.value).toBe('Belongs to Malu');
    showContext(restored); tap(restored, 'Yam'); await flush();
    expect(inputByPlaceholder(restored, 'training.exerciseNotePlaceholder').props.value).toBe('Belongs to Yam');
    await advanceToSave(restored);
    mockCreateDocumentedUnit.mockResolvedValue({ data: { id: 'unit-id' }, error: null });
    await submitTraining(restored);
    expect(mockAtomicSave.mock.calls[0][2].dog_id).toBe('dog-1');
    const yamUnitId = mockAtomicSave.mock.calls[0][1];
    act(() => restored.unmount());
    const remaining = render(); await flush();
    showContext(remaining); tap(remaining, 'Malu'); await flush();
    expect(inputByPlaceholder(remaining, 'training.exerciseNotePlaceholder').props.value).toBe('Belongs to Malu');
    await advanceToSave(remaining); await submitTraining(remaining);
    expect(mockAtomicSave.mock.calls[1][2].dog_id).toBe('dog-2');
    expect(mockAtomicSave.mock.calls[1][1]).not.toBe(yamUnitId);
  });

  it('shows load errors and completes a reminder only after an explicit action', async () => {
    mockListFocuses.mockResolvedValueOnce({ data: [], error: { message: 'offline' } }).mockResolvedValue({ data: [hint()], error: null });
    const node = render(); await flush();
    expect(strings(node)).toContain('trainingDoc.focusError');
    tap(node, 'trainingDoc.focusError'); await flush();
    expect(strings(node)).toContain('Start with a calm pause');
    expect(node.root.findAll(n => n.props.multiline !== undefined || n.props.placeholder !== undefined).filter(n => typeof n.props.onChangeText === 'function')).toHaveLength(0);
    expect(mockCompleteFocus).not.toHaveBeenCalled();
    tap(node, 'trainingDoc.focusDone'); await flush();
    expect(mockCompleteFocus.mock.calls[0][1]).toMatchObject({ id: 'hint-1', status: 'done', expectedRevision: 1 });
  });
  it('uses Android system back for the previous step without losing observations', async () => {
    let handler: (() => boolean | null | undefined) | undefined;
    const remove = jest.fn();
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, callback) => { handler = callback; return { remove }; });
    const node = render(); await flush(); await selectExercise(node);
    act(() => inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.onChangeText('Keep this observation'));
    await advanceToSave(node);
    expect(handler).toBeDefined();
    act(() => { expect(handler!()).toBe(true); });
    expect(strings(node)).toContain('trainingFlow.observeTitle');
    expect(inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.value).toBe('Keep this observation');
    expect(remove).toHaveBeenCalled();
    spy.mockRestore();
  });

});


it('preserves entry duration and note when choosing the first dog from an unassigned form', async () => {
  mockDogs = [{ id: 'dog-1', name: 'Yam' }, { id: 'dog-2', name: 'Malu' }]; mockDogsLoading = false; mockCategories = [];
  mockParams = { duration: '97', note: 'Timer entry note' };
  mockCreateDocumentedUnit.mockReset().mockResolvedValue({ data: { id: 'unit-id' }, error: null });
  const node = render(); await flush(); tap(node, 'Malu'); await flush(); await selectExercise(node);
  await submitTraining(node);
  expect(mockAtomicSave.mock.calls[0][2]).toEqual(expect.objectContaining({ dog_id: 'dog-2', duration_sec: 97, notes: 'Timer entry note' }));
});

it('guards consecutive context presses from one render without dropping another dog draft', async () => {
  mockDogs = [{ id: 'dog-1', name: 'Yam' }, { id: 'dog-2', name: 'Malu' }, { id: 'dog-3', name: 'Quiron' }];
  mockDogsLoading = false; mockCategories = []; mockParams = { dogId: 'dog-1' };
  const node = render(); await flush(); await selectExercise(node);
  act(() => inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.onChangeText('Yam draft'));
  showContext(node); tap(node, 'Malu'); await flush(); await selectExercise(node);
  act(() => inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.onChangeText('Malu draft'));
  showContext(node); tap(node, 'Yam'); await flush(); showContext(node);
  const malu = pressableWithText(node, 'Malu'); const quiron = pressableWithText(node, 'Quiron');
  act(() => { malu.props.onPress(); quiron.props.onPress(); }); await flush();
  expect(inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.value).toBe('Malu draft');
  showContext(node); tap(node, 'Yam'); await flush();
  expect(inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.value).toBe('Yam draft');
  showContext(node); tap(node, 'Malu'); await flush();
  expect(inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.value).toBe('Malu draft');
});

describe('explicit independent templates', () => {
  const source = () => ({ id: 'past', owner_id: 'owner-1', dog_id: 'dog-1', status: 'completed', session_date: '2026-10-14', score: 10, notes: 'Private old result', duration_sec: 90, started_at: 'old-start', ended_at: 'old-end', photos: ['old-photo'], videos: ['old-video'], exercises: [{ id: 'past-row', exercise_identity_id: 'stable', discipline: 'Fährte', exercise_name: 'Übung', rating: 5, notes: 'old exercise result', duration_sec: 33, seq_index: 0 }] });
  const params = () => ({ template: 'past', draftToken: 'entry-a', dogId: 'dog-1', discipline: 'faehrte', templateChoice: JSON.stringify({ owner: 'owner-1', dog: 'dog-1', discipline: 'Fährte', disciplineKey: 'system:faehrte', exercises: ['id:past-row'], focuses: [] }) });
  const snapshots = async () => {
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith('training_document_v1:'));
    return Promise.all(keys.map(async key => ({ key, value: JSON.parse((await AsyncStorage.getItem(key))!).value })));
  };
  beforeEach(() => { mockDogs = [{ id: 'dog-1', name: 'Yam' }]; mockDogsLoading = false; mockCategories = []; mockParams = params(); mockGetTrainingUnitById.mockReset().mockResolvedValue({ data: source(), error: null }); });
  it('persists a new blank plan without copying facts, timing or media', async () => {
    const node = render(); await flush();
    const draft = (await snapshots())[0].value;
    expect(draft.unitId).not.toBe('past'); expect(draft.operationId).toBeDefined();
    expect(draft).toMatchObject({ description: '', score: 0, durationMin: null, recordedDurationSec: null, photos: [], videos: [], audio: [] });
    expect(draft.selected).toEqual([expect.objectContaining({ rating: null, notes: null, performed: false, sourceUnitId: 'past' })]);
    expect(draft.templateContext).toMatchObject({ sourceId: 'past', hints: [] });
    expect(strings(node)).not.toContain('Private old result'); expect(mockAtomicSave).not.toHaveBeenCalled();
  });
  it('saves today through the existing create contract, without rewriting the source or duplicating focus records', async () => {
    mockParams.templateChoice = JSON.stringify({ ...JSON.parse(mockParams.templateChoice), focuses: ['server:h'] });
    mockListFocuses.mockResolvedValue({ data: [{ id: 'h', owner_id: 'owner-1', dog_id: 'dog-1', discipline_key: 'system:faehrte', text: 'Next hint', status: 'open', source_date_snapshot: '2026-10-14', source_unit_snapshot_id: 'past', revision: 1 }], error: null });
    mockCreateDocumentedUnit.mockResolvedValue({ error: null, data: { id: 'new' } });
    const node = render(); await flush();
    expect((await snapshots())[0].value.templateContext.hints[0].text).toBe('Next hint');
    await act(async () => { await saveButton(node).props.onPress(); }); await flush();
    tap(node, 'trainingDoc.planned'); await flush();
    await submitTraining(node); await flush();
    expect(mockAtomicSave).toHaveBeenCalledTimes(1);
    const [owner, id, today, rows, mode, options] = mockAtomicSave.mock.calls[0];
    expect(owner).toBe('owner-1'); expect(id).not.toBe('past'); expect(mode).toBe('create');
    expect(today).toMatchObject({ notes: null, duration_sec: null, photos: [], videos: [] });
    expect(today.started_at).not.toBe('old-start'); expect(rows[0]).toMatchObject({ notes: null, rating: null, duration_sec: null });
    expect(options.focusChanges ?? []).toEqual([]); expect(mockUpdateDocumentedUnit).not.toHaveBeenCalled();
  });
  it('restores the same draft without refetching or replacing user changes', async () => {
    const first = render(); await flush(); const [saved] = await snapshots();
    const changed = { ...saved.value, description: 'New observation', workflowStep: 1 };
    await AsyncStorage.setItem(saved.key, JSON.stringify({ version: 1, value: changed }));
    act(() => first.unmount()); mockGetTrainingUnitById.mockClear();
    render(); await flush();
    expect(mockGetTrainingUnitById).not.toHaveBeenCalled(); expect((await snapshots())[0].value.description).toBe('New observation');
  });
  it('keeps ordinary drafts and a second template entry independent', async () => {
    await AsyncStorage.setItem('training_document_v1:owner-1:new', JSON.stringify({ version: 1, value: { untouched: true } }));
    const first = render(); await flush(); const a = (await snapshots()).find(d => d.value.unitId)!;
    act(() => first.unmount()); mockParams = { ...params(), template: 'past-b', draftToken: 'entry-b' }; mockGetTrainingUnitById.mockResolvedValue({ data: { ...source(), id: 'past-b' }, error: null });
    render(); await flush(); const all = await snapshots();
    expect(all).toHaveLength(3); expect(all.find(d => d.key.endsWith(':new'))!.value).toEqual({ untouched: true });
    expect(all.filter(d => d.value.unitId).map(d => d.value.unitId)).toContain(a.value.unitId);
    expect(new Set(all.filter(d => d.value.unitId).map(d => d.value.unitId)).size).toBe(2);
  });
  it.each(['owner', 'dog', 'offline', 'malformed'])('blocks %s without persisting a partial template', async reason => {
    if (reason === 'owner') mockGetTrainingUnitById.mockResolvedValue({ data: { ...source(), owner_id: 'foreign' }, error: null });
    if (reason === 'dog') mockGetTrainingUnitById.mockResolvedValue({ data: { ...source(), dog_id: 'other' }, error: null });
    if (reason === 'offline') mockGetTrainingUnitById.mockResolvedValue({ data: null, error: { message: 'offline' } });
    if (reason === 'malformed') mockParams.templateChoice = '{broken';
    const node = render(); await flush(); expect(strings(node)).toContain('trainingDoc.draftError');
    expect(await snapshots()).toEqual([]); expect(mockAtomicSave).not.toHaveBeenCalled();
  });
});
