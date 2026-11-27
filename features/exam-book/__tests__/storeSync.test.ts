import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';

// Echte lokale Migrationen in In-Memory-SQLite; Supabase ist ein kleiner Fake mit
// den PostgREST-Antworten für die Migration 20261125090000_dog_exam_book.sql.
let mockDb: DatabaseSync;
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}` }));
jest.mock('@/features/tracking/storage/gpsCaptureScope', () => ({ invalidateGpsCaptures: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => mockDb.exec(sql),
  getAllAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).all(...args),
  getFirstAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).get(...args),
  runAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).run(...args),
  withTransactionAsync: async () => { throw new Error('PRUEFUNGSBUCH_DARF_KEINE_TRANSAKTION_OEFFNEN'); },
}) }));

type Row = Record<string, any>;
const mockServer = {
  user: 'owner' as string | null,
  table: true,
  offline: false,
  dogs: new Set<string>(),
  rows: [] as Row[],
  writes: [] as string[],
  /** Läuft während des Uploads (z. B. Bearbeiten/Rückgängig auf dem Gerät). */
  duringUpsert: null as null | (() => Promise<void>),
};
const mockMissing = { code: 'PGRST205', message: "Could not find the table 'public.dog_exam_results' in the schema cache" };
function mockQuery(table: string) {
  const filters: [string, unknown][] = [];
  const result = async () => {
    if (mockServer.offline) throw new TypeError('Network request failed');
    if (!mockServer.table) return { data: null, error: mockMissing };
    return { data: mockServer.rows.filter(r => filters.every(([k, v]) => r[k] === v)).map(r => ({ ...r })), error: null };
  };
  const api: any = {
    select: () => api,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return api; },
    limit: () => api,
    maybeSingle: async () => {
      const r = await result();
      return r.error ? r : { data: r.data![0] ?? null, error: null };
    },
    then: (ok: any, fail: any) => result().then(ok, fail),
    delete: () => { mockServer.writes.push(`delete:${table}`); return api; },
    upsert: async (row: Row) => {
      mockServer.writes.push(`upsert:${table}`);
      if (mockServer.offline) throw new TypeError('Network request failed');
      if (!mockServer.table) return { error: mockMissing };
      if (row.owner_id !== mockServer.user || !mockServer.dogs.has(row.dog_id)) {
        return { error: { code: '42501', message: 'new row violates row-level security policy' } };
      }
      // Server speichert timestamptz mit anderem Format als der Client.
      const stored = { ...row, updated_at: row.updated_at.replace('Z', '+00:00') };
      const i = mockServer.rows.findIndex(r => r.id === row.id);
      if (i >= 0) mockServer.rows[i] = stored; else mockServer.rows.push(stored);
      const during = mockServer.duringUpsert; mockServer.duringUpsert = null;
      if (during) await during();
      return { error: null };
    },
  };
  return api;
}
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: mockServer.user ? { user: { id: mockServer.user } } : null }, error: null }) },
  from: (table: string) => mockQuery(table),
} }));

import type { ExamInput } from '../model';
import {
  acceptServerVersion, countOpenExamOperations, forgetDogExams, getExam, keepLocalVersion, listExamsForDog, listWaitingIds,
  mergeRemoteExams, openExamOperations, removeExam, restoreExam, saveExam, WAIT_RETRY_FREE, WAIT_RETRY_MS,
} from '../store';
import { refreshExamBook, SERVER_NOT_READY, syncExamBook, WAITING_FOR_SERVER } from '../sync';

const input = (over: Partial<ExamInput> = {}): ExamInput => ({
  dog_id: 'dog-1', exam_date: '2027-04-12', location: null, club: null, judge: null,
  exam_type: 'igp', exam_type_label: null, exam_level: '2',
  sections: [{ key: 'A', label: 'Fährte', points: 92, maxPoints: 100 }],
  total_points: null, max_points: null, rating: null, passed: true, placement: null, notes: 'Notiz', ...over,
});
const local = () => mockDb.prepare('select * from local_exam_results order by id').all() as any[];

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec('create table local_schema_migrations(version integer primary key, applied_at text)');
  for (const m of MIGRATIONS) { mockDb.exec(m.sql); mockDb.prepare('insert into local_schema_migrations(version) values (?)').run(m.version); }
  mockDb.exec(`insert into local_training_sessions(local_id,user_id,payload_json) values ('track-a','owner','{"keep":true}');`);
  Object.assign(mockServer, { user: 'owner', table: true, offline: false, dogs: new Set(['dog-1', 'dog-2']), rows: [], writes: [] });
});
afterEach(() => mockDb.close());

describe('lokales Prüfungsbuch (offline)', () => {
  it('legt an, bearbeitet und liest je Hund', async () => {
    const e = await saveExam('owner', input());
    expect(local()).toHaveLength(1);
    expect(local()[0].state).toBe('pending');
    await saveExam('owner', input({ notes: 'geändert' }), e.id);
    const list = await listExamsForDog('owner', 'dog-1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: e.id, notes: 'geändert', created_at: e.created_at });
    expect(await listExamsForDog('owner', 'dog-2')).toEqual([]);
    expect(await listExamsForDog('andere', 'dog-1')).toEqual([]);
  });

  it('Entfernen ist weich und rückgängig machbar; nichts wird gelöscht', async () => {
    const e = await saveExam('owner', input());
    await removeExam('owner', e.id);
    expect(await listExamsForDog('owner', 'dog-1')).toEqual([]);
    expect(local()).toHaveLength(1);
    expect((await getExam('owner', e.id))!.deleted_at).not.toBeNull();
    await restoreExam('owner', e.id);
    expect(await listExamsForDog('owner', 'dog-1')).toHaveLength(1);
  });

  it('berührt keine anderen lokalen Daten', async () => {
    await saveExam('owner', input());
    expect(mockDb.prepare('select payload_json from local_training_sessions').all()).toEqual([{ payload_json: '{"keep":true}' }]);
  });

  it('fremde ID kann nicht bearbeitet werden', async () => {
    await expect(saveExam('owner', input(), 'gibts-nicht')).rejects.toThrow('EXAM_NOT_FOUND');
  });
});

describe('Abgleich mit dem Server', () => {
  it('lädt wartende Einträge hoch und bestätigt sie', async () => {
    const e = await saveExam('owner', input());
    const res = await syncExamBook('owner');
    expect(res).toMatchObject({ synced: 1, failed: 0, serverReady: true });
    expect(mockServer.rows).toHaveLength(1);
    expect(mockServer.rows[0]).toMatchObject({ id: e.id, client_local_id: e.id, owner_id: 'owner', notes: 'Notiz' });
    expect(local()[0].state).toBe('synced');
    expect(mockServer.writes.every(w => w === 'upsert:dog_exam_results')).toBe(true);
  });

  it('Entfernen wird als deleted_at hochgeladen, nie als DELETE', async () => {
    const e = await saveExam('owner', input());
    await syncExamBook('owner');
    await removeExam('owner', e.id);
    await syncExamBook('owner');
    expect(mockServer.rows[0].deleted_at).not.toBeNull();
    expect(mockServer.writes).not.toContain('delete:dog_exam_results');
  });

  it('wartet ohne Datenverlust, solange die Server-Tabelle fehlt', async () => {
    mockServer.table = false;
    await saveExam('owner', input());
    const res = await syncExamBook('owner');
    expect(res.serverReady).toBe(false);
    expect(local()[0]).toMatchObject({ state: 'pending', last_error: SERVER_NOT_READY });
    mockServer.table = true;
    expect((await syncExamBook('owner')).synced).toBe(1);
  });

  it('offline: bleibt wartend, wirft nicht', async () => {
    mockServer.offline = true;
    await saveExam('owner', input());
    const res = await syncExamBook('owner');
    expect(res.failed).toBe(1);
    expect(local()[0].state).toBe('pending');
  });

  it('nicht erlaubt (z. B. Hund nicht auf dem Server): wartet', async () => {
    await saveExam('owner', input({ dog_id: 'nur-lokal' }));
    expect((await syncExamBook('owner')).waiting).toBe(1);
    expect(local()[0]).toMatchObject({ state: 'pending' });
    expect(local()[0].last_error).toMatch(new RegExp(`^${WAITING_FOR_SERVER}:1:\\d+$`));
  });

  it('andere angemeldete Person: kein Upload', async () => {
    await saveExam('owner', input());
    mockServer.user = 'andere';
    await syncExamBook('owner');
    expect(mockServer.writes).toEqual([]);
  });

  it('Änderung von einem anderen Gerät wird nicht überschrieben (Konflikt)', async () => {
    const e = await saveExam('owner', input());
    await syncExamBook('owner');
    // Anderes Gerät ändert später.
    mockServer.rows[0] = { ...mockServer.rows[0], notes: 'vom Tablet', updated_at: '2099-01-01T00:00:00+00:00' };
    await saveExam('owner', input({ notes: 'vom Handy' }), e.id);
    const res = await syncExamBook('owner');
    expect(res.conflicts).toBe(1);
    expect(mockServer.rows[0].notes).toBe('vom Tablet');
    expect(local()[0].state).toBe('conflict');
    expect((await getExam('owner', e.id))!.notes).toBe('vom Handy');
    expect(await countOpenExamOperations('owner')).toEqual({ pending: 0, conflict: 1 });

    // Lösung «meine Version»: erneut hochladen.
    await keepLocalVersion('owner', e.id, '2099-01-01T00:00:00+00:00');
    expect((await syncExamBook('owner')).synced).toBe(1);
    expect(mockServer.rows[0].notes).toBe('vom Handy');
  });

  it('Konflikt gelöst mit Serverstand: lokale Fassung bleibt im Eintrag erhalten', async () => {
    const e = await saveExam('owner', input());
    await syncExamBook('owner');
    mockServer.rows[0] = { ...mockServer.rows[0], notes: 'vom Tablet', updated_at: '2099-01-01T00:00:00+00:00' };
    await saveExam('owner', input({ notes: 'vom Handy' }), e.id);
    await syncExamBook('owner');
    expect(await acceptServerVersion('owner', mockServer.rows[0])).toBe(true);
    expect((await getExam('owner', e.id))!.notes).toBe('vom Tablet');
    expect(JSON.parse(local()[0].payload_json).replaced_local).toContain('vom Handy');
  });

  it('zweimal hintereinander synchronisieren ist ohne Wirkung', async () => {
    await saveExam('owner', input());
    await syncExamBook('owner');
    mockServer.writes = [];
    await syncExamBook('owner');
    expect(mockServer.writes).toEqual([]);
  });

  it('Nachladen: neue Einträge vom anderen Gerät, wartende lokale Änderungen bleiben', async () => {
    const mine = await saveExam('owner', input({ notes: 'lokal wartend' }));
    mockServer.rows.push({
      id: 'srv-1', owner_id: 'owner', dog_id: 'dog-1', client_local_id: 'srv-1', exam_date: '2026-10-03',
      exam_type: 'igp', exam_level: '1', sections: [], passed: true, created_at: '2026-10-03T10:00:00+00:00',
      updated_at: '2026-10-03T10:00:00+00:00', deleted_at: null,
    });
    mockServer.rows.push({ ...mockServer.rows[0], id: mine.id, notes: 'Server alt', updated_at: '2099-01-01T00:00:00+00:00' });
    mockServer.rows.push({ ...mockServer.rows[0], id: 'fremd', owner_id: 'andere' });
    expect(await refreshExamBook('owner')).toBe(true);
    const list = await listExamsForDog('owner', 'dog-1');
    expect(list.map(e => e.id).sort()).toEqual([mine.id, 'srv-1'].sort());
    expect(list.find(e => e.id === mine.id)!.notes).toBe('lokal wartend');
  });

  it('Nachladen übernimmt neuere Serverstände bestätigter Zeilen, ältere nicht', async () => {
    const e = await saveExam('owner', input());
    await syncExamBook('owner');
    const server = mockServer.rows[0];
    await mergeRemoteExams('owner', [{ ...server, notes: 'älter', updated_at: '2000-01-01T00:00:00+00:00' }]);
    expect((await getExam('owner', e.id))!.notes).toBe('Notiz');
    await mergeRemoteExams('owner', [{ ...server, notes: 'neuer', updated_at: '2099-01-01T00:00:00+00:00' }]);
    expect((await getExam('owner', e.id))!.notes).toBe('neuer');
  });
});

describe('Review 2026-11-26: kein unechter Konflikt, nichts geht verloren', () => {
  it('Bearbeiten während des Uploads: kein Konflikt, die neue Eingabe wird danach hochgeladen', async () => {
    const e = await saveExam('owner', input({ notes: 'erste' }));
    mockServer.duringUpsert = async () => { await saveExam('owner', input({ notes: 'zweite' }), e.id); };
    await syncExamBook('owner');
    expect(local()[0].state).toBe('pending');
    const res = await syncExamBook('owner');
    expect(res).toMatchObject({ synced: 1, conflicts: 0 });
    expect(mockServer.rows[0].notes).toBe('zweite');
    expect(local()[0].state).toBe('synced');
  });

  it('Entfernen und «Rückgängig» während des Uploads: kein Konflikt, Eintrag bleibt sichtbar', async () => {
    const e = await saveExam('owner', input());
    await syncExamBook('owner');
    await removeExam('owner', e.id);
    mockServer.duringUpsert = async () => { await restoreExam('owner', e.id); };
    await syncExamBook('owner');
    const res = await syncExamBook('owner');
    expect(res).toMatchObject({ conflicts: 0, synced: 1 });
    expect(mockServer.rows[0].deleted_at).toBeNull();
    expect((await listExamsForDog('owner', 'dog-1')).map(x => x.id)).toEqual([e.id]);
  });

  it('zwei schnelle Speicherungen hintereinander: kein Konflikt', async () => {
    const e = await saveExam('owner', input({ notes: 'a' }));
    mockServer.duringUpsert = async () => { await saveExam('owner', input({ notes: 'b' }), e.id); await saveExam('owner', input({ notes: 'c' }), e.id); };
    await syncExamBook('owner');
    expect((await syncExamBook('owner')).conflicts).toBe(0);
    expect(mockServer.rows[0].notes).toBe('c');
  });

  it('echte Änderung auf einem anderen Gerät bleibt ein Konflikt', async () => {
    const e = await saveExam('owner', input());
    mockServer.duringUpsert = async () => { await saveExam('owner', input({ notes: 'Handy' }), e.id); };
    await syncExamBook('owner');
    mockServer.rows[0] = { ...mockServer.rows[0], notes: 'Tablet', updated_at: '2099-01-01T00:00:00+00:00' };
    expect((await syncExamBook('owner')).conflicts).toBe(1);
    expect((await getExam('owner', e.id))!.notes).toBe('Handy');
  });

  it('frühere eigene Fassung (replaced_local) bleibt beim Bearbeiten und Nachladen erhalten', async () => {
    const e = await saveExam('owner', input());
    await syncExamBook('owner');
    mockServer.rows[0] = { ...mockServer.rows[0], notes: 'vom Tablet', updated_at: '2099-01-01T00:00:00+00:00' };
    await saveExam('owner', input({ notes: 'vom Handy' }), e.id);
    await syncExamBook('owner');
    await acceptServerVersion('owner', mockServer.rows[0]);
    const kept = JSON.parse(local()[0].payload_json).replaced_local as string;
    expect(kept).toContain('vom Handy');
    await saveExam('owner', input({ notes: 'neu bearbeitet' }), e.id);
    expect(JSON.parse(local()[0].payload_json).replaced_local).toBe(kept);
    expect((await getExam('owner', e.id))!.replaced_local).toBe(kept);
    await syncExamBook('owner');
    expect(mockServer.rows[0].replaced_local).toBeUndefined();   // nie hochgeladen
    mockServer.rows[0] = { ...mockServer.rows[0], notes: 'später', updated_at: '2099-06-01T00:00:00+00:00' };
    await mergeRemoteExams('owner', mockServer.rows);
    expect(JSON.parse(local()[0].payload_json)).toMatchObject({ notes: 'später', replaced_local: kept });
  });

  it('dauerhaft wartend: nach drei Versuchen nur noch alle 6 Stunden, Hinweis, Eintrag bleibt', async () => {
    await saveExam('owner', input({ dog_id: 'nur-lokal' }));
    for (let i = 0; i < WAIT_RETRY_FREE; i++) await syncExamBook('owner');
    expect(mockServer.writes.filter(w => w.startsWith('upsert'))).toHaveLength(WAIT_RETRY_FREE);
    expect(await listWaitingIds('owner', 'nur-lokal')).toHaveLength(1);
    await syncExamBook('owner');
    expect(mockServer.writes.filter(w => w.startsWith('upsert'))).toHaveLength(WAIT_RETRY_FREE);   // begrenzt
    expect(await openExamOperations('owner', 200, Date.now() + WAIT_RETRY_MS)).toHaveLength(1);    // später wieder
    expect(local()).toHaveLength(1);
    // Hund ist jetzt auf dem Server, Eintrag bearbeitet: Zähler zurück, sofort hochgeladen.
    mockServer.dogs.add('nur-lokal');
    await saveExam('owner', input({ dog_id: 'nur-lokal', notes: 'neu' }), local()[0].id);
    expect((await syncExamBook('owner')).synced).toBe(1);
  });
});

describe('Hund gelöscht', () => {
  it('entfernt lokal nur die Zeilen genau dieses Hundes', async () => {
    await saveExam('owner', input());
    await saveExam('owner', input({ dog_id: 'dog-2' }));
    await forgetDogExams('owner', 'dog-1');
    expect(local().map(r => r.dog_id)).toEqual(['dog-2']);
  });
});
