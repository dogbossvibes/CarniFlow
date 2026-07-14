// Repository mocken → kein echtes SQLite/expo-sqlite im Test.
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  createLocalSearchPointsBatch: jest.fn(async () => {}),
}));

import { createLocalSearchPointsBatch } from '@/features/tracking/repositories/localTrackRepository';
import {
  resetSearchBuffer, enqueueSearchPoint, flushSearchPoints, getSearchPersistError, _peekSearchBuffer,
} from '@/features/tracking/store/searchPersist';

const mockBatch = createLocalSearchPointsBatch as jest.Mock;

const pt = (lat: number, lng: number) => ({
  latitude: lat, longitude: lng, accuracy: 8, altitude: null, speed: null, heading: null,
  timestamp: new Date().toISOString(),
});

describe('searchPersist — inkrementelle Absuche-Persistenz (P1)', () => {
  beforeEach(() => { mockBatch.mockClear(); mockBatch.mockResolvedValue(undefined); resetSearchBuffer('sess1'); });

  it('11. Suchpunkt wird mit point_type=\'search\' lokal gespeichert', async () => {
    enqueueSearchPoint(pt(47.0, 8.0));
    await flushSearchPoints();
    expect(mockBatch).toHaveBeenCalledTimes(1);
    const [sessionId, batch] = mockBatch.mock.calls[0];
    expect(sessionId).toBe('sess1');
    expect(batch[0].point_type).toBe('search');
    expect(batch[0]).toMatchObject({ latitude: 47.0, longitude: 8.0 });
  });

  it('14. Stop-Flush schreibt den letzten Puffer und leert ihn', async () => {
    enqueueSearchPoint(pt(47.0, 8.0));
    enqueueSearchPoint(pt(47.0, 8.001));
    expect(_peekSearchBuffer().count).toBe(2);        // noch nicht geflusht (< BATCH_SIZE)
    await flushSearchPoints();                         // entspricht stop() → flushSearchPoints()
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockBatch.mock.calls[0][1]).toHaveLength(2);
    expect(_peekSearchBuffer().count).toBe(0);         // Puffer geleert
  });

  it('16. Persistenzfehler stoppt die Aufnahme nicht (Re-Queue, kein Throw)', async () => {
    mockBatch.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    enqueueSearchPoint(pt(47.0, 8.0));

    let threw = false;
    let ok = true;
    try { ok = await flushSearchPoints(); } catch { threw = true; }

    expect(threw).toBe(false);                         // wirft NIE
    expect(ok).toBe(false);                            // meldet Fehler
    expect(getSearchPersistError()).toContain('SQLITE_BUSY');
    expect(_peekSearchBuffer().count).toBe(1);         // Punkt bleibt gepuffert (Re-Queue)

    // Nächster Flush (Mock ist wieder ok) schreibt den zurückgestellten Punkt.
    const ok2 = await flushSearchPoints();
    expect(ok2).toBe(true);
    expect(_peekSearchBuffer().count).toBe(0);
    expect(getSearchPersistError()).toBeNull();
  });
});
