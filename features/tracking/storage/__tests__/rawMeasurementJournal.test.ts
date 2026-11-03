import { createRawMeasurementJournal, MAX_RAW_MEASUREMENTS, type JournalStorage, type RawMeasurement } from '../rawMeasurementJournal';
const point = (n = 0): RawMeasurement => ({ measuredAtMs: 1000 + n, receivedAtMs: 2000 + n,
  latitude: 47, longitude: 8, accuracy: 5, altitude: null, speed: null, heading: null,
  source: 'precision', delivery: 'foreground' });
function fixture() {
  const data = new Map<string, string>();
  const storage: JournalStorage = {
    getAllKeys: async () => [...data.keys()], multiGet: async keys => keys.map(k => [k, data.get(k) ?? null]),
    setItem: jest.fn(async (k, v) => { data.set(k, v); }), multiRemove: async keys => { keys.forEach(k => data.delete(k)); },
  };
  return { data, storage, journal: createRawMeasurementJournal(storage, 'owner', 'session') };
}
describe('raw journal (not production activated)', () => {
  it('recovers unsealed measurements after restart and refuses append after finish', async () => {
    const { storage, journal } = fixture(); await journal.append(point());
    const restarted = createRawMeasurementJournal(storage, 'owner', 'session');
    expect(await restarted.read()).toEqual({ state: 'open', records: [point()], issues: [] });
    await restarted.append(point(1)); await restarted.finish();
    expect((await restarted.read()).state).toBe('complete');
    await expect(restarted.append(point(2))).rejects.toThrow('not writable');
  });
  it('serializes simultaneous deliveries across chunk boundaries', async () => {
    const { journal, data } = fixture();
    const points = Array.from({ length: 130 }, (_, i) => ({ ...point(i), delivery: i % 2 ? 'background' as const : 'foreground' as const }));
    await Promise.all(points.map(p => journal.append(p))); await journal.finish();
    expect((await journal.read()).records).toEqual(points); expect(data.size).toBe(4);
  });
  it('retains duplicates, clock reversal, outliers and negative reported uncertainty', async () => {
    const { journal } = fixture(); const points = [point(10), point(10), { ...point(-5), latitude: 0, accuracy: -1 }];
    for (const p of points) await journal.append(p);
    expect((await journal.read()).records).toEqual(points);
  });
  it('snapshots before async work without undocumented properties', async () => {
    const { journal } = fixture(); const p = { ...point(), secret: 'omit' }; const write = journal.append(p);
    p.latitude = 50; await write; expect((await journal.read()).records).toEqual([point()]);
  });
  it('isolates owner and session on reads/deletion', async () => {
    const { journal, storage } = fixture();
    const other = createRawMeasurementJournal(storage, 'other', 'session');
    const sibling = createRawMeasurementJournal(storage, 'owner', 'session2');
    await journal.append(point()); await other.append(point(1)); await sibling.append(point(2)); await journal.remove();
    expect((await journal.read()).state).toBe('absent');
    expect((await other.read()).records).toEqual([point(1)]); expect((await sibling.read()).records).toEqual([point(2)]);
  });
  it('stops on storage failure instead of silently skipping', async () => {
    const { journal, storage } = fixture(); await journal.append(point());
    (storage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(journal.append(point(1))).rejects.toThrow('disk full');
    await expect(journal.append(point(2))).rejects.toThrow('stopped');
    expect((await journal.read()).records).toEqual([point()]);
  });
  it('recovers a committed write with lost acknowledgement', async () => {
    const { journal, storage, data } = fixture();
    (storage.setItem as jest.Mock).mockImplementationOnce(async (k, v) => { data.set(k, v); throw new Error('lost ack'); });
    await expect(journal.append(point())).rejects.toThrow('lost ack');
    expect((await createRawMeasurementJournal(storage, 'owner', 'session').read()).records).toEqual([point()]);
  });
  it.each(['truncated', 'missing', 'seal mismatch'])('reports %s without rewriting evidence', async mode => {
    const { journal, storage, data } = fixture();
    for (let i = 0; i < 65; i++) await journal.append(point(i)); await journal.finish();
    const key = [...data.keys()].find(k => k.endsWith('chunk.000000'))!;
    if (mode === 'truncated') data.set(key, '{');
    if (mode === 'missing') data.delete(key);
    if (mode === 'seal mismatch') data.set([...data.keys()].find(k => k.endsWith('seal'))!, '{"version":1,"count":999}');
    const before = [...data]; const restarted = createRawMeasurementJournal(storage, 'owner', 'session');
    expect((await restarted.read()).state).toBe('corrupt');
    await expect(restarted.append(point())).rejects.toThrow('not writable'); expect([...data]).toEqual(before);
  });
  it('does not claim completion on failed seal write', async () => {
    const { journal, storage } = fixture(); await journal.append(point());
    (storage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(journal.finish()).rejects.toThrow('disk full'); expect((await journal.read()).state).toBe('open');
  });
  it('stops visibly at capacity without evicting previous records', async () => {
    const { storage, data } = fixture();
    for (let i = 0; i < MAX_RAW_MEASUREMENTS / 64; i++) {
      data.set(`anyvo.rawMeasurements.v1.owner.session.chunk.${String(i).padStart(6, '0')}`,
        JSON.stringify({ version: 1, index: i, records: Array.from({ length: 64 }, () => point()) }));
    }
    const restarted = createRawMeasurementJournal(storage, 'owner', 'session');
    await expect(restarted.append(point())).rejects.toThrow('capacity');
    await expect(restarted.finish()).rejects.toThrow('stopped');
    expect((await restarted.read()).records).toHaveLength(MAX_RAW_MEASUREMENTS);
    expect(data.size).toBe(MAX_RAW_MEASUREMENTS / 64);
  });
  it('bounds queued writes if persistence cannot keep up', async () => {
    const { journal } = fixture();
    const writes = Array.from({ length: 257 }, (_, i) => journal.append(point(i)));
    const results = await Promise.allSettled(writes);
    expect(results.some(r => r.status === 'rejected')).toBe(true);
    await expect(journal.finish()).rejects.toThrow('stopped');
  });
  it('can seal an empty session', async () => {
    const { journal } = fixture(); await journal.finish();
    expect(await journal.read()).toEqual({ state: 'complete', records: [], issues: [] });
  });
  it('rejects invalid identities and non-finite raw values', async () => {
    const { journal, storage } = fixture();
    expect(() => createRawMeasurementJournal(storage, 'owner.session', 'x')).toThrow('identity');
    await expect(journal.append({ ...point(), latitude: NaN })).rejects.toThrow('measurement');
    expect((await journal.read()).state).toBe('absent');
  });
});

describe('multiple handles to the same raw journal', () => {
  it('preserves concurrent foreground/background writes from separate handles', async () => {
    const { storage, journal } = fixture();
    const second = createRawMeasurementJournal(storage, 'owner', 'session');
    await Promise.all([journal.append(point()), second.append({ ...point(1), delivery: 'background' })]);
    expect((await journal.read()).records).toEqual([point(), { ...point(1), delivery: 'background' }]);
    await journal.finish();
    await expect(second.append(point(2))).rejects.toThrow('not writable');
  });
  it('does not reuse stale cached records after another handle deletes the journal', async () => {
    const { storage, journal } = fixture();
    await journal.append(point());
    const second = createRawMeasurementJournal(storage, 'owner', 'session');
    await second.remove();
    await journal.append(point(2));
    expect((await second.read()).records).toEqual([point(2)]);
  });
});

it('shares a storage failure across handles and cannot falsely seal a partial journal', async () => {
  const { journal, storage } = fixture();
  const second = createRawMeasurementJournal(storage, 'owner', 'session');
  await journal.append(point());
  (storage.setItem as jest.Mock).mockRejectedValueOnce(new Error('full'));
  await expect(second.append(point(1))).rejects.toThrow('full');
  await expect(journal.finish()).rejects.toThrow('stopped');
  expect((await second.read()).state).toBe('open');
});

it('retains readable measurements beyond a missing chunk for diagnostics only', async () => {
  const { journal, data } = fixture();
  for (let i = 0; i < 65; i++) await journal.append(point(i));
  data.delete('anyvo.rawMeasurements.v1.owner.session.chunk.000000');
  const snapshot = await journal.read();
  expect(snapshot.state).toBe('corrupt');
  expect(snapshot.issues).toContain('missing_chunk');
  expect(snapshot.records).toEqual([point(64)]);
});
