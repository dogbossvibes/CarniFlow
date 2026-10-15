import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import type { TrainingUnit, TrainingExercise, AudioFile } from '@/types/trainingUnit';
import type { TrainingMetrics } from '@/types/analytics';
import { createEmbeddingForTrainingSession, createEmbeddingForExerciseNote } from '@/features/ai/services/trainingEmbeddingService';
import { getAtomicTrainingDocument, type DocumentPatch, type DocumentSave } from './trainingDocumentService';
import { commitTrainingSave, saveFingerprint } from '@/features/training/documentation/saveIntent';
import { trainingUnitFingerprint } from '@/features/training/documentation/retry';

// Embeddings für die semantische Suche erzeugen — NON-BLOCKING (fire-and-forget,
// schluckt Fehler intern). Darf das Speichern der Einheit nie aufhalten.
function embedUnitContent(
  unitId: string, dogId: string | null, notes: string | null,
  exercises: { discipline: string; notes: string | null }[], sessionDate?: string | null,
) {
  const category = exercises[0]?.discipline ?? null;
  const metadata = { unit_id: unitId, dog_id: dogId, category, session_date: sessionDate ?? null };
  if (notes && notes.trim()) {
    void createEmbeddingForTrainingSession({ sourceId: unitId, content: notes, metadata });
  }
  const exNotes = exercises
    .map(e => (e.notes ? `${e.discipline}: ${e.notes}` : null))
    .filter(Boolean).join('\n');
  if (exNotes) {
    void createEmbeddingForExerciseNote({ sourceId: unitId, content: exNotes, metadata });
  }
}

// Verbundene Trainer:innen mit view_trainings-Berechtigung über neue Aktivität
// der Kund:in informieren (best-effort, connection-basiert).
async function notifyTrainersOfActivity(ownerId: string, title: string) {
  try {
    const { data: conns } = await supabase
      .from('connections')
      .select('connected_user_id, connection_permissions(view_trainings)')
      .eq('owner_user_id', ownerId)
      .eq('status', 'accepted');
    const trainerIds = (conns ?? [])
      .filter((c: any) => c.connection_permissions?.view_trainings ?? c.connection_permissions?.[0]?.view_trainings)
      .map((c: any) => c.connected_user_id as string);
    if (!trainerIds.length) return;

    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', ownerId).single();
    const name = (prof?.full_name ?? 'Eine Kund:in') as string;

    await supabase.functions.invoke('notify', {
      body: { user_ids: trainerIds, title, body: `${name} hat eine neue Einheit abgeschlossen.`, data: { type: 'activity' } },
    });
  } catch { /* best-effort */ }
}

interface DocumentedUnitInput extends TrainingMetrics {
  dog_id:       string;
  session_date: string;
  started_at:   string | null;
  ended_at:     string | null;
  duration_sec: number | null;
  score:        number | null;
  notes:        string | null;
  photos:       string[];
  videos:       string[];
  audio_files:  AudioFile[];
  shared_with_trainer: boolean;
}

// Liste abgeschlossener Einheiten (mit Hund + Übungen) für den Verlauf.
export function getTrainingUnits(ownerId: string, dogId?: string) {
  let q = supabase
    .from('training_units')
    .select('*, dog:dogs(name), exercises:training_exercises(*)')
    .eq('owner_id', ownerId)
    .eq('status', 'completed')
    .order('session_date', { ascending: false })
    .order('created_at',   { ascending: false });
  if (dogId) q = q.eq('dog_id', dogId);
  return q;
}

// Apply the discipline before the bound, so many unrelated sessions do not
// hide the last matching training. Keep the existing all-unit feed unchanged.
export function getTrainingPreparationUnits(ownerId: string, dogId: string, discipline: string) {
  return supabase.from('training_units')
    .select('*, dog:dogs(name), exercises:training_exercises!inner(*)')
    .eq('owner_id', ownerId).eq('dog_id', dogId).eq('status', 'completed')
    .eq('exercises.discipline', discipline)
    .order('session_date', { ascending: false }).order('created_at', { ascending: false });
}

// Rein lesend, KEIN neues Schema: leitet „zuletzt selbst benutzte eigene Übungen"
// für eine feste Sparte aus der bestehenden Trainingshistorie ab (training_exercises
// über die bereits vorhandene FK-Relation zu training_units gefiltert nach
// owner_id). Ersetzt für System-Sparten (die keine editierbare Übungsliste haben,
// im Gegensatz zu custom_categories) eine eigene Persistenz-Tabelle.
export async function getRecentExerciseNames(ownerId: string, discipline: string, limit = 20, dogId?: string) {
  let query = supabase
    .from('training_exercises')
    .select('exercise_name, created_at, training_units!inner(owner_id,dog_id,status)')
    .eq('discipline', discipline)
    .eq('training_units.owner_id', ownerId)
    .eq('training_units.status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (dogId) query = query.eq('training_units.dog_id', dogId);
  const { data, error } = await query;
  if (error) return { data: [] as string[], error };
  const names: string[] = [];
  for (const row of (data ?? []) as { exercise_name: string }[]) {
    if (!names.includes(row.exercise_name)) names.push(row.exercise_name);
  }
  return { data: names, error: null };
}

export function getTrainingUnitById(id: string) {
  return supabase
    .from('training_units')
    .select('*, dog:dogs(name), exercises:training_exercises(*)')
    .eq('id', id)
    .single();
}

// Legt eine neue, laufende Einheit an (status 'active').
export async function createTrainingUnit(
  ownerId: string,
  dogId:   string,
) {
  return supabase
    .from('training_units')
    .insert({
      owner_id:     ownerId,
      dog_id:       dogId,
      session_date: new Date().toISOString().split('T')[0],
      started_at:   new Date().toISOString(),
      status:       'active',
    })
    .select('*')
    .single();
}

type ExerciseInput = Omit<TrainingExercise, 'unit_id' | 'created_at'>;
interface AtomicSaveOptions {
  operationId?: string;
  current?: () => boolean;
  expectedFingerprint?: string;
  focusChanges?: DocumentSave['focusChanges'];
  identityChanges?: DocumentSave['identityChanges'];
}

// Every completion/documentation route uses this single transactional RPC.
// The server owns quota, authorization, CAS, child replacement and receipts.
export async function saveDocumentedUnitAtomic(
  ownerId: string, unitId: string, unit: DocumentPatch, exercises: ExerciseInput[],
  mode: 'create' | 'edit' | 'finish', options: AtomicSaveOptions = {},
) {
  const current = options.current ?? (() => true);
  if (mode === 'edit' && !options.expectedFingerprint) return { data: null, error: { code: 'CONFLICT', message: 'An edit requires its original training snapshot' } };
  const fingerprint = saveFingerprint({ unit, exercises, mode, operationId: options.operationId, focusChanges: options.focusChanges, identityChanges: options.identityChanges });
  const result = await commitTrainingSave(ownerId, unitId, fingerprint, async () => {
    let expectedToken: string | null = null;
    if (mode !== 'create') {
      const latest = await getAtomicTrainingDocument(ownerId, unitId, current);
      if (latest.error) return latest;
      if (mode === 'finish') {
        const remote = latest.data.unit;
        const resultFields = ['duration_sec', 'rating', 'score', 'notes', 'motivation', 'konzentration', 'praezision', 'ausdauer', 'trieblage', 'impulskontrolle'] as const;
        // Old active drafts have no captured baseline. Only an untouched empty
        // active result can be adopted; existing results are never overwritten.
        if (remote.status !== 'active' || (!options.expectedFingerprint && (
          remote.exercises?.length || remote.ended_at != null || resultFields.some(field => remote[field] != null)
        ))) return { data: null, error: { code: 'CONFLICT', message: 'Remote training already changed or completed' } };
      }
      if (options.expectedFingerprint && trainingUnitFingerprint(latest.data.unit) !== options.expectedFingerprint) {
        return { data: null, error: { code: 'CONFLICT', message: 'Training changed before saving' } };
      }
      expectedToken = latest.data.token;
    }
    return { error: null, data: {
      unitId, requestId: options.operationId ?? Crypto.randomUUID(), expectedToken,
      unit: { ...unit, ...(mode === 'finish' ? { ended_at: new Date().toISOString() } : {}), status: 'completed' as const },
      exercises: exercises.map(e => ({ ...e, id: e.id ?? Crypto.randomUUID() })),
      ...(options.focusChanges ? { focusChanges: options.focusChanges } : {}),
      ...(options.identityChanges ? { identityChanges: options.identityChanges } : {}),
    } };
  }, current);
  if (result.error) return { data: null, error: result.error };
  if (current() && !result.data.duplicate && mode !== 'edit') {
    void notifyTrainersOfActivity(ownerId, '🐾 Neue Aktivität');
    embedUnitContent(unitId, unit.dog_id ?? null, unit.notes ?? null, exercises, unit.session_date);
  }
  return { data: { id: unitId, ...result.data }, error: null };
}

export function finishTrainingUnit(
  unitId: string,
  updates: { duration_sec: number; rating: number | null; notes: string | null; shared_with_trainer?: boolean } & Partial<TrainingMetrics>,
  exercises: ExerciseInput[], ownerId: string, current?: () => boolean, expectedFingerprint?: string, operationId?: string,
) {
  return saveDocumentedUnitAtomic(ownerId, unitId, updates, exercises, 'finish', { current, expectedFingerprint, operationId });
}

export function createDocumentedUnit(
  ownerId: string, unit: DocumentedUnitInput, exercises: ExerciseInput[],
  unitId = Crypto.randomUUID(), current?: () => boolean,
) {
  return saveDocumentedUnitAtomic(ownerId, unitId, unit, exercises, 'create', { current });
}

export function updateDocumentedUnit(
  unitId: string, unit: DocumentedUnitInput, exercises: ExerciseInput[],
  current: () => boolean, ownerId: string, expectedFingerprint: string,
) {
  return saveDocumentedUnitAtomic(ownerId, unitId, unit, exercises, 'edit', { current, expectedFingerprint });
}

export async function deleteTrainingUnit(id: string) {
  // Zugehörige Embeddings mitlöschen (Units verknüpfen über source_id, kein FK-Cascade).
  await supabase.from('training_embeddings').delete().eq('source_id', id);
  return supabase.from('training_units').delete().eq('id', id);
}

export type { TrainingUnit, TrainingExercise };
