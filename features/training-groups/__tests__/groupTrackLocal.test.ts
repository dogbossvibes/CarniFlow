import { createGroupTrackImportPlan, findLocalGroupTrack, findOwnGroupTrack, importGroupTrack, listOwnGroupTracks, readGroupTrackMarker, submitHandover, listPendingHandovers } from '../groupTrackLocal';
import { projectTrackTransferSource } from '@/features/tracking-transfer/source';
import { GroupApiError } from '@/features/tracking-exchange/groups/groupRpc';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {
  getItem: async (k: string) => mockStore.get(k) ?? null, setItem: async (k: string, v: string) => { mockStore.set(k, v); } } }));
const mockRows: { session: Record<string, unknown> | null; points: Record<string, unknown>[]; markers: Record<string, unknown>[] } = { session: null, points: [], markers: [] };
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  getFirstAsync: async () => mockRows.session,
  getAllAsync: async (sql: string) => sql.includes('local_track_points') ? mockRows.points : mockRows.markers,
}) }));
const mockClearPending = jest.fn(async () => {});
jest.mock('@/features/tracking/store/trackPersist', () => ({ peekPending: async () => ({ sessionId: 'lay-1' }), clearPending: (...a: unknown[]) => mockClearPending(...(a as [])) }));
const mockRemove = jest.fn();
jest.mock('@/features/tracking/store/activeFaehrten', () => ({ useActiveFaehrten: { getState: () => ({ get: () => ({ sessionId: 'lay-1' }), remove: mockRemove }) } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '70000000-0000-4000-8000-000000000001' }));

const T0 = 1_763_000_000_000;
const pt = (lat: number, lng: number, t: number) => ({ lat, lng, t, accuracy: 3, altitude: null, speed: null, heading: null, breakBefore: false, measuredDistanceM: null });
const reference = { version: 1 as const, startedAtMs: T0, finishedAtMs: T0 + 600_000, distanceM: 175, durationSeconds: 600,
  points: [pt(47.37, 8.54, T0), pt(47.371, 8.5415, T0 + 300_000), pt(47.3712, 8.5418, T0 + 600_000)],
  markers: [{ id: 'm1', type: 'gegenstand' as const, material: null, angleKind: null, lat: 47.371, lng: 8.5415, accuracy: 3, distanceFromStartM: 140, t: T0 + 300_000 }],
  segments: [], manualAngleGeometry: null };
const input = { userId: 'b2222222-2222-4222-8222-222222222222', dogId: 'b0000000-0000-4000-8000-0000000000b1',
  sessionId: '70000000-0000-4000-8000-000000000001', trackId: '50000000-0000-4000-8000-000000000001', blind: true, nowMs: T0 + 900_000 };

function rowsFromPlan(plan: ReturnType<typeof createGroupTrackImportPlan>) {
  const rows = plan.statements.map(st => {
    const table = /insert into (\w+)/.exec(st.sql)![1];
    const keys = /\(([^)]*)\) values/.exec(st.sql)![1].split(',');
    return { table, row: Object.fromEntries(keys.map((k, i) => [k, st.params[i]])) };
  });
  return {
    session: rows.find(r => r.table === 'local_training_sessions')!.row,
    points: rows.filter(r => r.table === 'local_track_points').map(r => r.row),
    markers: rows.filter(r => r.table === 'local_track_markers').map(r => r.row),
    queue: rows.filter(r => r.table === 'sync_queue').map(r => r.row),
  };
}

describe('Import bei der Hundeführerin', () => {
  it('legt eine eigene Fährte des eigenen Hundes an, ohne Übergabe-Quittung', () => {
    const { session, points, markers, queue } = rowsFromPlan(createGroupTrackImportPlan(input, reference));
    expect(session).toMatchObject({ user_id: input.userId, dog_id: input.dogId, type: 'track', status: 'completed', remote_id: null, sync_status: 'pending' });
    const payload = JSON.parse(session.payload_json as string);
    expect(payload.trackTransferReceipt).toBeUndefined();
    expect(payload.groupTrack).toEqual({ version: 1, trackId: input.trackId, blind: true });
    expect(readGroupTrackMarker(session.payload_json as string)).toEqual({ version: 1, trackId: input.trackId, blind: true });
    expect(points.map(p => p.local_id)).toEqual([0, 1, 2].map(i => `group:${input.trackId}:point:${i}`));
    expect(markers).toHaveLength(1);
    expect(queue).toEqual([expect.objectContaining({ entity_type: 'training_session', entity_local_id: input.sessionId, operation: 'create' })]);
  });

  it('die angelegte Fährte ergibt wieder denselben Verlauf (Grundlage der Absuche)', () => {
    const { session, points, markers } = rowsFromPlan(createGroupTrackImportPlan(input, reference));
    const { groupTrack: _marker, ...rest } = JSON.parse(session.payload_json as string); void _marker;
    const projected = projectTrackTransferSource({ ...session, payload_json: JSON.stringify(rest) } as never, points as never, markers as never);
    expect(projected).toEqual(reference);
  });

  it('Mantrailing (Spec 02): Trail wird als eigener Mantrail angelegt, Blind = Doppelblind', () => {
    const igp = rowsFromPlan(createGroupTrackImportPlan(input, reference));
    const { session, points } = rowsFromPlan(createGroupTrackImportPlan({ ...input, kind: 'mantrail' }, reference));
    expect(session).toMatchObject({ type: 'mantrail', category: 'Mantrailing', title: 'Mantrailing', status: 'completed' });
    const payload = JSON.parse(session.payload_json as string);
    expect(payload.mantrail).toMatchObject({ version: 1, trailSource: 'transfer', doubleBlind: true, result: null });
    expect(payload.groupTrack).toEqual({ version: 1, trackId: input.trackId, blind: true });
    expect(points).toEqual(igp.points);   // gleiche Trailer-Spur wie bei der Fährte
    // Ohne kind bleibt der IGP-Import unverändert.
    expect(igp.session).toMatchObject({ type: 'track', category: 'IGP', title: null });
    expect(JSON.parse(igp.session.payload_json as string).mantrail).toBeUndefined();
  });

  it('ungültige Pakete werden nicht angelegt', () => {
    expect(() => createGroupTrackImportPlan(input, { ...reference, points: [reference.points[0]] })).toThrow();
  });
});

describe('Übergabe durch die Leger:in', () => {
  const userId = 'a1111111-1111-4111-8111-111111111111';
  const entry = { trackId: input.trackId, localId: 'lay-1', groupId: 'g', sessionId: 's', createdAtMs: 1 };
  beforeEach(() => {
    mockStore.clear(); mockClearPending.mockClear(); mockRemove.mockClear();
    const { session, points, markers } = rowsFromPlan(createGroupTrackImportPlan({ ...input, userId, sessionId: 'lay-1', dogId: 'a0000000-0000-4000-8000-00000000000a' }, reference));
    const { groupTrack: _m, ...rest } = JSON.parse(session.payload_json as string); void _m;
    mockRows.session = { ...session, payload_json: JSON.stringify(rest) }; mockRows.points = points; mockRows.markers = markers;
  });

  it('gesendet: Warteschlange leer, eigener Hund nicht mehr «offen»', async () => {
    const submit = jest.fn(async () => ({}));
    await expect(submitHandover({ submit } as never, userId, entry)).resolves.toBe('sent');
    expect(submit).toHaveBeenCalledWith(input.trackId, reference);
    expect(await listPendingHandovers(userId)).toEqual([]);
    expect(mockClearPending).toHaveBeenCalledWith('a0000000-0000-4000-8000-00000000000a');
    expect(mockRemove).toHaveBeenCalled();
  });

  it('ohne Netz: bleibt in der Warteschlange, eigene Fährte unverändert', async () => {
    const submit = jest.fn(async () => { throw new GroupApiError('GROUP_CONNECTION'); });
    await expect(submitHandover({ submit } as never, userId, entry)).resolves.toBe('queued');
    expect((await listPendingHandovers(userId)).map(e => e.trackId)).toEqual([input.trackId]);
    expect(mockClearPending).not.toHaveBeenCalled();
  });

  it('inzwischen abgebrochen: aus der Warteschlange, eigene Fährte bleibt', async () => {
    const submit = jest.fn(async () => { throw new GroupApiError('GROUP_REVOKED'); });
    await expect(submitHandover({ submit } as never, userId, entry)).resolves.toBe('dropped');
    expect(await listPendingHandovers(userId)).toEqual([]);
    expect(mockClearPending).not.toHaveBeenCalled();
  });
});

describe('Eigene Fährte im Gruppentraining (Issue #150)', () => {
  const userId = 'a1111111-1111-4111-8111-111111111111', dogId = 'a0000000-0000-4000-8000-00000000000a';
  const entry = { trackId: input.trackId, localId: 'lay-1', groupId: 'g', sessionId: 's', createdAtMs: 1, own: true };
  const ownTrack = { trackId: input.trackId, layerUserId: userId, handlerUserId: userId };
  let before = '';
  beforeEach(() => {
    mockStore.clear(); mockClearPending.mockClear(); mockRemove.mockClear();
    const { session, points, markers } = rowsFromPlan(createGroupTrackImportPlan({ ...input, userId, sessionId: 'lay-1', dogId }, reference));
    const { groupTrack: _m, ...rest } = JSON.parse(session.payload_json as string); void _m;
    mockRows.session = { ...session, payload_json: JSON.stringify(rest) }; mockRows.points = points; mockRows.markers = markers;
    before = JSON.stringify(mockRows);
  });

  it('eingetragen: kein Übergabeschritt, die Fährte bleibt für den eigenen Hund offen und unverändert', async () => {
    const submit = jest.fn(async () => ({}));
    await expect(submitHandover({ submit } as never, userId, entry)).resolves.toBe('sent');
    expect(submit).toHaveBeenCalledWith(input.trackId, reference);
    expect(await listPendingHandovers(userId)).toEqual([]);
    expect(mockClearPending).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(JSON.stringify(mockRows)).toBe(before);
    expect(await listOwnGroupTracks(userId)).toEqual([{ trackId: input.trackId, localId: 'lay-1', sessionId: 's', createdAtMs: 1 }]);
    await expect(findOwnGroupTrack(userId, input.trackId)).resolves.toEqual({ localId: 'lay-1', dogId, blind: false, searched: false });
    await expect(findLocalGroupTrack(userId, ownTrack)).resolves.toMatchObject({ localId: 'lay-1' });
  });

  it('ohne Netz: wartet mit Kennzeichen «eigene», lokale Fährte bleibt', async () => {
    const submit = jest.fn(async () => { throw new GroupApiError('GROUP_CONNECTION'); });
    await expect(submitHandover({ submit } as never, userId, entry)).resolves.toBe('queued');
    expect(await listPendingHandovers(userId)).toEqual([expect.objectContaining({ trackId: input.trackId, own: true })]);
    expect(JSON.stringify(mockRows)).toBe(before);
    expect(mockClearPending).not.toHaveBeenCalled();
  });

  it.each(['GROUP_UNAVAILABLE', 'GROUP_REVOKED'] as const)('Server lehnt ab (%s, z. B. ohne die Migration): lokal gelegte Fährte bleibt erhalten', async code => {
    const submit = jest.fn(async () => { throw new GroupApiError(code); });
    await expect(submitHandover({ submit } as never, userId, entry)).resolves.toBe('dropped');
    expect(await listPendingHandovers(userId)).toEqual([]);
    expect(JSON.stringify(mockRows)).toBe(before);
    expect(mockClearPending).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('abgesucht wird an der eigenen lokalen Fährte erkannt', async () => {
    await submitHandover({ submit: async () => ({}) } as never, userId, entry);
    mockRows.session = { ...mockRows.session, payload_json: JSON.stringify({ run: { finishedAt: 'x' } }) };
    await expect(findOwnGroupTrack(userId, input.trackId)).resolves.toMatchObject({ searched: true });
  });

  it('auf einem anderen Gerät (kein Eintrag): keine lokale Fährte, und nie ein Import als Kopie', async () => {
    await expect(findOwnGroupTrack(userId, input.trackId)).resolves.toBeNull();
    await expect(importGroupTrack(userId, { ...ownTrack, dogId, blind: false } as never, reference)).rejects.toThrow('GROUP_UNAVAILABLE');
  });

  it('«für andere» unverändert: ohne Kennzeichen wird der eigene Hund weiter freigegeben', async () => {
    const { own: _own, ...other } = entry; void _own;
    await expect(submitHandover({ submit: async () => ({}) } as never, userId, other)).resolves.toBe('sent');
    expect(mockClearPending).toHaveBeenCalledWith(dogId);
    expect(await listOwnGroupTracks(userId)).toEqual([]);
  });
});
