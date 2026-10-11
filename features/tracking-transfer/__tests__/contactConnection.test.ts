import { connectAnyvoPerson, searchAnyvoPeople } from '@/services/connectionService';
const mockMaybe = jest.fn(), mockInsert = jest.fn(), mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args), from: () => ({
  select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockMaybe }) }) }) }),
  insert: (...args: unknown[]) => { mockInsert(...args); return { select: () => ({ single: async () => ({ data: { status: 'accepted' }, error: null }) }) }; },
}) } }));
beforeEach(() => { jest.clearAllMocks(); mockMaybe.mockResolvedValue({ data: null, error: null }); });
it('uses the existing generic connection kind, with no trainer role or data-sharing grant', async () => {
  await connectAnyvoPerson('owner', 'person', jest.fn());
  expect(mockInsert).toHaveBeenCalledWith({ owner_user_id: 'owner', connected_user_id: 'person', status: 'accepted', created_by: 'owner', connection_type: 'health_contact' });
});
it('prevents a stale connection insert after A→B→A during the existing-connection lookup', async () => {
  let resolve!: (value: unknown) => void, epoch = 0;
  mockMaybe.mockReturnValue(new Promise(r => { resolve = r; }));
  const result = connectAnyvoPerson('owner', 'person', () => { if (epoch) throw new Error('ACCOUNT_CHANGED'); });
  epoch = 2; resolve({ data: null, error: null });
  await expect(result).rejects.toThrow('ACCOUNT_CHANGED'); expect(mockInsert).not.toHaveBeenCalled();
});
it('does not upgrade an existing blocked connection to accepted', async () => {
  mockMaybe.mockResolvedValue({ data: { status: 'blocked' }, error: null });
  expect((await connectAnyvoPerson('owner', 'person')).data?.status).toBe('blocked'); expect(mockInsert).not.toHaveBeenCalled();
});
it('distinguishes a lookup outage from zero matches for the transfer UI, keeping legacy callers compatible', async () => {
  mockRpc.mockResolvedValue({ error: { message: 'private server detail' }, data: null });
  await expect(searchAnyvoPeople('Alex', true)).rejects.toThrow('PERSON_LOOKUP_FAILED');
  await expect(searchAnyvoPeople('Alex')).resolves.toEqual([]);
});
it('does not browse profiles without an explicit minimum-length query', async () => {
  await expect(searchAnyvoPeople(' a ', true)).resolves.toEqual([]); expect(mockRpc).not.toHaveBeenCalled();
});

it('does not insert after an ambiguous failed connection lookup', async () => {
  mockMaybe.mockResolvedValue({ data: null, error: { message: 'connection failed' } });
  expect((await connectAnyvoPerson('owner', 'person')).error).toBe('connection failed'); expect(mockInsert).not.toHaveBeenCalled();
});
