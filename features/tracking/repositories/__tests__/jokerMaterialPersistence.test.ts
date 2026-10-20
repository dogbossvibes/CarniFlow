import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { createLocalTrackMarker, getTrackMarkersBySession } from '../localTrackRepository';
let mockDb: DatabaseSync;
let mockId = 0;
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  runAsync: async (sql: string, ...params: (string | number | null)[]) => mockDb.prepare(sql).run(...params),
  getAllAsync: async (sql: string, ...params: (string | number | null)[]) => mockDb.prepare(sql).all(...params),
}) }));
jest.mock('@/lib/localDb/ids', () => ({ newLocalId: () => `marker-${++mockId}`, nowIso: () => new Date(1000).toISOString() }));
beforeEach(() => { mockDb = new DatabaseSync(':memory:'); for (const m of MIGRATIONS) mockDb.exec(m.sql); });
afterEach(() => mockDb.close());
it.each(['duebel','ball','gummi'])('keeps %s losslessly through the unchanged SQLite material column', async material => {
 mockDb.exec("insert into local_training_sessions(local_id) values ('session')");
 await createLocalTrackMarker('session',{sourceMarkerId:'object-source',recordedAtMs:1000,marker_type:'gegenstand',material,latitude:47,longitude:8,distance_from_start:5});
 const rows=await getTrackMarkersBySession('session');
 expect(rows).toHaveLength(1);expect(rows[0].material).toBe(material);
 expect(JSON.parse(rows[0].payload_json!)).toMatchObject({sourceMarkerId:'object-source'});
});
