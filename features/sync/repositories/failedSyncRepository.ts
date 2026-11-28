import { getLocalDb } from '@/lib/localDb/client';
import { nowIso } from '@/lib/localDb/ids';
import type { SyncEntityType, SyncOperation } from '@/features/sync/types/sync';

// Sync-Center: fehlgeschlagene Queue-Einträge lesen, einzeln erneut versuchen und
// Fährten mit fehlendem Hund einem bestehenden Hund zuordnen.
//
// Kundendatenschutz: Hier wird NIE etwas gelöscht. Das Zuordnen ändert ausschliesslich
// die dog_id der lokalen Session (plus die dog_id lokaler Bewertungs-Verweise derselben
// Session) und setzt den Upload wieder auf „ausstehend". Punkte, Marker, Gegenstände,
// payload_json (inkl. run), Datumswerte und Notizen bleiben unverändert.

export interface FailedSyncItem {
  queueId: string;
  entityType: SyncEntityType;
  entityLocalId: string;
  operation: SyncOperation;
  attempts: number;
  lastError: string | null;
  /** Nur bei training_session mit vorhandener lokaler Zeile. */
  session: null | {
    userId: string;
    dogId: string | null;
    type: string | null;
    title: string | null;
    startedAt: string | null;
    createdAt: string;
    payloadJson: string | null;
  };
}

interface Row {
  id: string; entity_type: SyncEntityType; entity_local_id: string; operation: SyncOperation;
  attempts: number | null; last_error: string | null;
  s_local_id: string | null; user_id: string | null; dog_id: string | null; type: string | null; title: string | null;
  started_at: string | null; s_created_at: string | null; payload_json: string | null; last_sync_error: string | null;
}

export async function listFailedSyncItems(): Promise<FailedSyncItem[]> {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<Row>(
    `select q.id, q.entity_type, q.entity_local_id, q.operation, q.attempts, q.last_error,
            s.local_id as s_local_id, s.user_id, s.dog_id, s.type, s.title, s.started_at,
            s.created_at as s_created_at, s.payload_json, s.last_sync_error
       from sync_queue q
       left join local_training_sessions s
         on q.entity_type = 'training_session' and s.local_id = q.entity_local_id
      where q.status = 'failed'
      order by q.created_at asc`,
  );
  return rows.map(r => ({
    queueId: r.id, entityType: r.entity_type, entityLocalId: r.entity_local_id, operation: r.operation,
    attempts: r.attempts ?? 0, lastError: r.last_error ?? r.last_sync_error ?? null,
    session: r.s_local_id ? {
      userId: r.user_id ?? '', dogId: r.dog_id, type: r.type, title: r.title,
      startedAt: r.started_at, createdAt: r.s_created_at ?? '', payloadJson: r.payload_json,
    } : null,
  }));
}

/** Genau einen fehlgeschlagenen Eintrag wieder in den Upload nehmen (failed → pending). */
export async function retryFailedQueueItem(queueId: string): Promise<boolean> {
  const db = await getLocalDb();
  const res = await db.runAsync(`update sync_queue set status='pending', updated_at=? where id=? and status='failed'`, nowIso(), queueId);
  return (res?.changes ?? 0) > 0;
}

export interface ReassignResult { reassigned: string[]; skipped: string[] }

const setJsonDogId = (json: string, dogId: string): string | null => {
  try {
    const v = JSON.parse(json);
    if (!v || typeof v !== 'object') return null;
    return JSON.stringify({ ...v, dogId });
  } catch { return null; }
};

/**
 * Lokale Fährten einem bestehenden Hund zuordnen und den Upload wieder anstossen.
 * Nur Sessions des angegebenen Kontos; jede Session wird nur geändert, wenn ihre dog_id
 * seit dem Lesen unverändert ist (keine stillen Überschreibungen). Atomar je Aufruf.
 */
export async function reassignDogForSessions(localIds: readonly string[], newDogId: string, ownerId: string): Promise<ReassignResult> {
  const reassigned: string[] = [];
  const skipped: string[] = [];
  if (!newDogId || !ownerId || localIds.length === 0) return { reassigned, skipped: [...localIds] };
  const db = await getLocalDb();
  const ts = nowIso();
  await db.withExclusiveTransactionAsync(async tx => {
    for (const localId of new Set(localIds)) {
      const row = await tx.getFirstAsync<{ dog_id: string | null; user_id: string }>(
        'select dog_id, user_id from local_training_sessions where local_id=?', localId);
      if (!row || row.user_id !== ownerId) { skipped.push(localId); continue; }
      const oldDogId = row.dog_id;
      // Nur dog_id + Sync-Status. updated_at bleibt (Datumswerte der Fährte unverändert).
      const upd = await tx.runAsync(
        `update local_training_sessions
            set dog_id=?, sync_status=case when sync_status='synced' then sync_status else 'pending' end, last_sync_error=null
          where local_id=? and user_id=? and dog_id is ?`,
        newDogId, localId, ownerId, oldDogId);
      if ((upd?.changes ?? 0) === 0) { skipped.push(localId); continue; }

      // Abhängige lokale Verweise (Objektbewertungen derselben Session): Spalte und JSON
      // konsistent mitziehen, sonst passt der Schlüssel (sessionId+runId+dogId) nicht mehr.
      if (oldDogId) {
        const outbox = await tx.getAllAsync<{ operation_id: string; request_json: string }>(
          `select operation_id, request_json from track_object_review_outbox
            where owner_id=? and session_id=? and dog_id=? and state in ('pending','failed','conflict')`,
          ownerId, localId, oldDogId);
        for (const o of outbox) {
          const next = setJsonDogId(o.request_json, newDogId);
          if (!next) continue;   // unlesbar → unverändert lassen, nichts verwerfen
          await tx.runAsync(
            `update track_object_review_outbox set dog_id=?, request_json=? where operation_id=? and owner_id=? and dog_id=?`,
            newDogId, next, o.operation_id, ownerId, oldDogId);
        }
        const cache = await tx.getAllAsync<{ run_id: string; response_json: string }>(
          'select run_id, response_json from track_object_review_cache where owner_id=? and session_id=? and dog_id=?',
          ownerId, localId, oldDogId);
        for (const c of cache) {
          const next = setJsonDogId(c.response_json, newDogId);
          if (!next) continue;
          await tx.runAsync(
            'update track_object_review_cache set dog_id=?, response_json=? where owner_id=? and run_id=? and dog_id=?',
            newDogId, next, ownerId, c.run_id, oldDogId);
        }
      }

      await tx.runAsync(
        `update sync_queue set status='pending', updated_at=?
          where entity_type='training_session' and entity_local_id=? and status='failed'`,
        ts, localId);
      reassigned.push(localId);
    }
  });
  return { reassigned, skipped };
}
