import { createRawRecordingSessions } from '../rawRecordingSession';
import type { JournalStorage, RawMeasurement } from '../rawMeasurementJournal';
const point: RawMeasurement = { measuredAtMs: 1, receivedAtMs: 2, latitude: 47, longitude: 8,
  accuracy: 4, altitude: null, speed: null, heading: null, source: 'precision', delivery: 'foreground' };
function fixture() {
  const data = new Map<string, string>();
  const storage: JournalStorage = {
    getAllKeys: async () => [...data.keys()], multiGet: async keys => keys.map(k => [k, data.get(k) ?? null]),
    setItem: jest.fn(async (key, value) => { data.set(key, value); }),
    multiRemove: jest.fn(async keys => { keys.forEach(key => data.delete(key)); }),
  };
  return { data, storage, sessions: createRawRecordingSessions(storage, 'owner') };
}
it('shares one lifecycle for foreground and background callers', async () => {
  const { sessions } = fixture(); const a = sessions.open('track'); const b = sessions.open('track');
  expect(a).toBe(b);
  await Promise.all([a.capture(point), b.capture({ ...point, source: 'expo', delivery: 'background' })]);
  expect((await a.read()).records.map(p => p.source)).toEqual(['precision', 'expo']);
  const finish = a.finish(); expect(b.finish()).toBe(finish);
  expect(await b.capture(point)).toBe(false); expect(await finish).toBe(true);
  expect((await a.read()).state).toBe('complete');
});
it('interrupts and resumes without inventing measurements', async () => {
  const { sessions } = fixture(); const s = sessions.open('track');
  await s.capture(point); await s.interrupt(); expect(await s.capture(point)).toBe(false);
  expect(s.resume()).toBe(true); await s.capture({ ...point, measuredAtMs: 30_001 });
  expect((await s.read()).records.map(p => p.measuredAtMs)).toEqual([1, 30_001]);
});
it('reopens an unsealed recording from durable storage', async () => {
  const { sessions, storage } = fixture(); await sessions.open('track').capture(point); await sessions.revoke();
  const recovered = createRawRecordingSessions(storage, 'owner').open('track');
  expect((await recovered.read()).records).toEqual([point]);
  expect(await recovered.capture({ ...point, measuredAtMs: 3 })).toBe(true);
});
it('does not resurrect a deleted recording through delayed callbacks', async () => {
  const { sessions, data } = fixture(); const s = sessions.open('track');
  const write = s.capture(point); const removal = s.remove();
  expect(await s.capture(point)).toBe(false); await Promise.all([write, removal]);
  expect(data.size).toBe(0); expect(s.resume()).toBe(false);
  expect(await sessions.open('track').capture(point)).toBe(false);
  await expect(s.read()).rejects.toThrow('closed');
});
it('does not claim successful completion after storage failure', async () => {
  const { sessions, storage } = fixture(); const s = sessions.open('track');
  (storage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  expect(await s.capture(point)).toBe(false); expect(await s.finish()).toBe(false);
  expect(s.status()).toBe('failed'); expect(s.resume()).toBe(false);
});
it('revokes old account callbacks without deleting another owner', async () => {
  const { sessions, storage } = fixture(); const s = sessions.open('track');
  await s.capture(point); await sessions.revoke();
  expect(await s.capture(point)).toBe(false); expect(await s.finish()).toBe(false);
  await expect(s.read()).rejects.toThrow('closed'); expect(() => sessions.open('new')).toThrow('closed');
  const other = createRawRecordingSessions(storage, 'other').open('track');
  expect((await other.read()).records).toEqual([]);
});
it('allows explicit deletion retry but never reopens stale callbacks', async () => {
  const { sessions, storage } = fixture(); const s = sessions.open('track'); await s.capture(point);
  (storage.multiRemove as jest.Mock).mockRejectedValueOnce(new Error('busy'));
  await expect(s.remove()).rejects.toThrow('busy'); expect(await s.capture(point)).toBe(false);
  await s.remove(); expect(s.status()).toBe('deleted');
});
it.each(['remove', 'revoke'])('does not return stale successful completion after %s', async action => {
  const { sessions } = fixture(); const s = sessions.open('track');
  await s.capture(point); expect(await s.finish()).toBe(true);
  if (action === 'remove') await s.remove(); else await sessions.revoke();
  expect(await s.finish()).toBe(false);
});
it('drains an in-flight seal before revocation finishes', async () => {
  const { sessions, storage } = fixture(); const s = sessions.open('track');
  await s.capture(point);
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  (storage.setItem as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => {
    release = resolve; entered();
  }));
  const finish = s.finish(); await started;
  let revoked = false;
  const revoke = sessions.revoke().then(() => { revoked = true; });
  await new Promise(resolve => setImmediate(resolve));
  expect(revoked).toBe(false);
  release(); await revoke;
  expect(await finish).toBe(false);
});
