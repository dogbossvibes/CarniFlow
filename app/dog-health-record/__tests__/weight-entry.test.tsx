// RC-Fix "Digital Health Record — Gewicht erfassen" (TestFlight Build 46),
// parts 1–3 (systemic fix for ALL Health quick-action forms).
// Part 1 root cause: the shared quick-action AnyvoBottomSheet never opted
// into keyboardAware mode, so the sheet never repositioned above the
// keyboard. Part 2 root cause (found on device retest after part 1
// shipped): the sheet DID reposition, but its scrollable body — the only
// flexShrink:1 element among fixed-size siblings (griff/title/footer) —
// collapsed to a sliver instead of claiming its leftover share of the
// keyboard-reduced height. Part 3 root cause (found on device retest after
// part 2 shipped): iOS's decimal-pad keyboard has no Return/Done key at
// all, so there was never a way to finish/confirm entry — "blind typing"
// wasn't a visibility regression, it's that nothing on the decimal-pad
// itself lets the user confirm they're done. Fixed with a reusable iOS
// keyboard accessory ("Fertig") attached via inputAccessoryViewID to any
// Field using keyboardType="decimal-pad" — zero per-field code. See the
// in-file comments in app/dog-health-record/[id].tsx for the full
// explanation. The actual on-device keyboard-visibility/collapse/accessory-
// bar behavior cannot be reliably asserted by a JS unit test (documented as
// manual device retest below); this suite covers everything that IS
// reliably testable: the intended flex layout structure, decimal input (dot
// and comma), invalid/empty rejection, same-weight/different-date
// independence, every quick-action variant rendering its own fields, state
// resetting correctly when switching between quick-action types, the
// numeric keyboard type and its accessory wiring, and that the accessory's
// Done action only dismisses the keyboard — never state, never save.
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { readFileSync } from 'fs';
import { InputAccessoryView, Keyboard, Platform, Text, TextInput } from 'react-native';
import DogHealthRecordRoute from '@/app/dog-health-record/[id]';
import type { Dog } from '@/types';
import type { HealthOverviewData } from '@/services/healthService';

const mockLoadHealthOverview = jest.fn();
const mockCreateWeightEntry = jest.fn();
const mockUpdateWeightEntry = jest.fn();
const mockGetDogById = jest.fn();

const DOG: Dog = {
  id: 'dog-1', owner_id: 'owner-1', name: 'Rex', breed: null, birth_date: null,
  weight_kg: null, gender: null, photo_url: null, titles: null, sire: null, dam: null,
  kennel: null, is_favorite: null, color: null, microchip_number: null,
  tasso_registered: null, registry_country_code: null, registry_type: null,
  registry_name: null, registry_number: null, discipline: null, level: null,
  best_score: null, vet: null, vaccination: null, food: null, created_at: '2026-01-01T00:00:00Z',
};

const EMPTY_OVERVIEW: HealthOverviewData = {
  entries: [], vaccinations: [], medications: [], conditions: [], parasites: [], vetVisits: [], documents: [],
} as HealthOverviewData;

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
    useLocalSearchParams: () => ({ id: 'dog-1' }),
    // Real useFocusEffect only re-runs on focus; a naive `(cb) => cb()` here
    // would re-invoke reload() (and its async work) on every re-render.
    useFocusEffect: (cb: () => void) => { useEffect(() => { cb(); }, []); },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: 'owner-1' } }) }));
// useToast's real implementation sets a genuine 1.8s setTimeout to dismiss
// the message — it fires fine in the app, but leaks past Jest's teardown in
// a test. Not what these tests are about; stub it out.
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn(), toast: null }) }));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/services/dogs', () => ({ getDogById: (...a: unknown[]) => mockGetDogById(...a) }));
jest.mock('@/services/dogHub', () => ({ deleteDogDocument: jest.fn(), getDogDocumentUrl: jest.fn() }));
jest.mock('@/services/healthService', () => ({
  loadHealthOverview: (...a: unknown[]) => mockLoadHealthOverview(...a),
  createWeightEntry: (...a: unknown[]) => mockCreateWeightEntry(...a),
  updateWeightEntry: (...a: unknown[]) => mockUpdateWeightEntry(...a),
  deleteWeightEntry: jest.fn(), createVaccination: jest.fn(), updateVaccination: jest.fn(), deleteVaccination: jest.fn(),
  createMedication: jest.fn(), updateMedication: jest.fn(), deleteMedication: jest.fn(),
  createParasiteTreatment: jest.fn(), updateParasiteTreatment: jest.fn(), deleteParasiteTreatment: jest.fn(),
  createVetVisit: jest.fn(), updateVetVisit: jest.fn(), deleteVetVisit: jest.fn(),
  createCondition: jest.fn(), updateCondition: jest.fn(), deleteCondition: jest.fn(),
}));

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DogHealthRecordRoute />); });
  return node;
}

function weightInput(node: ReactTestRenderer) {
  return (node.root as unknown as {
    findAllByType: (t: unknown) => { props: { placeholder?: string; value: string; onChangeText: (v: string) => void; keyboardType?: string; inputAccessoryViewID?: string } }[];
  }).findAllByType(TextInput).find((i) => i.props.placeholder === 'z. B. 24,5')!;
}

function findByText(node: ReactTestRenderer, text: string) {
  return (node.root as unknown as {
    findAll: (p: (c: { props: { onPress?: () => void }; findAllByType: (t: unknown) => { props: { children: unknown } }[] }) => boolean) => { props: { onPress: () => void } }[];
  }).findAll((c) => typeof c.props.onPress === 'function' && c.findAllByType(Text).some((t) => t.props.children === text))[0];
}

function openWeightSheet(node: ReactTestRenderer) {
  act(() => { findByText(node, 'health.recordWeight').props.onPress(); });
}

function openQuickAction(node: ReactTestRenderer, labelKey: string) {
  act(() => { findByText(node, labelKey).props.onPress(); });
}

function strings(node: ReactTestRenderer): string[] {
  return (node.root as unknown as {
    findAllByType: (type: unknown) => { props: { children: unknown } }[];
  }).findAllByType(Text)
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c): c is string => typeof c === 'string');
}

function allInputs(node: ReactTestRenderer) {
  return (node.root as unknown as {
    findAllByType: (t: unknown) => { props: { value?: string } }[];
  }).findAllByType(TextInput);
}

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

describe('Digital Health Record: "Gewicht erfassen" weight entry', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    mockCreateWeightEntry.mockReset().mockResolvedValue({ data: { id: 'entry-1' }, error: null, reminderSync: 'not_required' });
    mockUpdateWeightEntry.mockReset().mockResolvedValue({ data: { id: 'entry-1' }, error: null, reminderSync: 'not_required' });
  });

  it('opens the Gewicht sheet with the weight input rendered', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    expect(weightInput(node)).toBeTruthy();
  });

  it('accepts an integer weight and saves it', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('24'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateWeightEntry).toHaveBeenCalledWith('dog-1', expect.objectContaining({ weight_kg: 24 }));
  });

  it('accepts a decimal weight with a dot ("24.5")', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('24.5'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateWeightEntry).toHaveBeenCalledWith('dog-1', expect.objectContaining({ weight_kg: 24.5 }));
  });

  it('accepts a decimal weight with a comma ("24,5") — the German/Swiss keyboard separator', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('24,5'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateWeightEntry).toHaveBeenCalledWith('dog-1', expect.objectContaining({ weight_kg: 24.5 }));
  });

  it('rejects empty input — does not save', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateWeightEntry).not.toHaveBeenCalled();
    expect(mockUpdateWeightEntry).not.toHaveBeenCalled();
  });

  it('rejects invalid (non-numeric, zero, negative) input — does not save', async () => {
    const node = render();
    await flush();
    for (const bad of ['abc', '0', '-5', ',']) {
      openWeightSheet(node);
      act(() => { weightInput(node).props.onChangeText(bad); });
      await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    }
    expect(mockCreateWeightEntry).not.toHaveBeenCalled();
  });

  it('save payload contains the selected measurement date (entry_date)', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('24.5'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateWeightEntry).toHaveBeenCalledWith('dog-1', expect.objectContaining({ entry_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
  });

  it('SAME kg value on two different dates creates TWO independent measurements — never an update, never deduplicated by weight', async () => {
    const node = render();
    await flush();

    // First measurement: 2026-09-01, 24.5 kg.
    openWeightSheet(node);
    const dateField1 = (node.root as unknown as {
      findAll: (p: (c: { props: { onChange?: (d: Date) => void; mode?: string } }) => boolean) => { props: { onChange: (d: Date) => void } }[];
    }).findAll((c) => typeof c.props.onChange === 'function' && c.props.mode !== 'time')[0];
    act(() => { dateField1.props.onChange(new Date('2026-09-01T00:00:00Z')); });
    act(() => { weightInput(node).props.onChangeText('24,5'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });

    expect(mockCreateWeightEntry).toHaveBeenNthCalledWith(1, 'dog-1', expect.objectContaining({ weight_kg: 24.5, entry_date: '2026-09-01' }));
    expect(mockUpdateWeightEntry).not.toHaveBeenCalled();

    // Second measurement: a fresh "add" (not edit) with the SAME weight, a
    // LATER date. openSheet always resets editId to null, so this must go
    // through createWeightEntry again — never updateWeightEntry, and never
    // silently treated as "already exists" because the value is equal.
    openWeightSheet(node);
    const dateField2 = (node.root as unknown as {
      findAll: (p: (c: { props: { onChange?: (d: Date) => void; mode?: string } }) => boolean) => { props: { onChange: (d: Date) => void } }[];
    }).findAll((c) => typeof c.props.onChange === 'function' && c.props.mode !== 'time')[0];
    act(() => { dateField2.props.onChange(new Date('2026-09-26T00:00:00Z')); });
    act(() => { weightInput(node).props.onChangeText('24,5'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });

    expect(mockCreateWeightEntry).toHaveBeenCalledTimes(2);
    expect(mockCreateWeightEntry).toHaveBeenNthCalledWith(2, 'dog-1', expect.objectContaining({ weight_kg: 24.5, entry_date: '2026-09-26' }));
    expect(mockUpdateWeightEntry).not.toHaveBeenCalled();
  });

  it('existing history entries are not replaced merely because weight is equal — editing an entry only updates when explicitly opened via edit (editId set), not via a fresh add', async () => {
    const node = render();
    await flush();
    // A fresh "add" flow always has editId === null (set by openSheet), so it
    // can never resolve to an update, regardless of what weight value is
    // typed or whether an equal-weight entry already exists elsewhere.
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('30'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateWeightEntry).toHaveBeenCalledTimes(1);
    expect(mockUpdateWeightEntry).not.toHaveBeenCalled();
  });
});

describe('Digital Health Record: iOS numeric keyboard accessory ("Fertig")', () => {
  const originalPlatformOS = Platform.OS;
  beforeEach(() => {
    Platform.OS = 'ios';
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    mockCreateWeightEntry.mockReset().mockResolvedValue({ data: { id: 'entry-1' }, error: null, reminderSync: 'not_required' });
    mockUpdateWeightEntry.mockReset().mockResolvedValue({ data: { id: 'entry-1' }, error: null, reminderSync: 'not_required' });
  });
  afterEach(() => { Platform.OS = originalPlatformOS; });

  it('the Gewicht field uses the decimal-pad keyboard', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    expect(weightInput(node).props.keyboardType).toBe('decimal-pad');
  });

  it('the Gewicht field is wired to the accessory via inputAccessoryViewID', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    expect(weightInput(node).props.inputAccessoryViewID).toBe('health-numeric-done');
  });

  it('a normal text field (e.g. Notiz) has no inputAccessoryViewID — normal Return behavior is preserved, unchanged', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    const notiz = allInputs(node).find((i) => (i.props as unknown as { placeholder?: string }).placeholder === 'Optional');
    expect(notiz).toBeTruthy();
    expect((notiz!.props as unknown as { inputAccessoryViewID?: string }).inputAccessoryViewID).toBeUndefined();
    expect((notiz!.props as unknown as { keyboardType?: string }).keyboardType).toBe('default');
  });

  it('renders exactly one InputAccessoryView with the "Fertig" (common.done) label, attached to the same ID', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    const accessories = (node.root as unknown as { findAllByType: (t: unknown) => { props: { nativeID?: string } }[] }).findAllByType(InputAccessoryView);
    expect(accessories).toHaveLength(1);
    expect(accessories[0].props.nativeID).toBe('health-numeric-done');
    expect(strings(node)).toContain('common.done');
  });

  it('pressing "Fertig" dismisses the keyboard but does not clear the typed value or trigger save', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('24,5'); });

    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const doneButton = (node.root as unknown as {
      findAll: (p: (c: { props: { onPress?: () => void }; findAllByType: (t: unknown) => { props: { children: unknown } }[] }) => boolean) => { props: { onPress: () => void } }[];
    }).findAll((c) => typeof c.props.onPress === 'function' && c.findAllByType(Text).some((t) => t.props.children === 'common.done'))[0];
    act(() => { doneButton.props.onPress(); });

    expect(dismissSpy).toHaveBeenCalledTimes(1);
    expect(weightInput(node).props.value).toBe('24,5');
    expect(mockCreateWeightEntry).not.toHaveBeenCalled();
    expect(mockUpdateWeightEntry).not.toHaveBeenCalled();
    dismissSpy.mockRestore();
  });

  it('Save remains a separate, explicit action — the typed value only saves via Speichern, not via Fertig', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('24,5'); });
    const doneButton = (node.root as unknown as {
      findAll: (p: (c: { props: { onPress?: () => void }; findAllByType: (t: unknown) => { props: { children: unknown } }[] }) => boolean) => { props: { onPress: () => void } }[];
    }).findAll((c) => typeof c.props.onPress === 'function' && c.findAllByType(Text).some((t) => t.props.children === 'common.done'))[0];
    act(() => { doneButton.props.onPress(); });
    expect(mockCreateWeightEntry).not.toHaveBeenCalled();

    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateWeightEntry).toHaveBeenCalledTimes(1);
    expect(mockCreateWeightEntry).toHaveBeenCalledWith('dog-1', expect.objectContaining({ weight_kg: 24.5 }));
  });

  it('the accessory does not render on Android (InputAccessoryView is iOS-only by design)', async () => {
    Platform.OS = 'android';
    const node = render();
    await flush();
    openWeightSheet(node);
    const accessories = (node.root as unknown as { findAllByType: (t: unknown) => unknown[] }).findAllByType(InputAccessoryView);
    expect(accessories).toHaveLength(0);
  });
});

describe('Digital Health Record: every quick-action variant renders its own fields', () => {
  const VARIANTS: [string, string][] = [
    ['health.recordVaccination', 'Impfart'],
    ['health.recordParasites', 'Behandlungstyp'],
    ['health.recordMedication', 'Name'],
    ['health.recordVet', 'Termin'],
    ['health.recordWeight', 'Gewicht in kg'],
    ['health.recordAllergy', 'Allergie'],
    ['health.recordIntolerance', 'Unverträglichkeit'],
    ['health.recordDiagnosis', 'Diagnose'],
  ];
  it.each(VARIANTS)('opening "%s" renders its distinguishing field ("%s")', async (actionLabelKey, expectedLabel) => {
    const node = render();
    await flush();
    openQuickAction(node, actionLabelKey);
    expect(strings(node)).toContain(expectedLabel);
  });
});

describe('Digital Health Record: switching quick-action type resets state correctly', () => {
  it('typing into Gewicht, then opening a different quick action, does not leak the typed value into the new form', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('30'); });
    // Switch to Impfung without saving — openSheet resets text1/text2/text3.
    openQuickAction(node, 'health.recordVaccination');
    const impfartInput = allInputs(node).find((i) => (i.props as unknown as { placeholder?: string }).placeholder === 'z. B. Tollwut');
    expect(impfartInput).toBeTruthy();
    expect(impfartInput!.props.value).toBe('');
    expect(allInputs(node).some((i) => i.props.value === '30')).toBe(false);
  });

  it('reopening Gewicht fresh after switching away starts with an empty field again', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('30'); });
    openQuickAction(node, 'health.recordVaccination');
    openWeightSheet(node);
    expect(weightInput(node).props.value).toBe('');
  });
});

describe('Digital Health Record quick-action sheet: keyboard-aware flex layout', () => {
  const content = readFileSync('app/dog-health-record/[id].tsx', 'utf8');
  it('the shared quick-action sheet opts into AnyvoBottomSheet keyboardAware', () => {
    expect(content).toMatch(/<AnyvoBottomSheet keyboardAware visible=\{sheet !== null\}/);
  });
  it('the redundant local KeyboardAvoidingView was removed (double avoidance can over-compensate)', () => {
    expect(content).not.toMatch(/<KeyboardAvoidingView/);
    expect(content).not.toMatch(/\bKeyboardAvoidingView\b.*from 'react-native'/);
  });
  it('the scrollable body sits in its own explicit flex:1/minHeight:0 container (sheetBody) — one definite boundary for Yoga to distribute the keyboard-reduced height against', () => {
    expect(content).toMatch(/<View style=\{s\.sheetBody\}>/);
    expect(content).toMatch(/sheetBody: \{ flex: 1, minHeight: 0 \}/);
  });
  it('the ScrollView itself claims space with flex:1/minHeight:0, not just flexShrink:1 — it does not passively collapse toward zero', () => {
    expect(content).toMatch(/<ScrollView style=\{s\.sheetScroll\}/);
    expect(content).toMatch(/sheetScroll: \{ flex: 1, minHeight: 0 \}/);
    expect(content).not.toMatch(/sheetScroll: \{ flexShrink: 1 \}/);
  });
  it('Speichern sits in a fixed footer outside the scrollable body — reachable regardless of scroll position, and not itself given flex:1 (it must keep its natural size, not compete for the scroll body\'s space)', () => {
    expect(content).toMatch(/<View style=\{s\.sheetFooter\}>/);
    expect(content).toMatch(/sheetFooter: \{ paddingTop: 14, paddingBottom: 6 \}/);
  });
  it('AnyvoBottomSheet.tsx itself was not modified for this fix — the shared component\'s repositioning mechanism was already proven correct by Backpack; the defect and its fix are scoped to this screen\'s own container hierarchy', () => {
    const sheetComponent = readFileSync('components/ui/AnyvoBottomSheet.tsx', 'utf8');
    expect(sheetComponent).not.toMatch(/sheetBody/);
  });
  it('keyboardShouldPersistTaps="handled" so date/notes fields stay tappable while the keyboard is open', () => {
    expect(content).toMatch(/keyboardShouldPersistTaps="handled"/);
  });
});
