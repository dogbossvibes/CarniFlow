import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { buildExam, type ExamInput } from '@/features/exam-book/model';

// Übersicht Prüfungsbuch: Fortschritt, Punkteverlauf nur mit Premium, Konflikt,
// geteilte Ansicht nur lesend.
let mockParams: Record<string, string> = { id: 'dog-1', name: 'Luna' };
let mockPro = false;
let mockCapsLoading = false;
const mockPush = jest.fn();
const mockBook = { exams: [] as any[], conflicts: new Set<string>(), pending: new Set<string>(), loading: false, reload: jest.fn(), readLocal: jest.fn(), available: true };
const mockShared = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => { const { useEffect } = jest.requireActual('react'); useEffect(() => { cb(); }, []); },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('react-native-svg', () => {
  const { View } = jest.requireActual('react-native');
  const C = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  return { __esModule: true, default: C, Svg: C, G: C, Line: C, Polyline: C, Circle: C };
});
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => ({ isPro: mockPro, loading: mockCapsLoading }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string, p?: Record<string, unknown>) => p ? `${key}:${JSON.stringify(p)}` : key }) }));
jest.mock('@/i18n/format', () => ({ formatDate: (d: Date) => d.toISOString().slice(0, 10) }));
jest.mock('@/features/exam-book/useExamBook', () => ({ useExamBook: () => mockBook }));
jest.mock('@/features/exam-book/store', () => ({ acceptServerVersion: jest.fn(), keepLocalVersion: jest.fn() }));
jest.mock('@/features/exam-book/sync', () => ({ fetchRemoteExam: jest.fn() }));
jest.mock('@/features/exam-book/service', () => ({ listSharedExams: (...a: unknown[]) => mockShared(...a) }));
jest.mock('@/features/exam-book/ui/ExamShareSheet', () => ({ ExamShareSheet: () => null }));
const mockSharePdf = jest.fn();
jest.mock('@/features/exam-book/pdfShare', () => ({ shareExamBookPdf: (...a: unknown[]) => mockSharePdf(...a) }));

import DogExamsRoute from '../[id]';

const input = (level: string, date: string, a: number, passed = true): ExamInput => ({
  dog_id: 'dog-1', exam_date: date, location: null, club: 'SC Muster', judge: null, exam_type: 'igp', exam_type_label: null,
  exam_level: level, sections: [{ key: 'A', label: 'Fährte', points: a, maxPoints: 100 }, { key: 'B', label: 'Unterordnung', points: 80, maxPoints: 100 }],
  total_points: null, max_points: null, rating: 'G', passed, placement: null, notes: null,
});
const exams = [
  buildExam(input('1', '2026-10-03', 90), { id: 'e1', ownerId: 'owner' }, '2026-10-03T10:00:00.000Z'),
  buildExam(input('2', '2027-04-12', 95), { id: 'e2', ownerId: 'owner' }, '2027-04-12T10:00:00.000Z'),
];
const texts = (r: ReactTestRenderer) => r.root.findAllByType(Text).map(t => String(t.props.children));
const render = async () => { let r!: ReactTestRenderer; await act(async () => { r = TestRenderer.create(<DogExamsRoute />); }); return r; };

beforeEach(() => {
  mockParams = { id: 'dog-1', name: 'Luna' }; mockPro = false; mockCapsLoading = false; mockPush.mockReset();
  Object.assign(mockBook, { exams, conflicts: new Set(), pending: new Set(['e2']) });
  mockShared.mockReset();
  mockSharePdf.mockReset();
});

it('zeigt Fortschritt, Liste und «noch nicht synchronisiert»', async () => {
  const r = await render();
  const all = texts(r);
  expect(all).toContain('exam.passedLevel:{"level":"IGP 2"}');
  expect(all).toContain('exam.nextLevel:{"level":"IGP 3"}');
  expect(all.filter(t => t === 'exam.pendingSync')).toHaveLength(1);
  expect(all).toEqual(expect.arrayContaining(['170/200', '175/200']));
});

it('Punkteverlauf nur mit Premium', async () => {
  let r = await render();
  expect(texts(r)).toContain('exam.chartLocked');
  expect(texts(r).some(t => t.startsWith('exam.chartTitle'))).toBe(false);
  mockPro = true;
  r = await render();
  expect(texts(r)).toContain('exam.chartTitle · IGP');
});

it('zeigt Konflikte mit beiden Wahlmöglichkeiten', async () => {
  mockBook.conflicts = new Set(['e1']);
  const r = await render();
  expect(texts(r)).toEqual(expect.arrayContaining(['exam.conflictTitle', 'exam.conflictMine', 'exam.conflictOther']));
});

it('geteilte Ansicht: nur Lesen, kein Erfassen, Hinweis zu Anhängen', async () => {
  mockParams = { id: 'dog-9', name: 'Rex', shared: '1' };
  mockShared.mockResolvedValue({ data: exams, error: null });
  const r = await render();
  await act(async () => { await Promise.resolve(); });
  expect(mockShared).toHaveBeenCalledWith('dog-9');
  const all = texts(r);
  expect(all).toContain('Rex · exam.sharedReadOnly');
  expect(all).toContain('exam.attachmentsPrivate');
  expect(r.root.findAll(n => n.props.accessibilityLabel === 'exam.add')).toHaveLength(0);
  expect(r.root.findAll(n => n.props.accessibilityLabel === 'exam.share')).toHaveLength(0);
});

it('geteilte Ansicht ohne Freigabe: Hinweis statt Daten', async () => {
  mockParams = { id: 'dog-9', shared: '1' };
  mockShared.mockResolvedValue({ data: [], error: null });
  const r = await render();
  await act(async () => { await Promise.resolve(); });
  expect(texts(r)).toContain('exam.sharedUnavailable');
});

const pressLabel = async (r: ReactTestRenderer, label: string) => {
  const target = r.root.findAll(n => typeof n.props.onPress === 'function' && typeof n.type !== 'string'
    && n.findAllByType(Text).some(t => t.props.children === label)).pop();
  if (!target) throw new Error(`no button ${label}`);
  await act(async () => { await target.props.onPress(); });
};

it('PDF ohne Premium: führt zu Premium, erzeugt nichts', async () => {
  const r = await render();
  expect(texts(r)).toContain('exam.pdfLocked');
  await pressLabel(r, 'exam.pdfExport');
  expect(mockPush).toHaveBeenCalledWith('/premium');
  expect(mockSharePdf).not.toHaveBeenCalled();
});

it('PDF mit Premium: teilt das Prüfungsbuch mit beiden Einträgen', async () => {
  mockPro = true;
  mockSharePdf.mockResolvedValue('shared');
  const r = await render();
  await pressLabel(r, 'exam.pdfExport');
  expect(mockSharePdf).toHaveBeenCalledTimes(1);
  const [model, fileName] = mockSharePdf.mock.calls[0];
  expect(model.rows).toHaveLength(2);
  expect(model.dogName).toBe('Luna');
  expect(fileName).toBe('ANYVO-Pruefungsbuch-Luna');
});

it('PDF solange das Abo lädt: kein Schloss, kein Weg zu Premium, kein PDF', async () => {
  mockCapsLoading = true;
  const r = await render();
  expect(texts(r)).not.toContain('exam.pdfLocked');
  const icons = r.root.findAll(n => n.props.label === 'exam.pdfExport' && typeof n.props.icon === 'string');
  expect(icons.length).toBeGreaterThan(0);
  expect(icons.every(n => n.props.icon !== 'lock-closed-outline' && n.props.disabled === true)).toBe(true);
  // Auch ein direkter Aufruf (falls die Taste doch ausgelöst würde) führt nirgends hin.
  await act(async () => { await icons[0].props.onPress(); });
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockSharePdf).not.toHaveBeenCalled();
});
