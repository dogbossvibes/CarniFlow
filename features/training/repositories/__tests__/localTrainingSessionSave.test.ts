// SQLite mocken → SQL/Args inspizieren, ohne echte DB (Muster wie searchPointsRepo.test).
const mockRunAsync = jest.fn(async (..._args: any[]) => {});
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({ runAsync: mockRunAsync }) }));
jest.mock('@/lib/localDb/ids', () => ({ newLocalId: () => 'gen-id', nowIso: () => '2026-08-11T00:00:00.000Z' }));

import { createLocalTrainingSession, finalizeLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';

beforeEach(() => mockRunAsync.mockClear());

describe('localTrainingRepository — P-SAVE1 local-first', () => {
  it('createLocalTrainingSession nutzt explizite local_id + idempotentes insert or ignore', async () => {
    const row = await createLocalTrainingSession({ local_id: 'uuid-1', user_id: 'owner-1', dog_id: 'dog-1' });
    expect(row.local_id).toBe('uuid-1');
    const [sql, ...args] = mockRunAsync.mock.calls[0] as [string, ...any[]];
    expect(sql).toMatch(/insert or ignore into local_training_sessions/i);
    expect(args[0]).toBe('uuid-1');       // local_id gebunden (führende ID)
    expect(args).toContain('owner-1');    // user_id (= owner_id remote)
    expect(args).toContain('dog-1');      // dog_id (NOT NULL remote)
  });

  it('ohne local_id → generierte ID (rückwärtskompatibel)', async () => {
    const row = await createLocalTrainingSession({ user_id: 'owner-1' });
    expect(row.local_id).toBe('gen-id');
  });

  it('finalizeLocalTrainingSession schreibt status/ended_at/duration + payload_json; sync_status unberührt (bleibt pending)', async () => {
    await finalizeLocalTrainingSession('uuid-1', {
      endedAt: '2026-08-11T11:00:00.000Z', durationSeconds: 600,
      distanceMeters: 250, articlesTotal: 2, cornersTotal: 3, gpsQualityAverage: 4.5, segments: [{ x: 1 }],
    });
    const [sql, ...args] = mockRunAsync.mock.calls[0] as [string, ...any[]];
    expect(sql).toMatch(/update local_training_sessions set status=\?, ended_at=\?, duration_seconds=\?, payload_json=\?/i);
    expect(sql).not.toMatch(/sync_status/);   // Finalisierung ändert Sync-Status NICHT
    expect(args[0]).toBe('completed');
    expect(args[1]).toBe('2026-08-11T11:00:00.000Z');
    expect(args[2]).toBe(600);
    const payload = JSON.parse(args[3] as string);
    expect(payload.distanceMeters).toBe(250);
    expect(payload.articlesTotal).toBe(2);
    expect(payload.cornersTotal).toBe(3);
    expect(payload.segments).toEqual([{ x: 1 }]);
    expect(args[args.length - 1]).toBe('uuid-1');   // where local_id=?
  });
});
