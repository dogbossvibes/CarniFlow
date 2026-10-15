import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearDocumentDraft, documentDraftKey, loadDocumentDraft, saveDocumentDraft } from '../draft';
import { addTrainingFocuses, readTrainingFocuses, setTrainingFocusStatus, setTrainingFocusText, type TrainingFocus } from '../focus';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); });
const focus: TrainingFocus = { id: 'focus-1', dogId: 'dog-a', discipline: 'Obedience', originUnitId: 'unit-a',
  originDate: '2026-10-14', originText: 'Keep distance', text: 'Keep distance', status: 'open' };

test('drafts are isolated by account and edit target, and survive reopening', async () => {
  const key = documentDraftKey('owner-a');
  await saveDocumentDraft(key, { notes: 'My local input', planned: true });
  expect(await loadDocumentDraft(key)).toEqual({ notes: 'My local input', planned: true });
  expect(await loadDocumentDraft(documentDraftKey('owner-b'))).toBeNull();
  expect(await loadDocumentDraft(documentDraftKey('owner-a', 'edit-a'))).toBeNull();
});
test('a pending write cannot resurrect a cleared draft', async () => {
  const key = documentDraftKey('owner-a');
  const first = saveDocumentDraft(key, { notes: 'first' });
  const second = saveDocumentDraft(key, { notes: 'second' });
  const clear = clearDocumentDraft(key);
  await Promise.all([first, second, clear]);
  expect(await loadDocumentDraft(key)).toBeNull();
});
test('storage failures reject instead of claiming the draft is saved', async () => {
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  await expect(saveDocumentDraft(documentDraftKey('owner-a'), {})).rejects.toThrow('disk full');
  await saveDocumentDraft(documentDraftKey('owner-a'), { notes: 'retry' });
  expect(await loadDocumentDraft(documentDraftKey('owner-a'))).toEqual({ notes: 'retry' });
});
test('focus creation is local, idempotent and account isolated', async () => {
  await addTrainingFocuses('owner-a', [focus]);
  await addTrainingFocuses('owner-a', [{ ...focus, text: 'do not overwrite origin on retry' }]);
  expect(await readTrainingFocuses('owner-a')).toEqual([focus]);
  expect(await readTrainingFocuses('owner-b')).toEqual([]);
});
test('concurrent focus writes keep additions and explicit status without rewriting source notes', async () => {
  await addTrainingFocuses('owner-a', [focus]);
  await Promise.all([setTrainingFocusStatus('owner-a', focus.id, 'practice'), addTrainingFocuses('owner-a', [{ ...focus, id: 'focus-2' }])]);
  expect(await readTrainingFocuses('owner-a')).toEqual([{ ...focus, status: 'practice' }, { ...focus, id: 'focus-2' }]);
  await setTrainingFocusStatus('owner-a', focus.id, 'done');
  await addTrainingFocuses('owner-a', [focus]);
  expect((await readTrainingFocuses('owner-a'))[0]).toEqual({ ...focus, status: 'done' });
});
test('a missing source training does not destroy a focus or invent a new link', async () => {
  await addTrainingFocuses('owner-a', [focus]);
  await setTrainingFocusStatus('owner-a', focus.id, 'practice');
  expect((await readTrainingFocuses('owner-a'))[0]).toMatchObject({ originUnitId: 'unit-a', originDate: '2026-10-14', originText: 'Keep distance' });
});

test('changing current focus text leaves immutable source text, date and status intact', async () => {
  await addTrainingFocuses('owner-a', [focus]);
  await setTrainingFocusText('owner-a', focus.id, 'Updated current target');
  expect((await readTrainingFocuses('owner-a'))[0]).toEqual({ ...focus, text: 'Updated current target' });
});

test('queued focus operations are cancelled after the account context disappears', async () => {
  await addTrainingFocuses('owner-a', [focus]);
  let current = true;
  const change = setTrainingFocusStatus('owner-a', focus.id, 'done', () => current);
  current = false;
  await expect(change).rejects.toThrow('identity changed');
  expect((await readTrainingFocuses('owner-a'))[0].status).toBe('open');
});
