import { getLocalDb } from '@/lib/localDb/client';
import { newLocalId, nowIso } from '@/lib/localDb/ids';
import type { SyncEntityType, SyncOperation, SyncQueueItem, SyncQueueStatus } from '@/features/sync/types/sync';

// Persistente Sync-Queue (SQLite). Jede offline-Aktion wird hier eingereiht.

export async function enqueueSyncOperation(input: {
  entityType: SyncEntityType; entityLocalId: string; operation: SyncOperation;
  priority?: number; payload?: unknown;
}): Promise<string> {
  const db = await getLocalDb();
  const id = newLocalId('sq');
  const ts = nowIso();
  await db.runAsync(
    `insert into sync_queue (id, entity_type, entity_local_id, operation, priority, payload_json, created_at, updated_at, attempts, status)
     values (?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')`,
    id, input.entityType, input.entityLocalId, input.operation, input.priority ?? 5,
    input.payload != null ? JSON.stringify(input.payload) : null, ts, ts,
  );
  return id;
}

export async function getPendingSyncOperations(limit = 100): Promise<SyncQueueItem[]> {
  const db = await getLocalDb();
  // Reihenfolge: Priorität (klein = wichtiger), dann FIFO. 'failed' wird über
  // retryFailedOperations wieder 'pending'.
  return db.getAllAsync<SyncQueueItem>(
    `select * from sync_queue where status in ('pending','processing') order by priority asc, created_at asc limit ?`, limit,
  );
}

export async function markSyncProcessing(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update sync_queue set status='processing', updated_at=? where id=?`, nowIso(), id);
}

export async function markSyncCompleted(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update sync_queue set status='completed', updated_at=? where id=?`, nowIso(), id);
}

export async function markSyncFailed(id: string, error: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update sync_queue set status='failed', attempts=attempts+1, last_error=?, updated_at=? where id=?`, error.slice(0, 500), nowIso(), id);
}

export async function markSyncConflict(id: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update sync_queue set status='conflict', updated_at=? where id=?`, nowIso(), id);
}

export async function retryFailedOperations(): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update sync_queue set status='pending', updated_at=? where status='failed'`, nowIso());
}

export async function syncQueueCounts(): Promise<{ pending: number; failed: number; conflict: number }> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ pending: number; failed: number; conflict: number }>(
    `select
       sum(case when status in ('pending','processing') then 1 else 0 end) as pending,
       sum(case when status='failed' then 1 else 0 end) as failed,
       sum(case when status='conflict' then 1 else 0 end) as conflict
     from sync_queue`,
  );
  return { pending: row?.pending ?? 0, failed: row?.failed ?? 0, conflict: row?.conflict ?? 0 };
}

export async function clearCompleted(): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`delete from sync_queue where status='completed'`);
}

export type { SyncQueueItem, SyncQueueStatus };
