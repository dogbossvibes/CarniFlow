/* eslint-disable import/first */
const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args) } }));
jest.mock('@/services/calendarService', () => ({}));
jest.mock('@/services/connectionService', () => ({}));
import { HEALTH_SECTION_LIMIT, loadHealthOverview } from '../healthService';
function query(result: unknown) {
  const chain = { select: jest.fn(), eq: jest.fn(), order: jest.fn(), limit: jest.fn(), returns: jest.fn().mockResolvedValue(result) };
  chain.limit.mockReturnValue(Object.assign(Promise.resolve(result), { returns: chain.returns }));
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.order.mockReturnValue(chain);
  return chain;
}
beforeEach(() => { mockFrom.mockReset(); });
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

it('reads only weight fields for shared access while preserving owner reads', async () => {
  const weight = query({ data: [], error: null });
  mockFrom.mockImplementation((table: string) => table === 'dog_health_entries' ? weight : query({ data: [], error: null }));
  await loadHealthOverview('d', { weightFieldsOnly: true });
  expect(weight.select).toHaveBeenLastCalledWith('id,dog_id,entry_date,weight_kg,created_at');
  await loadHealthOverview('d');
  expect(weight.select).toHaveBeenLastCalledWith('*');
});
