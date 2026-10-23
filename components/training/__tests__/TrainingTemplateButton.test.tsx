import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { TrainingTemplateButton } from '../TrainingTemplateButton';
import type { TrainingUnit } from '@/types/trainingUnit';
import { documentDraftKey, saveDocumentDraft } from '@/features/training/documentation/draft';
import { templateEntryContext } from '@/features/training/documentation/template';
const mockPush = jest.fn(), mockHints = jest.fn();
let mockOwner = 'owner';
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'entry' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockOwner } } }) }));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
jest.mock('@/hooks/useCustomCategories', () => ({ useCustomCategories: () => ({ categories: [] }) }));
jest.mock('@/components/ui/AnyvoBottomSheet', () => ({ AnyvoBottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key, locale: 'de' }) }));
jest.mock('@/features/training/documentation/template', () => ({ ...jest.requireActual('@/features/training/documentation/template'), readTemplateHints: (...args: unknown[]) => mockHints(...args) }));
jest.mock('@/services/trainingDocumentService', () => ({ listServerTrainingFocuses: jest.fn() }));
const source = { id: 'source', dog_id: 'dog', owner_id: 'owner', status: 'completed', session_date: '2026-10-14', exercises: [{ id: 'one', discipline: 'Fährte', exercise_name: 'Suche', seq_index: 0 }, { id: 'two', discipline: 'Fährte', exercise_name: 'Suche', seq_index: 1 }] } as TrainingUnit;
type Item = { props: { children?: unknown; disabled?: boolean; accessibilityRole?: string; onPress: () => void }; findAllByType: (type: unknown) => Item[] };
let node: ReactTestRenderer;
const root = () => node.root as unknown as Item;
async function show(unit = source) { await act(async () => { node = TestRenderer.create(<TrainingTemplateButton unit={unit} />); }); }
async function tap(label: string) { const b = root().findAllByType(TouchableOpacity).find(b => b.findAllByType(Text).some(t => t.props.children === label))!; await act(async () => { b.props.onPress(); }); }
const confirms = () => root().findAllByType(TouchableOpacity).find(b => b.findAllByType(Text).some(t => t.props.children === 'trainingTemplate.confirm'))!;
beforeEach(async () => { mockOwner = 'owner'; mockPush.mockReset(); mockHints.mockReset().mockResolvedValue([{ id: 'local:h', text: 'Hint', date: '2026-10-13' }]); await AsyncStorage.clear(); jest.mocked(AsyncStorage.setItem).mockClear(); });
afterEach(() => { if (node) act(() => node.unmount()); });
test('cancel reads options without creating a draft or changing a training', async () => {
  await show(); await tap('trainingTemplate.open'); await tap('common.cancel');
  expect(mockPush).not.toHaveBeenCalled(); expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
test('checkbox selection keeps identical labels distinct and one tap opens only one new editor', async () => {
  await show(); await tap('trainingTemplate.open'); expect(confirms().props.disabled).toBe(true);
  const boxes = root().findAllByType(TouchableOpacity).filter(b => b.props.accessibilityRole === 'checkbox');
  await act(async () => { boxes[1].props.onPress(); boxes[2].props.onPress(); });
  const confirm = confirms(); await act(async () => { confirm.props.onPress(); confirm.props.onPress(); });
  expect(mockPush).toHaveBeenCalledTimes(1);
  const route = mockPush.mock.calls[0][0]; expect(route.pathname).toBe('/unit/document'); expect(route.params).not.toHaveProperty('id');
  expect(JSON.parse(route.params.templateChoice)).toMatchObject({ exercises: ['id:two'], focuses: ['local:h'], dog: 'dog' });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
test.each([{ owner_id: 'foreign' }, { status: 'active' }])('hides template actions for %j', async patch => {
  await show({ ...source, ...patch } as TrainingUnit); expect((node as unknown as { toJSON: () => unknown }).toJSON()).toBeNull(); expect(mockHints).not.toHaveBeenCalled();
});
test('unavailable focus reads block confirmation and offer retry', async () => {
  mockHints.mockRejectedValue(new Error('offline')); await show(); await tap('trainingTemplate.open'); expect(confirms().props.disabled).toBe(true);
  expect(root().findAllByType(Text).some(t => t.props.children === 'trainingDoc.focusError')).toBe(true);
  expect(mockPush).not.toHaveBeenCalled();
});
test('existing template drafts are offered for resume without changing them', async () => {
  const key = documentDraftKey('owner', undefined, templateEntryContext('source', 'dog', 'faehrte'));
  await saveDocumentDraft(key, { userText: 'Keep this' }); jest.mocked(AsyncStorage.setItem).mockClear();
  await show(); await tap('trainingTemplate.open'); await tap('trainingTemplate.resume');
  expect(mockPush).toHaveBeenCalledTimes(1); expect(mockHints).not.toHaveBeenCalled(); expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
test('late hints cannot cross an account change', async () => {
  let resolve!: (value: unknown[]) => void; mockHints.mockImplementation(() => new Promise(done => { resolve = done; }));
  await show(); await tap('trainingTemplate.open'); mockOwner = 'other';
  await act(async () => { node.update(<TrainingTemplateButton unit={source} />); resolve([{ id: 'private', text: 'old account', date: '2026-10-14' }]); });
  expect((node as unknown as { toJSON: () => unknown }).toJSON()).toBeNull(); expect(mockPush).not.toHaveBeenCalled();
});
