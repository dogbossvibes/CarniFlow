import { resolveLegacyHealthRouteAccess } from '../legacyHealthRouteAccess';
const mockSession = jest.fn(); const mockProbe = jest.fn(); const mockInbox = jest.fn();
const mockSelect = jest.fn(); const mockEq = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: () => mockSession() }, from: () => ({ select: (...args: unknown[]) => { mockSelect(...args); return { eq: (...args: unknown[]) => { mockEq(...args); return { eq: (...args: unknown[]) => { mockEq(...args); return { maybeSingle: () => mockProbe() }; } }; } }; } }) } }));
jest.mock('@/services/sharedHealthDogs', () => ({ loadReceivedHealthDogs: (...args: unknown[]) => mockInbox(...args) }));
const grant = { grant_id: 'g', dog_id: 'd', dog_name: 'Shared', owner_display_name: null, starts_at: '2020-01-01', expires_at: null, permissions: ['can_view_weight'] };
beforeEach(() => { mockSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'a' } } }, error: null }); mockProbe.mockReset().mockResolvedValue({ data: null, error: null }); mockInbox.mockReset().mockResolvedValue([grant]); mockSelect.mockClear(); mockEq.mockClear(); });
it('accepts only the exact positive owner row and never queries recipient metadata for owners', async () => {
  mockProbe.mockResolvedValue({ data: { id: 'd', owner_id: 'a' }, error: null });
  expect(await resolveLegacyHealthRouteAccess('d', 'a')).toEqual({ kind: 'owner' });
  expect(mockSelect).toHaveBeenCalledWith('id,owner_id'); expect(mockEq.mock.calls).toEqual([['id', 'd'], ['owner_id', 'a']]); expect(mockInbox).not.toHaveBeenCalled();
});
it('allows health-only recipients without any full dog-row read', async () => {
  const result = await resolveLegacyHealthRouteAccess('d', 'a');
  expect(result.kind).toBe('recipient'); expect(mockInbox).toHaveBeenCalledWith('d'); expect(mockSelect.mock.calls).toEqual([['id,owner_id']]);
});
it('does not interpret an owner-query error as nonownership', async () => {
  mockProbe.mockResolvedValue({ data: null, error: { message: 'offline' } });
  await expect(resolveLegacyHealthRouteAccess('d', 'a')).rejects.toThrow('health_route_owner_unavailable'); expect(mockInbox).not.toHaveBeenCalled();
});
it.each([{ id: 'd', owner_id: 'foreign' }, { id: 'foreign', owner_id: 'a' }])('rejects mismatched owner response %p', async data => {
  mockProbe.mockResolvedValue({ data, error: null });
  await expect(resolveLegacyHealthRouteAccess('d', 'a')).rejects.toThrow('health_route_invalid_owner'); expect(mockInbox).not.toHaveBeenCalled();
});
it('closes for missing grants without treating that as owner access', async () => {
  mockInbox.mockResolvedValue([]); expect(await resolveLegacyHealthRouteAccess('d', 'a')).toEqual({ kind: 'denied' });
});
it('propagates inbox failure instead of falling back to owner or health tables', async () => {
  mockInbox.mockRejectedValue(new Error('unavailable')); await expect(resolveLegacyHealthRouteAccess('d', 'a')).rejects.toThrow('unavailable'); expect(mockSelect).toHaveBeenCalledTimes(1);
});
it('rejects account drift before and after requests', async () => {
  mockSession.mockResolvedValueOnce({ data: { session: { user: { id: 'b' } } }, error: null });
  await expect(resolveLegacyHealthRouteAccess('d', 'a')).rejects.toThrow('health_route_account_changed'); expect(mockProbe).not.toHaveBeenCalled();
  mockProbe.mockResolvedValue({ data: { id: 'd', owner_id: 'a' }, error: null }); mockSession.mockResolvedValueOnce({ data: { session: { user: { id: 'a' } } }, error: null }).mockResolvedValueOnce({ data: { session: { user: { id: 'b' } } }, error: null });
  await expect(resolveLegacyHealthRouteAccess('d', 'a')).rejects.toThrow('health_route_account_changed');
});
it('does not accept an already expired grant returned by a delayed request', async () => {
  mockInbox.mockResolvedValue([{ ...grant, expires_at: '2020-01-02' }]); expect(await resolveLegacyHealthRouteAccess('d', 'a')).toEqual({ kind: 'denied' });
});
