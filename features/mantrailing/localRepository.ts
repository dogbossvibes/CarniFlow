import { getLocalDb } from '@/lib/localDb/client';
import { createLocalTrainingSession, type NewLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';
import { enqueueSyncOperation } from '@/features/sync/repositories/syncQueueRepository';
import { MANTRAIL_CATEGORY, MANTRAIL_SESSION_TYPE, MANTRAIL_TITLE, parseMantrailData, type MantrailData } from './model';

// Lokaler Speicher für Mantrailing (Spec 02, PR A). Nutzt die bestehende Tabelle
// local_training_sessions und den bestehenden Sync (training_session/create).
// Schutz: Diese Funktionen schreiben NUR Zeilen mit type = 'mantrail' und nur den
// Schlüssel payload_json.mantrail; IGP-Fährten werden nie verändert.
//
// Hinweis für die Aufzeichnung (PR B): finalizeLocalTrainingSession ersetzt
// payload_json vollständig. Mantrailing-Angaben daher NACH dem Abschluss mit
// setLocalMantrailDetails schreiben (oder erneut schreiben).

export type NewLocalMantrail = Omit<NewLocalTrainingSession, 'type' | 'category' | 'title'> & { title?: string | null };

/** Neue Mantrailing-Sitzung lokal anlegen (idempotent je local_id) und zum Upload vormerken. */
export async function createLocalMantrailSession(input: NewLocalMantrail, data?: MantrailData | null): Promise<string> {
  const row = await createLocalTrainingSession({
    ...input, type: MANTRAIL_SESSION_TYPE, category: MANTRAIL_CATEGORY, title: input.title ?? MANTRAIL_TITLE,
  });
  if (data) await setLocalMantrailDetails(row.local_id, data);
  await enqueueSyncOperation({ entityType: 'training_session', entityLocalId: row.local_id, operation: 'create', priority: 1 });
  return row.local_id;
}

/**
 * Setzt payload_json.mantrail atomar (json_set, andere Schlüssel bleiben) und merkt
 * eine bereits synchronisierte Zeile erneut zum Upload vor. Nur type = 'mantrail'.
 * Rückgabe false: keine passende Zeile (z. B. IGP-Fährte oder gelöscht).
 */
export async function setLocalMantrailDetails(localId: string, data: MantrailData): Promise<boolean> {
  const clean = parseMantrailData(data);
  if (!clean) return false;
  const db = await getLocalDb();
  const result = await db.runAsync(
    `update local_training_sessions
       set payload_json = json_set(coalesce(payload_json, '{}'), '$.mantrail', json(?)),
           updated_at = ?,
           sync_status = case when sync_status = 'synced' then 'pending' else sync_status end
     where local_id = ? and type = ? and deleted_at is null`,
    JSON.stringify(clean), new Date().toISOString(), localId, MANTRAIL_SESSION_TYPE,
  );
  return (result?.changes ?? 0) > 0;
}

/** Liest die Mantrailing-Angaben einer lokalen Sitzung (null bei IGP oder fehlend). */
export async function getLocalMantrailDetails(localId: string): Promise<MantrailData | null> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ type: string | null; payload_json: string | null }>(
    'select type, payload_json from local_training_sessions where local_id = ?', localId);
  if (!row || row.type !== MANTRAIL_SESSION_TYPE || !row.payload_json) return null;
  try { return parseMantrailData(JSON.parse(row.payload_json)?.mantrail); } catch { return null; }
}
