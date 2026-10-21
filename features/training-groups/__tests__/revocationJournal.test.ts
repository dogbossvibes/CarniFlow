import { RevocationJournal, type JournalStorage } from '../revocationJournal';

const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const one = { shareId: '20000000-0000-4000-8000-000000000001', sessionId: user };
const two = { shareId: '20000000-0000-4000-8000-000000000002', sessionId: user };
function storage() {
  const data = new Map<string, string>();
  return { data, getItem: jest.fn(async (k: string) => data.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { data.set(k, v); }) };
}
it('serializes updates across instances without losing unrelated pending revocations', async () => {
  const s = storage();
  const a = new RevocationJournal(s), b = new RevocationJournal(s);
  await Promise.all([a.put(user, one), b.put(user, two)]);
  expect(await a.list(user)).toEqual([one, two]);
  await Promise.all([a.acknowledge(user, one.shareId), b.put(other, one)]);
  expect(await a.list(user)).toEqual([two]);
  expect(await b.list(other)).toEqual([one]);
});
it('retains IDs on restart and never stores GPS or arbitrary payload fields', async () => {
  const s = storage();
  await new RevocationJournal(s).put(user, one);
  expect(await new RevocationJournal(s).list(user)).toEqual([one]);
  await expect(new RevocationJournal(s).put(user, { ...two, latitude: 47 } as typeof two)).rejects.toThrow('INVALID');
  expect([...s.data.values()].join()).not.toContain('latitude');
});
it('does not overwrite corrupt or unknown journal versions', async () => {
  const s = storage();
  s.getItem.mockResolvedValue('{"version":2,"entries":[]}');
  await expect(new RevocationJournal(s).put(user, one)).rejects.toThrow('JOURNAL_INVALID');
  expect(s.setItem).not.toHaveBeenCalled();
});
it('does not poison the serialization queue after a failed durable write', async () => {
  const s = storage();
  s.setItem.mockRejectedValueOnce(new Error('disk'));
  const j = new RevocationJournal(s);
  await expect(j.put(user, one)).rejects.toThrow('disk');
  await j.put(user, two);
  expect(await j.list(user)).toEqual([two]);
});
it('is idempotent only for the same share/session and fails on mismatched IDs', async () => {
  const s = storage(), j = new RevocationJournal(s as JournalStorage);
  await j.put(user, one); await j.put(user, one);
  expect(s.setItem).toHaveBeenCalledTimes(1);
  await expect(j.put(user, { ...one, sessionId: other })).rejects.toThrow('CONFLICT');
  expect(await j.list(user)).toEqual([one]);
});
