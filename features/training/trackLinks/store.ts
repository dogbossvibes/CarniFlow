import * as Crypto from 'expo-crypto';
import { getLocalDb, SQLITE_AVAILABLE } from '@/lib/localDb/client';

// Lokaler Speicher der Verknüpfung Training ↔ Fährte/Absuche (#114).
// SQLite ist die lokale Wahrheit: Verknüpfen und Lösen wirken sofort und offline;
// sync.ts gleicht später mit public.training_unit_tracks ab. Hier wird nie eine
// Fährte, Absuche oder ein Training verändert, nur die Verknüpfungszeile.

export type TrackLinkState = 'pending' | 'synced' | 'delete_pending';
export interface TrackLinkTarget { sessionId: string; runId?: string | null }
export interface TrackLink {
  id: string; owner_id: string; training_unit_id: string; training_session_id: string;
  track_run_id: string | null; state: TrackLinkState; created_at: string; updated_at: string; last_error: string | null;
}
export interface RemoteTrackLink { id: string; training_unit_id: string; training_session_id: string; track_run_id: string | null; created_at?: string | null }

const TABLE = 'local_training_unit_tracks';
const now = () => new Date().toISOString();
const run = (value?: string | null) => value ?? null;
export const linkKey = (sessionId: string, runId?: string | null) => `${sessionId}|${runId ?? ''}`;
export const trackLinksAvailable = () => SQLITE_AVAILABLE;

async function find(ownerId: string, unitId: string, target: TrackLinkTarget): Promise<TrackLink | null> {
  const db = await getLocalDb();
  return await db.getFirstAsync<TrackLink>(
    `select * from ${TABLE} where owner_id=? and training_unit_id=? and training_session_id=? and coalesce(track_run_id,'')=?`,
    ownerId, unitId, target.sessionId, target.runId ?? '') ?? null;
}

/** Sichtbare Verknüpfungen eines Trainings (ohne zum Lösen vorgemerkte). */
export async function listLinksForUnit(ownerId: string, unitId: string): Promise<TrackLink[]> {
  if (!SQLITE_AVAILABLE || !ownerId || !unitId) return [];
  const db = await getLocalDb();
  return db.getAllAsync<TrackLink>(
    `select * from ${TABLE} where owner_id=? and training_unit_id=? and state<>'delete_pending' order by created_at, id`, ownerId, unitId);
}

/** Sichtbare Verknüpfungen einer Fährte (Rückweg: Fährte zeigt ihre Trainings). */
export async function listLinksForSession(ownerId: string, sessionId: string): Promise<TrackLink[]> {
  if (!SQLITE_AVAILABLE || !ownerId || !sessionId) return [];
  const db = await getLocalDb();
  return db.getAllAsync<TrackLink>(
    `select * from ${TABLE} where owner_id=? and training_session_id=? and state<>'delete_pending' order by created_at, id`, ownerId, sessionId);
}

export async function linkTrack(ownerId: string, unitId: string, target: TrackLinkTarget): Promise<void> {
  const db = await getLocalDb();
  const existing = await find(ownerId, unitId, target);
  if (existing) {
    // Wieder verknüpft, bevor das Lösen synchronisiert wurde: erneut anlegen (Upsert ist idempotent).
    if (existing.state === 'delete_pending') await db.runAsync(`update ${TABLE} set state='pending', last_error=null, updated_at=? where id=?`, now(), existing.id);
    return;
  }
  const ts = now();
  await db.runAsync(
    `insert into ${TABLE} (id, owner_id, training_unit_id, training_session_id, track_run_id, state, created_at, updated_at)
     values (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    Crypto.randomUUID(), ownerId, unitId, target.sessionId, run(target.runId), ts, ts);
}

export async function unlinkTrack(ownerId: string, unitId: string, target: TrackLinkTarget): Promise<void> {
  const db = await getLocalDb();
  const existing = await find(ownerId, unitId, target);
  if (!existing || existing.state === 'delete_pending') return;
  // Auch eine noch nicht bestätigte Verknüpfung wird serverseitig gelöst: die
  // Antwort eines früheren Anlegens kann verloren gegangen sein.
  await db.runAsync(`update ${TABLE} set state='delete_pending', last_error=null, updated_at=? where id=?`, now(), existing.id);
}

/** Setzt die Auswahl eines Trainings; berührt nur Verknüpfungen dieses Trainings. */
export async function setUnitLinks(ownerId: string, unitId: string, targets: readonly TrackLinkTarget[]): Promise<{ added: number; removed: number }> {
  if (!SQLITE_AVAILABLE) throw new Error('TRACK_LINKS_UNAVAILABLE');
  if (!ownerId || !unitId) throw new Error('TRACK_LINKS_INVALID');
  const wanted = new Map(targets.map(t => [linkKey(t.sessionId, t.runId), t]));
  const current = await listLinksForUnit(ownerId, unitId);
  const have = new Set(current.map(l => linkKey(l.training_session_id, l.track_run_id)));
  let added = 0; let removed = 0;
  // Bewusst OHNE eigene Transaktion: getLocalDb() ist die eine geteilte Verbindung, auf der
  // auch der laufende GPS-Schreiber (localTrackRepository) seine Punkt-Batches committet.
  // Ein zweites BEGIN auf dieser Verbindung schlägt fehl und das ROLLBACK von expo-sqlite
  // würde den offenen GPS-Batch mit verwerfen. Jeder Schritt hier ist einzeln idempotent;
  // ein Abbruch mittendrin wird beim nächsten Speichern bzw. Abgleich nachgezogen.
  for (const link of current) {
    if (wanted.has(linkKey(link.training_session_id, link.track_run_id))) continue;
    await unlinkTrack(ownerId, unitId, { sessionId: link.training_session_id, runId: link.track_run_id }); removed++;
  }
  for (const [key, target] of wanted) {
    if (have.has(key)) continue;
    await linkTrack(ownerId, unitId, target); added++;
  }
  return { added, removed };
}

/**
 * Auswahl auf Ebene ganzer Fährten (Oberfläche). Bestehende Verknüpfungen einer
 * gewählten Fährte bleiben wie sie sind, auch solche mit einzelner Absuche.
 */
export async function setUnitTrackSelection(ownerId: string, unitId: string, sessionIds: readonly string[]): Promise<{ added: number; removed: number }> {
  const chosen = new Set(sessionIds);
  const current = await listLinksForUnit(ownerId, unitId);
  const kept = current.filter(l => chosen.has(l.training_session_id));
  const linked = new Set(kept.map(l => l.training_session_id));
  return setUnitLinks(ownerId, unitId, [
    ...kept.map(l => ({ sessionId: l.training_session_id, runId: l.track_run_id })),
    ...[...chosen].filter(id => !linked.has(id)).map(sessionId => ({ sessionId })),
  ]);
}

/** Trainings mit mindestens einer sichtbaren Verknüpfung (für den Hinweis in Listen). */
export async function linkedUnitIds(ownerId: string): Promise<Set<string>> {
  if (!SQLITE_AVAILABLE || !ownerId) return new Set();
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{ training_unit_id: string }>(
    `select distinct training_unit_id from ${TABLE} where owner_id=? and state<>'delete_pending'`, ownerId);
  return new Set(rows.map(r => r.training_unit_id));
}

/** Nach dem Löschen eines Trainings: nur dessen lokale Verknüpfungszeilen entfernen. */
export async function forgetUnitLinks(ownerId: string, unitId: string): Promise<void> {
  if (!SQLITE_AVAILABLE || !ownerId || !unitId) return;
  const db = await getLocalDb();
  await db.runAsync(`delete from ${TABLE} where owner_id=? and training_unit_id=?`, ownerId, unitId);
}

export async function openLinkOperations(ownerId: string, limit = 200): Promise<TrackLink[]> {
  if (!SQLITE_AVAILABLE || !ownerId) return [];
  const db = await getLocalDb();
  return db.getAllAsync<TrackLink>(
    `select * from ${TABLE} where owner_id=? and state in ('pending','delete_pending') order by updated_at, id limit ?`, ownerId, limit);
}

export async function countOpenLinkOperations(ownerId: string): Promise<number> {
  if (!SQLITE_AVAILABLE || !ownerId) return 0;
  const db = await getLocalDb();
  return (await db.getFirstAsync<{ n: number }>(
    `select count(*) as n from ${TABLE} where owner_id=? and state in ('pending','delete_pending')`, ownerId))?.n ?? 0;
}

// Die Bestätigung gilt nur, wenn sich die Zeile seit dem Lesen nicht geändert hat
// (updated_at): eine zwischenzeitliche Nutzeraktion gewinnt und wird neu synchronisiert.
export async function confirmLinkSynced(link: TrackLink): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update ${TABLE} set state='synced', last_error=null where id=? and state='pending' and updated_at=?`, link.id, link.updated_at);
}
export async function confirmLinkRemoved(link: TrackLink): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`delete from ${TABLE} where id=? and state='delete_pending' and updated_at=?`, link.id, link.updated_at);
}
/** Die verknüpfte Fährte gibt es nicht mehr: nur die nie bestätigte lokale Zeile entfernen. */
export async function dropOrphanLink(link: TrackLink): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`delete from ${TABLE} where id=? and state='pending' and updated_at=?`, link.id, link.updated_at);
}
export async function noteLinkError(link: TrackLink, error: string | null): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update ${TABLE} set last_error=? where id=? and updated_at=?`, error?.slice(0, 300) ?? null, link.id, link.updated_at);
}

/**
 * Übernimmt den Serverstand für genau ein Training oder genau eine Fährte.
 * Wartende lokale Änderungen (pending, delete_pending) bleiben unangetastet;
 * nur bereits bestätigte Zeilen folgen dem Server.
 */
export async function mergeRemoteLinks(ownerId: string, scope: { unitId: string } | { sessionId: string }, remote: readonly RemoteTrackLink[]): Promise<void> {
  if (!SQLITE_AVAILABLE || !ownerId) return;
  const db = await getLocalDb();
  const [column, value] = 'unitId' in scope ? ['training_unit_id', scope.unitId] : ['training_session_id', scope.sessionId];
  const key = (l: { training_unit_id: string; training_session_id: string; track_run_id: string | null }) =>
    `${l.training_unit_id}|${linkKey(l.training_session_id, l.track_run_id)}`;
  // Ohne eigene Transaktion (Begründung siehe setUnitLinks): das Löschen ist auf state='synced'
  // begrenzt und das Einfügen ist «insert or ignore»; ein Abbruch wird beim nächsten Abgleich geheilt.
  const local = await db.getAllAsync<TrackLink>(`select * from ${TABLE} where owner_id=? and ${column}=?`, ownerId, value);
  const localKeys = new Set(local.map(key));
  const remoteKeys = new Set(remote.map(key));
  for (const row of local) {
    if (row.state === 'synced' && !remoteKeys.has(key(row))) await db.runAsync(`delete from ${TABLE} where id=? and state='synced'`, row.id);
  }
  const ts = now();
  for (const row of remote) {
    if (localKeys.has(key(row))) continue;
    await db.runAsync(
      `insert or ignore into ${TABLE} (id, owner_id, training_unit_id, training_session_id, track_run_id, state, created_at, updated_at)
       values (?, ?, ?, ?, ?, 'synced', ?, ?)`,
      row.id, ownerId, row.training_unit_id, row.training_session_id, run(row.track_run_id), row.created_at ?? ts, ts);
  }
}
