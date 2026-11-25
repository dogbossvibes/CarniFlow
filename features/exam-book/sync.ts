import { supabase } from '@/lib/supabase';
import type { ExamResult } from './model';
import {
  confirmExamSynced, examFromRow, markExamConflict, mergeRemoteExams, noteExamError, openExamOperations,
  type ExamRow,
} from './store';

// Abgleich des lokalen Prüfungsbuchs mit public.dog_exam_results.
// Hochladen per Upsert (id ist auf allen Geräten gleich). Eine Änderung von einem
// anderen Gerät wird nie stillschweigend überschrieben: ist der Serverstand neuer
// als der Stand, auf dem die lokale Änderung beruht, wird die Zeile als Konflikt
// markiert und lokal behalten. Gelöscht wird nichts (kein DELETE, nur deleted_at).

const REMOTE = 'dog_exam_results';
export const SERVER_NOT_READY = 'SERVER_NOT_READY';     // Tabelle fehlt (Migration noch nicht ausgeführt)
export const WAITING_FOR_SERVER = 'WAITING_FOR_SERVER'; // z. B. Hund noch nicht auf dem Server

const COLUMNS = 'id, owner_id, dog_id, client_local_id, exam_date, location, club, judge, exam_type, exam_type_label, exam_level, sections, total_points, max_points, rating, passed, placement, notes, schema_version, created_at, updated_at, deleted_at';

type PgError = { code?: string | null; message?: string | null } | null;
const tableMissing = (e: PgError) => !!e && (e.code === '42P01' || e.code === 'PGRST205'
  || /dog_exam_results.*(does not exist|schema cache)/i.test(e.message ?? ''));
const notAllowedYet = (e: PgError) => !!e && (e.code === '42501' || e.code === '23503');

export interface ExamSyncResult { synced: number; conflicts: number; waiting: number; failed: number; serverReady: boolean }

const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

function toRemote(exam: ExamResult) {
  return {
    id: exam.id, owner_id: exam.owner_id, dog_id: exam.dog_id, client_local_id: exam.client_local_id,
    exam_date: exam.exam_date, location: exam.location, club: exam.club, judge: exam.judge,
    exam_type: exam.exam_type, exam_type_label: exam.exam_type_label, exam_level: exam.exam_level,
    sections: exam.sections, total_points: exam.total_points, max_points: exam.max_points,
    rating: exam.rating, passed: exam.passed, placement: exam.placement, notes: exam.notes,
    schema_version: exam.schema_version, created_at: exam.created_at, updated_at: exam.updated_at,
    deleted_at: exam.deleted_at,
  };
}

async function push(row: ExamRow): Promise<'synced' | 'conflict' | 'waiting' | 'failed' | 'not_ready'> {
  const exam = examFromRow(row);
  if (!exam) { await noteExamError(row, 'INVALID_LOCAL_ROW'); return 'failed'; }

  // Serverstand lesen: wurde der Eintrag seit unserer Grundlage woanders geändert?
  const current = await supabase.from(REMOTE).select('updated_at').eq('id', exam.id).maybeSingle();
  if (current.error) {
    if (tableMissing(current.error)) { await noteExamError(row, SERVER_NOT_READY); return 'not_ready'; }
    await noteExamError(row, current.error.message ?? 'Sync-Fehler'); return 'failed';
  }
  const serverMs = ms((current.data as { updated_at?: string } | null)?.updated_at);
  const baseMs = ms(row.base_updated_at);
  if (serverMs != null && (baseMs == null || serverMs > baseMs)) {
    await markExamConflict(row);
    return 'conflict';
  }

  const { error } = await supabase.from(REMOTE).upsert(toRemote(exam), { onConflict: 'id' });
  if (!error) { await confirmExamSynced(row, exam.updated_at); return 'synced'; }
  if (tableMissing(error)) { await noteExamError(row, SERVER_NOT_READY); return 'not_ready'; }
  if (notAllowedYet(error)) { await noteExamError(row, WAITING_FOR_SERVER); return 'waiting'; }
  await noteExamError(row, error.message ?? 'Sync-Fehler'); return 'failed';
}

let running: Promise<ExamSyncResult> | null = null;

/** Lädt alle wartenden Einträge der angemeldeten Person hoch. Wirft nicht. */
export function syncExamBook(ownerId: string, options?: { sessionVerified?: boolean }): Promise<ExamSyncResult> {
  if (running) return running;
  const task = (async (): Promise<ExamSyncResult> => {
    const result: ExamSyncResult = { synced: 0, conflicts: 0, waiting: 0, failed: 0, serverReady: true };
    try {
      if (!ownerId) return result;
      if (!options?.sessionVerified) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user.id !== ownerId) return result;
      }
      for (const row of await openExamOperations(ownerId)) {
        const outcome = await push(row);
        if (outcome === 'not_ready') { result.serverReady = false; result.waiting++; break; }
        if (outcome === 'conflict') result.conflicts++;
        else result[outcome]++;
      }
    } catch { result.failed++; }
    return result;
  })();
  running = task;
  void task.finally(() => { if (running === task) running = null; });
  return task;
}

/** Serverstand der eigenen Einträge (optional eines Hundes) nachladen. Offline oder ohne Tabelle: keine Wirkung. */
export async function refreshExamBook(ownerId: string, dogId?: string | null): Promise<boolean> {
  if (!ownerId) return false;
  try {
    let query = supabase.from(REMOTE).select(COLUMNS).eq('owner_id', ownerId);
    if (dogId) query = query.eq('dog_id', dogId);
    const { data, error } = await query.limit(1000);
    if (error || !Array.isArray(data)) return false;
    await mergeRemoteExams(ownerId, data);
    return true;
  } catch { return false; }
}

/** Serverstand eines Eintrags (für die Konfliktlösung in der Oberfläche). */
export async function fetchRemoteExam(id: string): Promise<unknown | null> {
  try {
    const { data, error } = await supabase.from(REMOTE).select(COLUMNS).eq('id', id).maybeSingle();
    return error ? null : data ?? null;
  } catch { return null; }
}
