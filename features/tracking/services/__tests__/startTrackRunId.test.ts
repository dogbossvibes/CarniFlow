// Supabase-Builder mocken (lazy referenziert wg. jest-Hoisting/TDZ).
const mockSingle = jest.fn(async () => ({ data: { id: 'run-1' }, error: null }));
const mockSelect = jest.fn((_cols?: string) => ({ single: mockSingle }));
const mockInsert = jest.fn((_row?: Record<string, unknown>) => ({ select: mockSelect }));
const mockFrom = jest.fn((_table?: string) => ({ insert: mockInsert }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: (t?: string) => mockFrom(t) } }));

import { startTrackRun } from '@/features/tracking/services/trackService';

beforeEach(() => { mockFrom.mockClear(); mockInsert.mockClear(); });

describe('startTrackRun — deterministische Client-Run-UUID als track_runs.id', () => {
  it('setzt id, wenn übergeben', async () => {
    await startTrackRun('sess-1', 'run-1');
    const payload = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.id).toBe('run-1');
    expect(payload.session_id).toBe('sess-1');
  });

  it('ohne id → kein id-Feld (Server gen_random_uuid())', async () => {
    await startTrackRun('sess-1');
    const payload = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect('id' in payload).toBe(false);
    expect(payload.session_id).toBe('sess-1');
  });
});
