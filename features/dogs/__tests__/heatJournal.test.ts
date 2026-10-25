/* eslint-disable import/first */
const mockFrom = jest.fn();
const mockUser = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args), auth: { getUser: () => mockUser() } } }));
import { dailyHeatRows, recordedActiveCycle, saveDailyHeatRows, finishRecordedHeat } from '../heatJournal';
import type { HeatCycle } from '../heatCycles';

const cycle = { id: 'cycle', dog_id: 'dog', owner_id: 'owner', start_date: '2026-01-01', end_date: null, status: 'active' };
const row = { id: 'uuid', date: '2026-01-02', type: 'Blutung', value: 'Keine', notes: null };
let dog: { id: string; gender: string | null; owner_id: string };
let existing: object[];
let insertError: object | null;
let updateRows: object[];
let queries: ReturnType<typeof query>[];
function query(table: string) {
  const chain: any = { table, mode: 'read' };
  for (const key of ['eq', 'is', 'in', 'select']) chain[key] = jest.fn(() => chain);
  chain.insert = jest.fn(() => { chain.mode = 'insert'; return chain; });
  chain.update = jest.fn(() => { chain.mode = 'update'; return chain; });
  chain.single = jest.fn(async () => ({ data: table === 'dogs' ? dog : cycle, error: null }));
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: chain.mode === 'update' ? updateRows : existing, error: chain.mode === 'insert' ? insertError : null }).then(resolve);
  return chain;
}
beforeEach(() => {
  dog = { id: 'dog', gender: 'female', owner_id: 'owner' }; existing = []; insertError = null; updateRows = [{ id: 'cycle' }]; queries = [];
  mockUser.mockReset().mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  mockFrom.mockReset().mockImplementation(table => { const q = query(table); queries.push(q); return q; });
});
it('builds only explicitly selected observations with separate stable IDs, without changing the draft', () => {
  const draft = Object.freeze({ date: row.date, bleeding: 'Keine', behavior: 'Unruhig', standing: true, notes: ' old note ' });
  let counter = 0;
  const rows = dailyHeatRows(draft, () => String(++counter));
  expect(rows.map(r => r.type)).toEqual(['Blutung', 'Verhalten', 'Standreflex', 'Notiz']);
  expect(rows.map(r => r.id)).toEqual(['1', '2', '3', '4']);
  expect(rows[0].value).toBe('Keine'); expect(rows[3].notes).toBe('old note'); expect(draft.notes).toBe(' old note ');
});
it('does not infer normal or absent bleeding for untouched fields', () => {
  expect(dailyHeatRows({ date: row.date, bleeding: null, behavior: null, standing: false, notes: '' }, () => '')).toEqual([]);
});
it('inserts the daily observations atomically without updates/deletes', async () => {
  await saveDailyHeatRows('dog', 'cycle', 'owner', [row, { ...row, id: 'uuid2', type: 'Verhalten', value: 'Unruhig' }]);
  const writes = queries.filter(q => q.insert.mock.calls.length);
  expect(writes).toHaveLength(1);
  expect(writes[0].insert.mock.calls[0][0]).toHaveLength(2);
  expect(writes[0].insert.mock.calls[0][0][0]).toMatchObject({ ...row, dog_id: 'dog', heat_cycle_id: 'cycle', owner_id: 'owner' });
  expect(queries.every(q => q.update.mock.calls.length === 0)).toBe(true);
});
it.each(['male', null, 'unknown', 'Female'])('refuses non-canonical female profile %s', async gender => {
  dog.gender = gender;
  await expect(saveDailyHeatRows('dog', 'cycle', 'owner', [row])).rejects.toThrow();
  expect(queries.some(q => q.insert.mock.calls.length)).toBe(false);
});
it('refuses a changed session before any table read', async () => {
  mockUser.mockResolvedValue({ data: { user: { id: 'other' } }, error: null });
  await expect(saveDailyHeatRows('dog', 'cycle', 'owner', [row])).rejects.toThrow(); expect(mockFrom).not.toHaveBeenCalled();
});
it('refuses a read-only trainer', async () => {
  dog.owner_id = 'other';
  await expect(saveDailyHeatRows('dog', 'cycle', 'owner', [row])).rejects.toThrow();
});
it('refuses a mismatched cycle-dog pair', async () => {
  await expect(saveDailyHeatRows('different-dog', 'cycle', 'owner', [row])).rejects.toThrow();
});
it('propagates resolved insert errors', async () => {
  insertError = { message: 'offline' };
  await expect(saveDailyHeatRows('dog', 'cycle', 'owner', [row])).rejects.toEqual(insertError);
});
it('confirms an identical retry after a lost response without writing again', async () => {
  existing = [{ ...row, dog_id: 'dog', heat_cycle_id: 'cycle', owner_id: 'owner' }];
  await saveDailyHeatRows('dog', 'cycle', 'owner', [row]);
  expect(queries.some(q => q.insert.mock.calls.length)).toBe(false);
});
it('never overwrites conflicting old data', async () => {
  existing = [{ ...row, value: 'Stark', dog_id: 'dog', heat_cycle_id: 'cycle', owner_id: 'owner' }];
  await expect(saveDailyHeatRows('dog', 'cycle', 'owner', [row])).rejects.toThrow('conflict');
  expect(queries.some(q => q.insert.mock.calls.length || q.update.mock.calls.length)).toBe(false);
});
it.each(['2025-12-31', '2099-01-01', '2026-02-31', '2026-01-02suffix'])('rejects date outside the cycle or invalid date %s', async date => {
  await expect(saveDailyHeatRows('dog', 'cycle', 'owner', [{ ...row, date }])).rejects.toThrow();
});
it('ending the heat cycle changes only end/status/timestamp, preserving notes and child rows', async () => {
  await finishRecordedHeat('dog', 'cycle', 'owner', '2026-01-02');
  const update = queries.find(q => q.update.mock.calls.length)!;
  expect(Object.keys(update.update.mock.calls[0][0]).sort()).toEqual(['end_date', 'status', 'updated_at']);
  expect(update.eq).toHaveBeenCalledWith('dog_id', 'dog'); expect(update.is).toHaveBeenCalledWith('end_date', null);
});
it('does not claim success when ending changed no record', async () => {
  updateRows = [];
  await expect(finishRecordedHeat('dog', 'cycle', 'owner', '2026-01-02')).rejects.toThrow();
});
it('recorded active selection does not turn completed or future entries into an active cycle', () => {
  const base = { id: 'old', dogId: 'dog', startDate: '2026-01-01', endDate: null, status: 'completed', notes: 'old', phase: null, createdAt: '' } as HeatCycle;
  const records = [base, { ...base, id: 'future', startDate: '2027-01-01', status: 'active' as const }, { ...base, id: 'active', status: 'active' as const }];
  expect(recordedActiveCycle(records, '2026-01-02')?.id).toBe('active');
  expect(records[0].notes).toBe('old'); expect(records[0].status).toBe('completed');
});

it('confirms an identical concurrent retry winner after a unique-key insert error', async () => {
  const original = mockFrom.getMockImplementation()!;
  mockFrom.mockImplementation(table => {
    const q = original(table);
    if (table === 'dog_heat_observations') q.insert.mockImplementation(() => {
      q.mode = 'insert'; insertError = { code: '23505' };
      existing = [{ ...row, dog_id: 'dog', heat_cycle_id: 'cycle', owner_id: 'owner' }];
      return q;
    });
    return q;
  });
  await expect(saveDailyHeatRows('dog', 'cycle', 'owner', [row])).resolves.toBeUndefined();
  expect(queries.filter(q => q.insert.mock.calls.length)).toHaveLength(1);
});
