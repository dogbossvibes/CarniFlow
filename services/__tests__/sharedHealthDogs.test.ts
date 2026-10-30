import { loadReceivedHealthDogs } from '../sharedHealthDogs';
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
beforeEach(() => { mockRpc.mockReset(); });
it('uses the scoped minimal metadata RPC, no whole-dog table read', async () => {
  mockRpc.mockResolvedValue({ data: [], error: null });
  await expect(loadReceivedHealthDogs('dog')).resolves.toEqual([]);
  expect(mockRpc).toHaveBeenCalledWith('list_received_health_dogs', { p_dog_id: 'dog' });
});
it('distinguishes a missing backend or network error from an empty inbox', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
  await expect(loadReceivedHealthDogs()).rejects.toThrow('shared_health_unavailable');
});
it.each([null, {}, [null], [{ grant_id: 'g', permissions: 'can_view_weight' }]])('fails closed for malformed response %p', async data => {
  mockRpc.mockResolvedValue({ data, error: null });
  await expect(loadReceivedHealthDogs()).rejects.toThrow('shared_health_invalid_response');
});
