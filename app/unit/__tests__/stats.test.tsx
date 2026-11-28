import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import type { FeedItem } from '@/services/trainingFeed';
import StatsScreen from '@/app/unit/stats';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }), useFocusEffect: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/components/analytics/ScoreRing', () => ({ ScoreRing: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

const mockFeed: FeedItem[] = [];
jest.mock('@/hooks/useTrainingFeed', () => ({
  useTrainingFeed: () => ({ feed: mockFeed, loading: false, refresh: jest.fn() }),
}));
const mockDogs = [{ id: 'rex', name: 'Rex' }, { id: 'luna', name: 'Luna' }];
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockDogs, loading: false }) }));
let mockActive = 'rex';
const mockSetActive = jest.fn((id: string) => { mockActive = id; });
jest.mock('@/hooks/useActiveDog', () => ({
  useActiveDog: () => ({ activeDogId: mockActive, activeDog: null, setActiveDog: mockSetActive }),
}));


function item(p: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    owner_id: 'u1', dog_id: 'rex', session_date: '2026-11-20', created_at: '2026-11-20T10:00:00Z',
    duration_sec: 600, rating: null, exercises: [], source: 'unit', ...p,
  } as FeedItem;
}

function strings(node: ReactTestRenderer): string[] {
  return node.root.findAllByType(Text)
    .flatMap(t => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((x): x is string => typeof x === 'string');
}

function press(node: ReactTestRenderer, label: string) {
  const btn = node.root.findAll(n => n.type === TouchableOpacity && n.props.accessibilityLabel === label)[0];
  act(() => { btn.props.onPress(); });
}

describe('StatsScreen pro Hund (#117)', () => {
  beforeEach(() => {
    mockActive = 'rex';
    mockSetActive.mockClear();
    mockFeed.splice(0, mockFeed.length,
      item({ id: 'a', dog_id: 'rex', source: 'track', distance_meters: 1200, duration_sec: 3600 }),
      item({ id: 'b', dog_id: 'luna', source: 'track', distance_meters: 300, duration_sec: 1200 }),
      item({ id: 'c', dog_id: null as unknown as string, source: 'unit', duration_sec: 600 }),
    );
  });

  it('zeigt Distanz und Dauer des aktiven Hundes, «Alle» und «Ohne Hund» separat', () => {
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<StatsScreen />); });
    expect(strings(node)).toEqual(expect.arrayContaining(['Rex', 'Luna', 'training.statsAllDogs', 'training.statsNoDog', '1.2 km', '1h']));

    press(node, 'training.statsAllDogs');
    expect(strings(node)).toEqual(expect.arrayContaining(['1.5 km', '1h 30m']));

    press(node, 'training.statsNoDog');
    expect(strings(node)).toEqual(expect.arrayContaining(['10m']));
    expect(strings(node)).not.toContain('training.trackWork');

    press(node, 'Luna');
    expect(mockSetActive).toHaveBeenCalledWith('luna');
    act(() => { node.update(<StatsScreen />); });
    expect(strings(node)).toEqual(expect.arrayContaining(['300 m', '20m']));
  });

  it('blendet «Ohne Hund» aus, wenn alle Einträge einen Hund haben', () => {
    mockFeed.splice(2, 1);
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<StatsScreen />); });
    expect(strings(node)).not.toContain('training.statsNoDog');
  });
});
