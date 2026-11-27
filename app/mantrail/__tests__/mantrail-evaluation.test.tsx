import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { emptyMantrailData } from '@/features/mantrailing/model';

// Übersicht und Auswertung (Spec 02, PR C), mit nachgebildeten Daten.
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => { const { useEffect } = jest.requireActual('react'); useEffect(cb, [cb]); },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k) }) }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: [{ id: 'dog-1', name: 'Malu' }] }) }));
jest.mock('@/features/tracking/components/TrackingMap', () => ({ TrackingMap: () => null }));
const mockList = jest.fn();
const mockDetail = jest.fn();
jest.mock('@/features/mantrailing/history', () => ({
  listMantrails: (...a: unknown[]) => mockList(...a),
  loadMantrailDetail: (...a: unknown[]) => mockDetail(...a),
}));

import Overview from '../index';
import Detail from '../[id]';

const texts = (r: ReactTestRenderer) => r.root.findAllByType(Text)
  .flatMap(n => (Array.isArray(n.props.children) ? n.props.children : [n.props.children])).filter((x: unknown) => typeof x === 'string') as string[];
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const data = (over = {}) => ({ ...emptyMantrailData(), ...over });

beforeEach(() => { mockPush.mockReset(); mockList.mockReset(); mockDetail.mockReset(); mockParams = {}; });

it('Übersicht: Statistik über abgeschlossene Trails, Verlauf öffnet die Auswertung', async () => {
  mockList.mockResolvedValue([
    { id: 'a', dogId: 'dog-1', startedAt: '2026-11-20T10:00:00Z', hasRun: true, dogDistanceM: 800, durationS: 600, source: 'local', data: data({ result: 'found', trailAgeMinutes: 60, environment: 'forest' }) },
    { id: 'b', dogId: 'dog-1', startedAt: '2026-11-19T10:00:00Z', hasRun: true, dogDistanceM: 1200, durationS: 900, source: 'remote', data: data({ result: 'not_found', trailAgeMinutes: 120, environment: 'city' }) },
    { id: 'c', dogId: 'dog-1', startedAt: '2026-11-18T10:00:00Z', hasRun: true, dogDistanceM: 300, durationS: 200, source: 'local', data: data({ negative: true, result: 'negative_correct' }) },
    { id: 'd', dogId: 'dog-1', startedAt: '2026-11-17T10:00:00Z', hasRun: false, dogDistanceM: null, durationS: null, source: 'local', data: data() },
  ]);
  let r!: ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(<Overview />); });
  await flush();
  const s = texts(r);
  expect(s).toContain('3');          // drei abgeschlossene Trails
  expect(s).toContain('50 %');       // 1 von 2 Trails mit Person gefunden
  expect(s).toContain('100 %');      // Negativtrail korrekt
  expect(s).toContain('1200 m');     // längster Trail
  expect(s.some(x => x.includes('mantrail.notRunYet'))).toBe(true);
  const item = r.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')
    .find(n => n.findAllByType(Text).some(tx => String(tx.props.children).includes('Malu · ')));
  act(() => { item!.props.onPress(); });
  expect(mockPush).toHaveBeenCalledWith('/mantrail/a');
});

it('Auswertung: Korridor 25 m, Dauer, Längen und Angaben', async () => {
  mockParams = { id: 'a' };
  mockDetail.mockResolvedValue({
    id: 'a', dogId: 'dog-1', startedAt: '2026-11-20T10:00:00Z', hasRun: true, dogDistanceM: 111, durationS: 605, source: 'local',
    data: data({ result: 'found', indication: 'Hinsetzen', trailAgeMinutes: 130, scentArticle: 'sock', windLay: { fromDeg: 225, speedKmh: 12, source: 'weather' } }),
    trailer: [{ lat: 47, lng: 8 }, { lat: 47.001, lng: 8 }],
    dog: [{ lat: 47, lng: 8 }, { lat: 47.0005, lng: 8.0001 }, { lat: 47.0005, lng: 8.001 }],
  });
  let r!: ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(<Detail />); });
  await flush();
  const s = texts(r);
  expect(s).toContain('10:05');
  expect(s).toContain('111 m');                      // Trailer-Spur ≈ 111 m
  expect(s).toContain('67 %');                       // 2 von 3 Hundepunkten im Korridor
  expect(s.some(x => /^\d+ m$/.test(x) && Number(x.split(' ')[0]) > 25)).toBe(true);   // grösste Abweichung
  expect(s).toContain('mantrail.nearShare:{"m":25}');
  expect(s).toContain('Hinsetzen');
  expect(s).toContain('SW 12 km/h');
  expect(s).toContain('mantrail.scent.sock');
});

it('Auswertung ohne Trailer-Spur: kein Vergleich, nur Hundespur', async () => {
  mockParams = { id: 'n' };
  mockDetail.mockResolvedValue({ id: 'n', dogId: 'dog-1', startedAt: null, hasRun: true, dogDistanceM: 50, durationS: 60, source: 'local',
    data: data({ trailSource: 'none' }), trailer: [], dog: [{ lat: 47, lng: 8 }, { lat: 47.0004, lng: 8 }] });
  let r!: ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(<Detail />); });
  await flush();
  expect(texts(r)).toContain('mantrail.noComparison');
});
