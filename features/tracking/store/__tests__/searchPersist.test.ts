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


describe('searchPersist — continuity write barriers', () => {
  let next = 0;
  beforeEach(() => { mockBatch.mockReset(); mockBatch.mockResolvedValue(undefined); resetSearchBuffer(`barrier-${++next}`); });
  it('waits for an in-flight batch and drains points added during it', async () => {
    let release!: () => void;
    mockBatch.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    enqueueSearchPoint(pt(47, 8));
    const first = flushSearchPoints();
    await Promise.resolve();
    enqueueSearchPoint(pt(47, 8.001));
    let settled = false;
    const finish = flushSearchPoints().then(ok => { settled = true; return ok; });
    await Promise.resolve();
    const settledBeforeRelease = settled;
    release();
    expect(await first).toBe(true);
    expect(settledBeforeRelease).toBe(false);
    expect(await finish).toBe(true);
    expect(mockBatch.mock.calls.flatMap(call => call[1])).toHaveLength(2);
    expect(_peekSearchBuffer().count).toBe(0);
  });
  it('reports an in-flight failure to every waiter', async () => {
    let reject!: (error: Error) => void;
    mockBatch.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    enqueueSearchPoint(pt(47, 8));
    const first = flushSearchPoints();
    await Promise.resolve();
    const finish = flushSearchPoints();
    reject(new Error('DISK_FULL'));
    expect(await first).toBe(false);
    expect(await finish).toBe(false);
    expect(_peekSearchBuffer().count).toBe(1);
    expect(await flushSearchPoints()).toBe(true);
  });
  it('never requeues a failed old-session batch into another dog/session', async () => {
    let reject!: (error: Error) => void;
    mockBatch.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    const oldSession = _peekSearchBuffer().sessionId!;
    enqueueSearchPoint(pt(47, 8));
    const old = flushSearchPoints();
    await Promise.resolve();
    resetSearchBuffer('next-dog-session');
    enqueueSearchPoint(pt(48, 9));
    reject(new Error('SQLITE_BUSY'));
    expect(await old).toBe(false);
    expect(_peekSearchBuffer()).toEqual({ sessionId: 'next-dog-session', count: 1 });
    expect(getSearchPersistError()).toBeNull();
    expect(await flushSearchPoints()).toBe(true);
    expect(mockBatch.mock.calls[1][0]).toBe('next-dog-session');
    expect(mockBatch.mock.calls[1][1][0].latitude).toBe(48);
    // The old pending batch can still be retried under its original identity.
    resetSearchBuffer(oldSession);
    expect(await flushSearchPoints()).toBe(true);
    expect(mockBatch.mock.calls[2][0]).toBe(oldSession);
    expect(mockBatch.mock.calls[2][1][0].latitude).toBe(47);
  });
});
