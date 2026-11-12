import { buildLocalTrackDetail } from '@/features/tracking/utils/localTrackDetail';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import fixture from './fixtures/backend-cloud-v1.json';
import { importOwnCopy } from '../ownImport';
import { createOwnSync, type OwnSyncDependencies } from '../ownSync';
import { parseOwnCopy, canonicalJson } from '../ownCopy';
import type { ImportTransaction } from '../importPlan';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const receipt = fixture.accept.receipt, sessionId = receipt.ownSessionId, userId = receipt.recipientUserId;
function harness() {
  const db = new DatabaseSync(':memory:'); for (const m of MIGRATIONS) db.exec(m.sql);
  let epoch = 0, serial = 0, lose = false, changeAuth = false, failAt = 0, writes = 0;
  const cloud = clone(fixture.accept.ownCopy) as any, operations = new Map<string, { digest: string; revision: number }>();
  const calls: { action: string; body: any }[] = [];
  const tx: ImportTransaction = { async getFirstAsync<T>(sql: string, ...params: any[]) { return (db.prepare(sql).get(...params) ?? null) as T | null; },
    async runAsync(sql: string, ...params: any[]) { if (++writes === failAt) throw new Error('disk full'); return db.prepare(sql).run(...params); } };
  const deps: OwnSyncDependencies = { currentScope: () => ({ userId, epoch }),
    exclusive: async fn => { db.exec('BEGIN IMMEDIATE'); try { const result = await fn(tx); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    uuid: () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`,
    call: async (_user, action, body) => {
      calls.push({ action, body: clone(body) });
      if (changeAuth) { epoch += 2; throw new Error('ACCOUNT_CHANGED'); }
      const key = body.operationId as string, prior = operations.get(key), digest = canonicalJson(body);
      if (prior && prior.digest !== digest) throw new Error('TRANSFER_CONFLICT');
      if (!prior) {
        if (body.expectedRevision !== cloud.revision) throw new Error('TRANSFER_REVISION_CONFLICT');
        if (action === 'save_own') { const p = body.patch as any;
          for (const field of ['title','notes','rating','lyingTimeMinutes']) if (Object.hasOwn(p, field)) cloud.metadata[field] = p[field];
          if (p.evaluation) cloud.evaluation = p.evaluation; if (p.run) cloud.run = p.run;
        } else cloud.deleted = true;
        cloud.revision++; operations.set(key, { digest, revision: cloud.revision });
      }
      if (lose) { lose = false; throw new Error('lost ACK'); }
      return { version: 1, serverNowMs: Date.now(), receiptId: receipt.receiptId, operationId: key,
        appliedRevision: operations.get(key)!.revision, currentRevision: cloud.revision, deleted: !!cloud.deleted };
    } };
  const get = () => db.prepare('select * from local_training_sessions where local_id=?').get(sessionId);
  const state = () => db.prepare('select * from local_track_transfer_sync where session_id=?').get(sessionId);
  return { db, deps, get, state, cloud, calls, operations,
    init: () => importOwnCopy(deps, userId, receipt, fixture.accept.ownCopy),
    sync: () => createOwnSync(deps, userId), lose: () => { lose = true; }, changeAuth: () => { changeAuth = true; },
    fail: (n: number) => { failAt = n; }, epoch: () => { epoch += 2; } };
}
it('hydrates the actual backend own-copy response with remote child IDs and no ordinary create queue', async () => {
  const h = harness(); try {
    await h.init(); expect(h.get()).toMatchObject({ remote_id: sessionId, sync_status: 'synced', user_id: userId });
    expect(h.db.prepare('select count(*) as n from sync_queue').get().n).toBe(0);
    expect(h.db.prepare('select remote_id from local_track_points order by timestamp').all().map((r: any) => r.remote_id)).toEqual(fixture.accept.ownCopy.pointIds);
    expect(h.state().revision).toBe(1);
  } finally { h.db.close(); }
});
it('restores current own notes, run, evaluation and lying time from real PostgreSQL fixture without sender reset', async () => {
  const h = harness(); try {
    await importOwnCopy(h.deps, userId, fixture.restore.receipt, fixture.restore.ownCopy);
    const own = parseOwnCopy(fixture.restore.ownCopy, fixture.restore.receipt), p = JSON.parse(h.get().payload_json);
    expect(h.get().notes).toBe(own.metadata.notes); expect(p.run).toEqual(own.run);
    expect(p.score).toBe(own.evaluation?.score); expect(p.trackTransferLyingTimeMinutes).toBe(own.metadata.lyingTimeMinutes);
    expect(h.db.prepare('select count(*) as n from sync_queue').get().n).toBe(0);
  } finally { h.db.close(); }
});
it.each([1,2,3,4,5])('rolls back parent, children and durable sync binding together at statement %s', async at => {
  const h = harness(); try { h.fail(at); await expect(h.init()).rejects.toThrow('disk full');
    for (const table of ['local_training_sessions','local_track_points','local_track_markers','local_track_transfer_sync']) expect(h.db.prepare(`select count(*) as n from ${table}`).get().n).toBe(0);
  } finally { h.db.close(); }
});
it('never hydrates over a dirty own session', async () => {
  const h = harness(); try { await h.init(); h.db.prepare("update local_training_sessions set notes='offline work',sync_status='pending'").run();
    await expect(h.init()).rejects.toThrow('IMPORT_CONFLICT'); expect(h.get().notes).toBe('offline work');
  } finally { h.db.close(); }
});
it('reuses a durably captured request after ACK loss and process restart, then saves later local edits separately', async () => {
  const h = harness(); try { await h.init(); h.lose();
    await expect(h.sync().edit(sessionId, { notes: 'first' })).rejects.toThrow('lost ACK');
    const saved = JSON.parse(h.state().pending_json); expect(h.cloud.metadata.notes).toBe('first');
    h.db.prepare("update local_training_sessions set notes='second' where local_id=?").run(sessionId);
    await h.sync().sync(sessionId);
    expect(h.calls[0].body).toEqual(h.calls[1].body); expect(h.calls[1].body).toEqual(saved.body);
    expect(h.calls[2].body.operationId).not.toBe(saved.body.operationId); expect(h.cloud.metadata.notes).toBe('second');
    expect(h.operations.size).toBe(2); expect(h.state().pending_json).toBeNull(); expect(h.get().sync_status).toBe('synced');
  } finally { h.db.close(); }
});
it('does not erase a pending operation when the recorder replaces its own payload', async () => {
  const h = harness(); try { await h.init(); const original = h.get().payload_json; h.lose();
    await expect(h.sync().edit(sessionId, { notes: 'keep' })).rejects.toThrow('lost ACK');
    h.db.prepare('update local_training_sessions set payload_json=?').run(original);
    const operation = h.state().pending_json; await h.sync().sync(sessionId);
    expect(operation).not.toBeNull(); expect(h.calls[0].body).toEqual(h.calls[1].body); expect(h.operations.size).toBe(1);
  } finally { h.db.close(); }
});
it('keeps stale local edits on revision conflict and never rebases them automatically', async () => {
  const h = harness(); try { await h.init(); h.cloud.revision = 2; h.cloud.metadata.notes = 'other device';
    await expect(h.sync().edit(sessionId, { notes: 'offline note' })).rejects.toThrow('TRANSFER_REVISION_CONFLICT');
    expect(h.get().notes).toBe('offline note'); expect(h.cloud.metadata.notes).toBe('other device'); expect(h.state().pending_json).not.toBeNull(); expect(h.state().revision).toBe(1);
  } finally { h.db.close(); }
});
it('an old successful ACK cannot adopt a newer cloud revision or reset the local draft', async () => {
  const h = harness(); try { await h.init(); h.lose(); await expect(h.sync().edit(sessionId, { notes: 'old' })).rejects.toThrow();
    h.cloud.revision = 3; h.cloud.metadata.notes = 'new device'; h.db.prepare("update local_training_sessions set notes='local unsent'").run();
    await expect(h.sync().sync(sessionId)).rejects.toThrow('TRANSFER_REVISION_CONFLICT');
    expect(h.get().notes).toBe('local unsent'); expect(h.get().sync_status).toBe('conflict'); expect(h.state().revision).toBe(2); expect(h.cloud.metadata.notes).toBe('new device');
  } finally { h.db.close(); }
});
it('account epoch changes reject the response without advancing local revision', async () => {
  const h = harness(); try { await h.init(); h.changeAuth(); await expect(h.sync().edit(sessionId, { notes: 'own' })).rejects.toThrow('ACCOUNT_CHANGED');
    expect(h.state().revision).toBe(1); expect(h.state().pending_json).not.toBeNull();
  } finally { h.db.close(); }
});
it('deletion retries the same request and leaves a tombstone instead of recreating the original', async () => {
  const h = harness(); try { await h.init(); h.lose(); await expect(h.sync().sync(sessionId, true)).rejects.toThrow('lost ACK');
    await h.sync().sync(sessionId, true); expect(h.calls[0].body).toEqual(h.calls[1].body); expect(h.state().deleted).toBe(1); expect(h.get().deleted_at).not.toBeNull();
    await expect(h.init()).rejects.toThrow('IMPORT_CONFLICT'); await expect(h.sync().edit(sessionId, { notes: 'resurrect' })).rejects.toThrow('TRANSFER_COPY_GONE');
  } finally { h.db.close(); }
});

it('queues a direct deletion durably before a lost server ACK', async () => {
  const h = harness(); try { await h.init(); h.lose(); await expect(h.sync().sync(sessionId, true)).rejects.toThrow('lost ACK');
    expect(h.get().sync_status).toBe('deleted_pending'); expect(h.get().deleted_at).not.toBeNull();
    expect(h.db.prepare("select operation,status from sync_queue").all()).toEqual([{ operation: 'delete', status: 'pending' }]);
    await h.sync().sync(sessionId, true); expect(h.state().deleted).toBe(1); expect(h.operations.size).toBe(1);
  } finally { h.db.close(); }
});
it('migration 7 preserves existing version-6 records and removes its binding with a deleted parent', () => {
  const db = new DatabaseSync(':memory:'); try {
    db.exec('PRAGMA foreign_keys=ON'); for (const m of MIGRATIONS.filter(m => m.version <= 6)) db.exec(m.sql);
    db.prepare("insert into local_training_sessions(local_id,notes,payload_json) values('legacy','keep','{}')").run();
    const before = db.prepare('select * from local_training_sessions').get(); db.exec(MIGRATIONS.find(m => m.version === 7)!.sql);
    expect(db.prepare('select * from local_training_sessions').get()).toEqual(before);
    db.prepare("insert into local_track_transfer_sync(session_id,receipt_id,user_id,receipt_json,revision,base_patch_json) values('legacy','receipt','user','{}',1,'{}')").run();
    db.exec("delete from local_training_sessions where local_id='legacy'"); expect(db.prepare('select count(*) as n from local_track_transfer_sync').get().n).toBe(0);
  } finally { db.close(); }
});

it('keeps original object IDs in detail and own search despite distinct SQLite/cloud marker row IDs', async () => {
  const h = harness(); try { await h.init();
    const markers = h.db.prepare('select * from local_track_markers order by created_at').all();
    const detail = buildLocalTrackDetail(h.get(), [], markers);
    expect(detail.markers.map((m: any) => m.id)).toEqual(fixture.accept.ownCopy.reference.markers.map(m => m.id));
    expect(detail.markers[0].id).not.toBe(markers[0].local_id);
    expect(detail.markers[0].id).not.toBe(markers[0].remote_id);
  } finally { h.db.close(); }
});

it('can delete a bound copy even if its unsent run payload is malformed', async () => {
  const h = harness(); try { await h.init(); const payload = JSON.parse(h.get().payload_json); payload.run = { invalid: true };
    h.db.prepare('update local_training_sessions set payload_json=?').run(JSON.stringify(payload));
    await h.sync().sync(sessionId, true); expect(h.state().deleted).toBe(1); expect(h.calls[0].action).toBe('delete_own');
  } finally { h.db.close(); }
});

it('restoring an existing evaluation does not derive or clear its independent cloud rating', async () => {
  const h = harness(); try {
    await importOwnCopy(h.deps, userId, fixture.restore.receipt, fixture.restore.ownCopy);
    Object.assign(h.cloud, clone(fixture.restore.ownCopy));
    expect(h.cloud.metadata.rating).toBe(4); expect(h.cloud.evaluation.score).toBe(80);
    const before = clone(h.cloud); await h.sync().sync(sessionId);
    expect(h.calls).toHaveLength(0); expect(h.cloud).toEqual(before);
    await h.sync().edit(sessionId, { notes: 'only this note' });
    expect(h.calls).toHaveLength(1); expect(h.calls[0].body.patch).toEqual({ notes: 'only this note' });
    expect(h.cloud.metadata.rating).toBe(4); expect(h.cloud.evaluation).toEqual(before.evaluation); expect(h.cloud.run).toEqual(before.run);
  } finally { h.db.close(); }
});
