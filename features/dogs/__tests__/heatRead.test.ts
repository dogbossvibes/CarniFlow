/* eslint-disable import/first */
const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args) } }));
import { getHeatCycles, getHeatCycleDetails, getHeatCycle, getHeatPhases, getHeatObservations } from '../heatCycles';
function query(result: unknown) {
  const chain = { select: jest.fn(), eq: jest.fn(), in: jest.fn(), order: jest.fn().mockResolvedValue(result) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.in.mockReturnValue(chain);
  return chain;
}
beforeEach(() => { mockFrom.mockReset(); });
describe('strict heat health reads', () => {
  it('rejects Supabase resolved errors instead of returning an empty successful history', async () => {
    const error = { message: 'offline', code: 'FETCH_ERROR' };
    mockFrom.mockReturnValue(query({ data: null, error }));
    await expect(getHeatCycleDetails('d')).rejects.toBe(error);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
  it('still treats an actually empty successful history as empty', async () => {
    mockFrom.mockReturnValue(query({ data: [], error: null }));
    await expect(getHeatCycleDetails('d')).resolves.toEqual({ cycles: [], phases: [], observations: [] });
  });
  it('keeps legacy Home reads compatible while aggregate reads are strict', async () => {
    mockFrom.mockReturnValue(query({ data: null, error: { message: 'offline' } }));
    await expect(getHeatCycles('d')).resolves.toEqual([]);
    await expect(getHeatCycles('d', { throwOnError: true })).rejects.toEqual({ message: 'offline' });
  });
  it.each(['dog_heat_phases', 'dog_heat_observations'])('propagates child errors from %s', async table => {
    const error = { message: 'child offline' };
    mockFrom.mockImplementation((name: string) => query({ data: name === 'dog_heat_cycles' ? [{ id: 'c', dog_id: 'd', start_date: '2026-10-01' }] : null, error: name === table ? error : null }));
    await expect(getHeatCycleDetails('d')).rejects.toBe(error);
  });
});

describe('strict historical detail reads', () => {
  it.each([getHeatPhases, getHeatObservations])('rejects child errors instead of replacing old entries with an empty list', async read => {
    const error = { message: 'offline' }; mockFrom.mockReturnValue(query({ data: null, error }));
    await expect(read('cycle', { throwOnError: true })).rejects.toEqual(error);
    await expect(read('cycle')).resolves.toEqual([]);
  });
  it('distinguishes an unavailable cycle from a failed cycle read', async () => {
    const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn().mockResolvedValue({ data: null, error: { message: 'offline' } }) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); mockFrom.mockReturnValue(chain);
    await expect(getHeatCycle('cycle', { throwOnError: true })).rejects.toEqual({ message: 'offline' });
    chain.single.mockResolvedValue({ data: null, error: null });
    await expect(getHeatCycle('cycle', { throwOnError: true })).resolves.toBeNull();
  });
});
