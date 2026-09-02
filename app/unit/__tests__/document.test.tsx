import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import DocumentScreen from '@/app/unit/document';

const mockCreateDocumentedUnit = jest.fn();
const mockUpdateDocumentedUnit = jest.fn();
const mockGetTrainingUnitById = jest.fn();
const mockGetRecentExerciseNames = jest.fn();
const mockUpdateCustomCategory = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockDogs: { id: string; name: string }[] = [];
let mockDogsLoading = false;
let mockCategories: { id: string; name: string; icon: string; color: string; exercises: string[]; key: string; label: string; accent: string; custom: boolean }[] = [];
let mockParams: Record<string, string> = {};

jest.mock('expo-crypto', () => ({ randomUUID: () => 'unit-id' }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args) }),
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
jest.mock('@/hooks/useCustomCategories', () => ({ useCustomCategories: () => ({ categories: mockCategories }) }));
jest.mock('@/constants/disciplines', () => ({
  DISCIPLINES: [{ key: 'faehrte', label: 'Fährte', accent: '#00FFCC', icon: 'paw', exercises: ['Übung'], custom: false }],
  customToDiscipline: (category: unknown) => category,
  disciplineColor: () => '#00FFCC',
}));
jest.mock('@/constants/sparten', () => ({ DEFAULT_SPARTEN: ['Fährte'] }));
jest.mock('@/services/trainingUnitService', () => ({
  createDocumentedUnit: (...args: unknown[]) => mockCreateDocumentedUnit(...args),
  updateDocumentedUnit: (...args: unknown[]) => mockUpdateDocumentedUnit(...args),
  getTrainingUnitById: (...args: unknown[]) => mockGetTrainingUnitById(...args),
  getRecentExerciseNames: (...args: unknown[]) => mockGetRecentExerciseNames(...args),
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

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DocumentScreen />); });
  return node;
}

// Lässt den Vorschläge-aus-Historie-Effekt (getRecentExerciseNames, async)
// vor dem Testende abschliessen — sonst landet das setState nach der
// act()-Grenze (React-Warnung / potenzieller Zugriff nach Teardown).
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
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

function selectExercise(node: ReactTestRenderer) {
  tap(node, 'Übung');
}

function inputByPlaceholder(node: ReactTestRenderer, placeholder: string) {
  return (node.root as unknown as {
    findAllByType: (type: unknown) => { props: { placeholder?: string; value?: string; onChangeText: (v: string) => void } }[];
  }).findAllByType(TextInput).find((i) => i.props.placeholder === placeholder)!;
}

// Default: keine Vorschläge, ausser ein Test setzt bewusst etwas anderes.
beforeEach(() => {
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

  it('keeps multiple dogs selectable instead of auto-selecting one', async () => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }, { id: 'dog-2', name: 'Malu' }];
    const node = render();
    await flush();
    selectExercise(node);

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
    selectExercise(node);
    await flush();

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
    await act(async () => { await saveButton(node).props.onPress(); });

    expect(mockCreateDocumentedUnit).toHaveBeenCalledWith(
      'owner-1',
      expect.anything(),
      [expect.objectContaining({ exercise_name: 'Übung', rating: 3, notes: 'War heute unruhig', seq_index: 0 })],
      'unit-id',
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

    tap(node, 'training.addCustomExercise');
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
    tap(node, 'Trickdogging');

    tap(node, 'training.addCustomExercise');
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
    tap(node, 'Trickdogging');
    tap(node, 'training.addCustomExercise');

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

    expect(mockGetRecentExerciseNames).toHaveBeenCalledWith('owner-1', 'Fährte');
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

    tap(node, 'Trickdogging');
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
        dog_id: 'dog-1', notes: 'Altes Training', score: 7, session_date: '2026-05-01',
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
    expect(inputByPlaceholder(node, 'training.exerciseNotePlaceholder').props.value).toBe('Gut gelaufen');
    expect(inputByPlaceholder(node, 'training.descriptionPlaceholder').props.value).toBe('Altes Training');

    mockUpdateDocumentedUnit.mockResolvedValue({ error: null });
    await act(async () => { await saveButton(node).props.onPress(); });

    expect(mockUpdateDocumentedUnit).toHaveBeenCalledWith(
      'unit-1',
      expect.anything(),
      [expect.objectContaining({ exercise_name: 'Übung', rating: 4, notes: 'Gut gelaufen' })],
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
    expect(strings(node)).toContain('45');

    const findBtn = (label: string) => (node.root as unknown as {
      findByProps: (p: { accessibilityLabel: string }) => { props: { onPress: () => void } };
    }).findByProps({ accessibilityLabel: label });

    act(() => { findBtn('training.durationDecrease').props.onPress(); });
    expect(strings(node)).toContain('40');

    act(() => { findBtn('training.durationIncrease').props.onPress(); });
    act(() => { findBtn('training.durationIncrease').props.onPress(); });
    expect(strings(node)).toContain('50');
  });
});
