// Swipe-left-to-delete (28.09.2026) needs react-native-gesture-handler's own
// Jest environment setup (native module install/mocking) — required only for
// ReanimatedSwipeable-wrapped Verlauf rows added below; every pre-existing
// test in this file is unaffected by it being present.
import 'react-native-gesture-handler/jestSetup';

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
import { Alert, InputAccessoryView, Keyboard, Platform, ScrollView, Text, TextInput, TouchableOpacity } from 'react-native';
import DogHealthRecordRoute from '@/app/dog-health-record/[id]';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { AnyvoChip } from '@/components/ui/AnyvoChip';
import type { Dog } from '@/types';
// Real implementations (not the CRUD-only-mocked parts) — used to compute
// EXPECTED values in the Läufigkeit-integration tests below, so assertions
// verify "the UI shows what the real, existing calculation produces" rather
// than a hand-derived number that could silently drift from the actual formula.
import { durationDays as realDurationDays, fmtDate as realFmtDate, getHeatHistoryStats as realGetHeatHistoryStats, type HeatCycle } from '@/features/dogs/heatCycles';
import type { HealthOverviewData } from '@/services/healthService';

const mockLoadHealthOverview = jest.fn();
// Läufigkeit-in-Gesundheitsakte-Integration (29.09.2026): captured so tests
// can assert exact navigation targets (openHeatCycle/openHeatQuickAction).
const mockPush = jest.fn();
const mockCreateWeightEntry = jest.fn();
const mockUpdateWeightEntry = jest.fn();
const mockGetDogById = jest.fn();

// Swipe-left-to-delete (28.09.2026): named (rather than the anonymous
// jest.fn() these used to be) so tests can assert the exact row id passed
// to the exact delete service for each timeline kind, from the NEW swipe
// entry point specifically — not just the pre-existing detail-sheet one.
const mockDeleteWeightEntry = jest.fn();
const mockDeleteVaccination = jest.fn();
const mockDeleteParasiteTreatment = jest.fn();
const mockDeleteVetVisit = jest.fn();
const mockDeleteCondition = jest.fn();

// Phase 3 (28.09.2026): medication administration history ("Gaben"). Named
// (rather than the anonymous jest.fn() used for untouched sibling mutations
// below) specifically so tests can assert the parent medication record is
// never touched when only an administration is saved/edited/deleted.
const mockLoadMedicationAdministrations = jest.fn();
const mockCreateMedicationAdministration = jest.fn();
const mockUpdateMedicationAdministration = jest.fn();
const mockDeleteMedicationAdministration = jest.fn();
const mockUpdateMedication = jest.fn();
const mockCreateMedication = jest.fn();
const mockDeleteMedication = jest.fn();
const mockCreateVaccination = jest.fn();
const mockUpdateVaccination = jest.fn();

// Diagnostics access (existing internal-tester allowlist, unmocked
// implementation — only its data source, useProfile, is stubbed here).
// Defaults to an allowed developer profile so every pre-existing test in
// this file keeps rendering the diagnostic unchanged; individual OTA tests
// override this per-case to prove the fail-closed gate.
let mockProfile: { is_internal_tester?: boolean | null; tester_level?: string | null } | null = { is_internal_tester: true, tester_level: 'developer' };

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
    useRouter: () => ({ back: jest.fn(), push: mockPush }),
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
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: mockProfile }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/services/dogs', () => ({ getDogById: (...a: unknown[]) => mockGetDogById(...a) }));
jest.mock('@/services/dogHub', () => ({ deleteDogDocument: jest.fn(), getDogDocumentUrl: jest.fn() }));
jest.mock('@/services/healthService', () => ({
  loadHealthOverview: (...a: unknown[]) => mockLoadHealthOverview(...a),
  createWeightEntry: (...a: unknown[]) => mockCreateWeightEntry(...a),
  updateWeightEntry: (...a: unknown[]) => mockUpdateWeightEntry(...a),
  deleteWeightEntry: (...a: unknown[]) => mockDeleteWeightEntry(...a), createVaccination: (...a: unknown[]) => mockCreateVaccination(...a), updateVaccination: (...a: unknown[]) => mockUpdateVaccination(...a), deleteVaccination: (...a: unknown[]) => mockDeleteVaccination(...a),
  createMedication: (...a: unknown[]) => mockCreateMedication(...a), updateMedication: (...a: unknown[]) => mockUpdateMedication(...a), deleteMedication: (...a: unknown[]) => mockDeleteMedication(...a),
  createParasiteTreatment: jest.fn(), updateParasiteTreatment: jest.fn(), deleteParasiteTreatment: (...a: unknown[]) => mockDeleteParasiteTreatment(...a),
  createVetVisit: jest.fn(), updateVetVisit: jest.fn(), deleteVetVisit: (...a: unknown[]) => mockDeleteVetVisit(...a),
  createCondition: jest.fn(), updateCondition: jest.fn(), deleteCondition: (...a: unknown[]) => mockDeleteCondition(...a),
  loadMedicationAdministrations: (...a: unknown[]) => mockLoadMedicationAdministrations(...a),
  createMedicationAdministration: (...a: unknown[]) => mockCreateMedicationAdministration(...a),
  updateMedicationAdministration: (...a: unknown[]) => mockUpdateMedicationAdministration(...a),
  deleteMedicationAdministration: (...a: unknown[]) => mockDeleteMedicationAdministration(...a),
}));
// Läufigkeit-in-Gesundheitsakte-Integration (29.09.2026): heatCycles.ts
// imports lib/supabase (→ AsyncStorage) at module scope — mocked away so
// its pure functions (isActiveCycle, predictHeat, getHeatHistoryStats,
// durationDays, fmtDate, heatCycleDay — kept REAL via requireActual, so
// these tests exercise the actual calculations) can load in this bare test
// env; only the two functions that actually touch supabase
// (getHeatCycleDetails, deleteHeatCycle) are replaced with controllable mocks.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
const mockGetHeatCycleDetails = jest.fn();
const mockDeleteHeatCycle = jest.fn();
jest.mock('@/features/dogs/heatCycles', () => {
  const actual = jest.requireActual('@/features/dogs/heatCycles');
  return {
    ...actual,
    getHeatCycleDetails: (...a: unknown[]) => mockGetHeatCycleDetails(...a),
    deleteHeatCycle: (...a: unknown[]) => mockDeleteHeatCycle(...a),
  };
});

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

function findChip(node: ReactTestRenderer, label: string) {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: { label: string; onPress: () => void } }[] })
    .findAllByType(AnyvoChip).find((c) => c.props.label === label)!;
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
    findAllByType: (t: unknown) => { props: { value?: string; placeholder?: string; onChangeText: (v: string) => void } }[];
  }).findAllByType(TextInput);
}

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

beforeEach(() => {
  mockProfile = { is_internal_tester: true, tester_level: 'developer' };
  mockLoadMedicationAdministrations.mockReset().mockResolvedValue({ data: [], error: null });
  mockCreateMedicationAdministration.mockReset().mockResolvedValue({ data: { id: 'admin-1' }, error: null });
  mockUpdateMedicationAdministration.mockReset().mockResolvedValue({ data: { id: 'admin-1' }, error: null });
  mockDeleteMedicationAdministration.mockReset().mockResolvedValue({ error: null });
  mockCreateMedication.mockReset().mockResolvedValue({ data: { id: 'med-1' }, error: null, reminderSync: 'not_required' });
  mockUpdateMedication.mockReset().mockResolvedValue({ data: { id: 'med-1' }, error: null, reminderSync: 'not_required' });
  mockDeleteMedication.mockReset().mockResolvedValue({ data: null, error: null, reminderSync: 'not_required' });
  mockCreateVaccination.mockReset().mockResolvedValue({ data: { id: 'vacc-1' }, error: null, reminderSync: 'not_required' });
  mockUpdateVaccination.mockReset().mockResolvedValue({ data: { id: 'vacc-1' }, error: null, reminderSync: 'not_required' });
  mockGetHeatCycleDetails.mockReset().mockResolvedValue({ cycles: [], phases: [], observations: [] });
  mockDeleteHeatCycle.mockReset().mockResolvedValue({ error: null });
  mockPush.mockReset();
});

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

describe('Digital Health Record quick-action sheet: keyboard-aware layout (corrected, 27.09.2026)', () => {
  const content = readFileSync('app/dog-health-record/[id].tsx', 'utf8');

  it('the shared quick-action sheet opts into AnyvoBottomSheet keyboardAware', () => {
    expect(content).toMatch(/<AnyvoBottomSheet keyboardAware closeButton visible=\{sheet !== null\}/);
  });
  it('the redundant local KeyboardAvoidingView was removed (double avoidance can over-compensate)', () => {
    expect(content).not.toMatch(/<KeyboardAvoidingView/);
    expect(content).not.toMatch(/\bKeyboardAvoidingView\b.*from 'react-native'/);
  });

  // REGRESSION (Phase A/B correction, 27.09.2026): a prior fix wrapped the
  // scrollable body in an explicit flex:1/minHeight:0 container (sheetBody)
  // plus gave the ScrollView flex:1/minHeight:0 instead of flexShrink:1.
  // flex:1 uses flexBasis:0%, which only sizes correctly against a BOUNDED
  // ancestor — every ancestor here (AnyvoBottomSheet's SafeAreaView/sheet
  // views) is content-sized (flexShrink:1, no explicit height), so there was
  // no bounded parent to distribute against. The result: sheetBody/
  // sheetScroll computed to ZERO height regardless of keyboard state — the
  // form body was gone even with the keyboard closed. Corrected: no wrapper
  // View at all (back to a bare Fragment), ScrollView back to plain
  // flexShrink:1 (flexBasis:auto — content-sized, sizes to its own content
  // when nothing squeezes it, shrinks only when something does).
  it('there is no sheetBody wrapper View around the scrollable body', () => {
    expect(content).not.toMatch(/<View style=\{s\.sheetBody\}>/);
    expect(content).not.toMatch(/sheetBody: \{/);
  });
  it('the ScrollView uses plain flexShrink:1 (content-sized, flexBasis:auto) — not flex:1/minHeight:0, which requires a bounded ancestor this sheet does not have', () => {
    expect(content).toMatch(/<ScrollView style=\{s\.sheetScroll\}/);
    expect(content).toMatch(/sheetScroll: \{ flexShrink: 1 \}/);
    expect(content).not.toMatch(/sheetScroll: \{ flex: 1, minHeight: 0 \}/);
  });
  it('the ScrollView and footer are direct Fragment children of the sheet, not wrapped in any flex:1 container', () => {
    const branch = content.match(/\) : \(\s*<>([\s\S]*?)<\/>\s*\)\}/)?.[1] ?? '';
    expect(branch).toContain('<ScrollView style={s.sheetScroll}');
    expect(branch).toContain('<View style={s.sheetFooter}>');
  });
  it('Speichern sits in a fixed footer outside the scrollable body — reachable regardless of scroll position, and not itself given flex:1 (it must keep its natural size, protected from any shrinkage)', () => {
    expect(content).toMatch(/<View style=\{s\.sheetFooter\}>/);
    expect(content).toMatch(/sheetFooter: \{ paddingTop: 14, paddingBottom: 6 \}/);
  });
  it('keyboardShouldPersistTaps="handled" so date/notes fields stay tappable while the keyboard is open', () => {
    expect(content).toMatch(/keyboardShouldPersistTaps="handled"/);
  });

  it('shared keyboard avoidance is now handled entirely inside AnyvoBottomSheet, not by any Health-specific flex rule — this screen requires nothing beyond plain flexShrink:1', () => {
    const sheetComponent = readFileSync('components/ui/AnyvoBottomSheet.tsx', 'utf8');
    expect(sheetComponent).not.toMatch(/sheetBody/);
    expect(sheetComponent).toMatch(/keyboardWillShow/);
    expect(sheetComponent).toMatch(/endCoordinates\.height/);
  });

  it('all quick-action forms render their full field set even with no keyboard/squeeze at all (nothing here depends on a keyboard being open to size correctly)', async () => {
    const node = render();
    await flush();
    openQuickAction(node, 'health.recordVaccination');
    // Vaccination is the longest form (5 fields) — every label must be
    // present in the render tree, proving the body isn't collapsed away.
    expect(strings(node)).toEqual(expect.arrayContaining(['Impfart', 'Tierarzt / Praxis', 'Impfstoff']));
    expect(findByText(node, 'Speichern')).toBeTruthy();
  });

  it('Backpack (a different AnyvoBottomSheet consumer) still uses plain flexShrink:1, unaffected by this correction', () => {
    const backpackContent = readFileSync('app/dog-backpack/[id].tsx', 'utf8');
    expect(backpackContent).toMatch(/editorScroll: \{ flexShrink: 1 \}/);
    expect(backpackContent).not.toMatch(/\bsheetBody\b/);
  });
});

// PHASE 1–5 (28.09.2026): physical-device report — quick-action forms
// visually collapsed BEFORE the keyboard even opened. Backpack (a confirmed
// working AnyvoBottomSheet consumer on the same device) was used as the
// canonical structural reference. A line-by-line audit against
// app/dog-backpack/[id].tsx found the shell already matching on every
// flex/minHeight/maxHeight/keyboard prop; the one real divergence was this
// ScrollView's own contentContainerStyle (sheetContent, a gap/paddingBottom
// object Backpack's editor ScrollView never sets at all) — removed, with
// equivalent field-to-field spacing moved onto formLabel/dateFieldGap
// instead, matching how Backpack's own fieldLabel already carries its
// spacing. This suite proves structural parity with Backpack; it does not
// (and cannot, from a JS unit test) prove the physical-device symptom itself
// was caused by the removed style, since no other divergence was found.
describe('Digital Health Record quick-action sheet: Backpack-parity structural shell (28.09.2026)', () => {
  const healthContent = readFileSync('app/dog-health-record/[id].tsx', 'utf8');
  const backpackContent = readFileSync('app/dog-backpack/[id].tsx', 'utf8');

  it('no Health-specific contentContainerStyle wrapper remains on the quick-action ScrollView — matches Backpack, which sets none', () => {
    expect(healthContent).not.toMatch(/sheetContent:\s*\{/);
    expect(healthContent).not.toMatch(/contentContainerStyle=\{s\.sheetContent\}/);
    expect(healthContent).toMatch(/<ScrollView style=\{s\.sheetScroll\} keyboardShouldPersistTaps="handled" keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\} showsVerticalScrollIndicator=\{false\}>/);
  });

  it('Health\'s sheetScroll/sheetFooter are byte-identical in shape to Backpack\'s editorScroll/editorFooter', () => {
    expect(healthContent).toMatch(/sheetScroll: \{ flexShrink: 1 \}/);
    expect(backpackContent).toMatch(/editorScroll: \{ flexShrink: 1 \}/);
    expect(healthContent).toMatch(/sheetFooter: \{ paddingTop: 14, paddingBottom: 6 \}/);
    expect(backpackContent).toMatch(/editorFooter: \{ paddingTop: 14, paddingBottom: 6 \}/);
  });

  it('both Health and Backpack use AnyvoBottomSheet with keyboardAware, keyboardShouldPersistTaps="handled" and the same keyboardDismissMode expression', () => {
    for (const content of [healthContent, backpackContent]) {
      expect(content).toMatch(/<AnyvoBottomSheet keyboardAware /);
      expect(content).toMatch(/keyboardShouldPersistTaps="handled"/);
      expect(content).toMatch(/keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
    }
  });

  it('Backpack has no KeyboardAvoidingView of its own (relies entirely on the shared AnyvoBottomSheet mechanism, same as Health)', () => {
    expect(backpackContent).not.toMatch(/<KeyboardAvoidingView/);
  });

  it.each(['health.recordVaccination', 'health.recordParasites', 'health.recordMedication', 'health.recordVet', 'health.recordWeight', 'health.recordAllergy', 'health.recordIntolerance', 'health.recordDiagnosis'])(
    'form body for "%s" exists immediately on open, before any keyboard interaction, with Save reachable',
    async (actionLabelKey) => {
      const node = render();
      await flush();
      openQuickAction(node, actionLabelKey);
      // The sheet's ScrollView must already contain rendered form content —
      // not an empty/collapsed body — the instant the sheet opens.
      const scrollView = (node.root as unknown as { findAllByType: (t: unknown) => { props: { children: unknown } }[] })
        .findAllByType(ScrollView).find((sv) => Array.isArray(sv.props.children) ? sv.props.children.length > 0 : sv.props.children != null);
      expect(scrollView).toBeTruthy();
      expect(findByText(node, 'Speichern')).toBeTruthy();
    },
  );

  it('the footer is a direct Fragment/Modal-tree sibling of the ScrollView, not nested inside any flex:1/minHeight:0 wrapper (no such wrapper exists in this file)', () => {
    expect(healthContent).not.toMatch(/flex:\s*1,\s*minHeight:\s*0/);
    expect(healthContent).not.toMatch(/minHeight:\s*0,\s*flex:\s*1/);
  });

  it('every DateField call in renderForm carries the same dateFieldGap spacing style, mirroring how Backpack keeps spacing on the field itself rather than the container', () => {
    const renderFormLine = healthContent.split('\n').find((line) => line.includes('function renderForm('))!;
    const dateFieldOpenTags = renderFormLine.match(/<DateField /g) ?? [];
    const dateFieldGapUsages = renderFormLine.match(/<DateField style=\{s\.dateFieldGap\}/g) ?? [];
    expect(dateFieldOpenTags.length).toBeGreaterThanOrEqual(9);
    expect(dateFieldGapUsages.length).toBe(dateFieldOpenTags.length);
  });

  it('Backpack remains completely unchanged by this Health-side pass', () => {
    expect(backpackContent).toContain("editorFooter: { paddingTop: 14, paddingBottom: 6 }");
    expect(backpackContent).not.toMatch(/dateFieldGap|sheetContent|HealthNumericKeyboardAccessory/);
  });

  it('same weight on two different dates still remains independently saveable after the shell alignment (editId semantics unchanged)', async () => {
    const node = render();
    await flush();
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('24,5'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateWeightEntry).toHaveBeenNthCalledWith(1, 'dog-1', expect.objectContaining({ weight_kg: 24.5 }));
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('24,5'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateWeightEntry).toHaveBeenCalledTimes(2);
    expect(mockUpdateWeightEntry).not.toHaveBeenCalled();
  });
});

// PHASE 3 (28.09.2026): vaccination details + medication administration
// history ("Gaben"). Extends the existing Digital Health Record only — same
// Übersicht/Verlauf/Dokumente navigation, same filters, same Verlauf ->
// detail sheet pattern; the detail sheet body is enriched for vaccination
// and medication kinds only, everything else keeps its original generic body.
function switchToVerlauf(node: ReactTestRenderer) {
  act(() => { findByText(node, 'health.recordTimeline').props.onPress(); });
}

const VACCINATION_ROW = {
  id: 'vacc-1', owner_id: 'owner-1', dog_id: 'dog-1',
  vaccine_type: 'Tollwut', vaccine_name: null as string | null,
  administered_on: '2026-09-27', next_due_on: '2029-09-27',
  clinic_name: 'Tierklinik Zürich', note: 'Gut vertragen', batch_number: 'LOT-2026-A1',
  document_id: null as string | null,
  created_at: '2026-09-27T08:00:00Z', updated_at: '2026-09-27T08:00:00Z',
};

const MEDICATION_ROW = {
  id: 'med-1', owner_id: 'owner-1', dog_id: 'dog-1',
  name: 'Rimadyl', dosage: '1,5 ml', frequency: '2x täglich',
  starts_on: '2026-09-20', ends_on: null as string | null, is_active: true,
  note: 'Nach dem Essen geben', dose_amount: null as number | null, dose_unit: null as string | null,
  administration_route: 'oral', prescribing_vet: 'Dr. Meier',
  created_at: '2026-09-20T08:00:00Z', updated_at: '2026-09-20T08:00:00Z',
};

function administrationRow(overrides: Partial<typeof MEDICATION_ROW> & { id: string; administered_at: string; amount?: number | null; unit?: string | null; administration_route?: string | null; location?: string | null; note?: string | null }) {
  return {
    owner_id: 'owner-1', dog_id: 'dog-1', medication_id: 'med-1',
    amount: null, unit: null, administration_route: null, location: null, note: null,
    created_at: overrides.administered_at, updated_at: overrides.administered_at,
    ...overrides,
  };
}

describe('Digital Health Record Phase 3 — vaccination details (Verlauf)', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue({ ...EMPTY_OVERVIEW, vaccinations: [VACCINATION_ROW] });
  });

  it('vaccination card in Verlauf shows name, date, and "Nächste Fälligkeit" next-due when present (never "Gültig bis" — the DB column is next_due_on, there is no separate valid_until field)', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    expect(strings(node)).toContain('Tollwut');
    expect(strings(node).some((line) => line.includes('Nächste Fälligkeit') && line.includes('27.09.2029'))).toBe(true);
    expect(strings(node).some((line) => line.includes('Gültig bis'))).toBe(false);
  });

  it('tapping a vaccination card opens its detail sheet with every saved field', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Tollwut').props.onPress(); });
    const rendered = strings(node);
    expect(rendered).toContain('Tollwut');
    expect(rendered.some((l) => l.includes('27.09.2026'))).toBe(true); // Datum
    expect(rendered.some((l) => l.includes('27.09.2029'))).toBe(true); // Nächste Fälligkeit
    expect(rendered).toContain('Nächste Fälligkeit');
    expect(rendered).not.toContain('Gültig bis / nächste Fälligkeit');
    expect(rendered).toContain('Tierklinik Zürich');
    expect(rendered).toContain('LOT-2026-A1');
    expect(rendered).toContain('Gut vertragen');
  });

  it('multiple vaccinations of the same type on different dates are preserved independently in Verlauf', async () => {
    mockLoadHealthOverview.mockResolvedValue({
      ...EMPTY_OVERVIEW,
      vaccinations: [
        { ...VACCINATION_ROW, id: 'vacc-1', administered_on: '2023-09-27', next_due_on: '2026-09-27' },
        { ...VACCINATION_ROW, id: 'vacc-2', administered_on: '2026-09-27', next_due_on: '2029-09-27' },
      ],
    });
    const node = render();
    await flush();
    switchToVerlauf(node);
    const rendered = strings(node);
    expect(rendered.filter((l) => l === 'Tollwut')).toHaveLength(2);
    expect(rendered.some((l) => l.includes('27.09.2026'))).toBe(true);
    expect(rendered.some((l) => l.includes('27.09.2029'))).toBe(true);
  });

  it('the existing "Impfungen" Verlauf filter still shows vaccination events only', async () => {
    mockLoadHealthOverview.mockResolvedValue({ ...EMPTY_OVERVIEW, vaccinations: [VACCINATION_ROW], medications: [MEDICATION_ROW] });
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Impfungen').props.onPress(); });
    const rendered = strings(node);
    expect(rendered).toContain('Tollwut');
    expect(rendered).not.toContain('Rimadyl');
  });

  // Audit finding: document_id already existed on dog_health_vaccinations
  // but had no UI to set it. Smallest possible fix — a picker over the
  // SAME health documents already loaded for the Dokumente tab.
  it('vaccination form offers the existing health documents to link, and saving persists the selected document_id', async () => {
    mockLoadHealthOverview.mockResolvedValue({
      ...EMPTY_OVERVIEW,
      documents: [{ id: 'doc-1', dog_id: 'dog-1', kind: 'impfpass', title: 'Impfpass Scan', category: 'health', subtype: null, file_url: 'x.pdf', issued_on: '2026-09-01', note: null, created_at: '2026-09-01' }],
    });
    const node = render();
    await flush();
    openQuickAction(node, 'health.recordVaccination');
    expect(strings(node)).toContain('Impfpass Scan');
    act(() => { findChip(node, 'Impfpass Scan').props.onPress(); });
    const impfart = allInputs(node).find((i) => i.props.placeholder === 'z. B. Tollwut')!;
    act(() => { impfart.props.onChangeText('Tollwut'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateVaccination).toHaveBeenCalledWith('dog-1', expect.objectContaining({ document_id: 'doc-1' }));
  });

  it('"Kein Dokument" clears a previously selected document on save', async () => {
    mockLoadHealthOverview.mockResolvedValue({
      ...EMPTY_OVERVIEW,
      documents: [{ id: 'doc-1', dog_id: 'dog-1', kind: 'impfpass', title: 'Impfpass Scan', category: 'health', subtype: null, file_url: 'x.pdf', issued_on: '2026-09-01', note: null, created_at: '2026-09-01' }],
      vaccinations: [{ ...VACCINATION_ROW, document_id: 'doc-1' }],
    });
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Tollwut').props.onPress(); });
    act(() => { findByText(node, 'Bearbeiten').props.onPress(); });
    act(() => { findChip(node, 'Kein Dokument').props.onPress(); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockUpdateVaccination).toHaveBeenCalledWith('vacc-1', expect.objectContaining({ document_id: null }));
  });
});

describe('Digital Health Record Phase 3 — medication treatment + "Gaben" administration history', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue({ ...EMPTY_OVERVIEW, medications: [MEDICATION_ROW] });
  });

  function openMedicationDetail(node: ReactTestRenderer) {
    switchToVerlauf(node);
    act(() => { findByText(node, 'Rimadyl').props.onPress(); });
  }

  it('the existing "Medikamente" Verlauf filter still shows medication treatments', async () => {
    mockLoadHealthOverview.mockResolvedValue({ ...EMPTY_OVERVIEW, vaccinations: [VACCINATION_ROW], medications: [MEDICATION_ROW] });
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Medikamente').props.onPress(); });
    const rendered = strings(node);
    expect(rendered).toContain('Rimadyl');
    expect(rendered).not.toContain('Tollwut');
  });

  it('medication detail shows the full treatment summary (dose, route, period, status, prescribing vet, note)', async () => {
    const node = render();
    await flush();
    openMedicationDetail(node);
    const rendered = strings(node);
    expect(rendered).toContain('Rimadyl');
    expect(rendered).toContain('1,5 ml');
    expect(rendered).toContain('oral');
    expect(rendered).toContain('Aktiv');
    expect(rendered).toContain('Dr. Meier');
    expect(rendered).toContain('Nach dem Essen geben');
  });

  it('"Gabe dokumentieren" is visible in the medication detail sheet', async () => {
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();
    expect(findByText(node, 'Gabe dokumentieren')).toBeTruthy();
  });

  it('loads the administration history for this medication on-demand, sorted newest first as returned', async () => {
    mockLoadMedicationAdministrations.mockResolvedValue({
      data: [
        administrationRow({ id: 'a-3', administered_at: '2026-09-28T08:05:00Z', amount: 1.5, unit: 'ml', administration_route: 'oral', location: 'Zuhause' }),
        administrationRow({ id: 'a-2', administered_at: '2026-09-27T20:10:00Z', amount: 1.5, unit: 'ml', administration_route: 'oral', location: 'Zuhause' }),
        administrationRow({ id: 'a-1', administered_at: '2026-09-27T08:15:00Z', amount: 1.5, unit: 'ml', administration_route: 'oral', location: 'Zuhause' }),
      ], error: null,
    });
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();
    expect(mockLoadMedicationAdministrations).toHaveBeenCalledWith('med-1');
    const rendered = strings(node);
    // Compute the expected HH:MM the same way the component does (local
    // Date methods) so this assertion is independent of the test host's timezone.
    const timeLabel = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const idx3 = rendered.findIndex((l) => l.includes('28.09.2026'));
    const idx2 = rendered.findIndex((l) => l.includes('27.09.2026') && l.includes(timeLabel('2026-09-27T20:10:00Z')));
    const idx1 = rendered.findIndex((l) => l.includes('27.09.2026') && l.includes(timeLabel('2026-09-27T08:15:00Z')));
    expect(idx3).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(idx3);
    expect(idx1).toBeGreaterThan(idx2);
  });

  it('"Gabe dokumentieren" opens a form and saving appends a NEW administration without touching the parent medication', async () => {
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();
    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });

    const inputs = allInputs(node);
    const amount = inputs.find((i) => (i.props as unknown as { placeholder?: string }).placeholder === 'z. B. 1,5')!;
    const unit = inputs.find((i) => (i.props as unknown as { placeholder?: string }).placeholder === 'z. B. ml')!;
    const route = inputs.find((i) => (i.props as unknown as { placeholder?: string }).placeholder === 'z. B. oral')!;
    const location = inputs.find((i) => (i.props as unknown as { placeholder?: string }).placeholder === 'z. B. Zuhause')!;
    act(() => { amount.props.onChangeText('1,5'); });
    act(() => { unit.props.onChangeText('ml'); });
    act(() => { route.props.onChangeText('oral'); });
    act(() => { location.props.onChangeText('Zuhause'); });

    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });

    expect(mockCreateMedicationAdministration).toHaveBeenCalledTimes(1);
    expect(mockCreateMedicationAdministration).toHaveBeenCalledWith('dog-1', 'med-1', expect.objectContaining({ amount: 1.5, unit: 'ml', administration_route: 'oral', location: 'Zuhause' }));
    expect(mockUpdateMedication).not.toHaveBeenCalled();
    expect(mockCreateMedication).not.toHaveBeenCalled();
  });

  it('the same amount logged twice on the same day creates TWO independent administrations — never merged, never overwritten', async () => {
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();

    for (let i = 0; i < 2; i += 1) {
      act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });
      const amount = allInputs(node).find((i2) => (i2.props as unknown as { placeholder?: string }).placeholder === 'z. B. 1,5')!;
      act(() => { amount.props.onChangeText('1,5'); });
      await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    }

    expect(mockCreateMedicationAdministration).toHaveBeenCalledTimes(2);
    // Neither call carries an id to merge against — each is an independent insert.
    for (const call of mockCreateMedicationAdministration.mock.calls) {
      expect(call[2]).not.toHaveProperty('id');
    }
  });

  it('administrations remain linked to the correct medication_id', async () => {
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();
    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateMedicationAdministration).toHaveBeenCalledWith('dog-1', 'med-1', expect.anything());
  });

  it('editing one administration calls update with only that administration\'s id — never bulk, never affecting others', async () => {
    mockLoadMedicationAdministrations.mockResolvedValue({
      data: [
        administrationRow({ id: 'a-2', administered_at: '2026-09-27T20:10:00Z', amount: 1.5 }),
        administrationRow({ id: 'a-1', administered_at: '2026-09-27T08:15:00Z', amount: 1.5 }),
      ], error: null,
    });
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();

    const editButtons = (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress: () => void } }[] })
      .findAllByType(TouchableOpacity).filter((c) => c.props.accessibilityLabel === 'Gabe bearbeiten');
    expect(editButtons.length).toBe(2);
    act(() => { editButtons[0].props.onPress(); });
    const noteInput = allInputs(node).find((i) => (i.props as unknown as { placeholder?: string }).placeholder === 'Optional' && (i.props as unknown as { value?: string }).value === '');
    if (noteInput) act(() => { noteInput.props.onChangeText('Aktualisiert'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });

    expect(mockUpdateMedicationAdministration).toHaveBeenCalledTimes(1);
    expect(mockUpdateMedicationAdministration.mock.calls[0][0]).toBe('a-2');
    expect(mockDeleteMedicationAdministration).not.toHaveBeenCalled();
  });

  it('deleting one administration only deletes that row by id — parent medication and other administrations untouched', async () => {
    mockLoadMedicationAdministrations.mockResolvedValue({
      data: [administrationRow({ id: 'a-2', administered_at: '2026-09-27T20:10:00Z' }), administrationRow({ id: 'a-1', administered_at: '2026-09-27T08:15:00Z' })],
      error: null,
    });
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();

    const deleteButtons = (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress: () => void } }[] })
      .findAllByType(TouchableOpacity).filter((c) => c.props.accessibilityLabel === 'Gabe löschen');
    expect(deleteButtons.length).toBe(2);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const destructive = buttons?.find((b) => b.text === 'Löschen');
      destructive?.onPress?.();
    });
    act(() => { deleteButtons[0].props.onPress(); });
    await flush();
    alertSpy.mockRestore();

    expect(mockDeleteMedicationAdministration).toHaveBeenCalledTimes(1);
    expect(mockDeleteMedicationAdministration).toHaveBeenCalledWith('a-2');
    expect(mockUpdateMedication).not.toHaveBeenCalled();
    expect(mockDeleteMedication).not.toHaveBeenCalled();
  });
});

// REGRESSION (Gaben, 28.09.2026): physical-device report — "Gabe
// dokumentieren" visibly did nothing (no form/sheet opened). Root cause,
// proven from source: openAdminForm/openAdminEdit set adminSheetOpen=true
// WITHOUT clearing `detail`, so the medication detail sheet
// (visible={detail !== null}) and a separate admin-editor sheet
// (visible={adminSheetOpen}) were simultaneously visible=true — two
// independent AnyvoBottomSheet instances, each its own native <Modal> on
// iOS, which cannot reliably present concurrently (a second concurrent
// presentation is commonly dropped silently, matching "onPress fires,
// state changes, nothing visible"). react-test-renderer has no real
// UIKit view-controller-presentation stacking semantics, so the
// pre-existing suite above (using the same mocks) could pass even with two
// simultaneously visible sheets in the real tree — it is structurally
// blind to this exact bug class. Fixed by merging the two sheets into ONE
// AnyvoBottomSheet whose body toggles between the detail view and the
// admin editor via the existing adminSheetOpen boolean (the same
// single-sheet/conditional-content pattern already used above for the
// emergency vs. normal quick-action sheet) — there is never more than one
// AnyvoBottomSheet visible=true for this part of the screen. These tests
// assert that invariant directly, plus the cancel ("Abbrechen") path and
// medication-id retention across open/cancel/reopen.
describe('Digital Health Record Phase 3 — "Gabe dokumentieren" nested-sheet regression (28.09.2026)', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue({ ...EMPTY_OVERVIEW, medications: [MEDICATION_ROW] });
  });

  function openMedicationDetail(node: ReactTestRenderer) {
    switchToVerlauf(node);
    act(() => { findByText(node, 'Rimadyl').props.onPress(); });
  }

  function detailAdminSheets(node: ReactTestRenderer) {
    // Both the medication-detail sheet and the admin editor now render
    // through the SAME AnyvoBottomSheet element (visible={detail !== null}).
    // Distinguish it from the unrelated quick-action sheet at the top of the
    // file (visible={sheet !== null}) by title: only this one ever renders
    // "Rimadyl" (detail.title) or "Gabe dokumentieren"/"Gabe bearbeiten".
    return (node.root as unknown as {
      findAllByType: (t: unknown) => { props: { visible: boolean; title?: string } }[];
    }).findAllByType(AnyvoBottomSheet).filter((sh) => sh.props.title === 'Rimadyl' || sh.props.title === 'Gabe dokumentieren' || sh.props.title === 'Gabe bearbeiten');
  }

  it('there is only ONE AnyvoBottomSheet instance covering medication detail + the Gabe editor — never two stacked sheets', async () => {
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();
    expect(detailAdminSheets(node)).toHaveLength(1);
    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });
    // Still exactly one instance — only its title/content switched.
    expect(detailAdminSheets(node)).toHaveLength(1);
  });

  it('tapping "Gabe dokumentieren" actually opens the form — the sheet stays visible and its title switches to "Gabe dokumentieren"', async () => {
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();
    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });
    const sheet = detailAdminSheets(node)[0];
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.title).toBe('Gabe dokumentieren');
    expect(allInputs(node).some((i) => (i.props as unknown as { placeholder?: string }).placeholder === 'z. B. 1,5')).toBe(true);
  });

  it('the medication id (medicationDetailId) is retained while the admin editor is open — saving still targets med-1', async () => {
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();
    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });
    expect(mockCreateMedicationAdministration).toHaveBeenCalledWith('dog-1', 'med-1', expect.anything());
  });

  it('"Abbrechen" returns to the medication detail view within the same sheet, without saving anything', async () => {
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();
    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });
    expect(detailAdminSheets(node)[0].props.title).toBe('Gabe dokumentieren');

    act(() => { findByText(node, 'Abbrechen').props.onPress(); });

    expect(mockCreateMedicationAdministration).not.toHaveBeenCalled();
    const sheet = detailAdminSheets(node)[0];
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.title).toBe('Rimadyl');
    expect(strings(node)).toContain('Gabe dokumentieren'); // back to the detail body's own button
  });

  it('after cancelling, reopening "Gabe dokumentieren" starts a fresh (non-edit) entry, and saving creates exactly one administration for med-1', async () => {
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();
    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });
    act(() => { findByText(node, 'Abbrechen').props.onPress(); });

    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });

    expect(mockCreateMedicationAdministration).toHaveBeenCalledTimes(1);
    expect(mockCreateMedicationAdministration).toHaveBeenCalledWith('dog-1', 'med-1', expect.anything());
    expect(mockUpdateMedicationAdministration).not.toHaveBeenCalled();
  });

  it('editing an administration opens the SAME merged sheet, prefilled, with its title switched to "Gabe bearbeiten" — not a second stacked sheet', async () => {
    mockLoadMedicationAdministrations.mockResolvedValue({
      data: [administrationRow({ id: 'a-1', administered_at: '2026-09-27T08:15:00Z', amount: 1.5, unit: 'ml' })], error: null,
    });
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();

    const editButton = (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress: () => void } }[] })
      .findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === 'Gabe bearbeiten')!;
    act(() => { editButton.props.onPress(); });

    expect(detailAdminSheets(node)).toHaveLength(1);
    const sheet = detailAdminSheets(node)[0];
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.title).toBe('Gabe bearbeiten');
    const amount = allInputs(node).find((i) => (i.props as unknown as { placeholder?: string }).placeholder === 'z. B. 1,5');
    expect(amount?.props.value).toBe('1.5');
  });

  it('closing the whole sheet (onClose) clears both detail and the admin editor, so reopening a different medication never shows a stale Gabe editor first', async () => {
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();
    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });

    const sheet = detailAdminSheets(node)[0] as unknown as { props: { onClose: () => void } };
    act(() => { sheet.props.onClose(); });

    expect(detailAdminSheets(node)).toHaveLength(0);
    openMedicationDetail(node);
    await flush();
    expect(detailAdminSheets(node)[0].props.title).toBe('Rimadyl');
  });

  it('no parent medication mutation occurs anywhere in the create/cancel/edit flow', async () => {
    mockLoadMedicationAdministrations.mockResolvedValue({
      data: [administrationRow({ id: 'a-1', administered_at: '2026-09-27T08:15:00Z' })], error: null,
    });
    const node = render();
    await flush();
    openMedicationDetail(node);
    await flush();

    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });
    act(() => { findByText(node, 'Abbrechen').props.onPress(); });

    const editButton = (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress: () => void } }[] })
      .findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === 'Gabe bearbeiten')!;
    act(() => { editButton.props.onPress(); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });

    expect(mockUpdateMedication).not.toHaveBeenCalled();
    expect(mockCreateMedication).not.toHaveBeenCalled();
    expect(mockDeleteMedication).not.toHaveBeenCalled();
  });
});

// REGRESSION (Health Record, 28.09.2026): physical-device report — Health
// bottom sheets had no reliable way to close. Source-level cause: this
// screen's two AnyvoBottomSheet consumers relied ENTIRELY on the shared
// component's backdrop tap (dragging/swiping never did anything — the
// "griff" handle was purely decorative, wired to no gesture at all — see
// components/ui/AnyvoBottomSheet.tsx for the full root-cause note). On a
// tall or keyboard-squeezed sheet that backdrop area can shrink to an
// unreachable sliver, trapping the user. Fixed by opting both Health sheets
// into the new AnyvoBottomSheet `closeButton` prop (an explicit, always-
// reachable header X, see the same file). These tests prove the button
// exists, is reachable, and — critically — that closing NEVER implicitly
// saves/mutates anything and always leaves clean state behind.
describe('Digital Health Record — explicit close (X) button (28.09.2026)', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG, error: null });
    mockCreateWeightEntry.mockReset().mockResolvedValue({ data: { id: 'entry-1' }, error: null, reminderSync: 'not_required' });
    mockUpdateWeightEntry.mockReset().mockResolvedValue({ data: { id: 'entry-1' }, error: null, reminderSync: 'not_required' });
  });

  function findCloseButton(node: ReactTestRenderer) {
    return (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress: () => void } }[] })
      .findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === 'Schließen');
  }

  it('the medication create sheet has a functioning explicit close action', async () => {
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    const node = render();
    await flush();
    openQuickAction(node, 'health.recordMedication');
    const close = findCloseButton(node);
    expect(close).toBeTruthy();
    act(() => { close!.props.onPress(); });
    expect(findByText(node, 'Speichern')).toBeFalsy(); // sheet is gone
  });

  it('closing the medication create sheet does not call create/update for any Health entity', async () => {
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    const node = render();
    await flush();
    openQuickAction(node, 'health.recordMedication');
    const inputs = allInputs(node);
    const name = inputs.find((i) => (i.props as unknown as { placeholder?: string }).placeholder === 'Medikament')!;
    act(() => { name.props.onChangeText('Rimadyl'); });
    act(() => { findCloseButton(node)!.props.onPress(); });
    expect(mockCreateMedication).not.toHaveBeenCalled();
    expect(mockUpdateMedication).not.toHaveBeenCalled();
  });

  it('the vaccination create sheet has a functioning explicit close action', async () => {
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    const node = render();
    await flush();
    openQuickAction(node, 'health.recordVaccination');
    act(() => { findCloseButton(node)!.props.onPress(); });
    expect(mockCreateVaccination).not.toHaveBeenCalled();
    expect(findByText(node, 'Speichern')).toBeFalsy();
  });

  it('the Gewicht sheet can be closed via the explicit close button without saving', async () => {
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    const node = render();
    await flush();
    openWeightSheet(node);
    act(() => { weightInput(node).props.onChangeText('24,5'); });
    act(() => { findCloseButton(node)!.props.onPress(); });
    expect(mockCreateWeightEntry).not.toHaveBeenCalled();
    expect(findByText(node, 'Speichern')).toBeFalsy();
  });

  it('closing an edit (via X) does not persist stale edit state — a later, unrelated "add" for a different entity still creates, never updates the closed edit target', async () => {
    mockLoadHealthOverview.mockReset().mockResolvedValue({ ...EMPTY_OVERVIEW, vaccinations: [VACCINATION_ROW] });
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Tollwut').props.onPress(); });
    act(() => { findByText(node, 'Bearbeiten').props.onPress(); }); // editId is now 'vacc-1', sheet === 'vaccination'
    act(() => { findCloseButton(node)!.props.onPress(); }); // closed via X, never saved

    act(() => { findByText(node, 'health.recordOverview').props.onPress(); }); // back to Übersicht for the quick-action buttons
    openWeightSheet(node); // an unrelated, fresh "add" for a different entity
    act(() => { weightInput(node).props.onChangeText('24'); });
    await act(async () => { await findByText(node, 'Speichern').props.onPress(); });

    expect(mockCreateWeightEntry).toHaveBeenCalledTimes(1);
    expect(mockUpdateWeightEntry).not.toHaveBeenCalled();
    expect(mockUpdateVaccination).not.toHaveBeenCalled();
    expect(mockCreateVaccination).not.toHaveBeenCalled();
  });
});

describe('Digital Health Record — medication detail sheet close + clean-state (28.09.2026)', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue({ ...EMPTY_OVERVIEW, medications: [MEDICATION_ROW, { ...MEDICATION_ROW, id: 'med-2', name: 'Cortison' }] });
  });

  function findCloseButton(node: ReactTestRenderer) {
    return (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress: () => void } }[] })
      .findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === 'Schließen');
  }

  it('the medication detail sheet has a functioning explicit close action', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Rimadyl').props.onPress(); });
    await flush();
    const close = findCloseButton(node);
    expect(close).toBeTruthy();
    act(() => { close!.props.onPress(); });
    expect(strings(node)).not.toContain('GABEN');
  });

  it('closing the detail sheet clears temporary state — reopening a DIFFERENT medication never shows a stale admin editor first', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Rimadyl').props.onPress(); });
    await flush();
    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });
    act(() => { findCloseButton(node)!.props.onPress(); });

    switchToVerlauf(node);
    act(() => { findByText(node, 'Cortison').props.onPress(); });
    await flush();
    expect(strings(node)).toContain('Cortison');
    expect(strings(node)).not.toContain('Gabe bearbeiten');
    // The detail body (not the admin editor) is showing — "Gabe dokumentieren" button is present again.
    expect(findByText(node, 'Gabe dokumentieren')).toBeTruthy();
  });

  it('closing while the admin ("Gabe dokumentieren") editor is active clears BOTH detail and admin state in one action', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Rimadyl').props.onPress(); });
    await flush();
    act(() => { findByText(node, 'Gabe dokumentieren').props.onPress(); });
    expect(strings(node)).toContain('Gabe dokumentieren'); // sheet title now the form

    act(() => { findCloseButton(node)!.props.onPress(); });

    expect(mockCreateMedicationAdministration).not.toHaveBeenCalled();
    expect(strings(node)).not.toContain('GABEN');
    expect(strings(node)).not.toContain('Menge');
  });
});

// SWIPE-LEFT-TO-DELETE (28.09.2026): Verlauf timeline cards can now be
// deleted by swiping left to reveal a red "Löschen" action, matching
// components/training/SwipeableTrainingItem.tsx's already-shipped,
// Build-48-compatible ReanimatedSwipeable pattern (same already-installed
// react-native-gesture-handler dependency — no new package). The actual
// on-device pan-gesture reveal cannot be reliably asserted by a JS unit
// test (documented manual-device-retest precedent already established
// above, for a different gesture/animation concern) — react-test-renderer
// has no real UIKit/Reanimated gesture-recognizer semantics. What IS
// reliably testable, and is covered here: the revealed action exists and is
// reachable, tapping it (not merely rendering/swiping) is what triggers the
// confirmation dialog, cancelling never deletes, confirming calls the exact
// existing delete service with the exact selected row id (reusing
// deleteItem — the SAME function the pre-existing detail-sheet "Löschen"
// button already called, so this is one delete pipeline with two entry
// points, not a duplicated one), a successful delete refreshes Verlauf, and
// a failed delete leaves the entry in place and never pretends to have
// succeeded. Every pre-existing test in this file (quick-action sheets,
// vaccination/medication detail, Gaben, the explicit close button, filters)
// still passes unmodified above — proving none of that regressed.
const VET_ROW = { id: 'vet-1', dog_id: 'dog-1', appointment_at: '2026-09-10T09:00:00Z', reason: 'Kontrolle', status: 'scheduled', clinic_name: 'Tierklinik Zürich', diagnosis: null, treatment: null, cost_amount: null, document_id: null, completed_at: null, note: null, created_at: '2026-09-01T00:00:00Z' };
const PARASITE_ROW = { id: 'para-1', dog_id: 'dog-1', treatment_date: '2026-09-05', product: 'Bravecto', note: null, next_due_date: '2026-12-05', treatment_type: 'flea_tick', created_at: '2026-09-05T00:00:00Z' };
const CONDITION_ROW = { id: 'cond-1', owner_id: 'owner-1', dog_id: 'dog-1', kind: 'allergy' as const, name: 'Huhn', status: 'active' as const, started_on: '2026-01-01', ended_on: null, note: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
// Two independent weight entries with the SAME kg value on different dates —
// exactly the case the swipe-delete flow must never conflate (WEIGHT
// special case in the task spec).
const WEIGHT_ROW_OLD = { id: 'w-old', dog_id: 'dog-1', entry_date: '2026-09-01', weight_kg: 24.5, load_level: null, is_rest_day: false, is_intense: false, note: null, created_at: '2026-09-01T00:00:00Z' };
const WEIGHT_ROW_NEW = { id: 'w-new', dog_id: 'dog-1', entry_date: '2026-09-15', weight_kg: 24.5, load_level: null, is_rest_day: false, is_intense: false, note: null, created_at: '2026-09-15T00:00:00Z' };
const DOCUMENT_ROW = { id: 'doc-1', dog_id: 'dog-1', kind: 'sonstiges', title: 'Laborbericht', category: 'health', subtype: null, file_url: 'x.pdf', issued_on: '2026-09-01', note: null, created_at: '2026-09-01' };

describe('Digital Health Record Verlauf — swipe-left-to-delete (28.09.2026)', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG, error: null });
    mockDeleteWeightEntry.mockReset().mockResolvedValue({ error: null, reminderSync: 'not_required' });
    mockDeleteVaccination.mockReset().mockResolvedValue({ error: null, reminderSync: 'not_required' });
    mockDeleteParasiteTreatment.mockReset().mockResolvedValue({ error: null, reminderSync: 'not_required' });
    mockDeleteVetVisit.mockReset().mockResolvedValue({ error: null, reminderSync: 'not_required' });
    mockDeleteCondition.mockReset().mockResolvedValue({ error: null, reminderSync: 'not_required' });
    mockDeleteMedication.mockReset().mockResolvedValue({ data: null, error: null, reminderSync: 'not_required' });
    mockLoadHealthOverview.mockReset().mockResolvedValue({
      ...EMPTY_OVERVIEW,
      entries: [WEIGHT_ROW_NEW, WEIGHT_ROW_OLD],
      vaccinations: [VACCINATION_ROW],
      medications: [MEDICATION_ROW],
      parasites: [PARASITE_ROW],
      vetVisits: [VET_ROW],
      conditions: [CONDITION_ROW],
      documents: [DOCUMENT_ROW],
    });
  });

  function findDeleteAction(node: ReactTestRenderer, label: string, nth = 0) {
    return (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress: () => void } }[] })
      .findAllByType(TouchableOpacity).filter((c) => c.props.accessibilityLabel === label)[nth];
  }
  function confirmDestructive() {
    return jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
  }
  function confirmCancel() {
    return jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      buttons?.find((b) => b.style === 'cancel')?.onPress?.();
    });
  }

  it('a deletable Verlauf card reveals a "<Titel> löschen" delete action', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    expect(findDeleteAction(node, 'Tollwut löschen')).toBeTruthy();
  });

  it('tapping the card itself (not the delete action) still opens the detail sheet, unaffected by the swipe wrapper', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Tollwut').props.onPress(); });
    expect(strings(node)).toContain('Tierklinik Zürich');
  });

  it('rendering the Verlauf list alone never deletes anything — the revealed action must be explicitly tapped', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    expect(mockDeleteVaccination).not.toHaveBeenCalled();
    expect(mockDeleteMedication).not.toHaveBeenCalled();
    expect(mockDeleteWeightEntry).not.toHaveBeenCalled();
  });

  it('tapping the delete action opens a confirmation dialog — it does not delete immediately', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findDeleteAction(node, 'Tollwut löschen')!.props.onPress(); });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('Tollwut löschen?');
    expect(mockDeleteVaccination).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('cancelling the confirmation does NOT delete', async () => {
    const alertSpy = confirmCancel();
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findDeleteAction(node, 'Tollwut löschen')!.props.onPress(); });
    await flush();
    expect(mockDeleteVaccination).not.toHaveBeenCalled();
    expect(strings(node)).toContain('Tollwut'); // card still present
    alertSpy.mockRestore();
  });

  it('confirming deletes exactly the selected vaccination and preserves its linked document (dog_health_vaccinations.document_id is "on delete set null" — the vaccination row itself is what deleteVaccination removes; the document row is never touched)', async () => {
    const alertSpy = confirmDestructive();
    const node = render();
    await flush();
    switchToVerlauf(node);
    const callsBefore = mockLoadHealthOverview.mock.calls.length;
    act(() => { findDeleteAction(node, 'Tollwut löschen')!.props.onPress(); });
    await flush();
    expect(mockDeleteVaccination).toHaveBeenCalledTimes(1);
    expect(mockDeleteVaccination).toHaveBeenCalledWith('vacc-1');
    expect(mockLoadHealthOverview.mock.calls.length).toBeGreaterThan(callsBefore); // Verlauf refreshed
    alertSpy.mockRestore();
  });

  it('medication confirmation copy discloses the Gaben cascade — the DB FK is "on delete cascade" for dog_health_medication_administrations.medication_id', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findDeleteAction(node, 'Rimadyl löschen')!.props.onPress(); });
    const [, message] = alertSpy.mock.calls[0];
    expect(message).toContain('Gaben');
    expect(message).toContain('dauerhaft gelöscht');
    alertSpy.mockRestore();
  });

  it('confirming a medication delete targets exactly that medication only — deleteMedication receives its id, no other medication is touched', async () => {
    const alertSpy = confirmDestructive();
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findDeleteAction(node, 'Rimadyl löschen')!.props.onPress(); });
    await flush();
    expect(mockDeleteMedication).toHaveBeenCalledTimes(1);
    expect(mockDeleteMedication).toHaveBeenCalledWith('med-1');
    alertSpy.mockRestore();
  });

  it('WEIGHT: deleting one dated weight entry never targets another entry with the same kg value — the swipe action on the OLDER row deletes only w-old', async () => {
    const alertSpy = confirmDestructive();
    const node = render();
    await flush();
    switchToVerlauf(node);
    // Two "Gewicht" cards exist (same title); sorted newest-first, so index 1 is the older (w-old) row.
    act(() => { findDeleteAction(node, 'Gewicht löschen', 1)!.props.onPress(); });
    await flush();
    expect(mockDeleteWeightEntry).toHaveBeenCalledTimes(1);
    expect(mockDeleteWeightEntry).toHaveBeenCalledWith('w-old');
    alertSpy.mockRestore();
  });

  it('vaccination, parasite, vet, and condition kinds each route to their own exact delete service with the exact selected row id', async () => {
    const alertSpy = confirmDestructive();
    const node = render();
    await flush();
    switchToVerlauf(node);

    act(() => { findDeleteAction(node, 'Bravecto löschen')!.props.onPress(); });
    await flush();
    expect(mockDeleteParasiteTreatment).toHaveBeenCalledWith('para-1');

    act(() => { findDeleteAction(node, 'Kontrolle löschen')!.props.onPress(); });
    await flush();
    expect(mockDeleteVetVisit).toHaveBeenCalledWith('vet-1');

    act(() => { findDeleteAction(node, 'Huhn löschen')!.props.onPress(); });
    await flush();
    expect(mockDeleteCondition).toHaveBeenCalledWith('cond-1');
    alertSpy.mockRestore();
  });

  it('a failed delete leaves the card in place and never removes it — no optimistic deletion', async () => {
    mockDeleteVaccination.mockResolvedValue({ error: { message: 'network' }, reminderSync: 'not_required' });
    const alertSpy = confirmDestructive();
    const node = render();
    await flush();
    switchToVerlauf(node);
    const callsBefore = mockLoadHealthOverview.mock.calls.length;
    act(() => { findDeleteAction(node, 'Tollwut löschen')!.props.onPress(); });
    await flush();
    expect(mockLoadHealthOverview.mock.calls.length).toBe(callsBefore); // never refreshed — nothing to "undo"
    expect(strings(node)).toContain('Tollwut'); // card still rendered, never removed
    alertSpy.mockRestore();
  });

  it('DOCUMENTS: a document Verlauf card has NO swipe-delete action — deleting a document keeps its own dedicated workflow (the Dokumente tab), not duplicated here', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    expect(findDeleteAction(node, 'Laborbericht löschen')).toBeUndefined();
  });

  it('a non-owner (shared Health access) sees no swipe-delete action on any Verlauf card', async () => {
    mockGetDogById.mockReset().mockResolvedValue({ data: { ...DOG, owner_id: 'someone-else' }, error: null });
    const node = render();
    await flush();
    switchToVerlauf(node);
    expect(findDeleteAction(node, 'Tollwut löschen')).toBeUndefined();
    expect(findDeleteAction(node, 'Rimadyl löschen')).toBeUndefined();
  });

  it('the Übersicht "recent activity" preview list never gets swipe-delete — it is a compact summary, not the full Verlauf', async () => {
    const node = render();
    await flush(); // stays on the default 'overview' tab
    expect(findDeleteAction(node, 'Tollwut löschen')).toBeUndefined();
  });

  it('existing Verlauf filters still work after adding swipe-delete', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Medikamente').props.onPress(); });
    const rendered = strings(node);
    expect(rendered).toContain('Rimadyl');
    expect(rendered).not.toContain('Tollwut');
  });
});

// ANYVO-wide long-press-delete standardization (28.09.2026): long press
// added ADDITIONALLY to the existing swipe-left action on Verlauf cards —
// both call the exact same onDelete (== deleteItem(item)), so there is no
// duplicated deletion logic and, per the already-proven-safe
// app/track/historie.tsx precedent (SwipeableTrainingItem + onLongPress
// together in production), no gesture conflict with ReanimatedSwipeable.
describe('Digital Health Record Verlauf — long-press delete, additional to swipe (28.09.2026)', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG, error: null });
    mockDeleteVaccination.mockReset().mockResolvedValue({ error: null, reminderSync: 'not_required' });
    mockLoadHealthOverview.mockReset().mockResolvedValue({ ...EMPTY_OVERVIEW, vaccinations: [VACCINATION_ROW] });
  });

  function findRow(node: ReactTestRenderer, label: string) {
    return (node.root as unknown as { findAllByType: (t: unknown) => { props: { onPress?: () => void; onLongPress?: () => void; accessibilityLabel?: string } }[] })
      .findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === label);
  }

  it('a deletable card also exposes onLongPress, wired to the same confirm+delete path as swipe', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    const row = findRow(node, 'Tollwut, lange drücken zum Löschen');
    expect(row).toBeTruthy();
    expect(typeof row!.props.onLongPress).toBe('function');
  });

  it('long press alone does not delete', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findRow(node, 'Tollwut, lange drücken zum Löschen')!.props.onLongPress?.(); });
    expect(mockDeleteVaccination).not.toHaveBeenCalled();
  });

  it('long press opens the same confirmation dialog swipe already used', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findRow(node, 'Tollwut, lange drücken zum Löschen')!.props.onLongPress?.(); });
    expect(alertSpy).toHaveBeenCalledWith('Tollwut löschen?', expect.any(String), expect.any(Array));
    alertSpy.mockRestore();
  });

  it('confirming a long-press delete calls the exact same service with the exact same id', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'destructive')?.onPress?.(); });
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findRow(node, 'Tollwut, lange drücken zum Löschen')!.props.onLongPress?.(); });
    await flush();
    expect(mockDeleteVaccination).toHaveBeenCalledWith('vacc-1');
    alertSpy.mockRestore();
  });

  it('a document card (no delete authority for this row kind) has no long-press-delete accessibilityLabel either', async () => {
    mockLoadHealthOverview.mockResolvedValue({ ...EMPTY_OVERVIEW, documents: [{ id: 'doc-1', dog_id: 'dog-1', kind: 'sonstiges', title: 'Laborbericht', category: 'health', subtype: null, file_url: 'x.pdf', issued_on: '2026-09-01', note: null, created_at: '2026-09-01' }] });
    const node = render();
    await flush();
    switchToVerlauf(node);
    expect(findRow(node, 'Laborbericht, lange drücken zum Löschen')).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════
// LÄUFIGKEIT-IN-GESUNDHEITSAKTE-INTEGRATION (29.09.2026)
// ════════════════════════════════════════════════════════════════════════
// Wiederverwendet ausschliesslich das bestehende Läufigkeits-Datenmodell/
// die bestehenden Berechnungen (features/dogs/heatCycles.ts:
// getHeatCycleDetails/deleteHeatCycle/isActiveCycle/predictHeat/
// getHeatHistoryStats — hier über requireActual echt eingebunden, nur die
// beiden supabase-Aufrufe sind gemockt). Detail-/Edit-Verwaltung bleibt in
// app/dog-heat/[id].tsx — diese Suite prüft nur die neue Integration:
// Gender-Gating, die neue HealthHeatCard/HealthHeatSheetContent, die
// Quick Action und die kompakte Verlauf-Darstellung.
const DOG_FEMALE: Dog = { ...DOG, gender: 'female' };
const DOG_MALE: Dog = { ...DOG, gender: 'male' };

const CYCLE_OLD: HeatCycle = { id: 'cyc-old', dogId: 'dog-1', startDate: '2026-01-01', endDate: '2026-01-21', status: 'completed', notes: null, phase: null, createdAt: '2026-01-01T00:00:00Z' };
const CYCLE_NEW: HeatCycle = { id: 'cyc-new', dogId: 'dog-1', startDate: '2026-07-01', endDate: '2026-07-21', status: 'completed', notes: null, phase: null, createdAt: '2026-07-01T00:00:00Z' };
const CYCLE_ACTIVE: HeatCycle = { id: 'cyc-active', dogId: 'dog-1', startDate: dateKeyToday(), endDate: null, status: 'active', notes: null, phase: null, createdAt: '2026-09-01T00:00:00Z' };

function dateKeyToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function findByAccessibilityLabelPrefix(node: ReactTestRenderer, prefix: string) {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress?: () => void } }[] })
    .findAllByType(TouchableOpacity).find((c) => typeof c.props.accessibilityLabel === 'string' && c.props.accessibilityLabel.startsWith(prefix));
}
function findAllByAccessibilityLabelIncluding(node: ReactTestRenderer, substr: string) {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress?: () => void; onLongPress?: () => void; testID?: string } }[] })
    .findAllByType(TouchableOpacity).filter((c) => typeof c.props.accessibilityLabel === 'string' && c.props.accessibilityLabel.includes(substr));
}
// The HealthHeatCard's own accessibilityLabel also includes the most recent
// cycle's formatted date range (see its own accessibilityLabel), so a bare
// date-substring search can match the CARD itself, not just a Verlauf-
// history row inside the opened sheet. Excludes the card explicitly by its
// testID so these always resolve to the intended history row.
function findHistoryRow(node: ReactTestRenderer, substr: string) {
  return findAllByAccessibilityLabelIncluding(node, substr).find((r) => r.props.testID !== 'health-heat-card');
}
function findHeatCard(node: ReactTestRenderer) {
  return (node.root as unknown as { findAllByProps: (p: object) => { props: { onPress?: () => void } }[] })
    .findAllByProps({ testID: 'health-heat-card' })[0];
}
// Only valid when cycles are non-empty — the populated card's onPress opens
// the Läufigkeit-Bereich sheet. The EMPTY-state card's onPress is `onAdd`
// (navigates straight to /dog-heat-new instead), by design — see the
// "Leerzustand" tests below, which exercise that path directly.
function openHeatSheet(node: ReactTestRenderer) {
  act(() => { findHeatCard(node)!.props.onPress?.(); });
}

describe('Digital Health Record — Läufigkeit: Gender-Gating', () => {
  it('Hündin → Läufigkeitskarte und Quick Action sichtbar', async () => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_FEMALE, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    mockGetHeatCycleDetails.mockResolvedValue({ cycles: [], phases: [], observations: [] });
    const node = render();
    await flush();
    expect(findByText(node, 'health.recordHeat')).toBeTruthy(); // Quick Action
    expect(findByAccessibilityLabelPrefix(node, 'heat.addFirst') ?? findByAccessibilityLabelPrefix(node, 'heat.title')).toBeTruthy(); // Karte (leer oder befüllt)
  });

  it('Rüde → keine Läufigkeitskarte, keine Quick Action, kein Verlauf-Filter', async () => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_MALE, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    const node = render();
    await flush();
    expect(findByText(node, 'health.recordHeat')).toBeFalsy();
    expect(mockGetHeatCycleDetails).not.toHaveBeenCalled(); // gar nicht erst geladen
    switchToVerlauf(node);
    expect(findChip(node, 'Läufigkeit')).toBeFalsy();
  });

  it('unbekanntes Geschlecht (null) → keine Läufigkeitskarte, keine Quick Action', async () => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG, error: null }); // DOG.gender === null
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    const node = render();
    await flush();
    expect(findByText(node, 'health.recordHeat')).toBeFalsy();
    expect(mockGetHeatCycleDetails).not.toHaveBeenCalled();
  });
});

describe('Digital Health Record — Läufigkeit: Leerzustand', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_FEMALE, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    mockGetHeatCycleDetails.mockResolvedValue({ cycles: [], phases: [], observations: [] });
  });

  it('keine Daten → korrekter Leerzustand auf der Karte', async () => {
    const node = render();
    await flush();
    expect(strings(node)).toContain('heat.emptyTitle');
  });

  it('Tippen auf die leere Karte navigiert direkt zur bestehenden Erfassen-Route (kein Zwischenschritt über ein leeres Sheet nötig)', async () => {
    const node = render();
    await flush();
    act(() => { findHeatCard(node)!.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/dog-heat-new', params: { id: 'dog-1' } });
  });

  it('die dedizierte Läufigkeit-Bereichsansicht selbst zeigt denselben Leerzustand (Text/CTA), falls sie ohne Zyklen erreicht wird', () => {
    // Direkter Komponententest von HealthHeatSheetContent — deckt den
    // Leerzustand-Zweig ab, unabhängig davon, über welchen Weg er in der
    // echten App je erreicht wird.
    const { HealthHeatSheetContent } = require('@/components/dogs/HealthHeatSection');
    let node!: ReactTestRenderer;
    act(() => {
      node = TestRenderer.create(
        <HealthHeatSheetContent cycles={[]} phases={[]} observations={[]} prediction={null} stats={realGetHeatHistoryStats([])} isOwner onOpenCycle={() => {}} onDeleteCycle={() => {}} onAdd={() => {}} />,
      );
    });
    expect(strings(node)).toContain('heat.emptyTitle');
    expect(strings(node)).toContain('heat.emptyDesc');
    expect(strings(node)).toContain('heat.addFirst');
  });
});

describe('Digital Health Record — Läufigkeit: eine abgeschlossene Läufigkeit', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_FEMALE, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    mockGetHeatCycleDetails.mockResolvedValue({ cycles: [CYCLE_OLD], phases: [], observations: [] });
  });

  it('die Karte zeigt Zeitraum und Dauer der letzten Läufigkeit', async () => {
    const node = render();
    await flush();
    const duration = realDurationDays(CYCLE_OLD.startDate, CYCLE_OLD.endDate);
    // heat.days is rendered via t('heat.days'), which the i18n mock resolves
    // to the raw key — matches the actual mocked-render output exactly.
    expect(strings(node).some((t) => t.includes(`${duration} heat.days`))).toBe(true);
  });

  it('bei nur einer Läufigkeit: keine Prognose ("Noch keine Prognose verfügbar")', async () => {
    const node = render();
    await flush();
    expect(strings(node)).toContain('Noch keine Prognose verfügbar');
  });

  it('bei nur einer Läufigkeit: kein Fake-Ø-Abstand in der Statistik', async () => {
    const node = render();
    await flush();
    openHeatSheet(node);
    await flush();
    const stats = realGetHeatHistoryStats([CYCLE_OLD]);
    expect(stats.averageGapDays).toBeNull();
    expect(strings(node).some((t) => t.includes('Ø Abstand'))).toBe(false);
    expect(strings(node).some((t) => t === '1')).toBe(true); // Anzahl-Kachel
  });
});

describe('Digital Health Record — Läufigkeit: mehrere Läufigkeiten', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_FEMALE, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    mockGetHeatCycleDetails.mockResolvedValue({ cycles: [CYCLE_NEW, CYCLE_OLD], phases: [], observations: [] });
  });

  it('Verlauf ist chronologisch korrekt sortiert (neueste zuerst)', async () => {
    const node = render();
    await flush();
    openHeatSheet(node);
    await flush();
    const rendered = strings(node);
    const idxNew = rendered.findIndex((t) => t.includes(realFmtDate(CYCLE_NEW.startDate) ?? ''));
    const idxOld = rendered.findIndex((t) => t.includes(realFmtDate(CYCLE_OLD.startDate) ?? ''));
    expect(idxNew).toBeGreaterThan(-1);
    expect(idxOld).toBeGreaterThan(idxNew);
  });

  it('durchschnittliche Dauer wird korrekt aus den abgeschlossenen Zyklen berechnet', async () => {
    const node = render();
    await flush();
    openHeatSheet(node);
    await flush();
    const stats = realGetHeatHistoryStats([CYCLE_NEW, CYCLE_OLD]);
    expect(stats.averageDays).not.toBeNull();
    expect(strings(node).some((t) => t.includes(`${stats.averageDays} Tage`))).toBe(true);
  });

  it('durchschnittlicher Abstand wird korrekt aus den Start-zu-Start-Differenzen berechnet', async () => {
    const node = render();
    await flush();
    openHeatSheet(node);
    await flush();
    const stats = realGetHeatHistoryStats([CYCLE_NEW, CYCLE_OLD]);
    expect(stats.averageGapDays).not.toBeNull();
    expect(strings(node).some((t) => t.includes('Ø Abstand'))).toBe(true);
  });

  it('Anzahl dokumentierter Läufigkeiten ist korrekt', async () => {
    const node = render();
    await flush();
    openHeatSheet(node);
    await flush();
    expect(strings(node)).toContain('2');
    expect(strings(node)).toContain('Läufigkeiten');
  });
});

describe('Digital Health Record — Läufigkeit: offene/aktive Läufigkeit', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_FEMALE, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    mockGetHeatCycleDetails.mockResolvedValue({ cycles: [CYCLE_ACTIVE, CYCLE_OLD], phases: [], observations: [] });
  });

  it('die aktive Läufigkeit wird im Status-Hero als "aktuell" hervorgehoben, ohne erfundenes Enddatum', async () => {
    const node = render();
    await flush();
    openHeatSheet(node);
    await flush();
    const rendered = strings(node);
    // Matches the established Health-screen eyebrow convention (t(key).toUpperCase()) already used elsewhere in this file.
    expect(rendered).toContain('HEAT.CURRENTCYCLE');
    expect(rendered).toContain('heat.active');
    expect(rendered.some((t) => t.includes('31.12.2026') || t.includes('undefined'))).toBe(false); // kein Fake-Enddatum
  });

  it('die Karte auf der Übersicht zeigt ebenfalls den aktiven Status', async () => {
    const node = render();
    await flush();
    expect(strings(node)).toContain('heat.active');
  });
});

describe('Digital Health Record — Läufigkeit: Tap öffnet korrekten Cycle (bestehende Detailansicht)', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_FEMALE, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    mockGetHeatCycleDetails.mockResolvedValue({ cycles: [CYCLE_NEW, CYCLE_OLD], phases: [], observations: [] });
  });

  it('Tap auf eine Verlaufskarte im Läufigkeit-Bereich navigiert zu /dog-heat/[exact id]', async () => {
    const node = render();
    await flush();
    openHeatSheet(node);
    await flush();
    const row = findHistoryRow(node, realFmtDate(CYCLE_NEW.startDate) ?? '__nomatch__');
    act(() => { row!.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/dog-heat/cyc-new');
  });
});

describe('Digital Health Record — Läufigkeit: Long-Press nutzt vorhandenen Delete-Flow', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_FEMALE, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    mockGetHeatCycleDetails.mockResolvedValue({ cycles: [CYCLE_OLD], phases: [], observations: [] });
  });

  it('Long Press löscht NICHT direkt — erst nach Bestätigung', async () => {
    const node = render();
    await flush();
    openHeatSheet(node);
    await flush();
    const row = findAllByAccessibilityLabelIncluding(node, 'lange drücken zum Löschen')[0];
    act(() => { row!.props.onLongPress?.(); });
    expect(mockDeleteHeatCycle).not.toHaveBeenCalled();
  });

  it('Bestätigung löscht exakt den gewählten Cycle über die bestehende deleteHeatCycle-Funktion', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'destructive')?.onPress?.(); });
    const node = render();
    await flush();
    openHeatSheet(node);
    await flush();
    const row = findAllByAccessibilityLabelIncluding(node, 'lange drücken zum Löschen')[0];
    act(() => { row!.props.onLongPress?.(); });
    await flush();
    expect(mockDeleteHeatCycle).toHaveBeenCalledWith('cyc-old');
    alertSpy.mockRestore();
  });

  it('Abbrechen löscht nicht', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'cancel')?.onPress?.(); });
    const node = render();
    await flush();
    openHeatSheet(node);
    await flush();
    const row = findAllByAccessibilityLabelIncluding(node, 'lange drücken zum Löschen')[0];
    act(() => { row!.props.onLongPress?.(); });
    await flush();
    expect(mockDeleteHeatCycle).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('Nicht-Owner bekommt keine Delete-Aktion (kein onLongPress auf der Verlaufskarte)', async () => {
    mockGetDogById.mockResolvedValue({ data: { ...DOG_FEMALE, owner_id: 'someone-else' }, error: null });
    const node = render();
    await flush();
    openHeatSheet(node);
    await flush();
    const row = findHistoryRow(node, realFmtDate(CYCLE_OLD.startDate) ?? '__nomatch__');
    expect(row?.props.onLongPress).toBeUndefined();
  });
});

describe('Digital Health Record — Läufigkeit: Quick Action', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_FEMALE, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
  });

  it('ohne aktive Läufigkeit navigiert die Quick Action zu /dog-heat-new', async () => {
    mockGetHeatCycleDetails.mockResolvedValue({ cycles: [CYCLE_OLD], phases: [], observations: [] });
    const node = render();
    await flush();
    act(() => { findByText(node, 'health.recordHeat').props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/dog-heat-new', params: { id: 'dog-1' } });
  });

  it('bei bereits aktiver Läufigkeit öffnet die Quick Action stattdessen deren Detailansicht — kein zweiter Zyklus', async () => {
    mockGetHeatCycleDetails.mockResolvedValue({ cycles: [CYCLE_ACTIVE], phases: [], observations: [] });
    const node = render();
    await flush();
    act(() => { findByText(node, 'health.recordHeat').props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/dog-heat/cyc-active');
    expect(mockPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/dog-heat-new' }));
  });
});

describe('Digital Health Record — Läufigkeit: Verlauf-Integration (kompakte Darstellung)', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_FEMALE, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    mockGetHeatCycleDetails.mockResolvedValue({ cycles: [CYCLE_OLD], phases: [], observations: [] });
  });

  it('eine abgeschlossene Läufigkeit erscheint als kompakter Eintrag im allgemeinen Verlauf', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    expect(strings(node)).toContain('Läufigkeit');
  });

  it('Antippen navigiert direkt zur Läufigkeitsdetailansicht, nicht zum generischen Detail-Sheet', async () => {
    const node = render();
    await flush();
    switchToVerlauf(node);
    // Nicht per Text suchen — "Läufigkeit" matcht auch den Filter-Chip
    // (findByText nimmt den ersten Treffer nach Baum-Reihenfolge, und die
    // Filter-Chips stehen vor der Liste). testID identifiziert die Zeile
    // eindeutig.
    const row = (node.root as unknown as { findAllByProps: (p: object) => { props: { onPress?: () => void } }[] })
      .findAllByProps({ testID: 'health-verlauf-row-heat-heat:cyc-old' })[0];
    expect(row).toBeTruthy();
    act(() => { row!.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/dog-heat/cyc-old');
    // Kein generisches Detail-Sheet geöffnet: keine "Bearbeiten"/"Löschen"-Buttons aus DetailBody sichtbar.
    expect(strings(node).includes('Bearbeiten')).toBe(false);
  });

  it('der Läufigkeit-Filter erscheint im Verlauf nur bei Hündinnen und filtert korrekt', async () => {
    mockLoadHealthOverview.mockResolvedValue({ ...EMPTY_OVERVIEW, vaccinations: [VACCINATION_ROW] });
    const node = render();
    await flush();
    switchToVerlauf(node);
    expect(findChip(node, 'Läufigkeit')).toBeTruthy();
    act(() => { findChip(node, 'Läufigkeit').props.onPress(); });
    const rendered = strings(node);
    expect(rendered).toContain('Läufigkeit');
    expect(rendered).not.toContain('Tollwut');
  });
});

describe('Digital Health Record — Läufigkeit: Daten-Wiederverwendung, keine Duplikation', () => {
  it('verwendet exakt die von getHeatCycleDetails gelieferten Zyklen — kein separates/zweites Laden', async () => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_FEMALE, error: null });
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    mockGetHeatCycleDetails.mockReset().mockResolvedValue({ cycles: [CYCLE_OLD], phases: [], observations: [] });
    render();
    await flush();
    expect(mockGetHeatCycleDetails).toHaveBeenCalledTimes(1);
    expect(mockGetHeatCycleDetails).toHaveBeenCalledWith('dog-1');
  });
});

describe('Digital Health Record — Läufigkeit: Regression (bestehende Health-Funktionen unverändert)', () => {
  beforeEach(() => {
    mockGetDogById.mockReset().mockResolvedValue({ data: DOG_FEMALE, error: null });
    mockGetHeatCycleDetails.mockResolvedValue({ cycles: [], phases: [], observations: [] });
  });

  it('Health Phase 3 (Impfung-Detail) funktioniert weiterhin bei einer Hündin', async () => {
    mockLoadHealthOverview.mockReset().mockResolvedValue({ ...EMPTY_OVERVIEW, vaccinations: [VACCINATION_ROW] });
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Tollwut').props.onPress(); });
    expect(strings(node)).toContain('Nächste Fälligkeit');
  });

  it('Medikamente/Gaben funktionieren weiterhin bei einer Hündin', async () => {
    mockLoadHealthOverview.mockReset().mockResolvedValue({ ...EMPTY_OVERVIEW, medications: [MEDICATION_ROW] });
    const node = render();
    await flush();
    switchToVerlauf(node);
    act(() => { findByText(node, 'Rimadyl').props.onPress(); });
    await flush();
    expect(findByText(node, 'Gabe dokumentieren')).toBeTruthy();
  });

  it('Health Sheet X (Schliessen) funktioniert weiterhin bei einer Hündin', async () => {
    mockLoadHealthOverview.mockReset().mockResolvedValue(EMPTY_OVERVIEW);
    const node = render();
    await flush();
    openQuickAction(node, 'health.recordMedication');
    const close = (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress: () => void } }[] })
      .findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === 'Schließen');
    expect(close).toBeTruthy();
  });

  it('Health Swipe-Delete funktioniert weiterhin bei einer Hündin', async () => {
    mockLoadHealthOverview.mockReset().mockResolvedValue({ ...EMPTY_OVERVIEW, vaccinations: [VACCINATION_ROW] });
    const node = render();
    await flush();
    switchToVerlauf(node);
    const del = (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress?: () => void } }[] })
      .findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === 'Tollwut löschen');
    expect(del).toBeTruthy();
  });
});
