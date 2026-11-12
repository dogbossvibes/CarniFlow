import { createTrackTransferImportPlan } from '../importPlan';
import { decideTrackRecovery, reconstructPendingFromSession } from '@/features/tracking/store/trackRecovery';
import { transferRunId } from '../recovery';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import type { LocalSessionSnapshot } from '@/features/tracking/store/trackRecovery';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const receipt = { version: 1 as const, transferId: id(1), receiptId: id(2), recipientUserId: id(3), recipientDogId: id(4),
  ownSessionId: id(5), ownRunId: id(6), referenceDigest: 'a'.repeat(64), acceptedAtMs: 1791720010000 };
function snapshot(): LocalSessionSnapshot {
  const db = new DatabaseSync(':memory:');
  try {
    for (const m of MIGRATIONS) db.exec(m.sql);
    const reference = { version: 1, startedAtMs: 1791720000000, finishedAtMs: 1791720009000, distanceM: 2.123456, durationSeconds: 9,
      points: [0, 9000].map((dt, i) => ({ lat: 47, lng: 8 + i * .00001, t: 1791720000000 + dt, accuracy: 1.123456,
        altitude: null, speed: null, heading: null, breakBefore: i > 0, measuredDistanceM: i * 2.123456 })),
      markers: [{ id: 'real-source-marker', type: 'gegenstand', material: 'holz', angleKind: null,
        lat: 47, lng: 8, accuracy: 1, distanceFromStartM: 0, t: 1791720000000 }], segments: [], manualAngleGeometry: null };
    for (const q of createTrackTransferImportPlan(receipt, reference).statements) db.prepare(q.sql).run(...q.params);
    return { session: db.prepare('select * from local_training_sessions').get(),
      layPoints: db.prepare('select * from local_track_points order by timestamp').all(),
      markers: db.prepare('select * from local_track_markers').all(), searchPointCount: 0 };
  } finally { db.close(); }
}
it('restores actual imported marker identities, times, measured distance and gaps through the real recovery decision', () => {
  const result = reconstructPendingFromSession(snapshot(), id(4), { now: Date.now(), userId: id(3) });
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.pending.runId).toBe(id(6)); expect(result.pending.transferReceipt).toEqual(receipt);
  expect(result.pending.markers[0]).toMatchObject({ id: 'real-source-marker', t: 1791720000000, found: false });
  expect(result.pending.trackPoints[1]).toMatchObject({ breakBefore: true, measuredDistanceM: 2.123456 });
  expect(result.pending.distanceMeters).toBe(2.123456);
});
it.each(['recipientUserId', 'recipientDogId', 'ownSessionId'])('rejects inconsistent receipt %s during reconstruction', key => {
  const snap = snapshot(), payload = JSON.parse(snap.session.payload_json!); payload.trackTransferReceipt[key] = id(99);
  snap.session.payload_json = JSON.stringify(payload);
  expect(reconstructPendingFromSession(snap, id(4), { now: Date.now(), userId: id(3) }).ok).toBe(false);
});
it('never turns a missing measured distance into a zero-distance search', () => {
  const snap = snapshot(), payload = JSON.parse(snap.session.payload_json!); payload.distanceMeters = null;
  snap.session.payload_json = JSON.stringify(payload);
  expect(reconstructPendingFromSession(snap, id(4), { now: Date.now(), userId: id(3) }).ok).toBe(false);
});
it('never reconstructs a completed or already started search as a fresh imported track', () => {
  const snap = snapshot(); snap.searchPointCount = 1;
  expect(reconstructPendingFromSession(snap, id(4), { now: Date.now(), userId: id(3) })).toEqual({ ok: false, reason: 'search_started' });
  snap.searchPointCount = 0; snap.session.payload_json = JSON.stringify({ ...JSON.parse(snap.session.payload_json!), run: { score: 74 } });
  expect(reconstructPendingFromSession(snap, id(4), { now: Date.now(), userId: id(3) })).toEqual({ ok: false, reason: 'search_completed' });
});
it('uses the reserved own run only for its account, dog and session; ordinary tracks keep the existing path', () => {
  expect(transferRunId(receipt, id(3), id(5), id(4))).toBe(id(6));
  expect(transferRunId(null, undefined, null, undefined)).toBeNull();
  expect(() => transferRunId(receipt, id(99), id(5), id(4))).toThrow('ACCOUNT_CHANGED');
  expect(() => transferRunId(receipt, id(3), id(99), id(4))).toThrow('ACCOUNT_CHANGED');
});

it('opens a freshly imported own session with no pending buffer or registry, then rejects another account', () => {
  const local = snapshot();
  const input = { registry: {}, pending: null, local, dogId: id(4), sessionId: id(5), now: Date.now() };
  expect(decideTrackRecovery(input)).toEqual({ ok: false, reason: 'no_geometry' });
  const own = decideTrackRecovery({ ...input, userId: id(3) });
  expect(own.ok).toBe(true);
  if (own.ok) {
    expect(own.mode).toBe('resting'); expect(own.pendingToWrite?.transferReceipt).toEqual(receipt);
    expect(own.target).toContain(id(5)); expect(own.registryPatch?.runId).toBe(id(6));
  }
  expect(decideTrackRecovery({ ...input, userId: id(99) })).toEqual({ ok: false, reason: 'wrong_user' });
});
