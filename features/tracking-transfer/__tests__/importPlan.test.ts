import { MIGRATIONS } from '@/lib/localDb/migrations';
import { importTrackTransfer, parseTransferReceipt, type ImportDependencies, type ImportTransaction } from '../importPlan';
import { parseTrackTransferReference } from '../reference';
// Actual in-memory SQLite exercises SQL, rollback and constraints, rather than mirroring an array repository.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const receipt = () => ({ version: 1, transferId: id(1), receiptId: id(2), recipientUserId: id(3), recipientDogId: id(4),
  ownSessionId: id(5), ownRunId: id(6), referenceDigest: 'a'.repeat(64), acceptedAtMs: 1791720010000 });
const reference = () => parseTrackTransferReference({ version: 1, startedAtMs: 1791720000000, finishedAtMs: 1791720009000,
  distanceM: 15, durationSeconds: 9,
  points: [0, 9000].map((dt, i) => ({ lat: 47 + i * .0001, lng: 8, t: 1791720000000 + dt, accuracy: 2,
    altitude: null, speed: null, heading: null, breakBefore: i > 0, measuredDistanceM: i * 15 })),
  markers: [{ id: 'original-object', type: 'gegenstand', material: 'holz', angleKind: null, lat: 47, lng: 8,
    accuracy: null, distanceFromStartM: 0, t: 1791720000000 }], segments: [], manualAngleGeometry: null });
function harness() {
  const db = new DatabaseSync(':memory:'); for (const m of MIGRATIONS) db.exec(m.sql);
  let epoch = 0, count = 0, failAt = 0, changeAt = 0;
  const tx: ImportTransaction = {
    async getFirstAsync<T>(sql: string, ...params: (string | number | null)[]) { return (db.prepare(sql).get(...params) ?? null) as T | null; },
    async runAsync(sql, ...params) {
      count++;
      if (count === failAt) throw new Error('synthetic storage failure');
      const result = db.prepare(sql).run(...params);
      if (count === changeAt) epoch += 2;
      return result;
    },
  };
  const deps: ImportDependencies = { currentScope: () => ({ userId: id(3), epoch }),
    exclusive: async write => {
      db.exec('BEGIN IMMEDIATE');
      try { const result = await write(tx); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    } };
  return { db, deps, failAt: (n: number) => { failAt = n; }, changeAt: (n: number) => { changeAt = n; } };
}
it('imports an own parent and only the reference, preserving source marker identity and continuity', async () => {
  const h = harness(); try {
    await expect(importTrackTransfer(h.deps, id(3), receipt(), reference())).resolves.toEqual({ created: true, sessionId: id(5), runId: id(6) });
    const parent = h.db.prepare('select * from local_training_sessions').get();
    expect(parent).toMatchObject({ user_id: id(3), dog_id: id(4), status: 'completed', notes: null, visibility: 'private', sync_status: 'pending' });
    const payload = JSON.parse(parent.payload_json);
    expect(payload.trackTransferReceipt.ownRunId).toBe(id(6)); expect(payload.run).toBeUndefined();
    const points = h.db.prepare('select * from local_track_points order by timestamp').all();
    expect(points).toHaveLength(2); expect(points.every((p: { point_type: string; session_local_id: string }) => p.point_type === 'lay' && p.session_local_id === id(5))).toBe(true);
    expect(JSON.parse(points[1].payload_json)).toEqual({ breakBefore: true, measuredDistanceM: 15 });
    const marker = h.db.prepare('select * from local_track_markers').get();
    expect(JSON.parse(marker.payload_json)).toEqual({ sourceMarkerId: 'original-object', recordedAtMs: 1791720000000 });
    expect(h.db.prepare('select entity_local_id,operation,status from sync_queue').get()).toEqual({ entity_local_id: id(5), operation: 'create', status: 'pending' });
    expect(marker.note).toBeNull(); expect(marker.audio_remote_url).toBeNull();
  } finally { h.db.close(); }
});
it('replays the same receipt without overwriting later search results, edits or adding points', async () => {
  const h = harness(); try {
    await importTrackTransfer(h.deps, id(3), receipt(), reference());
    const parent = h.db.prepare('select payload_json from local_training_sessions').get();
    const payload = { ...JSON.parse(parent.payload_json), run: { run_id: id(6), score: 81 } };
    h.db.prepare('update local_training_sessions set notes=?,payload_json=?').run('MY NEW NOTE', JSON.stringify(payload));
    await expect(importTrackTransfer(h.deps, id(3), receipt(), reference())).resolves.toMatchObject({ created: false });
    expect(h.db.prepare('select notes,payload_json from local_training_sessions').get()).toEqual({ notes: 'MY NEW NOTE', payload_json: JSON.stringify(payload) });
    expect(h.db.prepare('select count(*) as n from local_track_points').get().n).toBe(2);
  } finally { h.db.close(); }
});
it.each([1, 2, 3, 4, 5])('rolls back the complete import if statement %s fails', async at => {
  const h = harness(); try {
    h.failAt(at); await expect(importTrackTransfer(h.deps, id(3), receipt(), reference())).rejects.toThrow('storage failure');
    for (const table of ['local_training_sessions', 'local_track_points', 'local_track_markers', 'sync_queue']) {
      expect(h.db.prepare(`select count(*) as n from ${table}`).get().n).toBe(0);
    }
  } finally { h.db.close(); }
});
it('rolls back even when A→B→A occurs after the last insert', async () => {
  const h = harness(); try {
    h.changeAt(5); await expect(importTrackTransfer(h.deps, id(3), receipt(), reference())).rejects.toThrow('ACCOUNT_CHANGED');
    expect(h.db.prepare('select count(*) as n from local_training_sessions').get().n).toBe(0);
  } finally { h.db.close(); }
});
it('refuses a colliding existing session and preserves it', async () => {
  const h = harness(); try {
    h.db.prepare('insert into local_training_sessions(local_id,user_id,dog_id,notes) values(?,?,?,?)').run(id(5), id(3), id(4), 'EXISTING');
    await expect(importTrackTransfer(h.deps, id(3), receipt(), reference())).rejects.toThrow('IMPORT_CONFLICT');
    expect(h.db.prepare('select notes from local_training_sessions').get().notes).toBe('EXISTING');
    expect(h.db.prepare('select count(*) as n from local_track_points').get().n).toBe(0);
  } finally { h.db.close(); }
});
it.each(['ownRunId', 'recipientDogId', 'receiptId'] as const)('rejects a different receipt binding %s on retry', async field => {
  const h = harness(); try {
    await importTrackTransfer(h.deps, id(3), receipt(), reference());
    await expect(importTrackTransfer(h.deps, id(3), { ...receipt(), [field]: id(99) }, reference())).rejects.toThrow('IMPORT_CONFLICT');
  } finally { h.db.close(); }
});
it('never imports into a different account', async () => {
  const h = harness(); try {
    await expect(importTrackTransfer(h.deps, id(99), receipt(), reference())).rejects.toThrow('ACCOUNT_CHANGED');
    expect(h.db.prepare('select count(*) as n from local_training_sessions').get().n).toBe(0);
  } finally { h.db.close(); }
});
it.each([{ ...receipt(), version: 2 }, { ...receipt(), extra: true }, { ...receipt(), ownRunId: id(5) }, { ...receipt(), acceptedAtMs: NaN }])('rejects malformed receipt', value => {
  expect(() => parseTransferReceipt(value)).toThrow('RECEIPT_INVALID');
});
