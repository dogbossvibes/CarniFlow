import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity } from 'react-native';
import DocumentScreen from '@/app/unit/document';

const mockCreateDocumentedUnit = jest.fn();
const mockAtomicSave = jest.fn();
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

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: () => mockUuidCounter++ === 0 ? 'unit-id' : `uuid-${mockUuidCounter}` }));
jest.mock('expo-router', () => ({
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
  listExerciseIdentities: async () => ({ data: [], error: null }),
  listServerTrainingFocuses: async () => ({ data: [], error: null }),
}));
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

function selectExercise(node: ReactTestRenderer) {
  tap(node, 'Übung');
}

function inputByPlaceholder(node: ReactTestRenderer, placeholder: string) {
  return (node.root as unknown as {
    findAllByType: (type: unknown) => { props: { placeholder?: string; value?: string; onChangeText: (v: string) => void } }[];
  }).findAllByType(TextInput).find((i) => i.props.placeholder === placeholder)!;
}

// Default: keine Vorschläge, ausser ein Test setzt bewusst etwas anderes.
beforeEach(async () => {
  mockOwner = 'owner-1'; mockUuidCounter = 0; mockAtomicSave.mockReset(); mockReplaySave.mockReset();
  await AsyncStorage.clear();
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
    selectExercise(node);

    mockCreateDocumentedUnit.mockResolvedValue({ error: null, data: { id: 'unit-1' } });
    await act(async () => { await saveButton(node).props.onPress(); });

    expect(strings(node)).toContain('Yam');
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
    await flush();
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

    tap(node, 'trainingDoc.exerciseDetails');
    const note = inputByPlaceholder(node, 'training.exerciseNotePlaceholder');
    act(() => { note.props.onChangeText('War heute unruhig'); });

    mockCreateDocumentedUnit.mockResolvedValue({ error: null, data: { id: 'unit-1' } });
    await act(async () => { await saveButton(node).props.onPress(); });

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

  it('4. Whitespace am Anfang/Ende wird vor der Übernahme entfernt', async () => {
    const node = render();
    await flush();
    tap(node, 'training.addCustomExercise');

    act(() => { inputByPlaceholder(node, 'training.customExercisePlaceholder').props.onChangeText('   Slalom   '); });
    act(() => { pressableWithText(node, 'common.save').props.onPress(); });

    expect(strings(node)).toContain('Slalom');
    expect(strings(node)).not.toContain('   Slalom   ');
  });

  it('11. doppeltes Auslösen von „Hinzufügen" erzeugt keine doppelte Übung', async () => {
    const node = render();
    await flush();
    tap(node, 'training.addCustomExercise');
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
    tap(node, 'training.addCustomExercise');
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
    selectExercise(node);   // vorhandene Preset-Übung „Übung" (siehe DISCIPLINES-Mock)

    tap(node, 'training.addCustomExercise');
    act(() => { inputByPlaceholder(node, 'training.customExercisePlaceholder').props.onChangeText('Cavaletti / Balance'); });
    act(() => { pressableWithText(node, 'common.save').props.onPress(); });

    expect(strings(node)).toContain('Übung');
    expect(strings(node)).toContain('Cavaletti / Balance');

    mockCreateDocumentedUnit.mockResolvedValue({ error: null, data: { id: 'unit-1' } });
    await act(async () => { await saveButton(node).props.onPress(); });

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

    expect(mockGetRecentExerciseNames).toHaveBeenCalledWith('owner-1', 'Fährte', 20, 'dog-1');
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
    await act(async () => { await saveButton(node).props.onPress(); });

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
    await act(async () => { await saveButton(node).props.onPress(); });

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
    const node = render(); await flush();
    tap(node, 'trainingDoc.buildOn'); await flush();
    expect(saveButton(node).props.disabled).toBe(true);
    expect(strings(node)).toContain('trainingDoc.planned');
    tap(node, 'trainingDoc.planned'); await flush();
    mockCreateDocumentedUnit.mockResolvedValue({ error: null, data: { id: 'new' } });
    await act(async () => { await saveButton(node).props.onPress(); });
    expect(mockCreateDocumentedUnit).toHaveBeenCalledWith('owner-1', expect.objectContaining({ duration_sec: null, photos: [], videos: [], shared_with_trainer: false }),
      [expect.objectContaining({ rating: null, notes: null, duration_sec: null })], 'unit-id', expect.any(Function));
  });
  it('does not display another dog history even when a stale response contains it', async () => {
    mockGetTrainingUnits.mockReturnValue({ limit: () => Promise.resolve({ data: [past()], error: null }) });
    const node = render(); await flush();
    expect(strings(node)).toContain('Past observation');
    tap(node, 'Malu'); await flush();
    expect(strings(node)).not.toContain('Past observation');
    expect(strings(node)).toContain('trainingDoc.noHistory');
  });
  it('guards two presses in the same render and preserves draft after a thrown save', async () => {
    const node = render(); await flush(); selectExercise(node); await flush();
    let rejectSave!: (reason: Error) => void;
    mockCreateDocumentedUnit.mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject; }));
    const press = saveButton(node).props.onPress;
    await act(async () => {
      const first = press(); const second = press();
      rejectSave(new Error('offline')); await Promise.all([first, second]);
    });
    expect(mockCreateDocumentedUnit).toHaveBeenCalledTimes(1);
    expect(saveButton(node).props.disabled).toBe(false);
    act(() => node.unmount()); await flush();
    const reopened = render(); await flush();
    expect(strings(reopened)).toContain('training.selectedCount');
    expect(saveButton(reopened).props.disabled).toBe(false);
  });
  it('keeps existing media/transcript, measured times and trainer permission when editing', async () => {
    mockParams = { id: 'edit-unit' };
    mockGetTrainingUnitById.mockResolvedValue({ data: { ...past(), started_at: '2026-10-14T10:00:00Z', ended_at: '2026-10-14T10:02:00Z', duration_sec: 120,
      audio_files: [{ url: 'audio-a', duration: '0:10', transcript: 'Existing transcript' }] }, error: null });
    mockUpdateDocumentedUnit.mockResolvedValue({ error: null });
    const node = render(); await flush();
    await act(async () => { await saveButton(node).props.onPress(); });
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
    await act(async () => { await saveButton(node).props.onPress(); });
    expect(mockUpdateDocumentedUnit).not.toHaveBeenCalled();
    expect(strings(node)).toContain('trainingDoc.reviewSave');
  });
  it('includes new focus and identity in one atomic request, keeps inputs on failure, and never uploads device-only focus data', async () => {
    mockReplace.mockClear();
    const node = render(); await flush(); selectExercise(node); await flush();
    const focusInput = inputByPlaceholder(node, 'trainingDoc.nextFocus');
    act(() => { focusInput.props.onChangeText('Keep some distance'); }); await flush();
    mockCreateDocumentedUnit.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await act(async () => { await saveButton(node).props.onPress(); }); await flush();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(inputByPlaceholder(node, 'trainingDoc.nextFocus').props.value).toBe('Keep some distance');
    const options = mockAtomicSave.mock.calls[0][5];
    expect(options.focusChanges).toEqual([expect.objectContaining({ action: 'create', request: expect.objectContaining({ text: 'Keep some distance', disciplineKey: 'system:faehrte' }) })]);
    expect(options.identityChanges).toHaveLength(1);
    mockCreateDocumentedUnit.mockResolvedValueOnce({ data: { id: 'unit-id' }, error: null });
    await act(async () => { await saveButton(node).props.onPress(); }); await flush();
    expect(mockAtomicSave.mock.calls[1][5].focusChanges).toEqual(options.focusChanges);
    expect(await AsyncStorage.getItem('training_focus_device_v1:owner-1')).toBeNull();
  });});

describe('DocumentScreen — final storage guards', () => {
  beforeEach(() => {
    mockDogs = [{ id: 'dog-1', name: 'Yam' }]; mockDogsLoading = false; mockCategories = [];
    mockParams = { dogId: 'dog-1' }; mockReplace.mockReset(); mockCreateDocumentedUnit.mockReset();
  });
  it('does not navigate after an account switch during draft removal', async () => {
    const node = render(); await flush(); selectExercise(node); await flush();
    const remove = AsyncStorage.removeItem as jest.Mock;
    const original = remove.getMockImplementation()!;
    let resolveRemove!: () => void;
    remove.mockImplementationOnce((key: string) => new Promise<void>(resolve => { resolveRemove = () => { void original(key).then(resolve); }; }));
    mockCreateDocumentedUnit.mockResolvedValue({ data: { id: 'unit-id' }, error: null });
    let pending!: Promise<void>;
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
    await act(async () => { await saveButton(node).props.onPress(); });
    expect(mockAtomicSave.mock.calls[0][2].duration_sec).toBe(125);
    expect(mockAtomicSave.mock.calls[0][3][0].duration_sec).toBe(37);
  });
  it('captures an explicit duration change instead of retaining the old seconds', async () => {
    const node = render(); await flush();
    const button = (node.root as unknown as { findByProps: (p: object) => { props: { onPress: () => void } } }).findByProps({ accessibilityLabel: 'training.durationIncrease' });
    act(() => button.props.onPress());
    await act(async () => { await saveButton(node).props.onPress(); });
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
    await act(async () => { await saveButton(node).props.onPress(); });
    expect(mockAtomicSave.mock.calls[0][3][0]).toMatchObject({ notes: 'old exercise', duration_sec: 37, rating: 3 });
  });
  it('keeps the real timer seconds instead of replacing97seconds with rounded minutes', async () => {
    mockParams = { dogId: 'dog-1', duration: '97' }; mockCreateDocumentedUnit.mockResolvedValue({ data: {}, error: null });
    const node = render(); await flush(); selectExercise(node); await flush();
    await act(async () => { await saveButton(node).props.onPress(); });
    expect(mockAtomicSave.mock.calls[0][2].duration_sec).toBe(97);
  });

});


describe('training document keyboard reachability', () => {
  const originalOS = Platform.OS;
  afterEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }); });
  it.each(['ios', 'android'] as const)('keeps scroll content and bottom action in the same keyboard-adjusted viewport on %s', async os => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    mockParams = {}; mockDogs = [{ id: 'dog-1', name: 'Luna' }]; mockDogsLoading = false;
    const node = render(); await flush();
    const keyboard = node.root.findByType(KeyboardAvoidingView);
    expect(keyboard.props.behavior).toBe(os === 'ios' ? 'padding' : 'height');
    // Both navigators hide their headers; no extra external-header offset belongs here.
    expect(keyboard.props.keyboardVerticalOffset ?? 0).toBe(0);
    expect(keyboard.findAll(n => n.props.testID === 'document-save').length).toBeGreaterThan(0);
    const scroll = keyboard.findByType(ScrollView);
    expect(scroll.props.keyboardDismissMode).toBe('on-drag');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  });
});
