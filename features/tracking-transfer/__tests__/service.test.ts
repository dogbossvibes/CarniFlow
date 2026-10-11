import { createTrackTransferService, parseTransferOffer } from '../service';
import { createTransferJournal } from '../operationJournal';
import { parseTrackTransferReference } from '../reference';
import type { ImportDependencies } from '../importPlan';
import type { SourceDependencies } from '../source';
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ref = () => parseTrackTransferReference({ version: 1, startedAtMs: 1000, finishedAtMs: 2000, distanceM: 1, durationSeconds: 1,
  points: [1000, 2000].map(t => ({ lat: 47, lng: 8, t, accuracy: 1, altitude: null, speed: null, heading: null, breakBefore: false, measuredDistanceM: null })),
  markers: [], segments: [], manualAngleGeometry: null });
const offer = () => parseTransferOffer({ transferId: id(1), senderUserId: id(2), recipientUserId: id(3), sourceTrainingId: id(4), referenceDigest: 'a'.repeat(64), createdAtMs: 3000, expiresAtMs: 90000, status: 'pending' });
const receipt = (body: Record<string, unknown>) => ({ version: 1, transferId: id(1), recipientUserId: id(3), referenceDigest: 'a'.repeat(64), acceptedAtMs: 4000,
  receiptId: body.receiptId, recipientDogId: body.recipientDogId, ownSessionId: body.ownSessionId, ownRunId: body.ownRunId });
const ownCopy = () => ({ version: 1, revision: 1, reference: ref(), pointIds: [id(81), id(82)], markerIds: [], createdAtMs: 4000,
  metadata: { title: null, notes: null, rating: null, lyingTimeMinutes: null }, evaluation: null, run: null });
function harness() {
  let epoch = 0, nextId = 10, failSave = false; const memory = new Map<string, string>();
  const storage = { getItem: async (key: string) => memory.get(key) ?? null, setItem: async (key: string, value: string) => { if (failSave) throw new Error('disk'); memory.set(key, value); } };
  const write = jest.fn(async () => {}), read = jest.fn(async () => null);
  const local: ImportDependencies & SourceDependencies = { currentScope: () => ({ userId: id(3), epoch }),
    exclusive: async fn => fn({ getFirstAsync: read, runAsync: write }), snapshot: jest.fn(), sourceIsRecording: () => false };
  const call = jest.fn(async (_user: string, action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (action === 'list') return { version: 1, serverNowMs: 5000, incoming: [offer()], outgoing: [] };
    return { version: 1, serverNowMs: 5000, receipt: receipt(body), ownCopy: ownCopy(), quota: { success: true, used: 1, limit: 1 } };
  });
  const make = () => createTrackTransferService(id(3), { local, client: { call }, journal: createTransferJournal(id(3), storage), uuid: () => id(nextId++), hash: async () => 'b'.repeat(64) });
  return { make, call, write, read, memory, change: () => { epoch += 2; }, failSave: () => { failSave = true; }, local };
}
it('reuses the exact accept body after lost response and recreated service; no second identity or client quota claim', async () => {
  const h = harness(), saved = h.call.getMockImplementation()!; h.call.mockRejectedValueOnce(new Error('lost ACK'));
  await expect(h.make().accept(offer(), ref(), id(5))).rejects.toThrow('lost ACK');
  const first = h.call.mock.calls[0][2]; expect(h.write).not.toHaveBeenCalled();
  h.call.mockImplementation(saved);
  const result = await h.make().accept(offer(), ref(), id(5));
  expect(h.call.mock.calls[1][2]).toEqual(first); expect(result.sessionId).toBe(first.ownSessionId);
  expect(h.call.mock.calls.every(([, action]) => action === 'accept')).toBe(true);
  expect(h.write).toHaveBeenCalledTimes(4); // own parent, two points, durable cloud binding
  expect([...h.memory.values()].join('')).not.toContain('latitude'); expect([...h.memory.values()].join('')).not.toContain('points');
});
it('never sends accept when durable reservation fails', async () => {
  const h = harness(); h.failSave(); await expect(h.make().accept(offer(), ref(), id(5))).rejects.toThrow('STORAGE'); expect(h.call).not.toHaveBeenCalled();
});
it('does not silently change the dog after an ambiguous acceptance', async () => {
  const h = harness(); h.call.mockRejectedValueOnce(new Error('lost'));
  await expect(h.make().accept(offer(), ref(), id(5))).rejects.toThrow();
  await expect(h.make().accept(offer(), ref(), id(6))).rejects.toThrow('TRANSFER_CONFLICT'); expect(h.call).toHaveBeenCalledTimes(1);
});
it.each(['recipientUserId', 'recipientDogId', 'ownSessionId', 'ownRunId', 'receiptId', 'transferId'])('rejects server receipt mismatch %s before any SQL write', async field => {
  const h = harness(), original = h.call.getMockImplementation()!;
  h.call.mockImplementation(async (...args) => { const result = await original(...args); result.receipt = { ...(result.receipt as object), [field]: id(99) }; return result; });
  await expect(h.make().accept(offer(), ref(), id(5))).rejects.toThrow('INVALID_RESPONSE'); expect(h.write).not.toHaveBeenCalled();
});
it('compares the complete reference on acceptance, not only digest or point count', async () => {
  const h = harness(), original = h.call.getMockImplementation()!;
  h.call.mockImplementation(async (...args) => { const result = await original(...args), changed = ref(); changed.points[1].lat += 0.0001; return { ...result, ownCopy: { ...ownCopy(), reference: changed } }; });
  await expect(h.make().accept(offer(), ref(), id(5))).rejects.toThrow('REFERENCE_CHANGED'); expect(h.write).not.toHaveBeenCalled();
});
it('blocks an A→B→A response before import even when the transport returns success', async () => {
  const h = harness(), original = h.call.getMockImplementation()!;
  h.call.mockImplementation(async (...args) => { const result = await original(...args); h.change(); return result; });
  await expect(h.make().accept(offer(), ref(), id(5))).rejects.toThrow('ACCOUNT_CHANGED'); expect(h.write).not.toHaveBeenCalled();
});
it('rejects a missing successful regular quota acknowledgement', async () => {
  const h = harness(), original = h.call.getMockImplementation()!;
  h.call.mockImplementation(async (...args) => ({ ...await original(...args), quota: { success: false, used: 1, limit: 1 } }));
  await expect(h.make().accept(offer(), ref(), id(5))).rejects.toThrow('INVALID_RESPONSE'); expect(h.write).not.toHaveBeenCalled();
});
it('never accepts foreign or duplicated inbox metadata', async () => {
  const h = harness(); h.call.mockResolvedValue({ incoming: [offer(), offer()], outgoing: [], serverNowMs: 5000 });
  await expect(h.make().list()).rejects.toThrow('INVALID_RESPONSE');
  h.call.mockResolvedValue({ incoming: [{ ...offer(), recipientUserId: id(99) }], outgoing: [], serverNowMs: 5000 });
  await expect(h.make().list()).rejects.toThrow('INVALID_RESPONSE');
});
it('restores an accepted receipt without a local journal via the recipient-authorised read action', async () => {
  const h = harness(); const body = { receiptId: id(10), recipientDogId: id(5), ownSessionId: id(11), ownRunId: id(12) };
  h.call.mockResolvedValue({ version: 1, serverNowMs: 5000, receipt: receipt(body), ownCopy: ownCopy(), quota: { success: true, used: 1, limit: 1 } });
  await expect(h.make().recover({ ...offer(), status: 'accepted' })).resolves.toMatchObject({ sessionId: id(11), runId: id(12), dogId: id(5) });
  expect(h.call).toHaveBeenCalledWith(id(3), 'read', { transferId: id(1) });
});
it('keeps a durable reservation unique for simultaneous journal clients', async () => {
  const data = new Map<string, string>(), storage = { getItem: async (k: string) => data.get(k) ?? null, setItem: async (k: string, v: string) => { data.set(k, v); } };
  const a = createTransferJournal(id(3), storage), b = createTransferJournal(id(3), storage);
  const results = await Promise.all([a.reserve('accept:x', () => ({ receiptId: id(1) })), b.reserve('accept:x', () => ({ receiptId: id(2) }))]);
  expect(results[0]).toEqual(results[1]); expect(await a.entries()).toHaveLength(1);
});
function withSource(h: ReturnType<typeof harness>) {
  const value = ref();
  const session = { local_id: id(4), remote_id: id(4), user_id: id(3), dog_id: id(5), type: 'track', status: 'completed', deleted_at: null,
    started_at: new Date(1000).toISOString(), ended_at: new Date(2000).toISOString(), duration_seconds: 1, updated_at: new Date(2000).toISOString(),
    payload_json: JSON.stringify({ distanceMeters: 1, manualAngleGeometry: [], notes: 'PRIVATE', run: { score: 99 } }) };
  const points = value.points.map(p => ({ latitude: p.lat, longitude: p.lng, timestamp: new Date(p.t).toISOString(), accuracy: p.accuracy,
    altitude: p.altitude, speed: p.speed, heading: p.heading, payload_json: null, session_local_id: id(4), point_type: 'lay' }));
  let reads = 0;
  h.local.snapshot = async fn => fn({ getFirstAsync: async <T>() => session as T,
    getAllAsync: async <T>() => (++reads % 2 === 1 ? points : []) as T[] });
  const original = h.call.getMockImplementation()!;
  h.call.mockImplementation(async (user, action, request) => {
    if (action === 'prepare') return { version: 1, serverNowMs: 3000, preparationId: request.preparationId, sourceTrainingId: id(4),
      referenceDigest: 'a'.repeat(64), reference: request.ownerReferenceV1, expiresAtMs: 9000 };
    if (action === 'offer') return { version: 1, serverNowMs: 3000, transfer: { ...offer(), transferId: request.transferId, senderUserId: id(3), recipientUserId: id(2) } };
    return original(user, action, request);
  });
  return { session, points };
}
it('prepares and semantically confirms a complete owner reference before offering it to the chosen contact', async () => {
  const h = harness(); withSource(h);
  const result = await h.make().offer(id(4), id(2));
  expect(result.recipientUserId).toBe(id(2));
  expect(h.call.mock.calls.map(c => c[1])).toEqual(['prepare', 'offer']);
  const wire = JSON.stringify(h.call.mock.calls); expect(wire).not.toContain('PRIVATE'); expect(wire).not.toContain('score');
  expect(h.write).not.toHaveBeenCalled();
});
it('never offers a preparation whose full geometry differs from the owner reference', async () => {
  const h = harness(); withSource(h); const original = h.call.getMockImplementation()!;
  h.call.mockImplementation(async (...args) => { const result = await original(...args);
    if (args[1] === 'prepare') { const value = ref(); value.points[1].lng += .1; return { ...result, reference: value }; } return result;
  });
  await expect(h.make().offer(id(4), id(2))).rejects.toThrow('REFERENCE_CHANGED');
  expect(h.call.mock.calls.map(c => c[1])).toEqual(['prepare']);
});
it('rereads the completed source after preparation and refuses a concurrent reference edit', async () => {
  const h = harness(), source = withSource(h), original = h.call.getMockImplementation()!;
  h.call.mockImplementation(async (...args) => { const result = await original(...args); if (args[1] === 'prepare') source.points[1].latitude += .1; return result; });
  await expect(h.make().offer(id(4), id(2))).rejects.toThrow('REFERENCE_CHANGED');
  expect(h.call.mock.calls.map(c => c[1])).toEqual(['prepare']);
});
it('opens an already committed own copy offline without requiring the expired server payload or reimporting it', async () => {
  const h = harness(); const saved = receipt({ receiptId: id(10), recipientDogId: id(5), ownSessionId: id(11), ownRunId: id(12) });
  h.local.snapshot = async () => ({ local_id: id(11), user_id: id(3), dog_id: id(5), payload_json: JSON.stringify({ trackTransferReceipt: saved, run: { score: 77 } }) }) as never;
  await expect(h.make().recover({ ...offer(), status: 'accepted' })).resolves.toEqual({ sessionId: id(11), runId: id(12), dogId: id(5), created: false });
  expect(h.call).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
});

it('Android rejects unsupported gap acceptance before journal, HTTP or quota and keeps the offer intact', async () => {
  const h = harness(), reference = ref(), invitation = offer(); reference.points[1].breakBefore = true;
  const before = JSON.stringify({ reference, invitation });
  await expect(h.make().accept(invitation, reference, id(5))).rejects.toThrow('TRANSFER_GAPS_UNSUPPORTED');
  expect(h.call).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled(); expect(h.memory.size).toBe(0);
  expect(JSON.stringify({ reference, invitation })).toBe(before);
});
