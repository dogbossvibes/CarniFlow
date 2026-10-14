import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { createLocalTrackMarker, getTrackMarkersBySession } from '../localTrackRepository';
import { mergeLayRecovery } from '../../utils/layRecovery';
import type { PendingTrack } from '../../store/trackPersist';
let mockDb: DatabaseSync;
let mockId = 0;
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  runAsync: async (sql: string, ...params: (string | number | null)[]) => mockDb.prepare(sql).run(...params),
  getAllAsync: async (sql: string, ...params: (string | number | null)[]) => mockDb.prepare(sql).all(...params),
}) }));
jest.mock('@/lib/localDb/ids', () => ({ newLocalId: () => `marker-${++mockId}`, nowIso: () => new Date(1000).toISOString() }));
beforeEach(() => { mockDb = new DatabaseSync(':memory:'); for (const m of MIGRATIONS) mockDb.exec(m.sql); });
afterEach(() => mockDb.close());
it.each(['bw', 'ow', 'gw', 'abriss'])('persists %s direction through real SQLite and process recovery', async angleKind => {
  mockDb.exec("insert into local_training_sessions(local_id) values ('session')");
  await createLocalTrackMarker('session', { sourceMarkerId: 'source', recordedAtMs: 1000,
    marker_type: 'winkel', angle_kind: angleKind, latitude: 47, longitude: 8, distance_from_start: 5,
    geometryDirection: 'rechts', geometrySharpness: angleKind === 'abriss' ? 'unresolved' : 'sharp', geometrySource: 'manual' });
  const rows = await getTrackMarkersBySession('session');
  const pending: PendingTrack = { sessionId:'session',dogId:'dog',status:'laying',trackPoints:[],markers:[],runPoints:[],distanceMeters:5,durationSeconds:1,layFinishedAt:null,startAnchor:null,savedAt:1000 };
  const restored = mergeLayRecovery(pending, [], rows)!;
  expect(restored.pending.markers[0]).toMatchObject({angleKind,geometryDirection:'rechts',geometrySource:'manual'});
  // A stale pending copy must also acquire the durable direction, without duplication.
  const marker = restored.pending.markers[0];
  const { geometryDirection: _direction, geometrySharpness: _sharpness, geometrySource: _source, ...stale } = marker;
  const merged = mergeLayRecovery({...pending,markers:[stale]},[],rows)!;
  expect(merged.pending.markers).toHaveLength(1);
  expect(merged.pending.markers[0].geometryDirection).toBe('rechts');
});
