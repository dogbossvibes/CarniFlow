/* eslint-disable import/first */
const mockFrom = jest.fn(), mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args), rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock('@/services/calendarService', () => ({}));
jest.mock('@/services/connectionService', () => ({}));
import { HEALTH_SECTION_LIMIT, loadHealthOverview } from '../healthService';
function query(result: unknown) {
  const chain = { select: jest.fn(), eq: jest.fn(), order: jest.fn(), limit: jest.fn(), returns: jest.fn().mockResolvedValue(result) };
  chain.limit.mockReturnValue(Object.assign(Promise.resolve(result), { returns: chain.returns }));
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.order.mockReturnValue(chain);
  return chain;
}
beforeEach(() => {
  mockFrom.mockReset().mockImplementation(() => query({ data: [], error: null }));
  mockRpc.mockReset().mockReturnValue({ returns: jest.fn().mockResolvedValue({ data: [], error: null }) });
});
describe('Health overview data boundaries', () => {
  it('detects one additional row while preserving the 120-row display boundary', async () => {
    const rows = Array.from({ length: HEALTH_SECTION_LIMIT + 1 }, (_, i) => ({ id: String(i) }));
    const vaccines = query({ data: rows, error: null });
    mockFrom.mockImplementation((table: string) => table === 'dog_health_vaccinations' ? vaccines : query({ data: [], error: null }));
    const result = await loadHealthOverview('d');
    expect(vaccines.limit).toHaveBeenCalledWith(121);
    expect(result.vaccinations).toHaveLength(120);
    expect(result.sectionLimits).toEqual({ vaccinations: true });
  });
  it('does not flag an exactly complete 120-row section as truncated', async () => {
    mockFrom.mockImplementation((table: string) => query({ data: table === 'dog_health_vaccinations' ? Array.from({ length: 120 }, (_, i) => ({ id: String(i) })) : [], error: null }));
    expect((await loadHealthOverview('d')).sectionLimits).toEqual({});
  });
  it('distinguishes failed reads from genuinely empty sections', async () => {
    mockFrom.mockImplementation((table: string) => query({ data: null, error: table === 'dog_health_vaccinations' ? { message: 'offline' } : null }));
    const result = await loadHealthOverview('d');
    expect(result.sectionErrors).toEqual({ vaccinations: 'offline' });
    expect(result.sectionLimits).toEqual({});
  });
});

it('preserves complete owner rows and never routes an owner read through the shared RPC', async () => {
  const rows = [{ id: 'owner-entry', dog_id: 'd', entry_date: '2026-10-30', weight_kg: 21.4,
    created_at: null, note: 'owner note', load_level: 'hoch', is_rest_day: true, is_intense: true }];
  const weight = query({ data: rows, error: null });
  mockFrom.mockImplementation((table: string) => table === 'dog_health_entries' ? weight : query({ data: [], error: null }));
  const result = await loadHealthOverview('d');
  expect(result.entries).toEqual(rows);
  expect(weight.select).toHaveBeenLastCalledWith('*');
  expect(weight.eq).toHaveBeenCalledWith('dog_id', 'd');
  expect(weight.limit).toHaveBeenCalledWith(121);
  expect(mockRpc).not.toHaveBeenCalled();
});

describe('shared weight RPC boundary', () => {
  const row = { id: 'weight-1', dog_id: 'd', entry_date: '2026-10-30', weight_kg: 21.4, created_at: '2026-10-30T12:00:00Z' };
  const reply = (data: unknown, error: unknown = null) => mockRpc.mockReturnValue({ returns: jest.fn().mockResolvedValue({ data, error }) });
  const expectNoBaseTableRead = () => expect(mockFrom.mock.calls.map(([table]) => table)).not.toContain('dog_health_entries');

  it('uses the fixed dog-scoped RPC and returns exactly five fields without mutating the response', async () => {
    const extra = Object.freeze({ ...row, note: 'private owner note', load_level: 'hoch', is_rest_day: true, is_intense: true });
    reply(Object.freeze([extra]));
    const result = await loadHealthOverview('d', { weightFieldsOnly: true });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('list_shared_dog_weights', { p_dog_id: 'd' });
    expect(result.entries).toEqual([row]);
    expect(Object.keys(result.entries[0]).sort()).toEqual(['id', 'dog_id', 'entry_date', 'weight_kg', 'created_at'].sort());
    expect(extra.note).toBe('private owner note');
    expect(result.sectionErrors).toEqual({});
    expectNoBaseTableRead();
  });

  it('retains a legacy nullable creation timestamp in the narrow result', async () => {
    reply([{ ...row, created_at: null }]);
    expect((await loadHealthOverview('d', { weightFieldsOnly: true })).entries).toEqual([{ ...row, created_at: null }]);
    expectNoBaseTableRead();
  });

  it('treats a real empty/no-access response as empty, without a fallback', async () => {
    reply([]);
    const result = await loadHealthOverview('d', { weightFieldsOnly: true });
    expect(result.entries).toEqual([]);
    expect(result.sectionErrors).toEqual({});
    expect(result.sectionLimits).toEqual({});
    expectNoBaseTableRead();
  });

  it.each([120, 121])('preserves the 120-row boundary for a %i-row RPC result', async count => {
    const rows = Array.from({ length: count }, (_, i) => ({ ...row, id: `weight-${i}` }));
    reply(rows);
    const result = await loadHealthOverview('d', { weightFieldsOnly: true });
    expect(result.entries).toEqual(rows.slice(0, 120));
    expect(result.sectionLimits).toEqual(count > 120 ? { entries: true } : {});
    expectNoBaseTableRead();
  });

  it.each(['RPC missing', 'permission denied', 'server unavailable'])('keeps %s as a failure and never reads the base table', async message => {
    reply([row], { message });
    const result = await loadHealthOverview('d', { weightFieldsOnly: true });
    expect(result.entries).toEqual([]);
    expect(result.sectionErrors).toEqual({ entries: message });
    expect(result.sectionLimits).toEqual({});
    expectNoBaseTableRead();
  });

  it('does not fall back after a rejected network request', async () => {
    mockRpc.mockReturnValue({ returns: jest.fn().mockRejectedValue(new Error('offline')) });
    await expect(loadHealthOverview('d', { weightFieldsOnly: true })).rejects.toThrow('offline');
    expectNoBaseTableRead();
  });

  const invalidResponses: [string, unknown][] = [
    ['null result', null], ['non-array result', {}], ['null row', [null]],
    ['empty identity', [{ ...row, id: '' }]], ['foreign dog', [{ ...row, dog_id: 'other-dog' }]],
    ['mixed authorized and foreign rows', [row, { ...row, id: 'foreign', dog_id: 'other-dog' }]],
    ['null weight', [{ ...row, weight_kg: null }]], ['string weight', [{ ...row, weight_kg: '21.4' }]],
    ['NaN weight', [{ ...row, weight_kg: NaN }]], ['infinite weight', [{ ...row, weight_kg: Infinity }]],
    ['invalid date', [{ ...row, entry_date: 'not-a-date' }]], ['missing timestamp', [{ ...row, created_at: undefined }]],
  ];
  it.each(invalidResponses)('rejects %s without returning any row', async (_name, data) => {
    reply(data);
    const result = await loadHealthOverview('d', { weightFieldsOnly: true });
    expect(result.entries).toEqual([]);
    expect(result.sectionErrors).toEqual({ entries: 'SHARED_WEIGHT_RESPONSE_INVALID' });
    expectNoBaseTableRead();
  });
});
