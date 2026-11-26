import * as Crypto from 'expo-crypto';
import { getLocalDb, SQLITE_AVAILABLE } from '@/lib/localDb/client';
import { buildExam, parseExam, REPLACED_LOCAL_MAX, visibleExams, type ExamInput, type ExamResult } from './model';

// Lokaler Speicher des Prüfungsbuchs. SQLite ist die lokale Wahrheit: Anlegen,
// Bearbeiten, Entfernen und Rückgängig wirken sofort und offline; sync.ts gleicht
// später mit public.dog_exam_results ab.
//
// Kundendatenerhalt: «Entfernen» setzt nur deleted_at (wiederherstellbar).
// Lokale Zeilen verschwinden nur, wenn die Person den ganzen Hund löscht
// (forgetDogExams, nach bestätigtem Serverlöschen) oder ausdrücklich alle
// lokalen Daten löscht (wipeLocalData). Serverdaten überschreiben nur bereits
// bestätigte (synced) Zeilen, nie wartende lokale Änderungen.
//
// Bewusst ohne eigene Transaktionen: getLocalDb() ist die eine geteilte Verbindung,
// auf der auch der GPS-Schreiber seine Punkt-Batches committet (siehe trackLinks/store.ts).

export type ExamRowState = 'pending' | 'synced' | 'conflict';
export interface ExamRow {
  id: string; owner_id: string; dog_id: string; exam_date: string; payload_json: string;
  state: ExamRowState; base_updated_at: string | null; deleted_at: string | null;
  created_at: string; updated_at: string; last_error: string | null;
}

const TABLE = 'local_exam_results';
export const examBookAvailable = () => SQLITE_AVAILABLE;

const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

function rowToExam(row: ExamRow): ExamResult | null {
  try { return parseExam(JSON.parse(row.payload_json)); } catch { return null; }
}

async function getRow(ownerId: string, id: string): Promise<ExamRow | null> {
  const db = await getLocalDb();
  return await db.getFirstAsync<ExamRow>(`select * from ${TABLE} where owner_id=? and id=?`, ownerId, id) ?? null;
}

async function writeLocal(exam: ExamResult, state: ExamRowState, base: string | null, existed: boolean): Promise<void> {
  const db = await getLocalDb();
  const payload = JSON.stringify(exam);
  if (existed) {
    await db.runAsync(
      `update ${TABLE} set dog_id=?, exam_date=?, payload_json=?, state=?, base_updated_at=?, deleted_at=?, updated_at=?, last_error=null
       where owner_id=? and id=?`,
      exam.dog_id, exam.exam_date, payload, state, base, exam.deleted_at, exam.updated_at, exam.owner_id, exam.id);
  } else {
    await db.runAsync(
      `insert into ${TABLE} (id, owner_id, dog_id, exam_date, payload_json, state, base_updated_at, deleted_at, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      exam.id, exam.owner_id, exam.dog_id, exam.exam_date, payload, state, base, exam.deleted_at, exam.created_at, exam.updated_at);
  }
}

/** Sichtbare Einträge eines Hundes, neueste zuerst. */
export async function listExamsForDog(ownerId: string, dogId: string): Promise<ExamResult[]> {
  if (!SQLITE_AVAILABLE || !ownerId || !dogId) return [];
  const db = await getLocalDb();
  const rows = await db.getAllAsync<ExamRow>(
    `select * from ${TABLE} where owner_id=? and dog_id=? and deleted_at is null`, ownerId, dogId);
  return visibleExams(rows.map(rowToExam).filter((e): e is ExamResult => !!e));
}

export async function getExam(ownerId: string, id: string): Promise<ExamResult | null> {
  if (!SQLITE_AVAILABLE || !ownerId || !id) return null;
  const row = await getRow(ownerId, id);
  return row ? rowToExam(row) : null;
}

/** Neuen Eintrag anlegen oder bestehenden bearbeiten. */
export async function saveExam(ownerId: string, input: ExamInput, existingId?: string | null): Promise<ExamResult> {
  if (!SQLITE_AVAILABLE) throw new Error('EXAM_BOOK_UNAVAILABLE');
  if (!ownerId || !input.dog_id) throw new Error('EXAM_BOOK_INVALID');
  const row = existingId ? await getRow(ownerId, existingId) : null;
  if (existingId && !row) throw new Error('EXAM_NOT_FOUND');
  const previous = row ? rowToExam(row) : null;
  const id = row?.id ?? Crypto.randomUUID();
  const exam = buildExam(input, { id, ownerId }, nextTimestamp(previous?.updated_at), previous);
  // Ein Konflikt bleibt Konflikt, bis er in der Oberfläche gelöst wird; die Eingabe geht nicht verloren.
  await writeLocal(exam, row?.state === 'conflict' ? 'conflict' : 'pending', row?.base_updated_at ?? null, !!row);
  return exam;
}

/** Entfernen = deleted_at setzen. Gibt den Eintrag zurück (für «Rückgängig»). */
export async function removeExam(ownerId: string, id: string): Promise<ExamResult | null> {
  return setDeleted(ownerId, id, true);
}

/** «Rückgängig» bzw. Wiederherstellen eines entfernten Eintrags. */
export async function restoreExam(ownerId: string, id: string): Promise<ExamResult | null> {
  return setDeleted(ownerId, id, false);
}

async function setDeleted(ownerId: string, id: string, deleted: boolean): Promise<ExamResult | null> {
  if (!SQLITE_AVAILABLE || !ownerId || !id) return null;
  const row = await getRow(ownerId, id);
  const exam = row ? rowToExam(row) : null;
  if (!row || !exam) return null;
  if (!!exam.deleted_at === deleted) return exam;
  const ts = nextTimestamp(exam.updated_at);
  const next: ExamResult = { ...exam, deleted_at: deleted ? ts : null, updated_at: ts };
  await writeLocal(next, row.state === 'conflict' ? 'conflict' : 'pending', row.base_updated_at, true);
  return next;
}

/** Zeitstempel strikt nach dem vorherigen (Uhren können springen). */
function nextTimestamp(previous?: string | null): string {
  const now = Date.now();
  const prev = ms(previous);
  return new Date(prev != null && prev >= now ? prev + 1 : now).toISOString();
}

export async function openExamOperations(ownerId: string, limit = 200, nowMs = Date.now()): Promise<ExamRow[]> {
  if (!SQLITE_AVAILABLE || !ownerId) return [];
  const db = await getLocalDb();
  const rows = await db.getAllAsync<ExamRow>(
    `select * from ${TABLE} where owner_id=? and state='pending' order by updated_at, id limit ?`, ownerId, limit);
  return rows.filter(r => shouldRetryWaiting(r.last_error, nowMs));
}

/** Einträge eines Hundes, die dauerhaft auf den Server warten (Hinweis in der Oberfläche). */
export async function listWaitingIds(ownerId: string, dogId: string): Promise<string[]> {
  if (!SQLITE_AVAILABLE || !ownerId || !dogId) return [];
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{ id: string; last_error: string | null }>(
    `select id, last_error from ${TABLE} where owner_id=? and dog_id=? and state='pending' and last_error like '${WAITING_PREFIX}%'`, ownerId, dogId);
  return rows.filter(r => (parseWaiting(r.last_error)?.attempts ?? 0) >= WAIT_RETRY_FREE).map(r => r.id);
}

export async function countOpenExamOperations(ownerId: string): Promise<{ pending: number; conflict: number }> {
  if (!SQLITE_AVAILABLE || !ownerId) return { pending: 0, conflict: 0 };
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{ state: string; n: number }>(
    `select state, count(*) as n from ${TABLE} where owner_id=? and state in ('pending','conflict') group by state`, ownerId);
  return {
    pending: rows.find(r => r.state === 'pending')?.n ?? 0,
    conflict: rows.find(r => r.state === 'conflict')?.n ?? 0,
  };
}

export const examFromRow = rowToExam;

// Nach bestätigtem Upload: Der Server hat jetzt genau den hochgeladenen Stand. Die
// Grundlage (base_updated_at) rückt IMMER auf diesen Stand vor – auch wenn die Zeile
// während des Uploads bearbeitet, entfernt oder per «Rückgängig» wiederhergestellt wurde.
// Sonst hielte der nächste Upload den eigenen Stand für eine Änderung «vom anderen Gerät»
// (unechter Konflikt). Als «synced» gilt die Zeile nur, wenn sie unverändert ist; eine
// zwischenzeitliche Eingabe bleibt «pending» und wird danach hochgeladen. Nie rückwärts.
export async function confirmExamSynced(row: ExamRow, serverUpdatedAt: string): Promise<void> {
  const db = await getLocalDb();
  const current = await db.getFirstAsync<{ base_updated_at: string | null }>(
    `select base_updated_at from ${TABLE} where id=? and owner_id=? and state='pending'`, row.id, row.owner_id);
  if (!current) return;   // inzwischen Konflikt o. Ä.: nichts überschreiben
  // Zeitvergleich als Zahl (Server und Gerät schreiben Zeitstempel unterschiedlich).
  const baseMs = ms(current.base_updated_at), serverMs = ms(serverUpdatedAt);
  const base = baseMs != null && (serverMs == null || baseMs >= serverMs) ? current.base_updated_at : serverUpdatedAt;
  await db.runAsync(
    `update ${TABLE} set base_updated_at=?, state=case when updated_at=? then 'synced' else state end, last_error=null
     where id=? and owner_id=? and state='pending'`,
    base, row.updated_at, row.id, row.owner_id);
}

export async function markExamConflict(row: ExamRow): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(
    `update ${TABLE} set state='conflict', last_error='CONFLICT' where id=? and owner_id=? and state='pending' and updated_at=?`,
    row.id, row.owner_id, row.updated_at);
}

// Dauerhaft wartende Uploads (z. B. Hund auf dem Server nicht vorhanden): Anzahl und Zeit
// des letzten Versuchs stehen in last_error («WAITING_FOR_SERVER:<n>:<ms>»), ohne
// Schemaänderung. Nach WAIT_RETRY_FREE Versuchen nur noch alle WAIT_RETRY_MS.
export const WAITING_PREFIX = 'WAITING_FOR_SERVER';
export const WAIT_RETRY_FREE = 3;
export const WAIT_RETRY_MS = 6 * 60 * 60 * 1000;
export function parseWaiting(lastError: string | null | undefined): { attempts: number; lastMs: number } | null {
  if (!lastError || !lastError.startsWith(WAITING_PREFIX)) return null;
  const [, n, t] = lastError.split(':');
  const attempts = Number(n); const lastMs = Number(t);
  return { attempts: Number.isFinite(attempts) && attempts > 0 ? attempts : 1, lastMs: Number.isFinite(lastMs) ? lastMs : 0 };
}
export function waitingError(previous: string | null | undefined, nowMs: number): string {
  return `${WAITING_PREFIX}:${(parseWaiting(previous)?.attempts ?? 0) + 1}:${nowMs}`;
}
/** Soll ein wartender Eintrag jetzt erneut hochgeladen werden? (Bearbeiten setzt den Zähler zurück.) */
export function shouldRetryWaiting(lastError: string | null | undefined, nowMs: number): boolean {
  const w = parseWaiting(lastError);
  return !w || w.attempts < WAIT_RETRY_FREE || nowMs - w.lastMs >= WAIT_RETRY_MS;
}

export async function noteExamError(row: ExamRow, error: string | null): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update ${TABLE} set last_error=? where id=? and owner_id=? and updated_at=?`,
    error?.slice(0, 300) ?? null, row.id, row.owner_id, row.updated_at);
}

/** Lokale Version behalten und erneut hochladen (Konflikt gelöst: «meine Version»). */
export async function keepLocalVersion(ownerId: string, id: string, serverUpdatedAt: string | null): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(
    `update ${TABLE} set state='pending', base_updated_at=?, last_error=null where owner_id=? and id=? and state='conflict'`,
    serverUpdatedAt, ownerId, id);
}

/**
 * Konflikt gelöst mit «Version vom anderen Gerät»: Serverstand übernehmen.
 * Die bisherige lokale Fassung bleibt als `replaced_local` im Eintrag erhalten,
 * damit keine Eingabe verloren geht.
 */
export async function acceptServerVersion(ownerId: string, remote: unknown): Promise<boolean> {
  const exam = parseExam(remote);
  if (!SQLITE_AVAILABLE || !exam || exam.owner_id !== ownerId) return false;
  const row = await getRow(ownerId, exam.id);
  if (!row || row.state !== 'conflict') return false;
  const db = await getLocalDb();
  // Frühere eigene Fassung ohne deren eigene ältere Kopie (keine Verschachtelung), gekürzt.
  const previous = rowToExam(row);
  const kept = previous ? JSON.stringify({ ...previous, replaced_local: undefined }) : row.payload_json;
  const payload = JSON.stringify({ ...exam, replaced_local: kept.slice(0, REPLACED_LOCAL_MAX) });
  await db.runAsync(
    `update ${TABLE} set dog_id=?, exam_date=?, payload_json=?, state='synced', base_updated_at=?, deleted_at=?, updated_at=?, last_error=null
     where owner_id=? and id=? and state='conflict' and updated_at=?`,
    exam.dog_id, exam.exam_date, payload, exam.updated_at, exam.deleted_at, exam.updated_at, ownerId, exam.id, row.updated_at);
  return true;
}

/**
 * Übernimmt Serverzeilen der angemeldeten Person.
 * - unbekannt lokal → als bestätigt einfügen
 * - lokal bestätigt und Server neuer → Serverstand übernehmen
 * - lokal wartend oder Konflikt → unangetastet (Konflikt wird beim Hochladen erkannt)
 * Lokale Zeilen werden nie gelöscht.
 */
/** Serverstand übernehmen, die lokal aufbewahrte frühere Fassung aber behalten. */
function withReplaced(exam: ExamResult, row: ExamRow): ExamResult {
  const keep = rowToExam(row)?.replaced_local;
  return keep ? { ...exam, replaced_local: keep } : exam;
}

export async function mergeRemoteExams(ownerId: string, remote: readonly unknown[]): Promise<{ inserted: number; updated: number }> {
  const result = { inserted: 0, updated: 0 };
  if (!SQLITE_AVAILABLE || !ownerId) return result;
  for (const raw of remote) {
    const exam = parseExam(raw);
    if (!exam || exam.owner_id !== ownerId) continue;
    const row = await getRow(ownerId, exam.id);
    if (!row) {
      await writeLocal(exam, 'synced', exam.updated_at, false);
      result.inserted++;
      continue;
    }
    if (row.state !== 'synced') continue;
    const serverMs = ms(exam.updated_at); const baseMs = ms(row.base_updated_at ?? row.updated_at);
    if (serverMs != null && (baseMs == null || serverMs > baseMs)) {
      const db = await getLocalDb();
      await db.runAsync(
        `update ${TABLE} set dog_id=?, exam_date=?, payload_json=?, base_updated_at=?, deleted_at=?, updated_at=?, last_error=null
         where owner_id=? and id=? and state='synced' and updated_at=?`,
        exam.dog_id, exam.exam_date, JSON.stringify(withReplaced(exam, row)), exam.updated_at, exam.deleted_at, exam.updated_at,
        ownerId, exam.id, row.updated_at);
      result.updated++;
    }
  }
  return result;
}

/**
 * Nach bestätigtem Löschen eines Hundes auf dem Server: nur dessen lokale
 * Prüfungszeilen entfernen (die Serverzeilen hat der Fremdschlüssel gelöscht).
 * Wird ausschliesslich aus deleteDogWithDependents aufgerufen.
 */
export async function forgetDogExams(ownerId: string, dogId: string): Promise<void> {
  if (!SQLITE_AVAILABLE || !ownerId || !dogId) return;
  const db = await getLocalDb();
  await db.runAsync(`delete from ${TABLE} where owner_id=? and dog_id=?`, ownerId, dogId);
}

/** IDs der Einträge eines Hundes, die auf eine Konfliktlösung warten. */
export async function listConflictIds(ownerId: string, dogId: string): Promise<string[]> {
  if (!SQLITE_AVAILABLE || !ownerId || !dogId) return [];
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{ id: string }>(
    `select id from ${TABLE} where owner_id=? and dog_id=? and state='conflict'`, ownerId, dogId);
  return rows.map(r => r.id);
}

/** Wartet ein Eintrag noch auf den Upload? (Hinweis «Noch nicht synchronisiert») */
export async function listPendingIds(ownerId: string, dogId: string): Promise<string[]> {
  if (!SQLITE_AVAILABLE || !ownerId || !dogId) return [];
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{ id: string }>(
    `select id from ${TABLE} where owner_id=? and dog_id=? and state='pending'`, ownerId, dogId);
  return rows.map(r => r.id);
}
