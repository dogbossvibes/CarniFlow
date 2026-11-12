import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { ExerciseIdentityList } from '../ExerciseIdentityList';
import { ServerTrainingFocusList } from '../ServerTrainingFocusList';
import type { ExerciseIdentity, ServerFocus } from '@/services/trainingDocumentService';

const mockList = jest.fn(); const mockRename = jest.fn(); const mockUpdate = jest.fn(); const mockSelect = jest.fn(); const mockRetry = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => 'stable-request' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/services/trainingDocumentService', () => ({ listExerciseIdentities: (...args: unknown[]) => mockList(...args), saveExerciseIdentity: (...args: unknown[]) => mockRename(...args), updateServerTrainingFocus: (...args: unknown[]) => mockUpdate(...args) }));
type Item = { props: any; findAllByType: (type: unknown) => Item[] };
let node: ReactTestRenderer;
const root = () => node.root as unknown as Item;
const texts = () => root().findAllByType(Text).flatMap(t => Array.isArray(t.props.children) ? t.props.children : [t.props.children]);
const buttons = (text: string) => root().findAllByType(TouchableOpacity).filter(b => b.findAllByType(Text).some(t => (t.props.children === text || Array.isArray(t.props.children) && t.props.children.includes(text))));
async function show(element: React.ReactElement) { await act(async () => { if (node) (node as unknown as { update: (e: React.ReactElement) => void }).update(element); else node = TestRenderer.create(element); for (let i = 0; i < 10; i++) await Promise.resolve(); }); }
const identities: ExerciseIdentity[] = ['one', 'two'].map(id => ({ id, owner_id: 'owner-a', discipline_key: 'system:obedience', display_name: 'Sit', revision: 1, archived_at: null }));
const focus = { id: 'focus-a', owner_id: 'owner-a', dog_id: 'dog-a', discipline_key: 'system:obedience', source_unit_id: null,
  source_unit_snapshot_id: 'old-unit', source_date_snapshot: '2026-10-14', source_text_snapshot: 'original', text: 'Current target', status: 'open', revision: 1 } as ServerFocus;
beforeEach(() => { jest.clearAllMocks(); mockList.mockResolvedValue({ data: identities, error: null }); });
afterEach(() => { act(() => { node?.unmount(); }); node = undefined as unknown as ReactTestRenderer; });
const registry = (owner = 'owner-a') => <ExerciseIdentityList ownerId={owner} disciplineKey="system:obedience" disciplineLabel="Obedience" suggestions={[]} selectedIds={[]} selectedNames={[]} onCreate={jest.fn()} onAddCustom={jest.fn()} onSelect={mockSelect} />;
const focusList = (owner = 'owner-a') => <ServerTrainingFocusList ownerId={owner} rows={owner === 'owner-a' ? [focus] : []} loading={false} error={false} limited={false} onRetry={mockRetry} onOpenSource={jest.fn()} />;

test('identical labels select distinct stable identities, never a name join', async () => {
  await show(registry());
  act(() => buttons('Sit')[0].props.onPress());
  const variants = root().findAllByType(TouchableOpacity).filter(b => String(b.props.testID).startsWith('exercise-variant-'));
  act(() => { variants[0].props.onPress(); variants[1].props.onPress(); });
  expect(mockSelect.mock.calls.map(call => call[0].id)).toEqual(['one', 'two']);
});
test('rename targets one stable identity and retains unsaved input after network failure', async () => {
  await show(registry()); act(() => buttons('Sit')[0].props.onPress());
  act(() => buttons('common.edit')[0].props.onPress());
  const input = root().findAllByType(TextInput)[0]; act(() => input.props.onChangeText('Stay'));
  mockRename.mockResolvedValue({ data: null, error: { message: 'offline' } });
  await act(async () => { await buttons('common.save')[0].props.onPress(); });
  expect(mockRename.mock.calls[0][1]).toMatchObject({ id: 'one', expectedRevision: 1, displayName: 'Stay' });
  expect(root().findAllByType(TextInput)[0].props.value).toBe('Stay'); expect(mockSelect).not.toHaveBeenCalled();
});
test('late registry response from an old account cannot show private names', async () => {
  let resolve!: (value: unknown) => void;
  mockList.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue({ data: [], error: null });
  await show(registry()); await show(registry('owner-b'));
  await act(async () => { resolve({ data: identities, error: null }); });
  expect(texts()).not.toContain('Sit');
});
test('deleted focus source retains text but offers no dead navigation', async () => {
  await show(focusList()); expect(texts()).toContain('Current target'); expect(texts()).toContain('trainingDoc.sourceRemoved');
  expect(texts()).not.toContain('trainingDoc.openHistory');
});
test('a status response from old A cannot update the new A after A-B-A', async () => {
  let resolve!: (value: unknown) => void;
  mockUpdate.mockReturnValue(new Promise(done => { resolve = done; }));
  await show(focusList()); act(() => buttons('trainingDoc.focusDone')[0].props.onPress());
  const current = mockUpdate.mock.calls[0][2] as () => boolean;
  await show(focusList('owner-b')); await show(focusList()); expect(current()).toBe(false);
  await act(async () => { resolve({ data: { focus }, error: null }); });
  expect(mockRetry).not.toHaveBeenCalled(); expect(buttons('trainingDoc.focusDone')[0].props.disabled).toBe(false);
});


test('preparation expands read-only open hints, hides completed items and offers only explicit completion', async () => {
  const older = { ...focus, id: 'older', source_date_snapshot: '2026-10-13', text: 'Older open hint' };
  const done = { ...focus, id: 'done', status: 'done' as const, text: 'Completed hint' };
  await show(<ServerTrainingFocusList preparation ownerId="owner-a" rows={[focus, older, done]} loading={false} error={false} limited={false} onRetry={mockRetry} onOpenSource={jest.fn()} />);
  expect(texts()).toContain('Current target'); expect(texts()).not.toContain('Older open hint');
  act(() => buttons('trainingDoc.more')[0].props.onPress());
  expect(texts()).toContain('Older open hint'); expect(texts()).not.toContain('Completed hint');
  expect(root().findAllByType(TextInput)).toHaveLength(0);
  expect(buttons('trainingDoc.focusOpen')).toHaveLength(0); expect(buttons('trainingDoc.focusPractice')).toHaveLength(0);
});
