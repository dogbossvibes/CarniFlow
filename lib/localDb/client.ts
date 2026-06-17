import type * as SQLiteTypes from 'expo-sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';

// Lokale SQLite-DB (primäre Quelle der App-UI im Offline-First-Modell).
// expo-sqlite lädt das native Modul beim Import → defensiv dynamisch laden,
// damit Expo Go / ein veralteter Build NICHT crasht (Offline dann inaktiv).
// deno-lint-ignore no-explicit-any
let SQLite: any = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { SQLite = require('expo-sqlite'); } catch { SQLite = null; }

export const SQLITE_AVAILABLE: boolean = !!SQLite?.openDatabaseAsync;

type DB = SQLiteTypes.SQLiteDatabase;
let dbPromise: Promise<DB> | null = null;

export function getLocalDb(): Promise<DB> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

async function init(): Promise<DB> {
  if (!SQLite?.openDatabaseAsync) throw new Error('SQLite nicht verfügbar (neuer Build nötig)');
  const db: DB = await SQLite.openDatabaseAsync('anyvo_local.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await db.execAsync(`create table if not exists local_schema_migrations (
    version integer primary key, applied_at text
  );`);
  await runMigrations(db);
  return db;
}

async function runMigrations(db: DB) {
  const rows = await db.getAllAsync<{ version: number }>('select version from local_schema_migrations');
  const applied = new Set(rows.map(r => r.version));
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    try {
      await db.withTransactionAsync(async () => {
        await db.execAsync(m.sql);
        await db.runAsync('insert or replace into local_schema_migrations (version, applied_at) values (?, ?)', m.version, new Date().toISOString());
      });
    } catch (e) {
      console.error(`[localDb] Migration ${m.version} (${m.name}) fehlgeschlagen`, e);
      throw e;
    }
  }
}

// Zählungen für Sync-Center / Debug.
export async function localCounts(): Promise<Record<string, number>> {
  const db = await getLocalDb();
  const tables = ['local_training_sessions', 'local_track_points', 'local_track_markers', 'local_media_files', 'sync_queue'];
  const out: Record<string, number> = {};
  for (const t of tables) {
    const r = await db.getFirstAsync<{ c: number }>(`select count(*) as c from ${t}`);
    out[t] = r?.c ?? 0;
  }
  return out;
}

// Beim Logout optional alle lokalen Daten löschen.
export async function wipeLocalData(): Promise<void> {
  const db = await getLocalDb();
  await db.execAsync(`delete from local_track_points; delete from local_track_markers;
    delete from local_media_files; delete from local_training_sessions; delete from sync_queue;`);
}
