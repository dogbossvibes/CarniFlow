import { clearDocumentDraft, loadDocumentDraft, saveDocumentDraft } from './draft';
import { saveAtomicTrainingDocument, type DocumentResult, type DocumentSave, type DocumentSaved } from '@/services/trainingDocumentService';

export interface SaveIntent { fingerprint: string; request: DocumentSave; completed: boolean }
const queues = new Map<string, Promise<unknown>>();
const keyFor = (owner: string, unitId: string) => `training_atomic_save_v1:${encodeURIComponent(owner)}:${encodeURIComponent(unitId)}`;
// Object key order is irrelevant; array order (especially exercise order) is not.
export function saveFingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(saveFingerprint).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${saveFingerprint(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export async function readTrainingSaveIntent(owner: string, unitId: string): Promise<SaveIntent | null> {
  const key = keyFor(owner, unitId);
  await queues.get(key)?.catch(() => {});
  const saved = await loadDocumentDraft<SaveIntent>(key);
  if (!saved) return null;
  if (!saved.request || saved.request.unitId !== unitId || typeof saved.request.requestId !== 'string'
      || !Array.isArray(saved.request.exercises) || typeof saved.completed !== 'boolean') throw new Error('Invalid training save intent');
  return saved;
}
export async function readPendingTrainingSave(owner: string, unitId: string): Promise<DocumentSave | null> {
  const saved = await readTrainingSaveIntent(owner, unitId);
  return saved && !saved.completed ? saved.request : null;
}
export async function retryTrainingSave(owner: string, unitId: string, requestId: string, current: () => boolean = () => true): Promise<DocumentResult<DocumentSaved>> {
  const saved = await readTrainingSaveIntent(owner, unitId);
  if (!saved || saved.request.requestId !== requestId) return { data: null, error: { code: 'UNRESOLVED_SAVE', message: 'Saved request unavailable' } };
  return commitTrainingSave(owner, unitId, saved.fingerprint, async () => ({ data: saved.request, error: null }), current);
}
// The exact request, occurrence IDs and quota reference survive a lost reply or
// app restart. There is deliberately no HTTP parent/delete/child fallback.
export function commitTrainingSave(owner: string, unitId: string, fingerprint: string,
  build: () => Promise<DocumentResult<DocumentSave>>, current: () => boolean = () => true): Promise<DocumentResult<DocumentSaved>> {
  const key = keyFor(owner, unitId);
  const task = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async (): Promise<DocumentResult<DocumentSaved>> => {
    const contextError = { code: 'CONTEXT_CHANGED', message: 'Training context changed' };
    if (!current()) return { data: null, error: contextError };
    try {
      let saved = await loadDocumentDraft<SaveIntent>(key);
      if (!current()) return { data: null, error: contextError };
      if (saved && (!saved.request || saved.request.unitId !== unitId || typeof saved.completed !== 'boolean')) throw new Error('Invalid training save intent');
      if (saved && !saved.completed && saved.fingerprint !== fingerprint) return { data: null, error: { code: 'UNRESOLVED_SAVE', message: 'Resolve the previous training save before changing its inputs' } };
      if (!saved || saved.fingerprint !== fingerprint) {
        const built = await build();
        if (built.error) return built;
        if (!current()) return { data: null, error: contextError };
        saved = { fingerprint, request: built.data, completed: false };
        await saveDocumentDraft(key, saved);
      }
      if (!current()) return { data: null, error: contextError };
      const result = await saveAtomicTrainingDocument(owner, saved.request, current);
      if (!current()) return { data: null, error: contextError };
      if (!result.error) await saveDocumentDraft(key, { ...saved, completed: true });
      else if (['quota_exceeded', 'CONFLICT', 'REQUEST_ID_REUSED', 'NOT_FOUND', 'UNAUTHENTICATED'].includes(result.error.code)
        || (result.error.code.startsWith('INVALID_') && result.error.code !== 'INVALID_RESPONSE') || /^23\d{3}$/.test(result.error.code)) {
        // A confirmed server rejection rolled back the entire transaction.
        await clearDocumentDraft(key);
      }
      return result;
    } catch (error) {
      return { data: null, error: { code: 'LOCAL_SAVE_ERROR', message: error instanceof Error ? error.message : 'Training draft unavailable' } };
    }
  });
  queues.set(key, task);
  void task.finally(() => { if (queues.get(key) === task) queues.delete(key); }).catch(() => {});
  return task;
}
