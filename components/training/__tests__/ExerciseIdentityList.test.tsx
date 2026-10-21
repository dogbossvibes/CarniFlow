import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { ExerciseIdentityList } from '../ExerciseIdentityList';
import type { ExerciseIdentity } from '@/services/trainingDocumentService';
const mockList = jest.fn(); const mockSave = jest.fn(); const mockSelect = jest.fn(); const mockCreate = jest.fn();
jest.mock('@/services/trainingDocumentService', () => ({ listExerciseIdentities: (...args: unknown[]) => mockList(...args), saveExerciseIdentity: (...args: unknown[]) => mockSave(...args) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'request-id' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
const row = (id: string, display_name = 'Revieren'): ExerciseIdentity => ({ id, display_name, owner_id: 'owner', discipline_key: 'system:schutzdienst', revision: 1, archived_at: null });
let view: ReactTestRenderer;
const props = { ownerId: 'owner', disciplineKey: 'system:schutzdienst', disciplineLabel: 'Schutzdienst', suggestions: ['Revieren', 'Flucht'],
  onSelect: mockSelect, onCreate: mockCreate, onAddCustom: jest.fn(), selectedIds: [] as string[], selectedNames: [] as string[] };
async function render(extra: Partial<React.ComponentProps<typeof ExerciseIdentityList>> = {}) {
  await act(async () => { view = TestRenderer.create(<ExerciseIdentityList {...props} {...extra} />); });
}
const find = (id: string) => view.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const press = async (id: string) => { const button = find(id); expect(button).toBeDefined(); await act(async () => { await button.props.onPress(); }); };
const inputs = () => (view.root as unknown as { findAllByType(type: unknown): { props: { value: string; onChangeText(v: string): void } }[] }).findAllByType(TextInput);
beforeEach(() => { mockList.mockReset().mockResolvedValue({ data: [row('a'), row('b')], error: null }); mockSave.mockReset().mockResolvedValue({ data: row('a'), error: null }); mockSelect.mockReset(); mockCreate.mockReset(); });
afterEach(() => { act(() => view?.unmount()); });
it('shows one choice for two stored Revieren identities plus the matching preset, without merging records', async () => {
  await render();
  expect(find('exercise-group-revieren')).toBeDefined();
  expect(inputs()).toHaveLength(0);
  await press('exercise-group-revieren');
  expect(find('exercise-variant-a')).toBeDefined(); expect(find('exercise-variant-b')).toBeDefined();
  await press('exercise-variant-b');
  expect(mockSelect).toHaveBeenCalledWith(row('b')); expect(mockCreate).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled();
});
it('selects the existing identity instead of creating another same-named preset', async () => {
  mockList.mockResolvedValue({ data: [row('a')], error: null }); await render();
  await press('exercise-group-revieren'); expect(mockSelect).toHaveBeenCalledWith(row('a')); expect(mockCreate).not.toHaveBeenCalled();
  await press('exercise-group-flucht'); expect(mockCreate).toHaveBeenCalledWith('Flucht');
});
it('More only reveals additional choices; rename requires an explicit separate action', async () => {
  mockList.mockResolvedValue({ data: Array.from({ length: 7 }, (_, i) => row(`id-${i}`, `Exercise ${i}`)), error: null });
  await render({ suggestions: [] }); await press('exercise-more'); expect(inputs()).toHaveLength(0);
  await press('exercise-rename-id-6'); expect(inputs()).toHaveLength(1);
  act(() => inputs()[0].props.onChangeText('New name')); await press('exercise-rename-save');
  expect(mockSave).toHaveBeenCalledWith('owner', expect.objectContaining({ id: 'id-6', displayName: 'New name', expectedRevision: 1 }), expect.any(Function));
});
it('blocks accidental creation while loading or after a registry error', async () => {
  let finish!: (v: unknown) => void; mockList.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(); expect(find('exercise-group-revieren').props.disabled).toBe(true);
  await press('exercise-group-revieren'); expect(mockCreate).not.toHaveBeenCalled();
  await act(async () => { finish({ data: [], error: new Error('offline') }); });
  await press('exercise-group-revieren'); expect(mockCreate).not.toHaveBeenCalled();
});
it('retains a failed rename input and prevents duplicate pending rename requests', async () => {
  mockList.mockResolvedValue({ data: [row('a')], error: null }); await render(); await press('exercise-rename-a');
  act(() => inputs()[0].props.onChangeText('Renamed'));
  let finish!: (v: unknown) => void; mockSave.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const save = find('exercise-rename-save').props.onPress;
  let pending!: Promise<void>; act(() => { pending = save(); void save(); });
  expect(mockSave).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ data: null, error: new Error('offline') }); await pending; });
  expect(inputs()[0].props.value).toBe('Renamed'); expect(find('exercise-rename-save').props.disabled).toBe(false);
});
it('immediately hides old-account data/editor and rejects a late rename result after account switch', async () => {
  mockList.mockResolvedValue({ data: [row('a')], error: null }); await render(); await press('exercise-rename-a');
  act(() => inputs()[0].props.onChangeText('Old account name'));
  let finish!: (v: unknown) => void; mockSave.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>; act(() => { pending = find('exercise-rename-save').props.onPress(); });
  mockList.mockResolvedValue({ data: [], error: null });
  act(() => { (view as unknown as { update(element: React.ReactElement): void }).update(<ExerciseIdentityList {...props} ownerId="other" />); });
  await act(async () => { finish({ data: row('a'), error: null }); await pending; });
  expect(inputs()).toHaveLength(0); expect(find('exercise-rename-a')).toBeUndefined();
});
it('shows actual history context only for the expanded saved variants', async () => {
  await render({ historyByIdentity: { b: { date: '2026-10-20', notes: 'Ruhiger gearbeitet' } } });
  await press('exercise-group-revieren');
  const variant = find('exercise-variant-b');
  const texts = (node: typeof variant) => (node as unknown as { findAllByType(type: unknown): { props: { children: unknown } }[] }).findAllByType(Text).flatMap(child => child.props.children);
  expect(texts(variant)).toContain(' · Ruhiger gearbeitet');
  expect(texts(find('exercise-variant-a'))).not.toContain('2026-10-20');
});
it('keeps input retryable after a thrown rename failure', async () => {
  mockList.mockResolvedValue({ data: [row('a')], error: null }); await render(); await press('exercise-rename-a');
  act(() => inputs()[0].props.onChangeText('Renamed')); mockSave.mockRejectedValueOnce(new Error('network'));
  await press('exercise-rename-save'); expect(inputs()[0].props.value).toBe('Renamed');
  expect(find('exercise-rename-save').props.disabled).toBe(false);
  await press('exercise-rename-save'); expect(mockSave).toHaveBeenCalledTimes(2);
  expect(mockSave.mock.calls[1][1].requestId).toBe(mockSave.mock.calls[0][1].requestId);
});
it('never offers archived, foreign-owner, or foreign-discipline registry entries', async () => {
  mockList.mockResolvedValue({ data: [{ ...row('archived'), archived_at: '2026-10-20' }, { ...row('foreign'), owner_id: 'other' },
    { ...row('wrong-discipline'), discipline_key: 'other' }], error: null });
  await render(); await press('exercise-group-revieren');
  expect(mockCreate).toHaveBeenCalledWith('Revieren'); expect(mockSelect).not.toHaveBeenCalled();
});
