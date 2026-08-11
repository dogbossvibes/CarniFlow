// SQLite mocken (getFirstAsync = payload lesen, runAsync = update). Mock-präfixiert.
const mockGetFirst = jest.fn();
const mockRunAsync = jest.fn(async (..._a: any[]) => {});
jest.mock('@/lib/localDb/client', () => ({
  getLocalDb: async () => ({ getFirstAsync: (...a: any[]) => mockGetFirst(...a), runAsync: (...a: any[]) => mockRunAsync(...a) }),
}));
jest.mock('@/lib/localDb/ids', () => ({ newLocalId: () => 'x', nowIso: () => '2026-08-12T00:00:00.000Z' }));

import { finalizeLocalTrackRun } from '@/features/training/repositories/localTrainingRepository';

beforeEach(() => { mockGetFirst.mockReset(); mockRunAsync.mockReset(); });

describe('finalizeLocalTrackRun — Run in payload_json, Lay-Summary bleibt erhalten', () => {
  it('merged run, ohne die bestehende Lay-Summary zu überschreiben', async () => {
    mockGetFirst.mockResolvedValue({ payload_json: JSON.stringify({ distanceMeters: 100, segments: [{ id: 's' }] }) });
    await finalizeLocalTrackRun('sess-1', { run_id: 'run-1', score: 88 });
    const [sql, payloadStr, , localId] = mockRunAsync.mock.calls[0] as [string, string, string, string];
    expect(sql).toMatch(/update local_training_sessions set payload_json=\?, updated_at=\?/i);
    expect(sql).not.toMatch(/sync_status/);   // RUN-SAVE1: kein Sync-Status-Umbau
    const payload = JSON.parse(payloadStr);
    expect(payload.distanceMeters).toBe(100);         // Lay-Summary erhalten
    expect(payload.segments).toEqual([{ id: 's' }]);
    expect(payload.run).toEqual({ run_id: 'run-1', score: 88 });
    expect(localId).toBe('sess-1');
  });

  it('ohne bestehendes payload_json → nur run', async () => {
    mockGetFirst.mockResolvedValue({ payload_json: null });
    await finalizeLocalTrackRun('sess-1', { run_id: 'run-1' });
    const payload = JSON.parse((mockRunAsync.mock.calls[0] as any[])[1]);
    expect(payload).toEqual({ run: { run_id: 'run-1' } });
  });

  it('kaputtes payload_json → run trotzdem gesetzt (kein Crash)', async () => {
    mockGetFirst.mockResolvedValue({ payload_json: '{not json' });
    await finalizeLocalTrackRun('sess-1', { run_id: 'run-1' });
    const payload = JSON.parse((mockRunAsync.mock.calls[0] as any[])[1]);
    expect(payload.run).toEqual({ run_id: 'run-1' });
  });
});
