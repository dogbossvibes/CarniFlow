// SQLite mocken → SQL/Args inspizieren, ohne echte DB.
// (jest.mock-Factory darf nur `mock`-präfixierte Out-of-scope-Variablen nutzen.)
const mockRunAsync = jest.fn(async (..._args: any[]) => {});
const mockWithTx = jest.fn(async (fn: () => Promise<void>) => { await fn(); });
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({ runAsync: mockRunAsync, withTransactionAsync: mockWithTx }) }));
jest.mock('@/lib/localDb/ids', () => ({ newLocalId: () => 'pt-x', nowIso: () => '2026-07-14T00:00:00.000Z' }));

import { createLocalSearchPointsBatch, deleteSearchPointsBySession } from '@/features/tracking/repositories/localTrackRepository';

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
