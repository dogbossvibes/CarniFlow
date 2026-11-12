import type { SQLiteDatabase } from 'expo-sqlite';
import { RAW_CAPTURE_SCHEMA } from './rawCaptureSchema';
import { GPS_CAPTURE_LINK_SCHEMA } from './gpsCaptureSchema';

/** Separate file: archival exclusive transactions never lock the primary track DB. */
export const RAW_CAPTURE_DB_SCHEMA = RAW_CAPTURE_SCHEMA + GPS_CAPTURE_LINK_SCHEMA;
let opening: Promise<SQLiteDatabase> | undefined;
export function getGpsCaptureDb(): Promise<SQLiteDatabase> {
  if (!opening) {
    const attempt = (async () => {
      // Lazy import preserves older-build module availability behavior.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SQLite: typeof import('expo-sqlite') = require('expo-sqlite');
      const db = await SQLite.openDatabaseAsync('anyvo_gps_arrivals_v1.db');
      try {
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await db.withExclusiveTransactionAsync(async tx => {
        const row = await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
        if ((row?.user_version ?? 0) > 1) throw new Error('RAW_SCHEMA_NEWER_THAN_CLIENT');
        if ((row?.user_version ?? 0) < 1) {
          await tx.execAsync(RAW_CAPTURE_DB_SCHEMA);
          await tx.execAsync('PRAGMA user_version=1');
        }
      });
      return db;
      } catch (error) {
        await db.closeAsync().catch(() => {});
        throw error;
      }
    })();
    opening = attempt;
    void attempt.catch(() => { if (opening === attempt) opening = undefined; });
  }
  return opening;
}
