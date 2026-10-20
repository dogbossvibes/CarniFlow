// ANYVO Gesture UX v1 — Training rollout (30.09.2026). Dedicated suite for
// the gesture-specific wiring app/training-journal.tsx gained in this
// patch: swipe/long-press for non-track (unit/session) rows only. General
// journal behavior (filters, search, pagination, the pre-existing
// track-delete flow) is already covered by app/__tests__/
// training-journal.test.tsx and is intentionally not duplicated here.
import 'react-native-gesture-handler/jestSetup';

import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import TrainingJournalScreen from '@/app/training-journal';
import type { FeedItem } from '@/services/trainingFeed';
jest.mock('@/services/trainingDocumentService', () => ({ listServerTrainingFocuses: async () => ({ data: [], error: null }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockRefresh = jest.fn(() => Promise.resolve());
const mockDeleteFeedItem = jest.fn((_item?: FeedItem) => Promise.resolve({ error: null as string | null }));
let mockFeed: FeedItem[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));
// Raw-key passthrough (established convention for gesture-wiring suites,
// e.g. app/dog-command/__tests__/command-list-gesture-ux.test.tsx) — makes
// assertions independent of which locale i18n happens to default to.
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key, locale: 'de-CH' }) }));
jest.mock('@/hooks/useDogs', () => ({
  useDogs: () => ({ dogs: [{ id: 'dogA', name: 'Malu' }], loading: false, error: null, refresh: jest.fn() }),
}));
jest.mock('@/hooks/useTrainingFeed', () => ({
  useTrainingFeed: () => ({ feed: mockFeed, loading: false, refresh: mockRefresh }),
}));
jest.mock('@/services/deleteTraining', () => ({
  deleteFeedItem: (item: FeedItem) => mockDeleteFeedItem(item),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});

function mkUnit(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: over.id ?? 'u1', owner_id: 'u1', dog_id: over.dog_id ?? 'dogA',
    session_date: over.session_date ?? '2026-08-02', started_at: null, ended_at: null,
    duration_sec: over.duration_sec ?? null, rating: over.rating ?? null, score: null, notes: over.notes ?? null,
    photos: [], videos: [], audio_files: [],
    motivation: null, konzentration: null, praezision: null, ausdauer: null, trieblage: null, impulskontrolle: null,
    shared_with_trainer: false, status: 'completed', created_at: over.created_at ?? '2026-08-02T10:00:00Z',
    dog: over.dog ?? { name: 'Malu' },
    exercises: over.exercises ?? [{ discipline: 'Unterordnung', exercise_name: 'Fuss', rating: null, notes: null, duration_sec: null, seq_index: 0 }],
    source: over.source ?? 'unit',
    distance_meters: null,
  };
}
function mkTrack(over: Partial<FeedItem> = {}): FeedItem {
  return {
    ...mkUnit(over), source: 'track',
    exercises: [{ discipline: 'Fährte', exercise_name: 'GPS-Fährte', rating: null, notes: null, duration_sec: null, seq_index: 0 }],
  };
}

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { for (const node of mounted.splice(0)) node.unmount(); }); });
jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<TrainingJournalScreen />); });
  mounted.push(node);
  return node;
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

// The main row is identified structurally (contains the discipline text) —
// not by tree-order index, since AnyvoSwipeRow's action buttons and the
// long-press menu's buttons are also TouchableOpacity instances in the
// same tree.
function findRow(node: ReactTestRenderer, textMatch: string) {
  return (node.root as unknown as {
    findAll: (p: (c: { findAllByType: (t: unknown) => { props: { children: unknown } }[] }) => boolean) => { props: { onPress?: () => void; onLongPress?: () => void; accessibilityLabel?: string } }[];
  }).findAll((c) => c.findAllByType(Text).some((t) => t.props.children === textMatch))
    .find((c) => (c as unknown as { type: unknown }).type === TouchableOpacity);
}
function findAction(node: ReactTestRenderer, label: string) {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress?: () => void } }[] })
    .findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === label);
}
function findMenuAction(node: ReactTestRenderer, testID: string) {
  return (node.root as unknown as { findAllByProps: (p: object) => { props: { onPress?: () => void } }[] })
    .findAllByProps({ testID })[0];
}
function findAllByTestIdPrefix(node: ReactTestRenderer, testID: string) {
  return (node.root as unknown as { findAllByProps: (p: object) => unknown[] }).findAllByProps({ testID });
}
function swipeableCount(node: ReactTestRenderer): number {
  return (node.root as unknown as { findAllByType: (t: unknown) => unknown[] }).findAllByType(ReanimatedSwipeable).length;
}
beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockClear();
  mockDeleteFeedItem.mockReset().mockResolvedValue({ error: null });
});

describe('Trainingsjournal Gesture UX v1 — 1. Tap öffnet bestehenden Detailflow', () => {
  it('Tap auf einen unit-Eintrag navigiert zu /unit/detail wie bisher', () => {
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findRow(node, 'Unterordnung')!.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/unit/detail', params: { id: 'u1' } });
  });

  it('Tap auf einen legacy session-Eintrag navigiert zu /training/<id> wie bisher', () => {
    mockFeed = [mkUnit({ id: 's1', source: 'session' })];
    const node = render();
    act(() => { findRow(node, 'Unterordnung')!.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/training/s1');
  });
});

describe('Trainingsjournal Gesture UX v1 — 2. Swipe zeigt erwartete Actions', () => {
  it('ein unit-Eintrag mountet eine ReanimatedSwipeable-Instanz mit Bearbeiten + Löschen', () => {
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    expect(swipeableCount(node)).toBe(1);
    expect(findAction(node, 'common.edit')).toBeTruthy();
    expect(findAction(node, 'training.deleteA11y')).toBeTruthy();
  });
});

describe('Trainingsjournal Gesture UX v1 — 3. Swipe allein löscht nie', () => {
  it('das Rendern der Zeile ruft deleteFeedItem nicht von selbst auf', () => {
    mockFeed = [mkUnit({ id: 'u1' })];
    render();
    expect(mockDeleteFeedItem).not.toHaveBeenCalled();
  });
});

describe('Trainingsjournal Gesture UX v1 — 4. Delete nutzt bestehenden Handler / 5. Bestätigung bleibt bestehen', () => {
  it('Löschen (Swipe-Action) öffnet die bestehende Bestätigung mit der bestehenden Training-Copy', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findAction(node, 'training.deleteA11y')!.props.onPress?.(); });
    expect(spy).toHaveBeenCalledWith('training.deleteTitle', 'training.deleteConfirm', expect.any(Array), expect.any(Object));
    expect(mockDeleteFeedItem).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('Bestätigen ruft deleteFeedItem mit exakt dem gewählten Eintrag auf und aktualisiert danach den Feed', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'destructive')?.onPress?.(); });
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findAction(node, 'training.deleteA11y')!.props.onPress?.(); });
    await flush();
    expect(mockDeleteFeedItem).toHaveBeenCalledTimes(1);
    expect((mockDeleteFeedItem.mock.calls[0][0] as FeedItem).id).toBe('u1');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('Abbrechen löscht nicht und aktualisiert den Feed nicht', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'cancel')?.onPress?.(); });
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findAction(node, 'training.deleteA11y')!.props.onPress?.(); });
    await flush();
    expect(mockDeleteFeedItem).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('bei Delete-Fehler bleibt der Eintrag sichtbar, der Feed wird nicht refetcht, und die bestehende Fehlermeldung erscheint', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'destructive')?.onPress?.(); });
    mockDeleteFeedItem.mockResolvedValueOnce({ error: 'row-level security violation' });
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findAction(node, 'training.deleteA11y')!.props.onPress?.(); });
    await flush();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(spy.mock.calls.some((c) => c[0] === 'journal.deleteTrainingError')).toBe(true);
    expect(findRow(node, 'Unterordnung')).toBeTruthy();
    spy.mockRestore();
  });
});

describe('Trainingsjournal Gesture UX v1 — 6. Async-Reentrancy / 7. keine unhandled rejection / 8. Retry nach Fehler', () => {
  it('während die Löschbestätigung noch offen ist ("pending"), startet ein zweiter/dritter Tap auf Löschen keinen weiteren Alert', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {}); // nie automatisch bestätigen — bleibt "pending"
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findAction(node, 'training.deleteA11y')!.props.onPress?.(); });
    act(() => { findAction(node, 'training.deleteA11y')!.props.onPress?.(); });
    act(() => { findAction(node, 'training.deleteA11y')!.props.onPress?.(); });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('ein fehlgeschlagenes Löschen erzeugt keine unhandled promise rejection', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'destructive')?.onPress?.(); });
    mockDeleteFeedItem.mockResolvedValueOnce({ error: 'network' });
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    try {
      act(() => { findAction(node, 'training.deleteA11y')!.props.onPress?.(); });
      await flush();
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
      spy.mockRestore();
    }
  });

  it('nach einem fehlgeschlagenen Löschversuch bleibt die Aktion erneut auslösbar und kann danach erfolgreich sein', async () => {
    mockDeleteFeedItem.mockResolvedValueOnce({ error: 'network' }).mockResolvedValueOnce({ error: null });
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'destructive')?.onPress?.(); });
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findAction(node, 'training.deleteA11y')!.props.onPress?.(); });
    await flush();
    act(() => { findAction(node, 'training.deleteA11y')!.props.onPress?.(); }); // retry
    await flush();
    expect(mockDeleteFeedItem).toHaveBeenCalledTimes(2);
    expect(mockRefresh).toHaveBeenCalledTimes(1); // nur beim erfolgreichen zweiten Versuch
    spy.mockRestore();
  });
});

describe('Trainingsjournal Gesture UX v1 — 9. Long Press zeigt nur bestehende erlaubte Aktionen / 10. löscht nicht direkt', () => {
  it('Long Press öffnet ein Menü mit genau Öffnen/Bearbeiten/Löschen — kein Wiederholen, kein Teilen', () => {
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findRow(node, 'Unterordnung')!.props.onLongPress?.(); });
    expect(findMenuAction(node, 'journal-action-menu-open')).toBeTruthy();
    expect(findMenuAction(node, 'journal-action-menu-edit')).toBeTruthy();
    expect(findMenuAction(node, 'journal-action-menu-delete')).toBeTruthy();
    expect(findAllByTestIdPrefix(node, 'journal-action-menu-repeat')).toHaveLength(0);
    expect(findAllByTestIdPrefix(node, 'journal-action-menu-share')).toHaveLength(0);
  });

  it('Long Press allein löscht/bearbeitet/navigiert nicht — nur ein expliziter Tap im Menü tut das', () => {
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findRow(node, 'Unterordnung')!.props.onLongPress?.(); });
    expect(mockDeleteFeedItem).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('"Bearbeiten" im Menü navigiert zur bestehenden Edit-Route /unit/document', () => {
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findRow(node, 'Unterordnung')!.props.onLongPress?.(); });
    act(() => { findMenuAction(node, 'journal-action-menu-edit')!.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/unit/document', params: { id: 'u1' } });
  });

  it('"Öffnen" im Menü navigiert zur bestehenden Detailansicht', () => {
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findRow(node, 'Unterordnung')!.props.onLongPress?.(); });
    act(() => { findMenuAction(node, 'journal-action-menu-open')!.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/unit/detail', params: { id: 'u1' } });
  });

  it('"Löschen" im Menü öffnet dieselbe Bestätigung wie die Swipe-Action — keine zweite Delete-Logik', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    act(() => { findRow(node, 'Unterordnung')!.props.onLongPress?.(); });
    act(() => { findMenuAction(node, 'journal-action-menu-delete')!.props.onPress?.(); });
    expect(spy).toHaveBeenCalledWith('training.deleteTitle', 'training.deleteConfirm', expect.any(Array), expect.any(Object));
    spy.mockRestore();
  });

  it('Bearbeiten im Long-Press-Menü ist für den legacy session-Eintrag ebenfalls verdrahtet (Edit-Query-Param-Route)', () => {
    mockFeed = [mkUnit({ id: 's1', source: 'session' })];
    const node = render();
    act(() => { findRow(node, 'Unterordnung')!.props.onLongPress?.(); });
    act(() => { findMenuAction(node, 'journal-action-menu-edit')!.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/training/[id]', params: { id: 's1', edit: 'true' } });
  });
});

describe('Trainingsjournal Gesture UX v1 — 11. Fährteneintrag im Journal bleibt unverändert', () => {
  it('ein track-Eintrag mountet keine ReanimatedSwipeable-Instanz', () => {
    mockFeed = [mkTrack({ id: 't1' })];
    const node = render();
    expect(swipeableCount(node)).toBe(0);
  });

  it('ein track-Eintrag hat weiterhin nur den bestehenden inline Löschen-Button — kein Bearbeiten-Swipe, kein Long-Press-Menü', () => {
    mockFeed = [mkTrack({ id: 't1' })];
    const node = render();
    const del = (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string } }[] })
      .findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === 'journal.deleteTrackA11y');
    expect(del).toBeTruthy();
    expect(findAction(node, 'common.edit')).toBeUndefined();
    act(() => { findRow(node, 'Fährte')!.props.onLongPress?.(); });
    expect(findMenuAction(node, 'journal-action-menu-open')).toBeUndefined();
  });

  it('gemischter Feed: nur der unit-Eintrag bekommt Gesture-Actions, der track-Eintrag bleibt exakt Legacy', () => {
    mockFeed = [mkTrack({ id: 't1' }), mkUnit({ id: 'u1' })];
    const node = render();
    expect(swipeableCount(node)).toBe(1); // nur der unit-Eintrag
  });

  it('track-Löschflow (bestehende Fährten-Copy) bleibt exakt unverändert erreichbar', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFeed = [mkTrack({ id: 't1' })];
    const node = render();
    const del = (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress?: () => void } }[] })
      .findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === 'journal.deleteTrackA11y');
    act(() => { del!.props.onPress?.(); });
    expect(spy).toHaveBeenCalledWith('journal.deleteTrackTitle', 'journal.deleteTrackBody', expect.any(Array));
    spy.mockRestore();
  });
});

describe('Trainingsjournal Gesture UX v1 — Accessibility', () => {
  it('accessibilityLabel weist bei vorhandenen Aktionen auf "lange drücken für Aktionen" hin', () => {
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    const row = findRow(node, 'Unterordnung')!;
    expect((row.props as unknown as { accessibilityLabel?: string }).accessibilityLabel).toContain('lange drücken für Aktionen');
  });

  it('Bearbeiten/Löschen sind über accessibilityActions erreichbar, ohne die Swipe-Geste auszuführen', () => {
    mockFeed = [mkUnit({ id: 'u1' })];
    const node = render();
    const row = findRow(node, 'Unterordnung')!;
    const actionsProp = (row.props as unknown as { accessibilityActions?: { name: string; label: string }[] }).accessibilityActions;
    expect(actionsProp?.map((a) => a.name)).toEqual(['edit', 'delete']);
  });
});
