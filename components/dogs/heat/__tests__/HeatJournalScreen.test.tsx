import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { HeatJournalScreen } from '../HeatJournalScreen';
import { fmtDate } from '@/features/dogs/heatCycles';
import type { Dog } from '@/types';
const mockLoad = jest.fn(); const mockSave = jest.fn(); const mockEnd = jest.fn(); const mockPush = jest.fn(); const mockReplace = jest.fn(); const mockGuard = jest.fn();
let mockUser = 'owner'; let mockCounter = 0;
const mockRouter = { push: mockPush, replace: mockReplace, back: jest.fn() };
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return { useRouter: () => mockRouter, useFocusEffect: (fn: () => unknown) => React.useEffect(fn, [fn]) };
});
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ dispatch: jest.fn() }), usePreventRemove: (...a: unknown[]) => mockGuard(...a) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockCounter}` }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@/components/ui/DateField', () => ({ DateField: 'DateField' }));
jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => ({ isPro: true, loading: false }) }));
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: mockUser } }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ locale: 'de' }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/dogs/heatCycles', () => ({ ...jest.requireActual('@/features/dogs/heatCycles'), getHeatCycleDetails: (...args: unknown[]) => mockLoad(...args) }));
jest.mock('@/features/dogs/heatJournal', () => ({ ...jest.requireActual('@/features/dogs/heatJournal'), saveDailyHeatRows: (...args: unknown[]) => mockSave(...args), finishRecordedHeat: (...args: unknown[]) => mockEnd(...args) }));
const dog = { id: 'dog', name: 'Luna', gender: 'female', owner_id: 'owner' } as Dog;
const cycle = { id: 'cycle', dogId: 'dog', startDate: '2026-01-01', endDate: null, status: 'active', notes: 'Old cycle note', phase: 'custom legacy', createdAt: '' };
const legacy = { id: 'observation', heatCycleId: 'cycle', date: '2026-01-02', type: 'Legacy custom', value: 'Original value', notes: 'Original note', createdAt: '' };
let node: ReactTestRenderer;
const nodesOf = (type: unknown) => (node.root as unknown as { findAllByType: (type: unknown) => { props: { children?: unknown; value?: string; accessibilityLabel?: string; onPress: () => void; onChangeText?: (text: string) => void; disabled?: boolean } }[] }).findAllByType(type);
const text = () => nodesOf(Text).map(n => Array.isArray(n.props.children) ? n.props.children.join('') : n.props.children).join(' ') + nodesOf(TextInput).map(n => n.props.value).join(' ');
const button = (label: string) => nodesOf(TouchableOpacity).find(n => n.props.accessibilityLabel === label)!;
async function tap(label: string) { await act(async () => { button(label).props.onPress(); }); }
async function render() { await act(async () => { node = TestRenderer.create(<HeatJournalScreen dog={dog} />); }); }
beforeEach(() => { mockUser = 'owner'; mockCounter = 0; mockLoad.mockReset().mockResolvedValue({ cycles: [cycle], phases: [], observations: [legacy] }); mockSave.mockReset().mockResolvedValue(undefined); mockEnd.mockReset().mockResolvedValue(undefined); mockPush.mockReset(); mockGuard.mockReset(); });
afterEach(() => { if (node) act(() => node.unmount()); });
it('shows actual records and opens observation details without altering them', async () => {
  await render(); expect(text()).toContain('Luna'); expect(text()).toContain('Original note'); expect(text()).toContain('Original value');
  await tap('Alle Beobachtungen ansehen'); expect(mockPush).toHaveBeenCalledWith('/dog-heat/cycle'); expect(mockSave).not.toHaveBeenCalled();
});
it('requires an explicit observation, then saves selected bleeding plus a note in a single request', async () => {
  await render(); await tap('Beobachtung hinzufügen'); expect(button('Beobachtung speichern').props.disabled).toBe(true);
  await tap('Keine'); await act(async () => node.root.findByType(TextInput).props.onChangeText('Blutung aufgehört'));
  await tap('Beobachtung speichern');
  expect(mockSave).toHaveBeenCalledTimes(1); const rows = mockSave.mock.calls[0][3];
  expect(rows.map((r: { type: string }) => r.type)).toEqual(['Blutung', 'Notiz']); expect(rows[0].value).toBe('Keine');
  expect(mockEnd).not.toHaveBeenCalled(); expect(text()).toContain('Beobachtung gespeichert.');
});
it('preserves entered text and stable row IDs on a failed save and retry', async () => {
  mockSave.mockRejectedValueOnce(new Error('offline'));
  await render(); await tap('Beobachtung hinzufügen'); await act(async () => node.root.findByType(TextInput).props.onChangeText('Keep this'));
  await tap('Beobachtung speichern'); expect(text()).toContain('Keep this'); expect(text()).toContain('Speichern nicht bestätigt');
  expect(node.root.findByType(TextInput).props.editable).toBe(false);
  await tap('Erneut versuchen'); expect(mockSave.mock.calls[1][3]).toEqual(mockSave.mock.calls[0][3]);
});
it('keeps loaded observations on a refresh error', async () => {
  await render(); mockLoad.mockRejectedValue(new Error('offline'));
  await act(async () => node.root.findByType(RefreshControl).props.onRefresh());
  expect(text()).toContain('Original note'); expect(text()).toContain('Daten konnten nicht geladen');
});
it('blocks duplicate taps while the first save is pending', async () => {
  let finish!: () => void; mockSave.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await render(); await tap('Beobachtung hinzufügen'); await tap('Leicht');
  const press = button('Beobachtung speichern').props.onPress;
  await act(async () => { press(); press(); }); expect(mockSave).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});
it('read-only users see history but no write actions', async () => {
  mockUser = 'trainer'; await render(); expect(button('Beobachtung hinzufügen')).toBeUndefined(); expect(button('Läufigkeit beenden')).toBeUndefined(); expect(text()).toContain('Original note');
});
it('shows empty state only after a successful empty read', async () => {
  mockLoad.mockResolvedValue({ cycles: [], phases: [], observations: [] }); await render(); expect(button('Beginn eintragen')).toBeDefined();
  await tap('Beginn eintragen'); expect(mockPush).toHaveBeenCalledWith({ pathname: '/dog-heat-new', params: { id: 'dog', historical: '0' } });
});
it('does not offer creating a cycle after an initial read failure', async () => {
  mockLoad.mockRejectedValue(new Error('offline')); await render(); expect(button('Beginn eintragen')).toBeUndefined(); expect(text()).toContain('Daten konnten nicht geladen');
});
it('ending requires a separate explicit action; a selected bleeding option never ends the cycle', async () => {
  await render(); await tap('Läufigkeit beenden'); expect(text()).toContain('Wenn nur die Blutung aufgehört'); expect(mockEnd).not.toHaveBeenCalled();
  await tap('Ende speichern'); expect(mockEnd).toHaveBeenCalledWith('dog', 'cycle', 'owner', expect.any(String));
});
it('cancel requires confirmation when a draft is dirty', async () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(); await tap('Beobachtung hinzufügen'); await tap('Leicht'); await tap('Abbrechen');
  expect(spy).toHaveBeenCalledWith('Ungespeicherte Eingaben verwerfen?', undefined, expect.any(Array)); expect(button('Beobachtung speichern')).toBeDefined();
  expect(mockGuard).toHaveBeenLastCalledWith(true, expect.any(Function)); spy.mockRestore();
});

describe('restored forecast and breeding overview', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 24, 12)); });
  afterEach(() => jest.useRealTimers());
  const old = { ...cycle, id: 'old', startDate: '2026-01-01', endDate: '2026-01-20', status: 'completed' };
  const last = { ...old, id: 'last', startDate: '2026-06-30', endDate: '2026-07-20' };
  it('restores next date/countdown from historical intervals without writes, and keeps them on refresh failure', async () => {
    mockLoad.mockResolvedValue({ cycles: [last, old], phases: [], observations: [] });
    await render(); expect(text()).toContain(fmtDate('2026-12-27')!); expect(text()).toContain('In etwa 64 Tagen'); expect(text()).toContain('bisherigen Zyklusabständen');
    expect(mockSave).not.toHaveBeenCalled(); expect(mockEnd).not.toHaveBeenCalled();
    mockLoad.mockRejectedValue(new Error('offline')); await act(async () => node.root.findByType(RefreshControl).props.onRefresh());
    expect(text()).toContain('In etwa 64 Tagen'); expect(text()).toContain('Daten konnten nicht geladen');
  });
  it('marks a single historical cycle as a rough estimate and ignores future starts for calculation', async () => {
    mockLoad.mockResolvedValue({ cycles: [last, { ...old, id: 'future', startDate: '2027-01-01', endDate: null }], phases: [], observations: [] });
    await render(); expect(text()).toContain('In etwa 64 Tagen'); expect(text()).toContain('Grobe Schätzung'); expect(text()).toContain(fmtDate('2027-01-01')!);
  });
  it.each([['2026-04-27', 'Voraussichtlich heute'], ['2026-04-26', 'Geschätzter Termin war gestern']])('handles countdown boundary %s', async (startDate, expected) => {
    mockLoad.mockResolvedValue({ cycles: [{ ...old, startDate, endDate: '2026-05-10' }], phases: [], observations: [] });
    await render(); expect(text()).toContain(expected);
  });
  it('does not fabricate a prediction for an empty history', async () => {
    mockLoad.mockResolvedValue({ cycles: [], phases: [], observations: [] }); await render(); expect(text()).not.toContain('Nächste Läufigkeit');
  });
  it('opens existing calendar and owner correction details, displays recorded phases', async () => {
    mockLoad.mockResolvedValue({ cycles: [last], phases: [{ id: 'phase', heatCycleId: 'last', phaseType: 'Östrus', startDate: '2026-07-09', endDate: '2026-07-15' }], observations: [] });
    await render(); expect(text()).toContain(`Östrus · ${fmtDate('2026-07-09')} – ${fmtDate('2026-07-15')}`);
    await tap('Kalender ansehen'); expect(mockPush).toHaveBeenLastCalledWith('/dog-heat-calendar/dog');
    await tap('Eintrag bearbeiten oder löschen'); expect(mockPush).toHaveBeenLastCalledWith('/dog-heat/last');
  });
  it('saves explicitly observed standing and discharge on the selected date without ending the cycle', async () => {
    await render(); await tap('Beobachtung hinzufügen');
    await tap('Zuchtbeobachtungen'); await tap('Stehtag beobachtet');
    await act(async () => nodesOf(TextInput).find(n => n.props.accessibilityLabel === 'Ausfluss (Farbe, Konsistenz, Geruch)')!.props.onChangeText!('klar, dünnflüssig'));
    await tap('Beobachtung speichern');
    expect(mockSave.mock.calls[0][3]).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'Standreflex', date: '2026-10-24' }), expect.objectContaining({ type: 'Ausfluss', value: 'klar, dünnflüssig', date: '2026-10-24' })]));
    expect(mockEnd).not.toHaveBeenCalled();
  });
});

// A completed/discarded observation must never seed another day's form.
it.each(['saved', 'discarded'])('clears discharge before a new observation after %s draft', async action => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    await render(); await tap('Beobachtung hinzufügen'); await tap('Zuchtbeobachtungen');
    await act(async () => nodesOf(TextInput).find(n => n.props.accessibilityLabel === 'Ausfluss (Farbe, Konsistenz, Geruch)')!.props.onChangeText!('previous observation'));
    if (action === 'saved') await tap('Beobachtung speichern');
    else {
      await tap('Abbrechen');
      const choices = spy.mock.calls[spy.mock.calls.length - 1][2]!;
      await act(async () => choices.find(choice => choice.style === 'destructive')!.onPress!());
    }
    await tap('Beobachtung hinzufügen'); await tap('Zuchtbeobachtungen');
    expect(nodesOf(TextInput).find(n => n.props.accessibilityLabel === 'Ausfluss (Farbe, Konsistenz, Geruch)')!.props.value).toBe('');
    expect(button('Beobachtung speichern').props.disabled).toBe(true);
  } finally { spy.mockRestore(); }
});
