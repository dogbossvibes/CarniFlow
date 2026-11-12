import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ContinueTrainingSection } from '../ContinueTrainingSection';

const mockPush = jest.fn();
const mockRefetch = jest.fn();
let mockDogs: { id: string; name: string }[] = [];
let mockState: Record<string, unknown> = {};
const mockRequestedDogs: (string | null | undefined)[] = [];
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ locale: 'de', t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k) }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockDogs }) }));
jest.mock('@/hooks/useDogTrainingSummary', () => ({
  useDogTrainingSummary: (dog: string | null | undefined) => { mockRequestedDogs.push(dog); return { refetch: mockRefetch, ...mockState }; },
}));

const summary = {
  last: { id: 'u1', source: 'unit', date: '2026-11-06', daysAgo: 3, disciplines: ['Unterordnung'],
    exercises: [{ name: 'Sitz', discipline: 'Unterordnung', level: 'festigen', legacyStars: null, trend: 'up' },
      { name: 'Platz', discipline: 'Unterordnung', level: null, legacyStars: 4, trend: null }] },
  previous: [{ id: 'old', source: 'session', date: '2026-11-01', disciplines: ['IGP'], exerciseCount: 1 }],
  openHint: { id: 'h1', text: 'Ruhiger Abschluss', date: '2026-11-06' },
};
let view: ReactTestRenderer;
const texts = () => view.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));
const rows = () => view.root.findAllByType(TouchableOpacity);
const render = () => act(() => { view = TestRenderer.create(<ContinueTrainingSection />); });

beforeEach(() => { mockPush.mockReset(); mockRefetch.mockReset(); mockRequestedDogs.length = 0; mockDogs = [{ id: 'd1', name: 'Yam' }, { id: 'd2', name: 'Malu' }]; mockState = { data: summary, isPending: false, isError: false }; });

// Etappe 3b „Ein Ort pro Hund“: nur noch eine Hundeliste; Details auf der Hundeseite.
describe('ContinueTrainingSection (T-184 Etappe 3b)', () => {
  test('eine Zeile pro Hund mit letztem Training und Hinweis; jede fragt ihren Hund ab', () => {
    render();
    const all = texts();
    expect(all).toContain('dogTraining.listTitle');
    expect(all).toContain('dogTraining.listHint');
    expect(all.filter(x => x === 'Yam' || x === 'Malu')).toEqual(['Yam', 'Malu']);
    expect(all).toContain('continueTraining.lastLine:{"when":"continueTraining.daysAgo:{\\"count\\":3}","discipline":"Unterordnung"}');
    expect(all).toContain('continueTraining.openHint:{"text":"Ruhiger Abschluss"}');
    expect(new Set(mockRequestedDogs)).toEqual(new Set(['d1', 'd2']));
    expect(rows()).toHaveLength(2);
  });

  test('kein doppeltes letztes Training mehr: keine Übungsliste, kein Weiter, kein Verlauf-Link', () => {
    render();
    const all = texts().join(' | ');
    expect(all).not.toContain('Sitz');
    expect(all).not.toContain('continueTraining.next');
    expect(all).not.toContain('continueTraining.history');
    expect(all).not.toContain('continueTraining.earlier');
  });

  test('Tipp auf einen Hund öffnet seine Trainingsseite', () => {
    render();
    act(() => { rows().find(r => r.props.accessibilityLabel.startsWith('dogTraining.open:{"name":"Malu"}'))!.props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/unit/progress', params: { dogId: 'd2' } });
  });

  test('kein Training → Hinweis; Ladefehler → Fehlertext, Zeile bleibt antippbar; laden → kein falscher Leerzustand', () => {
    mockState = { data: { last: null, previous: [], openHint: null }, isPending: false, isError: false };
    render();
    expect(texts()).toContain('continueTraining.none');
    mockState = { data: undefined, isPending: false, isError: true };
    render();
    expect(texts()).toContain('continueTraining.loadError');
    act(() => { rows()[0].props.onPress(); });
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    mockState = { data: undefined, isPending: true, isError: false };
    render();
    expect(texts()).not.toContain('continueTraining.none');
    expect(texts()).not.toContain('continueTraining.loadError');
    expect(rows()[0].props.accessibilityLabel).toBe('dogTraining.open:{"name":"Yam"}. common.loading');
  });

  test('sechs Hunde → sechs Zeilen, jede öffnet die richtige Seite; Hinweis im Screenreader-Text', () => {
    mockDogs = Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, name: `Hund ${i}` }));
    render();
    expect(rows()).toHaveLength(6);
    act(() => { rows()[4].props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/unit/progress', params: { dogId: 'd4' } });
    expect(rows()[0].props.accessibilityLabel).toContain('continueTraining.openHint:{"text":"Ruhiger Abschluss"}');
  });

  test('ohne Hunde wird nichts angezeigt', () => {
    mockDogs = [];
    render();
    expect(view.toJSON()).toBeNull();
  });
});
