// SQLite mocken → SQL/Args inspizieren, ohne echte DB.
// (jest.mock-Factory darf nur `mock`-präfixierte Out-of-scope-Variablen nutzen.)
const mockRunAsync = jest.fn(async (..._args: any[]) => {});
const mockWithTx = jest.fn(async (fn: () => Promise<void>) => { await fn(); });
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({ runAsync: mockRunAsync, withTransactionAsync: mockWithTx }) }));
jest.mock('@/lib/localDb/ids', () => ({ newLocalId: () => 'pt-x', nowIso: () => '2026-07-14T00:00:00.000Z' }));

import { createLocalTrackMarker, createLocalTrackPointsBatch, createLocalSearchPointsBatch, deleteSearchPointsBySession } from '@/features/tracking/repositories/localTrackRepository';

const runAsync = mockRunAsync;
beforeEach(() => { mockRunAsync.mockClear(); mockWithTx.mockClear(); });

describe('localTrackRepository — Absuche (P2)', () => {
  it('11 (DB). createLocalSearchPointsBatch schreibt point_type=\'search\' + session_remote_id', async () => {
    await createLocalSearchPointsBatch('sess1', [{ latitude: 47, longitude: 8, accuracy: 5 }]);
    expect(runAsync).toHaveBeenCalledTimes(1);
    const sql = runAsync.mock.calls[0][0] as string;
    expect(sql).toContain("'search'");
    // session_local_id UND session_remote_id = 'sess1'
    expect(runAsync.mock.calls[0]).toContain('sess1');
  });

  it('10 (DB). deleteSearchPointsBySession löscht NUR point_type=\'search\'', async () => {
    await deleteSearchPointsBySession('sess1');
    expect(runAsync).toHaveBeenCalledTimes(1);
    const sql = runAsync.mock.calls[0][0] as string;
    expect(sql).toMatch(/delete from local_track_points/i);
    expect(sql).toContain("point_type='search'");
    expect(runAsync.mock.calls[0][1]).toBe('sess1');
  });
});


it.each([createLocalTrackPointsBatch, createLocalSearchPointsBatch])('stores the same boundary metadata with a complete SQL binding list', async write => {
  await write('s', [{ latitude: 47, longitude: 8, timestamp: '2026-10-08T10:00:00.000Z', breakBefore: true }]);
  const [sql, ...bindings] = mockRunAsync.mock.calls[0];
  expect((sql as string).match(/\?/g)).toHaveLength(bindings.length);
  expect(bindings.at(-1)).toBe('{"breakBefore":true}');
});

it('persists canonical lay distance and stable marker origin with complete SQL bindings', async () => {
  await createLocalTrackPointsBatch('s', [{ latitude: 47, longitude: 8, breakBefore: true, measuredDistanceM: 12 }]);
  await createLocalTrackMarker('s', { marker_type: 'gegenstand', sourceMarkerId: 'client-marker', recordedAtMs: 123 });
  for (const [sql, ...args] of mockRunAsync.mock.calls) expect((sql.match(/\?/g) ?? []).length).toBe(args.length);
  expect(JSON.parse(mockRunAsync.mock.calls[0].at(-1))).toEqual({ breakBefore: true, measuredDistanceM: 12 });
  expect(mockRunAsync.mock.calls[1]).toContain(new Date(123).toISOString());
  expect(JSON.parse(mockRunAsync.mock.calls[1].at(-1))).toEqual({ sourceMarkerId: 'client-marker', recordedAtMs: 123 });
});
