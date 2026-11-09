import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { ContinueTrainingSection } from '../ContinueTrainingSection';

const mockPush = jest.fn();
const mockRefetch = jest.fn();
let mockDogs: { id: string; name: string }[] = [];
let mockState: Record<string, unknown> = {};
const mockRequestedDogs: (string | null | undefined)[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ locale: 'de', t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k) }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockDogs }) }));
jest.mock('@/i18n/format', () => ({ formatDate: (d: Date) => `F${d.getDate()}.${d.getMonth() + 1}` }));
jest.mock('@/hooks/useDogTrainingSummary', () => ({
  useDogTrainingSummary: (dog: string | null | undefined) => { mockRequestedDogs.push(dog); return { refetch: mockRefetch, ...mockState }; },
}));

const summary = {
  last: { id: 'u1', source: 'unit', date: '2026-11-06', daysAgo: 3, disciplines: ['Unterordnung'],
    exercises: [{ name: 'Sitz', discipline: 'Unterordnung', level: 'festigen', legacyStars: null, trend: 'up' },
      { name: 'Platz', discipline: 'Unterordnung', level: null, legacyStars: 4, trend: null }] },
  previous: [{ id: 'old', source: 'session', date: '2026-11-01', disciplines: ['IGP'], exerciseCount: 1 }],
  openHint: { text: 'Ruhiger Abschluss', date: '2026-11-06' },
};
let view: ReactTestRenderer;
const texts = () => view.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));
const press = (label: string) => act(() => { view.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress(); });
const render = () => act(() => { view = TestRenderer.create(<ContinueTrainingSection />); });

beforeEach(() => { mockPush.mockReset(); mockRefetch.mockReset(); mockRequestedDogs.length = 0; mockDogs = [{ id: 'd1', name: 'Yam' }, { id: 'd2', name: 'Malu' }]; mockState = { data: summary, isPending: false, isError: false }; });

describe('ContinueTrainingSection (T-184 Etappe 2)', () => {
  test('zeigt letztes Training, Lernstufe mit Trend, alte Bewertung, Hinweis und frühere Trainings', () => {
    render();
    const all = texts().join(' | ');
    expect(all).toContain('continueTraining.title');
    expect(all).toContain('Sitz · trainingLevel.festigen ↑');
    expect(all).toContain('Platz · trainingLevel.legacy:{"value":4}');
    expect(all).toContain('continueTraining.openHint:{"text":"Ruhiger Abschluss"}');
    expect(all).toContain('continueTraining.earlier');
  });

  test('Weiter öffnet den Erfassen-Screen mit Hund und Sparte; frühere Session über ihre Route', () => {
    render();
    press('continueTraining.next');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/unit/document', params: { dogId: 'd1', discipline: 'Unterordnung' } });
    act(() => { view.root.findAll(n => typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => [t.props.children].flat().join('').includes('F1.11')))[0].props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/training/old');
  });

  test('Hundewechsel fragt den gewählten Hund ab', () => {
    render();
    press('Malu');
    expect(mockRequestedDogs[mockRequestedDogs.length - 1]).toBe('d2');
  });

  test('Ladefehler zeigt Erneut-Knopf; kein Training zeigt Hinweis; ohne Hunde nichts', () => {
    mockState = { data: undefined, isPending: false, isError: true };
    render();
    act(() => { view.root.findAll(n => typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => t.props.children === 'continueTraining.loadError'))[0].props.onPress(); });
    expect(mockRefetch).toHaveBeenCalled();
    mockState = { data: { last: null, previous: [], openHint: null }, isPending: false, isError: false };
    render();
    expect(texts()).toContain('continueTraining.none');
    mockDogs = [];
    render();
    expect(view.toJSON()).toBeNull();
  });

  test('solange nicht geladen: kein falsches „Noch kein Training“', () => {
    mockState = { data: undefined, isPending: true, isError: false };
    render();
    expect(texts()).not.toContain('continueTraining.none');
  });

  test('mehrere Sparten: Weiter nimmt die erste Sparte des letzten Trainings', () => {
    mockState = { data: { ...summary, last: { ...summary.last, disciplines: ['IGP', 'Unterordnung'] } }, isPending: false, isError: false };
    render();
    press('continueTraining.next');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/unit/document', params: { dogId: 'd1', discipline: 'IGP' } });
  });

  test('frühere Trainings: Datum formatiert, Einzahl bei 1 Übung', () => {
    render();
    const all = texts().join(' | ');
    expect(all).not.toContain('2026-11-01');
    expect(all).toContain('continueTraining.exerciseCountOne');
  });
});
