// Supabase-Builder mocken → Insert-Payload inspizieren (mock-präfixiert wg. jest-Hoisting).
const mockSingle = jest.fn(async () => ({ data: { id: 'uuid-1' }, error: null }));
const mockSelect = jest.fn((_cols?: string) => ({ single: mockSingle }));
const mockInsert = jest.fn((_row?: Record<string, unknown>) => ({ select: mockSelect }));
const mockFrom = jest.fn((_table?: string) => ({ insert: mockInsert }));
// Lazy referenzieren (mockFrom wird erst beim Aufruf gelesen, nicht bei Modul-Import).
jest.mock('@/lib/supabase', () => ({ supabase: { from: (table?: string) => mockFrom(table) } }));

import { createTrackSession, type NewTrackSessionInput } from '@/features/tracking/services/trackService';

const baseInput: NewTrackSessionInput = {
  dogId: 'dog-1', surfaceTypes: ['Wiese'], terrainConditions: [], lyingTimeMinutes: 0,
  notes: null, locationName: null, temperature: null, weatherCondition: null,
  latitude: null, longitude: null,
};

beforeEach(() => { mockFrom.mockClear(); mockInsert.mockClear(); mockSelect.mockClear(); mockSingle.mockClear(); });

describe('createTrackSession — deterministische Client-UUID als training_sessions.id', () => {
  it('setzt id im Insert, wenn übergeben', async () => {
    await createTrackSession('owner-1', { ...baseInput, id: 'uuid-1' });
    const payload = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.id).toBe('uuid-1');
    expect(payload.owner_id).toBe('owner-1');
    expect(payload.dog_id).toBe('dog-1');
  });

  it('ohne id → kein id-Feld (Server gen_random_uuid())', async () => {
    await createTrackSession('owner-1', { ...baseInput });
    const payload = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect('id' in payload).toBe(false);
  });
});
