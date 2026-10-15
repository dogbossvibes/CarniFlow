import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useActiveTraining, startUnit, addExercise, resetUnit, retryActiveTrainingLoad } from '../activeTraining';

let mockOwner = 'initial-owner';
let mockSerial = 0;
const mockGetAtomic = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockOwner } } }) }));
jest.mock('@/services/trainingDocumentService', () => ({ getAtomicTrainingDocument: (...args: unknown[]) => mockGetAtomic(...args) }));
let latest: ReturnType<typeof useActiveTraining>;
function Probe() { latest = useActiveTraining(); return null; }
const nodes: ReactTestRenderer[] = [];
const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
function render() { let node!: ReactTestRenderer; act(() => { node = TestRenderer.create(<Probe />); }); nodes.push(node); return node; }
function switchOwner(node: ReactTestRenderer, owner: string) { mockOwner = owner; act(() => { (node as unknown as { update: (v: React.ReactElement) => void }).update(<Probe />); }); }
const exercise = { discipline: 'Obedience', exercise_name: 'PRIVATE A', rating: 4, notes: 'private observation', duration_sec: 37 };
beforeEach(async () => { mockOwner = `owner-${++mockSerial}`; await AsyncStorage.clear(); mockGetAtomic.mockReset(); });
afterEach(async () => { await act(async () => { nodes.splice(0).forEach(node => node.unmount()); }); });

test('account switch hides and preserves both active drafts independently', async () => {
  const ownerA = mockOwner; const ownerB = `${ownerA}-b`; const node = render(); await flush();
  act(() => { startUnit({ unitId: 'unit-a', dogId: 'dog-a', dogName: 'A', ownerId: ownerA, sourceFingerprint: 'original' }); addExercise(exercise, ownerA); }); await flush();
  switchOwner(node, ownerB); await flush(); expect(latest.unitId).toBeNull(); expect(latest.exercises).toEqual([]);
  act(() => { startUnit({ unitId: 'unit-b', dogId: 'dog-b', dogName: 'B', ownerId: ownerB }); }); await flush();
  expect(resetUnit(ownerA)).toBe(false); expect(latest.unitId).toBe('unit-b');
  switchOwner(node, ownerA); await flush(); expect(latest.unitId).toBe('unit-a'); expect(latest.exercises[0]).toEqual(exercise);
  switchOwner(node, ownerB); await flush(); expect(latest.unitId).toBe('unit-b');
  expect(JSON.parse((await AsyncStorage.getItem(`active_training_v2:${ownerA}`))!).value.exercises[0].notes).toBe('private observation');
});
test('verified legacy draft is copied without time-based deletion, including old notes', async () => {
  const owner = mockOwner;
  const legacy = { unitId: 'legacy', dogId: 'legacy-dog', dogName: 'Old dog', startedAt: Date.now() - 48 * 3600 * 1000, exercises: [exercise], paused: true, pausedAt: Date.now(), accumPausedMs: 0, goalMinutes: 60 };
  await AsyncStorage.setItem('active_training', JSON.stringify(legacy));
  mockGetAtomic.mockResolvedValue({ data: { unit: { owner_id: owner, dog_id: 'legacy-dog' }, token: 'token' }, error: null });
  render(); await flush();
  expect(latest.unitId).toBe('legacy'); expect(latest.exercises[0].notes).toBe(exercise.notes);
  expect(await AsyncStorage.getItem(`active_training_v2:${owner}`)).not.toBeNull(); expect(await AsyncStorage.getItem('active_training')).toBeNull();
});
test('unverified global legacy bytes are retained and never shown to a different account', async () => {
  const raw = JSON.stringify({ unitId: 'foreign', dogId: 'foreign-dog', startedAt: Date.now(), exercises: [exercise] });
  await AsyncStorage.setItem('active_training', raw);
  mockGetAtomic.mockResolvedValue({ data: null, error: { code: 'NOT_FOUND' } });
  render(); await flush(); expect(latest.unitId).toBeNull(); expect(latest.exercises).toEqual([]);
  expect(await AsyncStorage.getItem('active_training')).toBe(raw);
});
test('a delayed account load cannot erase its stored draft or replace a newly started other-account unit', async () => {
  const ownerA = mockOwner; const ownerB = `${ownerA}-b`;
  const raw = JSON.stringify({ version: 1, value: { ownerId: ownerA, unitId: 'old-a', dogId: 'dog-a', startedAt: Date.now(), exercises: [exercise] } });
  await AsyncStorage.setItem(`active_training_v2:${ownerA}`, raw);
  const read = AsyncStorage.getItem as jest.Mock; const original = read.getMockImplementation()!;
  let resolveRead!: (value: string) => void;
  read.mockImplementation((key: string) => key === `active_training_v2:${ownerA}` ? new Promise<string>(resolve => { resolveRead = resolve; }) : original(key));
  const node = render(); await flush();
  switchOwner(node, ownerB); await flush();
  act(() => { startUnit({ unitId: 'new-b', dogId: 'dog-b', dogName: 'B', ownerId: ownerB }); });
  await act(async () => { resolveRead(raw); }); await flush();
  expect(latest.unitId).toBe('new-b'); expect(await original(`active_training_v2:${ownerA}`)).toBe(raw);
  read.mockImplementation(original);
});

test('starting during hydration cannot overwrite an existing same-account draft', async () => {
  const owner = mockOwner;
  const raw = JSON.stringify({ version: 1, value: { ownerId: owner, unitId: 'existing-own', dogId: 'dog-a', startedAt: Date.now(), exercises: [exercise] } });
  await AsyncStorage.setItem(`active_training_v2:${owner}`, raw);
  const read = AsyncStorage.getItem as jest.Mock; const original = read.getMockImplementation()!;
  let resolve!: (value: string) => void;
  read.mockImplementation((key: string) => key === `active_training_v2:${owner}` ? new Promise<string>(done => { resolve = done; }) : original(key));
  render(); await flush();
  expect(latest.hydrating).toBe(true);
  expect(startUnit({ unitId: 'new-unwanted', dogId: 'dog-a', dogName: 'A', ownerId: owner })).toBe(false);
  await act(async () => { resolve(raw); }); await flush();
  expect(latest.unitId).toBe('existing-own'); expect(latest.exercises[0].notes).toBe(exercise.notes);
  read.mockImplementation(original);
});
test('corrupt account draft is preserved and blocks a new start until an explicit successful reload', async () => {
  const owner = mockOwner; const key = `active_training_v2:${owner}`;
  await AsyncStorage.setItem(key, '{broken'); render(); await flush();
  expect(latest.hydrationError).toBe(true);
  expect(startUnit({ unitId: 'unwanted', dogId: 'dog-a', dogName: 'A', ownerId: owner })).toBe(false);
  expect(await AsyncStorage.getItem(key)).toBe('{broken');
  await AsyncStorage.setItem(key, JSON.stringify({ version: 1, value: { ownerId: owner, unitId: 'recovered', dogId: 'dog-a', startedAt: Date.now(), exercises: [exercise] } }));
  act(() => retryActiveTrainingLoad(owner)); await flush(); expect(latest.unitId).toBe('recovered');
});

test('offline legacy recovery remains visible as retryable and later restores the exact old inputs', async () => {
  const owner = mockOwner;
  const legacy = { unitId: 'offline-legacy', dogId: 'legacy-dog', startedAt: Date.now() - 123456, exercises: [exercise], paused: true, pausedAt: Date.now(), accumPausedMs: 6300, goalMinutes: 30 };
  const raw = JSON.stringify(legacy); await AsyncStorage.setItem('active_training', raw);
  mockGetAtomic.mockResolvedValueOnce({ data: null, error: { code: 'NETWORK_ERROR' } });
  render(); await flush(); expect(latest.hydrationError).toBe(true); expect(await AsyncStorage.getItem('active_training')).toBe(raw);
  mockGetAtomic.mockResolvedValueOnce({ data: { unit: { owner_id: owner, dog_id: 'legacy-dog' }, token: 'token' }, error: null });
  act(() => retryActiveTrainingLoad(owner)); await flush();
  expect(latest.unitId).toBe('offline-legacy'); expect(latest.startedAt).toBe(legacy.startedAt); expect(latest.accumPausedMs).toBe(6300); expect(latest.exercises).toEqual([exercise]);
});
