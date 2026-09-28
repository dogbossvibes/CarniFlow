// ANYVO — standardized long-press delete (28.09.2026). Läufigkeit → Verlauf
// ("Historie") is the FIRST screen this pattern was added to, matching the
// physical-device report: normal tap opens the cycle unchanged (app/dog-heat/
// [id].tsx); a NEW long press (delayLongPress=350, matching the established
// ANYVO convention already shipped in app/track/historie.tsx) opens the SAME
// confirmation + deletes via the SAME existing deleteHeatCycle service already
// used by every other delete entry point for this record type (the detail
// screen's own delete button, the Hub preview's trash icon) — one
// authoritative delete path, reused, not duplicated. Long press itself never
// deletes; only tapping the confirmation's destructive "Löschen" does.
// Ownership is checked explicitly (dog_heat_cycles RLS grants SELECT to a
// connected, accepted trainer too, but DELETE to the owner only — see
// DOG_HEAT_CYCLES.sql) since HeatCycle itself carries no owner_id in its
// mapped shape.
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, TouchableOpacity } from 'react-native';
import DogHeatCalendarScreen from '@/app/dog-heat-calendar/[id]';
import type { HeatCycle } from '@/features/dogs/heatCycles';

const mockGetHeatCycleDetails = jest.fn();
const mockDeleteHeatCycle = jest.fn();
const mockGetDogById = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
    useLocalSearchParams: () => ({ id: 'dog-1' }),
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
jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => ({ isPro: true, loading: false }) }));
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: 'owner-1' } }) }));
jest.mock('@/services/dogs', () => ({ getDogById: (...a: unknown[]) => mockGetDogById(...a) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn(), toast: null }) }));
jest.mock('@/i18n', () => ({
  useT: () => ({
    t: (key: string) => ({
      'dog.deleteHeatTitle': 'Läufigkeit löschen?',
      'dog.deleteEntryBody': 'Dieser Läufigkeitseintrag wird dauerhaft gelöscht.',
      'common.cancel': 'Abbrechen',
      'common.delete': 'Löschen',
    }[key] ?? key),
  }),
}));
// heatCycles.ts imports lib/supabase (→ AsyncStorage) at module scope; since
// the mock below needs requireActual (for the pure date/duration helpers the
// screen also imports), that real module load must not hit the native
// AsyncStorage module in this Jest environment.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/dogs/heatCycles', () => {
  const actual = jest.requireActual('@/features/dogs/heatCycles');
  return {
    ...actual,
    getHeatCycleDetails: (...a: unknown[]) => mockGetHeatCycleDetails(...a),
    deleteHeatCycle: (...a: unknown[]) => mockDeleteHeatCycle(...a),
  };
});

const CYCLE_OLD: HeatCycle = { id: 'cyc-old', dogId: 'dog-1', startDate: '2026-02-01', endDate: '2026-02-21', status: 'completed', notes: null, phase: null, createdAt: '2026-02-01T00:00:00Z' };
const CYCLE_NEW: HeatCycle = { id: 'cyc-new', dogId: 'dog-1', startDate: '2026-08-12', endDate: '2026-09-01', status: 'completed', notes: null, phase: null, createdAt: '2026-08-12T00:00:00Z' };

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DogHeatCalendarScreen />); });
  return node;
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }

function findHistoryRows(node: ReactTestRenderer) {
  return (node.root as unknown as {
    findAllByType: (t: unknown) => { props: { onPress?: () => void; onLongPress?: () => void; accessibilityLabel?: string } }[];
  }).findAllByType(TouchableOpacity).filter((c) => typeof c.props.accessibilityLabel === 'string' && c.props.accessibilityLabel.includes('lange drücken zum Löschen'));
}

beforeEach(() => {
  mockPush.mockReset();
  mockGetDogById.mockReset().mockResolvedValue({ data: { id: 'dog-1', owner_id: 'owner-1' }, error: null });
  mockDeleteHeatCycle.mockReset().mockResolvedValue({ data: null, error: null });
  mockGetHeatCycleDetails.mockReset().mockResolvedValue({ cycles: [CYCLE_NEW, CYCLE_OLD], phases: [], observations: [] });
});

describe('Läufigkeit Verlauf (Historie): normal tap unchanged', () => {
  it('tapping a history card still opens exactly that cycle', async () => {
    const node = render();
    await flush();
    act(() => { findHistoryRows(node)[0].props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/dog-heat/cyc-new');
  });
});

describe('Läufigkeit Verlauf (Historie): long-press delete', () => {
  it('a history card exposes a long-press delete action for the owner', async () => {
    const node = render();
    await flush();
    const rows = findHistoryRows(node);
    expect(rows.length).toBe(2);
    expect(typeof rows[0].props.onLongPress).toBe('function');
  });

  it('long press alone does not delete — only confirming does', async () => {
    const node = render();
    await flush();
    act(() => { findHistoryRows(node)[0].props.onLongPress?.(); });
    expect(mockDeleteHeatCycle).not.toHaveBeenCalled();
  });

  it('long press opens the confirmation dialog with the shared Läufigkeit copy', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const node = render();
    await flush();
    act(() => { findHistoryRows(node)[0].props.onLongPress?.(); });
    expect(alertSpy).toHaveBeenCalledWith(
      'Läufigkeit löschen?',
      'Dieser Läufigkeitseintrag wird dauerhaft gelöscht.',
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });

  it('cancelling the confirmation does not delete', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'cancel')?.onPress?.();
    });
    const node = render();
    await flush();
    act(() => { findHistoryRows(node)[0].props.onLongPress?.(); });
    await flush();
    expect(mockDeleteHeatCycle).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('confirming deletes exactly the selected cycle id — the newer row targets cyc-new, not cyc-old', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const node = render();
    await flush();
    act(() => { findHistoryRows(node)[0].props.onLongPress?.(); });
    await flush();
    expect(mockDeleteHeatCycle).toHaveBeenCalledTimes(1);
    expect(mockDeleteHeatCycle).toHaveBeenCalledWith('cyc-new');
    alertSpy.mockRestore();
  });

  it('deleting one cycle never targets the sibling cycle — the older row targets cyc-old', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const node = render();
    await flush();
    act(() => { findHistoryRows(node)[1].props.onLongPress?.(); });
    await flush();
    expect(mockDeleteHeatCycle).toHaveBeenCalledWith('cyc-old');
    expect(mockDeleteHeatCycle).not.toHaveBeenCalledWith('cyc-new');
    alertSpy.mockRestore();
  });

  it('a successful delete refreshes the list — getHeatCycleDetails is called again', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const node = render();
    await flush();
    const callsBefore = mockGetHeatCycleDetails.mock.calls.length;
    act(() => { findHistoryRows(node)[0].props.onLongPress?.(); });
    await flush();
    expect(mockGetHeatCycleDetails.mock.calls.length).toBeGreaterThan(callsBefore);
    alertSpy.mockRestore();
  });

  it('a failed delete leaves the row visible and never pretends to have succeeded', async () => {
    mockDeleteHeatCycle.mockResolvedValue({ data: null, error: { message: 'network' } });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const node = render();
    await flush();
    const callsBefore = mockGetHeatCycleDetails.mock.calls.length;
    act(() => { findHistoryRows(node)[0].props.onLongPress?.(); });
    await flush();
    expect(mockGetHeatCycleDetails.mock.calls.length).toBe(callsBefore); // never refreshed — nothing to "undo"
    expect(findHistoryRows(node)).toHaveLength(2); // both rows still rendered, none removed locally
    alertSpy.mockRestore();
  });
});

describe('Läufigkeit Verlauf (Historie): ownership gating', () => {
  it('a non-owner (connected/accepted trainer, read-only per dog_heat_cycles RLS) never sees a long-press delete action', async () => {
    mockGetDogById.mockResolvedValue({ data: { id: 'dog-1', owner_id: 'someone-else' }, error: null });
    const node = render();
    await flush();
    expect(findHistoryRows(node)).toHaveLength(0);
  });

  it('a non-owner can still tap a history card normally to view it', async () => {
    mockGetDogById.mockResolvedValue({ data: { id: 'dog-1', owner_id: 'someone-else' }, error: null });
    const node = render();
    await flush();
    const cards = (node.root as unknown as { findAllByType: (t: unknown) => { props: { onPress?: () => void } }[] })
      .findAllByType(TouchableOpacity).filter((c) => typeof c.props.onPress === 'function');
    expect(cards.length).toBeGreaterThan(0);
  });
});
