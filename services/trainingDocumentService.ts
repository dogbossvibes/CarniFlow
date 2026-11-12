import { supabase } from '@/lib/supabase';
import type { TrainingExercise, TrainingUnit } from '@/types/trainingUnit';

export interface TrainingDocumentError { code: string; message: string }
export type DocumentResult<T> = { data: T; error: null } | { data: null; error: TrainingDocumentError };
export type DocumentPatch = Partial<Omit<TrainingUnit, 'id' | 'owner_id' | 'created_at' | 'dog' | 'exercises'>>;
export type DocumentExercise = Omit<TrainingExercise, 'unit_id' | 'created_at' | 'id'> & {
  id: string; discipline_key?: string | null;
};
export interface FocusCreate {
  id: string; requestId: string; sourceUnitId: string; sourceExerciseId?: string;
  disciplineKey: string; text: string;
}
export interface FocusUpdate { id: string; requestId: string; expectedRevision: number; text?: string; status?: 'open' | 'practice' | 'done' }
export interface DocumentSave {
  requestId: string; unitId: string; expectedToken: string | null;
  unit: DocumentPatch; exercises: DocumentExercise[];
  focusChanges?: ({ action: 'create'; request: FocusCreate } | { action: 'update'; request: FocusUpdate })[];
  identityChanges?: { request: { id: string; requestId: string; expectedRevision: null; disciplineKey: string; displayName: string } }[];
}
export interface DocumentSaved { version: 1; unitId: string; token: string; currentToken: string; duplicate: boolean; exerciseIds: string[] }
export interface ExerciseIdentity {
  id: string; owner_id: string; discipline_key: string; display_name: string;
  revision: number; archived_at: string | null;
}
export interface ServerFocus {
  id: string; owner_id: string; dog_id: string; discipline_key: string;
  exercise_identity_id: string | null; source_unit_id: string | null; source_unit_snapshot_id: string;
  source_date_snapshot: string; exercise_name_snapshot: string | null; source_text_snapshot: string;
  text: string; status: 'open' | 'practice' | 'done'; revision: number;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function errorOf(value: unknown): TrainingDocumentError {
  const raw = object(value) ? value : {};
  const message = typeof raw.message === 'string' ? raw.message : value instanceof Error ? value.message : 'Training request failed';
  const known = /\b(UNAUTHENTICATED|CONTEXT_CHANGED|NOT_FOUND|CONFLICT|REQUEST_ID_REUSED|QUOTA_EXCEEDED|INVALID_[A-Z_]+|IMMUTABLE_SOURCE)\b/.exec(message)?.[1];
  return { code: known === 'QUOTA_EXCEEDED' ? 'quota_exceeded' : known ?? (typeof raw.code === 'string' ? raw.code : 'NETWORK_ERROR'), message };
}
const cancelled = (): TrainingDocumentError => ({ code: 'CONTEXT_CHANGED', message: 'Training context changed' });
async function invoke<T>(owner: string, rpc: string, action: string, request: object,
  valid: (value: unknown) => value is T, current: () => boolean): Promise<DocumentResult<T>> {
  if (!owner || !current()) return { data: null, error: cancelled() };
  try {
    const { data, error } = await supabase.rpc(rpc, { p_action: action, p_request: { ...request, expectedOwnerId: owner } });
    if (!current()) return { data: null, error: cancelled() };
    if (error) return { data: null, error: errorOf(error) };
    if (!valid(data)) return { data: null, error: { code: 'INVALID_RESPONSE', message: 'Unconfirmed training response' } };
    return { data, error: null };
  } catch (error) { return { data: null, error: current() ? errorOf(error) : cancelled() }; }
}
export async function getAtomicTrainingDocument(owner: string, unitId: string, current: () => boolean = () => true): Promise<DocumentResult<{ unit: TrainingUnit; token: string }>> {
  const result = await invoke(owner, 'training_document_v1', 'get', { unitId },
    (v): v is { token: string; document: { unit: TrainingUnit; exercises: TrainingExercise[] } } => object(v) && v.version === 1 && v.unitId === unitId
      && typeof v.token === 'string' && object(v.document) && object(v.document.unit) && v.document.unit.id === unitId
      && v.document.unit.owner_id === owner && Array.isArray(v.document.exercises), current);
  return result.error ? result : { data: { unit: { ...result.data.document.unit, exercises: result.data.document.exercises }, token: result.data.token }, error: null };
}
export async function saveAtomicTrainingDocument(owner: string, request: DocumentSave, current: () => boolean = () => true): Promise<DocumentResult<DocumentSaved>> {
  const payload = { ...request,
    ...(request.focusChanges ? { focusChanges: request.focusChanges.map(change => ({ ...change, request: { ...change.request, expectedOwnerId: owner } })) } : {}),
    ...(request.identityChanges ? { identityChanges: request.identityChanges.map(change => ({ request: { ...change.request, expectedOwnerId: owner } })) } : {}),
  };
  const result = await invoke(owner, 'training_document_v1', 'save', payload,
    (v): v is DocumentSaved => object(v) && v.version === 1 && v.unitId === request.unitId && typeof v.token === 'string'
      && typeof v.currentToken === 'string' && typeof v.duplicate === 'boolean' && Array.isArray(v.exerciseIds)
      && v.exerciseIds.length === request.exercises.length && v.exerciseIds.every((id, i) => id === request.exercises[i].id), current);
  if (!result.error && result.data.currentToken !== result.data.token) return { data: null, error: { code: 'CONFLICT', message: 'Training changed after the saved request' } };
  return result;
}
function identity(v: unknown, owner: string): v is ExerciseIdentity {
  return object(v) && typeof v.id === 'string' && v.owner_id === owner && typeof v.discipline_key === 'string'
    && typeof v.display_name === 'string' && Number.isSafeInteger(v.revision);
}
export function listExerciseIdentities(owner: string, disciplineKey: string, afterId?: string, current: () => boolean = () => true) {
  return invoke(owner, 'training_exercise_identity_v1', 'list', { disciplineKey, ...(afterId ? { afterId } : {}) },
    (v): v is ExerciseIdentity[] => Array.isArray(v) && v.every(row => identity(row, owner) && row.discipline_key === disciplineKey), current);
}
export function saveExerciseIdentity(owner: string, request: { id: string; requestId: string; expectedRevision: number | null; disciplineKey?: string; displayName?: string; archived?: boolean }, current: () => boolean = () => true) {
  return invoke(owner, 'training_exercise_identity_v1', 'save', request,
    (v): v is { identity: ExerciseIdentity; duplicate: boolean } => object(v) && identity(v.identity, owner) && v.identity.id === request.id && typeof v.duplicate === 'boolean', current);
}
function focus(v: unknown, owner: string): v is ServerFocus {
  return object(v) && typeof v.id === 'string' && v.owner_id === owner && typeof v.dog_id === 'string'
    && typeof v.discipline_key === 'string' && typeof v.text === 'string' && ['open', 'practice', 'done'].includes(String(v.status))
    && typeof v.source_unit_snapshot_id === 'string' && typeof v.source_date_snapshot === 'string' && Number.isSafeInteger(v.revision);
}
export function listServerTrainingFocuses(owner: string, dogId?: string, disciplineKey?: string, afterId?: string, current: () => boolean = () => true) {
  return invoke(owner, 'training_focus_v1', 'list', { ...(dogId ? { dogId } : {}), ...(disciplineKey ? { disciplineKey } : {}), ...(afterId ? { afterId } : {}) },
    (v): v is ServerFocus[] => Array.isArray(v) && v.every(row => focus(row, owner) && (!dogId || row.dog_id === dogId) && (!disciplineKey || row.discipline_key === disciplineKey)), current);
}
export function updateServerTrainingFocus(owner: string, request: FocusUpdate, current: () => boolean = () => true) {
  return invoke(owner, 'training_focus_v1', 'update', request,
    (v): v is { focus: ServerFocus; duplicate: boolean } => object(v) && focus(v.focus, owner) && v.focus.id === request.id && typeof v.duplicate === 'boolean', current);
}
