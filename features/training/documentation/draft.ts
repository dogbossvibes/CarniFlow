import AsyncStorage from '@react-native-async-storage/async-storage';

// One serial writer per key prevents an older, slower write from resurrecting
// a cleared draft. Account and edit identity are part of the storage key.
const writes = new Map<string, Promise<void>>();
export function documentDraftKey(ownerId: string, id?: string, entryContext?: string): string {
  return `training_document_v1:${encodeURIComponent(ownerId)}:${id ? `edit:${encodeURIComponent(id)}` : entryContext ? `new:${encodeURIComponent(entryContext)}` : 'new'}`;
}
function enqueue(key: string, run: () => Promise<void>): Promise<void> {
  const task = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
  writes.set(key, task);
  void task.finally(() => { if (writes.get(key) === task) writes.delete(key); }).catch(() => {});
  return task;
}
export async function loadDocumentDraft<T>(key: string): Promise<T | null> {
  await writes.get(key)?.catch(() => {});
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (parsed?.version !== 1) throw new Error('Unsupported training draft version');
  return parsed.value as T;
}
export function saveDocumentDraft(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify({ version: 1, value });
  return enqueue(key, () => AsyncStorage.setItem(key, raw));
}
export function clearDocumentDraft(key: string): Promise<void> {
  return enqueue(key, () => AsyncStorage.removeItem(key));
}
