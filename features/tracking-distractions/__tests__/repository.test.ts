import { createDistractionRepository } from '../repository';
import { fixture } from './fixture';
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: jest.fn() }));
function setup() {
 const track = fixture(); let owner = 'owner', epoch = 0, parentOwner = 'owner', revision = 0;
 const writes: string[] = [];
 const tx = { getFirstAsync: jest.fn(async (sql: string) => sql.includes('count(*)') ? { count: 0 } : { local_id: track.parentSessionId, user_id: parentOwner, type: 'track', deleted_at: null }),
  getAllAsync: jest.fn(async () => []), runAsync: jest.fn(async (sql: string, ...params: (string | number)[]) => {
   writes.push(sql); if (sql.startsWith('insert')) { if (revision) throw new Error('UNIQUE'); revision = 1; return { changes: 1 }; }
   if (params.at(-1) !== revision) return { changes: 0 }; revision++; return { changes: 1 };
  }) };
 const repository = createDistractionRepository('owner', { scope: () => ({ userId: owner, epoch }), transaction: async fn => fn(tx as never) });
 return { track, repository, writes, tx, wrongParent: () => { parentOwner = 'someone'; }, switchAccount: () => { owner = 'other'; epoch++; }, aba: () => { epoch += 2; } };
}
it('only writes an independent child, with compare-and-swap revisions', async () => {
 const h = setup(); expect((await h.repository.save(h.track, 0)).revision).toBe(1);
 expect((await h.repository.save(h.track, 1)).revision).toBe(2);
 await expect(h.repository.save(h.track, 1)).rejects.toThrow('STORAGE');
 expect(h.writes.every(s => /^(insert into|update) local_track_distractions/.test(s))).toBe(true);
});
it('cannot overwrite an existing child by repeating create', async () => {
 const h = setup(); await h.repository.save(h.track, 0); await expect(h.repository.save(h.track, 0)).rejects.toThrow('UNIQUE');
});
it('rejects a foreign main track even when a faulty adapter returns it', async () => {
 const h = setup(); h.wrongParent(); await expect(h.repository.save(h.track, 0)).rejects.toThrow('PARENT_UNAVAILABLE'); expect(h.writes).toHaveLength(0);
});
it('isolates reads and writes after account changes, including A-B-A', async () => {
 const h = setup(); h.aba(); await expect(h.repository.list(h.track.parentSessionId)).rejects.toThrow('ACCOUNT_CHANGED');
 const h2 = setup(); h2.switchAccount(); await expect(h2.repository.save(h2.track, 0)).rejects.toThrow('ACCOUNT_CHANGED'); expect(h2.writes).toHaveLength(0);
});
it('rechecks ownership epoch inside the transaction before writing', async () => {
 const h = setup(); h.tx.getFirstAsync.mockImplementation(async () => { h.aba(); return { local_id: h.track.parentSessionId, user_id: 'owner', type: 'track', deleted_at: null }; });
 await expect(h.repository.save(h.track, 0)).rejects.toThrow('ACCOUNT_CHANGED'); expect(h.writes).toHaveLength(0);
});
