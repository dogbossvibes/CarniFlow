import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import ProgressScreen, { LEVEL_STYLE, LEGACY } from '../progress';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockRefetch = jest.fn();
let mockState: Record<string, unknown> = {};
let mockParams: Record<string, string> = { dogId: 'd1' };
const mockRequested: unknown[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }), useLocalSearchParams: () => mockParams }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/i18n', () => ({ useT: () => ({ locale: 'de', t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k) }) }));
jest.mock('@/i18n/format', () => ({ formatDate: (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.` }));
const mockRefreshDogs = jest.fn();
const mockRefetchSummary = jest.fn();
let mockDogs: { dogs: { id: string; name: string }[]; loading: boolean; error?: string | null; refresh?: () => void } = { dogs: [{ id: 'd1', name: 'Yam' }], loading: false };
let mockSummary: Record<string, unknown> | undefined;
let mockSummaryError = false;
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => mockDogs }));
jest.mock('@/hooks/useDogTrainingSummary', () => ({
  useDogTrainingSummary: () => ({ data: mockSummary, isError: mockSummaryError, refetch: mockRefetchSummary }),
  useDogTrainingHistory: (dog: unknown) => { mockRequested.push(dog); return { refetch: mockRefetch, ...mockState }; },
}));

const ex = (p: Record<string, unknown>) => ({ discipline: 'Unterordnung', exercise_name: 'Sitz', rating: null, notes: null, duration_sec: null, seq_index: 0, ...p });
const unit = (id: string, date: string, exercises: unknown[], extra: Record<string, unknown> = {}) => ({ id, owner_id: 'o', dog_id: 'd1', session_date: date, created_at: date, status: 'completed', duration_sec: 1800, exercises, ...extra });
const data = {
  units: [
    unit('a', '2026-11-01', [ex({ exercise_identity_id: 's', discipline_key: 'uo', rating: 4, rating_scale: 'lernstufe' }), ex({ exercise_name: 'Platz', rating: 3 })]),
    unit('b', '2026-11-05', [ex({ exercise_identity_id: 's', rating: 2, rating_scale: 'lernstufe' })]),
    unit('legacy', '2026-10-20', [ex({ discipline: 'IGP', exercise_name: 'Revier' })], { source: 'session', status: 'x' }),
  ],
  focuses: [{ id: 'f', discipline_key: 'uo', revision: 1, status: 'open', text: 'Ruhig abschliessen', exercise_name_snapshot: 'Sitz', source_date_snapshot: '2026-11-05' },
    { id: 'g', discipline_key: 'uo', revision: 1, status: 'done', text: 'Erledigt', exercise_name_snapshot: null, source_date_snapshot: '2026-11-01' }],
};
let view: ReactTestRenderer;
const texts = () => view.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));
const render = () => act(() => { view = TestRenderer.create(<ProgressScreen />); });
const byLabel = (label: string) => view.root.findAll(n => n.props.accessibilityLabel === label);

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 20, 12) });
  mockPush.mockReset(); mockRefetch.mockReset(); mockRequested.length = 0; mockParams = { dogId: 'd1' };
  mockState = { data, isLoading: false, isError: false };
  mockDogs = { dogs: [{ id: 'd1', name: 'Yam' }], loading: false, error: null, refresh: mockRefreshDogs };
  mockRefreshDogs.mockReset(); mockRefetchSummary.mockReset(); mockSummaryError = false;
  mockSummary = { last: { id: 'b', source: 'unit', date: '2026-11-05', daysAgo: 15, disciplines: ['Unterordnung'],
    exercises: [{ name: 'Sitz', discipline: 'Unterordnung', level: 'lernen', legacyStars: null, trend: 'down' }] }, previous: [], openHint: null };
});
afterEach(() => jest.useRealTimers());
const L = (h: string) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [L(a), L(b)].sort((p, q) => p - q); return (y + 0.05) / (x + 0.05); };

describe('Verlauf mit Übungs-Matrix (T-184 Etappe 3)', () => {
  test('lädt nur den Verlauf des Hundes und zeigt Tabs mit „Alle“', () => {
    render();
    expect(mockRequested).toContain('d1');
    const all = texts();
    expect(all).toContain('Unterordnung');
    expect(all).toContain('IGP');
    expect(all).toContain('progress.all');
  });

  test('Zellen sind für Screenreader beschriftet: Rückschritt, alte Bewertung, nicht trainiert', () => {
    render();
    expect(byLabel('5.11., Sitz: trainingLevel.lernen, progress.down').length).toBeGreaterThan(0);
    expect(byLabel('1.11., Platz: trainingLevel.legacy:{"value":3}').length).toBeGreaterThan(0);
    expect(byLabel('5.11., Platz: progress.notTrained').length).toBeGreaterThan(0);
  });

  test('nur offene Hinweise; Tab-Wechsel filtert; Liste öffnet das Detail', () => {
    render();
    expect(texts()).toContain('Ruhig abschliessen');
    expect(texts()).not.toContain('Erledigt');
    act(() => { view.root.findAll(n => n.props.accessibilityRole === 'tab' && n.findAllByType(Text).some(t => t.props.children === 'IGP'))[0].props.onPress(); });
    expect(texts().join(' ')).toContain('Revier');
    act(() => { view.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => t.props.children === 'Revier'))[0].props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/training/legacy');
  });

  test('Fehler mit Erneut, leerer Zustand, kein falscher Leerzustand beim Laden', () => {
    mockState = { data: undefined, isLoading: false, isError: true };
    render();
    act(() => { view.root.findAll(n => typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => t.props.children === 'continueTraining.loadError'))[0].props.onPress(); });
    expect(mockRefetch).toHaveBeenCalled();
    // Leerer Verlauf, aber ein letztes Training laut Zusammenfassung (z. B. Fenster-Grenze) → Matrix-Leertext.
    mockState = { data: { units: [], focuses: [] }, isLoading: false, isError: false };
    render();
    expect(texts()).toContain('progress.none');
    expect(texts()).not.toContain('continueTraining.none');
    mockState = { data: undefined, isLoading: true, isError: false };
    render();
    expect(texts()).not.toContain('progress.none');
  });

  test('Rückschritt behält die Stufe sichtbar (L↓); Rückfall-Hinweis nach ≥ 7 Tagen', () => {
    render();
    expect(texts()).toContain('L↓');
    expect(texts()).toContain('progress.fallback:{"name":"Sitz","days":15}');
  });

  test('Liste öffnet neue Einheiten im Detail', () => {
    render();
    act(() => { view.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => t.props.children === '5.11.'))[0].props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/unit/detail', params: { id: 'b' } });
  });

  test('unbekannte Sparte aus dem Link fällt auf „Alle“ zurück; Hinweise folgen dem Tab', () => {
    mockParams = { dogId: 'd1', discipline: 'Gibtsnicht' };
    render();
    const selected = view.root.findAll(n => n.props.accessibilityRole === 'tab' && n.props.accessibilityState?.selected);
    expect(selected[0].findAllByType(Text)[0].props.children).toBe('progress.all');
    expect(texts()).not.toContain('progress.none');
    mockParams = { dogId: 'd1', discipline: 'IGP' };
    render();
    expect(texts()).not.toContain('Ruhig abschliessen');
  });

  test('ohne Hund kein Dauer-Spinner', () => {
    mockParams = {};
    mockState = { data: undefined, isLoading: false, isPending: true, isError: false };
    render();
    expect(view.root.findAll(n => n.props.accessibilityLabel === 'common.loading')).toHaveLength(0);
    expect(texts()).toContain('dogTraining.notFound');
  });

  test('Stufenfarben: Symbol-Kontrast ≥ 4,5:1 und klar abgestufte Helligkeit', () => {
    const styles = [...Object.values(LEVEL_STYLE), LEGACY];
    for (const st of styles) expect(contrast(st.bg, st.fg)).toBeGreaterThanOrEqual(4.5);
    const lum = Object.values(LEVEL_STYLE).map(st => L(st.bg)).sort((a, b) => a - b);
    for (let i = 1; i < lum.length; i++) expect((lum[i] + 0.05) / (lum[i - 1] + 0.05)).toBeGreaterThanOrEqual(1.3);
  });
});

describe('Ein Ort pro Hund – Seite „Training von <Hund>“ (T-184 Etappe 3b)', () => {
  const order = () => texts().map(x => x.startsWith('dogTraining.capture') ? 'dogTraining.capture' : x).filter(x => ['dogTraining.capture', 'continueTraining.lastTitle', 'progress.matrixTitle', 'progress.allTrainings'].includes(x));
  const captureBtn = () => view.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel?.startsWith('dogTraining.capture'))[0];
  test('Reihenfolge: Erfassen, letztes Training, Matrix, alle Trainings; Kopf mit Hundename', () => {
    render();
    expect(order()).toEqual(['dogTraining.capture', 'continueTraining.lastTitle', 'progress.matrixTitle', 'progress.allTrainings']);
    expect(texts()).toContain('dogTraining.eyebrow');
    expect(texts()).toContain('Yam');
    expect(texts()).toContain('Sitz · trainingLevel.lernen ↓');
  });

  test('Erfassen öffnet den Erfassen-Screen mit Hund und Sparte (letztes Training, sonst gewählter Tab)', () => {
    render();
    expect(captureBtn().props.accessibilityLabel).toBe('dogTraining.capture · Unterordnung');
    act(() => { captureBtn().props.onPress(); });
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/unit/document', params: { dogId: 'd1', discipline: 'Unterordnung' } });
    act(() => { view.root.findAll(n => n.props.accessibilityRole === 'tab' && n.findAllByType(Text).some(t => t.props.children === 'IGP'))[0].props.onPress(); });
    expect(texts()).toContain('dogTraining.capture · IGP');
    act(() => { captureBtn().props.onPress(); });
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/unit/document', params: { dogId: 'd1', discipline: 'IGP' } });
  });

  test('letztes Training öffnet das Detail; der Hinweis dort steht nicht doppelt in der Hinweisliste', () => {
    mockSummary = { ...mockSummary, openHint: { id: 'f', text: 'Ruhig abschliessen', date: '2026-11-05' } };
    render();
    expect(texts().filter(x => x.includes('Ruhig abschliessen'))).toEqual(['continueTraining.openHint:{"text":"Ruhig abschliessen"}']);
    expect(texts().some(x => x.startsWith('progress.openHints'))).toBe(false);
    act(() => { view.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel?.startsWith('continueTraining.lastTitle'))[0].props.onPress(); });
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/unit/detail', params: { id: 'b' } });
  });

  test('Hund ohne Training: Erfassen + „Noch kein Training“, keine leere Matrix', () => {
    mockSummary = { last: null, previous: [], openHint: null };
    mockState = { data: { units: [], focuses: [] }, isLoading: false, isError: false };
    render();
    expect(texts()).toContain('dogTraining.capture');
    expect(texts()).toContain('continueTraining.none');
    expect(texts()).not.toContain('progress.none');
    expect(texts()).not.toContain('progress.matrixTitle');
  });

  test('unbekannter Hund: „Hund nicht gefunden“; während die Hunde laden kein falscher Hinweis', () => {
    mockParams = { dogId: 'weg' };
    render();
    expect(texts()).toContain('dogTraining.notFound');
    expect(texts().some(x => x.startsWith('dogTraining.capture'))).toBe(false);
    mockDogs = { dogs: [], loading: true };
    mockParams = { dogId: 'd1' };
    render();
    expect(texts()).not.toContain('dogTraining.notFound');
  });
});

describe('Hundeseite – Review-Nachträge (T-184 Etappe 3b)', () => {
  test('Ladefehler der Hunde: Fehlertext mit Neu laden statt „Hund nicht gefunden“', () => {
    mockDogs = { dogs: [], loading: false, error: 'offline', refresh: mockRefreshDogs };
    render();
    expect(texts()).not.toContain('dogTraining.notFound');
    act(() => { view.root.findAll(n => typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => t.props.children === 'continueTraining.loadError'))[0].props.onPress(); });
    expect(mockRefreshDogs).toHaveBeenCalled();
  });

  test('Ladefehler der Zusammenfassung: Fehlertext mit Erneut versuchen', () => {
    mockSummary = undefined; mockSummaryError = true;
    render();
    act(() => { view.root.findAll(n => typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => t.props.children === 'continueTraining.loadError'))[0].props.onPress(); });
    expect(mockRefetchSummary).toHaveBeenCalled();
  });

  test('alte Sterne im letzten Training lesbar; mehrere Sparten → erste; Session öffnet ihre Route', () => {
    mockSummary = { last: { id: 'b', source: 'session', date: '2026-11-05', daysAgo: 15, disciplines: ['IGP', 'Unterordnung'],
      exercises: [{ name: 'Platz', discipline: 'IGP', level: null, legacyStars: 4, trend: null }] }, previous: [], openHint: null };
    mockState = { data: { units: [], focuses: [] }, isLoading: false, isError: false };
    render();
    expect(texts()).toContain('Platz · trainingLevel.legacy:{"value":4}');
    act(() => { view.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel?.startsWith('dogTraining.capture'))[0].props.onPress(); });
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/unit/document', params: { dogId: 'd1', discipline: 'IGP' } });
    act(() => { view.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel?.startsWith('continueTraining.lastTitle'))[0].props.onPress(); });
    expect(mockPush).toHaveBeenLastCalledWith('/training/b');
  });

  test('ohne letztes Training wird der offene Hinweis nicht aus der Hinweisliste entfernt', () => {
    mockSummary = { last: null, previous: [], openHint: { id: 'f', text: 'Ruhig abschliessen', date: '2026-11-05' } };
    render();
    expect(texts()).toContain('Ruhig abschliessen');
  });

  test('Screenreader: Kopf heisst „Training von <Hund>“; Karte nennt die Übungen', () => {
    render();
    expect(byLabel('dogTraining.open:{"name":"Yam"}').length).toBeGreaterThan(0);
    expect(view.root.findAll(n => n.props.accessibilityLabel?.startsWith('continueTraining.lastTitle'))[0].props.accessibilityLabel).toContain('Sitz · trainingLevel.lernen ↓');
  });
});
