import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import TrainingJournalScreen from '@/app/training-journal';
import type { FeedItem } from '@/services/trainingFeed';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockRefresh = jest.fn(() => Promise.resolve());
const mockDeleteFeedItem = jest.fn((_item?: FeedItem) => Promise.resolve({ error: null as string | null }));
let mockFeed: FeedItem[] = [];

const mockLabels: Record<string, string> = {
  'journal.title': 'Journal',
  'journal.subtitle': 'Alle Trainings an einem Ort',
  'journal.thisYear': 'Dieses Jahr',
  'journal.statTrainings': 'Trainings',
  'journal.statTime': 'Trainingszeit',
  'journal.statDogs': 'Hunde',
  'journal.statDisciplines': 'Sparten',
  'journal.search': 'Suchen',
  'journal.filterPeriod': 'Zeitraum',
  'journal.period.all': 'Alle',
  'journal.period.7d': '7 Tage',
  'journal.period.30d': '30 Tage',
  'journal.period.year': 'Dieses Jahr',
  'journal.allDogs': 'Alle Hunde',
  'journal.allDisciplines': 'Alle Sparten',
  'journal.resetFilters': 'Filter zurücksetzen',
  'journal.emptyTitle': 'Noch keine Trainings',
  'journal.emptyText': 'Dokumentiere dein erstes Training.',
  'journal.emptyCta': 'Training starten',
  'journal.noMatchTitle': 'Keine passenden Trainings gefunden',
  'journal.minutesShort': '{count} Min.',
  'journal.hoursShort': '{count} h',
  'journal.media': 'Medien',
  'journal.group.today': 'Heute',
  'journal.group.yesterday': 'Gestern',
  'journal.group.week': 'Diese Woche',
  'journal.loadMore': 'Mehr laden',
  'common.back': 'Zurück',
  'common.close': 'Schliessen',
  'dog.pointsShort': '{points} Pkt.',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/i18n', () => ({
  useT: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let v = mockLabels[key] ?? key;
      if (params) {
        for (const [k, val] of Object.entries(params)) v = v.replace(`{${k}}`, String(val));
      }
      return v;
    },
    locale: 'de-CH',
  }),
}));

jest.mock('@/hooks/useDogs', () => ({
  useDogs: () => ({ dogs: [
    { id: 'dogA', name: 'Malu' },
    { id: 'dogB', name: 'Yam' },
  ], loading: false, error: null, refresh: jest.fn() }),
}));

jest.mock('@/hooks/useTrainingFeed', () => ({
  useTrainingFeed: () => ({ feed: mockFeed, loading: false, refresh: mockRefresh }),
}));

// Bestehende vereinheitlichte Delete-Fassade mocken (kein Supabase im UI-Test).
jest.mock('@/services/deleteTraining', () => ({
  deleteFeedItem: (item: FeedItem) => mockDeleteFeedItem(item),
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});

function mk(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: over.id ?? 'tr1',
    owner_id: 'u1',
    dog_id: over.dog_id ?? 'dogA',
    session_date: over.session_date ?? '2026-08-02',
    started_at: null, ended_at: null,
    duration_sec: over.duration_sec ?? null,
    rating: over.rating ?? null, score: null, notes: over.notes ?? null,
    photos: [], videos: [], audio_files: [],
    motivation: null, konzentration: null, praezision: null,
    ausdauer: null, trieblage: null, impulskontrolle: null,
    shared_with_trainer: false, status: 'completed',
    created_at: over.created_at ?? '2026-08-02T10:00:00Z',
    dog: over.dog ?? { name: 'Malu' },
    exercises: over.exercises ?? [{ discipline: 'Fährte', exercise_name: 'GPS-Fährte', rating: null, notes: null, duration_sec: over.duration_sec ?? null, seq_index: 0 }],
    source: over.source ?? 'track',
    distance_meters: over.distance_meters ?? null,
  };
}

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<TrainingJournalScreen />); });
  return node;
}

function allStrings(node: ReactTestRenderer): string {
  const texts = (node.root as unknown as { findAllByType: (t: unknown) => { props: { children: unknown } }[] }).findAllByType(Text);
  return texts
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((x): x is string => typeof x === 'string')
    .join(' ');
}

function trackCards(node: ReactTestRenderer): { props: { onPress?: () => void; accessibilityLabel?: string } }[] {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: { onPress?: () => void; accessibilityLabel?: string } }[] })
    .findAllByType(TouchableOpacity)
    .filter((b) => b.props.accessibilityLabel?.startsWith('Fährte'));
}

// Lösch-Buttons tragen das (im Test unmockte) Key-Label 'journal.deleteTrackA11y'
// und kollidieren daher nicht mit der Karten-Filterung oben.
function deleteButtons(node: ReactTestRenderer): { props: { onPress?: () => void } }[] {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: { onPress?: () => void; accessibilityLabel?: string } }[] })
    .findAllByType(TouchableOpacity)
    .filter((b) => b.props.accessibilityLabel === 'journal.deleteTrackA11y');
}

describe('Trainingsjournal — GPS-Fährten (T-40)', () => {
  beforeEach(() => { mockPush.mockReset(); });

  it('zeigt eine GPS-Fährte mit Sparte, Hund, Dauer und Distanz', () => {
    mockFeed = [mk({ id: 'tr1', duration_sec: 1800, distance_meters: 850, notes: 'Flachsfeld' })];
    const node = render();
    const s = allStrings(node);
    expect(s).toContain('Fährte');
    expect(s).toContain('Malu');
    expect(s).toContain('30 Min.');
    expect(s).toContain('850 m');
    expect(s).toContain('Flachsfeld');
    expect(trackCards(node)).toHaveLength(1);
  });

  it('mehrere GPS-Fährten (Malu + Yam) erscheinen je einmal', () => {
    mockFeed = [
      mk({ id: 'tr-malu', dog_id: 'dogA', dog: { name: 'Malu' }, distance_meters: 850 }),
      mk({ id: 'tr-yam', dog_id: 'dogB', dog: { name: 'Yam' }, distance_meters: 620 }),
    ];
    const node = render();
    const s = allStrings(node);
    expect(s).toContain('Malu');
    expect(s).toContain('Yam');
    expect(trackCards(node)).toHaveLength(2);
    expect(trackCards(node).map((c) => c.props.accessibilityLabel)).toEqual([
      expect.stringContaining('Malu'),
      expect.stringContaining('Yam'),
    ]);
  });

  it('keine Duplikate: derselbe Fährten-Eintrag erscheint nur einmal', () => {
    mockFeed = [mk({ id: 'tr1' })];
    const node = render();
    expect(trackCards(node)).toHaveLength(1);
  });

  it('Navigation zur bestehenden Fährten-Detailansicht /track/<id>', () => {
    mockFeed = [mk({ id: 'tr42' })];
    const node = render();
    act(() => { trackCards(node)[0].props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/track/tr42');
  });

  it('ohne GPS-Fährten: keine Fährten-Karte sichtbar', () => {
    mockFeed = [mk({ id: 'u1', source: 'unit', exercises: [{ discipline: 'Obedience', exercise_name: 'Fuss', rating: null, notes: null, duration_sec: null, seq_index: 0 }], dog: { name: 'Malu' } })];
    const node = render();
    expect(trackCards(node)).toHaveLength(0);
    expect(allStrings(node)).toContain('Obedience');
  });
});

describe('Trainingsjournal — Fährte löschen', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRefresh.mockClear();
    mockDeleteFeedItem.mockClear();
    mockDeleteFeedItem.mockResolvedValue({ error: null });
  });

  const lastAlertButtons = (): { text?: string; style?: string; onPress?: () => void | Promise<void> }[] => {
    const spy = Alert.alert as unknown as jest.Mock;
    return (spy.mock.calls[spy.mock.calls.length - 1]?.[2] ?? []) as never;
  };

  it('bietet nur bei Fährteneinträgen eine Löschaktion an', () => {
    mockFeed = [
      mk({ id: 'tr1', source: 'track' }),
      mk({ id: 'u1', source: 'unit', exercises: [{ discipline: 'Obedience', exercise_name: 'Fuss', rating: null, notes: null, duration_sec: null, seq_index: 0 }] }),
    ];
    const node = render();
    expect(deleteButtons(node)).toHaveLength(1);   // nur die Fährte
  });

  it('Löschen bestätigen ruft die Delete-Fassade und aktualisiert den Feed', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFeed = [mk({ id: 'tr42', source: 'track' })];
    const node = render();

    act(() => { deleteButtons(node)[0].props.onPress?.(); });
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBe('journal.deleteTrackTitle');
    expect(spy.mock.calls[0][1]).toBe('journal.deleteTrackBody');

    const del = lastAlertButtons().find((b) => b.style === 'destructive');
    await act(async () => { await del?.onPress?.(); });

    expect(mockDeleteFeedItem).toHaveBeenCalledTimes(1);
    expect((mockDeleteFeedItem.mock.calls[0][0] as FeedItem).id).toBe('tr42');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('Abbrechen löscht nicht und aktualisiert den Feed nicht', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFeed = [mk({ id: 'tr7', source: 'track' })];
    const node = render();

    act(() => { deleteButtons(node)[0].props.onPress?.(); });
    const cancel = lastAlertButtons().find((b) => b.style === 'cancel');
    await act(async () => { await cancel?.onPress?.(); });

    expect(mockDeleteFeedItem).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('bei Delete-Fehler bleibt der Eintrag sichtbar und der Feed wird nicht refetcht', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockDeleteFeedItem.mockResolvedValueOnce({ error: 'row-level security violation' });
    mockFeed = [mk({ id: 'tr9', source: 'track' })];
    const node = render();

    act(() => { deleteButtons(node)[0].props.onPress?.(); });
    const del = lastAlertButtons().find((b) => b.style === 'destructive');
    await act(async () => { await del?.onPress?.(); });

    expect(mockDeleteFeedItem).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();                 // kein Refetch bei Fehler
    expect(spy.mock.calls.some((c) => c[0] === 'journal.deleteError')).toBe(true);
    expect(trackCards(node)).toHaveLength(1);                   // Eintrag bleibt sichtbar
    spy.mockRestore();
  });
});
