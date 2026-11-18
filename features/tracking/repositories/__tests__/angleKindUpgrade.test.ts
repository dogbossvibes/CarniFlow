// T-211: Die Spitz-Hochstufung ändert genau eine Winkel-Zeile und sonst nichts (echtes SQLite).
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { createLocalTrackMarker, getTrackMarkersBySession, upgradeLocalTrackMarkerAngleKind } from '../localTrackRepository';
import { mergeLayRecovery } from '../../utils/layRecovery';
import type { PendingTrack } from '../../store/trackPersist';

let mockDb: DatabaseSync;
let mockId = 0;
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  runAsync: async (sql: string, ...params: (string | number | null)[]) => mockDb.prepare(sql).run(...params),
  getAllAsync: async (sql: string, ...params: (string | number | null)[]) => mockDb.prepare(sql).all(...params),
}) }));
jest.mock('@/lib/localDb/ids', () => ({ newLocalId: () => `marker-${++mockId}`, nowIso: () => new Date(1000).toISOString() }));
beforeEach(() => { mockDb = new DatabaseSync(':memory:'); for (const m of MIGRATIONS) mockDb.exec(m.sql); mockDb.exec("insert into local_training_sessions(local_id) values ('session')"); });
afterEach(() => mockDb.close());

const angle = (sourceMarkerId: string, angle_kind: string) => createLocalTrackMarker('session', {
  sourceMarkerId, recordedAtMs: 1000, marker_type: 'winkel', angle_kind, latitude: 47, longitude: 8, accuracy: 4, distance_from_start: 21.5, note: 'n' });

it('stuft nur die genannte normale Winkel-Zeile hoch; alle anderen Spalten und Zeilen bleiben gleich', async () => {
  const a = await angle('a', 'links');
  const b = await angle('b', 'links');
  const obj = await createLocalTrackMarker('session', { sourceMarkerId: 'o', recordedAtMs: 1000, marker_type: 'gegenstand', material: 'holz', latitude: 47, longitude: 8, distance_from_start: 30 });
  const before = await getTrackMarkersBySession('session');
  await upgradeLocalTrackMarkerAngleKind(a, 'links', 'spitz_links');
  const after = await getTrackMarkersBySession('session');
  expect(after).toHaveLength(3);
  expect(after.find(r => r.local_id === a)).toEqual({ ...before.find(r => r.local_id === a), angle_kind: 'spitz_links' });
  expect(after.find(r => r.local_id === b)).toEqual(before.find(r => r.local_id === b));
  expect(after.find(r => r.local_id === obj)).toEqual(before.find(r => r.local_id === obj));
});

it('ändert nichts, wenn die Zeile nicht (mehr) die erwartete normale Richtung trägt', async () => {
  const right = await angle('r', 'rechts');
  const manual = await angle('m', 'ow');
  const already = await angle('s', 'spitz_links');
  const before = await getTrackMarkersBySession('session');
  await upgradeLocalTrackMarkerAngleKind(right, 'links', 'spitz_links');
  await upgradeLocalTrackMarkerAngleKind(manual, 'links', 'spitz_links');
  await upgradeLocalTrackMarkerAngleKind(already, 'links', 'spitz_links');
  await upgradeLocalTrackMarkerAngleKind('unbekannt', 'links', 'spitz_links');
  expect(await getTrackMarkersBySession('session')).toEqual(before);
});

it('verweigert einen Richtungswechsel', async () => {
  const a = await angle('a', 'links');
  await expect(upgradeLocalTrackMarkerAngleKind(a, 'links', 'spitz_rechts')).rejects.toThrow();
  expect((await getTrackMarkersBySession('session'))[0].angle_kind).toBe('links');
});

it('Wiederherstellung nach App-Abbruch: kein doppelter Marker, egal welche Seite schon hochgestuft ist', async () => {
  const a = await angle('a', 'links');
  await upgradeLocalTrackMarkerAngleKind(a, 'links', 'spitz_links');
  const rows = await getTrackMarkersBySession('session');
  const pending = (angleKind: 'links' | 'spitz_links'): PendingTrack => ({ sessionId: 'session', dogId: 'dog', status: 'laying', trackPoints: [],
    markers: [{ id: 'a', type: 'winkel', material: null, angleKind, lat: 47, lng: 8, accuracy: 4, distance_from_start: 21.5, note: 'n', audio_url: null, found: false, t: 1000 }],
    runPoints: [], distanceMeters: 30, durationSeconds: 1, layFinishedAt: null, startAnchor: null, savedAt: 1000 });
  for (const kind of ['links', 'spitz_links'] as const) {
    const merged = mergeLayRecovery(pending(kind), [], rows)!;
    expect(merged.pending.markers).toHaveLength(1);
    expect(merged.markersToPersist).toHaveLength(0);
  }
});
