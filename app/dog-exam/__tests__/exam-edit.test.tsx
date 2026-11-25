import { DatabaseSync } from 'node:sqlite';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { MIGRATIONS } from '@/lib/localDb/migrations';

// Formular «Prüfung erfassen/bearbeiten» mit echtem lokalem Speicher
// (In-Memory-SQLite, echte Migrationen). Server ist aus (offline-first).
let mockDb: DatabaseSync;
let mockUuid = 0;
const mockBack = jest.fn();
let mockParams: Record<string, string> = { dogId: 'dog-1' };
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}` }));
jest.mock('@/features/tracking/storage/gpsCaptureScope', () => ({ invalidateGpsCaptures: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => mockDb.exec(sql),
  getAllAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).all(...args),
  getFirstAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).get(...args),
  runAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).run(...args),
}) }));
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  from: () => { throw new TypeError('Network request failed'); },
} }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/components/ui/KeyboardAwareScrollView', () => {
  const { ScrollView } = jest.requireActual('react-native');
  return { KeyboardAwareScrollView: ScrollView };
});
jest.mock('@/components/ui/DateField', () => ({ DateField: () => null }));
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string, p?: Record<string, unknown>) => p ? `${key}:${JSON.stringify(p)}` : key }) }));
jest.mock('@/i18n/format', () => ({ formatDate: (d: Date) => d.toISOString().slice(0, 10) }));
const mockShowUndo = jest.fn();
jest.mock('@/lib/undoToast', () => ({ showUndoToast: (o: unknown) => { mockShowUndo(o); return { flush: jest.fn(), cancel: jest.fn() }; } }));

import ExamEditScreen from '../edit';
import { listExamsForDog, saveExam } from '@/features/exam-book/store';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const texts = (r: ReactTestRenderer) => r.root.findAllByType(Text).map(t => String(t.props.children));
const press = async (r: ReactTestRenderer, label: string) => {
  const target = r.root.findAll(n => typeof n.props.onPress === 'function' && typeof n.type !== 'string'
    && n.findAllByType(Text).some(t => t.props.children === label)).pop();
  if (!target) throw new Error(`no button ${label}`);
  await act(async () => { target.props.onPress(); });
  await flush();
};
const input = (r: ReactTestRenderer, label: string) => r.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === label)!;

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec('create table local_schema_migrations(version integer primary key, applied_at text)');
  for (const m of MIGRATIONS) { mockDb.exec(m.sql); mockDb.prepare('insert into local_schema_migrations(version) values (?)').run(m.version); }
  mockBack.mockReset(); mockShowUndo.mockReset();
  mockParams = { dogId: 'dog-1' };
});
afterEach(() => mockDb.close());

it('erfasst eine IGP-Prüfung offline mit Summe aus den Abteilungen', async () => {
  let r!: ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(<ExamEditScreen />); });
  await flush();
  await press(r, 'IGP 2');
  await act(async () => {
    input(r, 'Fährte exam.points').props.onChangeText('92');
    input(r, 'Unterordnung exam.points').props.onChangeText('85,5');
    input(r, 'Schutzdienst exam.points').props.onChangeText('88');
    input(r, 'exam.judge').props.onChangeText(' Richter A ');
  });
  expect(texts(r)).toContain('exam.totalAuto:{"total":265.5}');
  await press(r, 'exam.totalAuto:{"total":265.5}');
  await press(r, 'exam.save');
  const list = await listExamsForDog('owner', 'dog-1');
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ exam_type: 'igp', exam_level: '2', total_points: 265.5, max_points: 300, judge: 'Richter A' });
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('speichert nicht, wenn Punkte über dem Maximum liegen', async () => {
  let r!: ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(<ExamEditScreen />); });
  await flush();
  await act(async () => { input(r, 'Fährte exam.points').props.onChangeText('101'); });
  await press(r, 'exam.save');
  expect(texts(r)).toContain('exam.invalidPoints');
  expect(await listExamsForDog('owner', 'dog-1')).toEqual([]);
  expect(mockBack).not.toHaveBeenCalled();
});

it('Entfernen ist weich und mit Rückgängig wiederherstellbar', async () => {
  const exam = await saveExam('owner', {
    dog_id: 'dog-1', exam_date: '2027-04-12', location: null, club: null, judge: null, exam_type: 'bh', exam_type_label: null,
    exam_level: 'bh', sections: [], total_points: null, max_points: null, rating: null, passed: true, placement: null, notes: 'bleibt',
  });
  mockParams = { dogId: 'dog-1', examId: exam.id };
  let r!: ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(<ExamEditScreen />); });
  await flush();
  expect(texts(r)).toContain('exam.editTitle');
  await press(r, 'exam.remove');
  expect(await listExamsForDog('owner', 'dog-1')).toEqual([]);
  expect(mockDb.prepare('select count(*) as n from local_exam_results').get()).toEqual({ n: 1 });
  expect(mockShowUndo).toHaveBeenCalledWith(expect.objectContaining({ message: 'exam.removed' }));
  await act(async () => { mockShowUndo.mock.calls[0][0].onUndo(); });
  await flush();
  const back = await listExamsForDog('owner', 'dog-1');
  expect(back.map(e => e.notes)).toEqual(['bleibt']);
});

it('Verknüpfen ist erst nach dem Sync möglich (Hinweis statt Fehler)', async () => {
  const exam = await saveExam('owner', {
    dog_id: 'dog-1', exam_date: '2027-04-12', location: null, club: null, judge: null, exam_type: 'igp', exam_type_label: null,
    exam_level: '1', sections: [], total_points: null, max_points: null, rating: null, passed: null, placement: null, notes: null,
  });
  mockParams = { dogId: 'dog-1', examId: exam.id };
  let r!: ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(<ExamEditScreen />); });
  await flush();
  expect(texts(r)).toContain('exam.linkOffline');
});
