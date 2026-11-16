import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import Screen from '../GroupEvaluationScreen';

// #146: Die Anzeige muss ohne gelegte Linie funktionieren (fremd gelegte Fährte) und sagen, warum sie fehlt.
const T = '50000000-0000-4000-8000-000000000001', G = '10000000-0000-4000-8000-000000000001', S = '30000000-0000-4000-8000-000000000001';
const A = 'a1111111-1111-4111-8111-111111111111', B = 'b2222222-2222-4222-8222-222222222222';
const mockFetch = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: '50000000-0000-4000-8000-000000000001' }),
  useFocusEffect: (cb: () => void | (() => void)) => { const React = jest.requireActual('react'); React.useEffect(cb, [cb]); } }));
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Polyline: 'Polyline', Marker: 'Marker' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea' }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/components/ui/AnyvoCard', () => ({ AnyvoCard: 'AnyvoCard' }));
jest.mock('@/features/contacts/ContactScreenHeader', () => ({ ContactScreenHeader: 'Header' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
// Stabiles Objekt: sonst lädt der Bildschirm bei jedem Rendern neu.
const mockServices = { evaluations: { fetch: (...a: unknown[]) => mockFetch(...a) } };
jest.mock('../groupHub', () => ({ ...jest.requireActual('../groupHub'), useGroupServices: () => mockServices }));

const metrics = { distanceM: 420, durationS: 1120, articlesFound: 2, articlesTotal: 3, deviationAvgM: 4.5, breaks: 1 };
const search = [{ lat: 47.3701, lng: 8.5401 }, { lat: 47.3709, lng: 8.5414 }];
const detail = { trackId: T, groupId: G, sessionId: S, handlerUserId: B, handlerName: 'Bea', layerUserId: A, layerName: 'Sandra',
  dogName: 'Luna', metrics, mine: false, updatedAtMs: 1, laid: [] as { lat: number; lng: number }[], search };

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree.unmount()); jest.clearAllMocks(); });
// Nur sichtbare Texte (toJSON enthält mit refreshControl ein React-Element und lässt sich nicht serialisieren).
const texts = () => JSON.stringify(tree.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children));
const all = (type: string) => tree.root.findAll(n => (n.type as unknown) === type);

it('ohne gelegte Linie: Karte mit der Absuche, kein Startpunkt, Hinweis warum', async () => {
  mockFetch.mockResolvedValue(detail);
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(mockFetch).toHaveBeenCalledWith(T);
  expect(all('MapView')).toHaveLength(1);
  expect(all('MapView')[0].props.accessibilityLabel).toBe('groups.evalMapLabelSearchOnly');
  expect(all('MapView')[0].props.initialRegion.latitude).toBeCloseTo(47.3705, 4);
  expect(all('Polyline')).toHaveLength(1);
  expect(all('Marker')).toHaveLength(0);
  expect(texts()).toContain('groups.evalNoLaidLine');
  expect(texts()).toContain('groups.evalLegendSearchOnly');
  expect(texts()).toContain('420 m');
});

it('mit gelegter Linie (selbst gelegt): beide Linien, Startpunkt, kein Hinweis', async () => {
  mockFetch.mockResolvedValue({ ...detail, layerUserId: B, layerName: 'Bea', laid: [{ lat: 47.37, lng: 8.54 }, { lat: 47.371, lng: 8.5415 }] });
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(all('Polyline')).toHaveLength(2);
  expect(all('Marker')).toHaveLength(1);
  expect(all('Marker')[0].props.coordinate).toEqual({ latitude: 47.37, longitude: 8.54 });
  expect(all('MapView')[0].props.accessibilityLabel).toBe('groups.evalMapLabel');
  expect(texts()).not.toContain('groups.evalNoLaidLine');
  expect(texts()).toContain('"groups.evalLegend"');
});
