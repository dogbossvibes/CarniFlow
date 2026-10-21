import * as Crypto from 'expo-crypto';
import { createTrainingGroupService } from '../groupService';
import { GroupApiError, type createGroupRpcClient } from '../groupRpc';
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
const u = '10000000-0000-4000-8000-000000000001', g = '20000000-0000-4000-8000-000000000001';
const s = '30000000-0000-4000-8000-000000000001', d = '40000000-0000-4000-8000-000000000001';
const p = '50000000-0000-4000-8000-000000000001';
const session = { sessionId: s, groupId: g, ownerUserId: u, title: 'Training', status: 'active', expiresAtMs: 90000,
  participants: [{ participationId: p, userId: u, displayName: 'A', dogId: d, dogName: 'Dog', colorKey: null }] };
function setup() {
  const call = jest.fn(); const client = { call, dispose: jest.fn() } as ReturnType<typeof createGroupRpcClient>;
  return { call, service: createTrainingGroupService(client, u) };
}
beforeEach(() => { jest.clearAllMocks(); jest.mocked(Crypto.randomUUID).mockReturnValue(p); });
it('reuses a participation ID after an unknown server outcome and validates the returned epoch', async () => {
  const { call, service } = setup(); call.mockRejectedValueOnce(new GroupApiError('GROUP_CONNECTION'));
  await expect(service.join(s, d)).rejects.toThrow('CONNECTION');
  call.mockResolvedValue({ session }); await service.join(s, d);
  expect(call.mock.calls[0][3]).toEqual({ sessionId: s, dogId: d, participationId: p });
  expect(call.mock.calls[1][3]).toEqual(call.mock.calls[0][3]);
  expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
});
it('does not acknowledge a successful join with another participation ID', async () => {
  const { call, service } = setup(); call.mockResolvedValue({ session: { ...session,
    participants: [{ ...session.participants[0], participationId: s }] } });
  await expect(service.join(s, d)).rejects.toThrow('INVALID_RESPONSE');
});
it('coalesces a repeated press and allocates a new ID only after a definitive response', async () => {
  const { call, service } = setup(); let resolve!: (r: unknown) => void;
  call.mockReturnValue(new Promise(r => { resolve = r; }));
  const a = service.join(s, d), b = service.join(s, d); expect(call).toHaveBeenCalledTimes(1);
  resolve({ session }); await Promise.all([a, b]);
  call.mockResolvedValue({ session }); await service.join(s, d);
  expect(Crypto.randomUUID).toHaveBeenCalledTimes(2);
});
it('leaves the exact participation epoch and refuses a mismatched ACK', async () => {
  const { call, service } = setup(); call.mockResolvedValue({ sessionId: s, participationId: g, left: true });
  await expect(service.leaveSession(s, p)).rejects.toThrow('INVALID_RESPONSE');
  expect(call.mock.calls[0][3]).toEqual({ sessionId: s, participationId: p });
});
it('rejects sessions from another group and invitations for another account', async () => {
  const { call, service } = setup(); call.mockResolvedValue({ sessions: [{ ...session, groupId: d }] });
  await expect(service.sessions(g)).rejects.toThrow('INVALID_RESPONSE');
  call.mockResolvedValue({ groups: [], invitations: [{ invitationId: p, groupId: g, groupTitle: 'Group',
    inviterUserId: u, recipientUserId: d, status: 'pending', expiresAtMs: 90000 }] });
  await expect(service.list()).rejects.toThrow('INVALID_RESPONSE');
});
it('binds group leave to the observed membership and rejects an ACK for another epoch', async () => {
  const { call, service } = setup(); call.mockResolvedValue({ groupId: g, membershipId: p, left: true });
  await service.leave(g, p); expect(call.mock.calls[0][3]).toEqual({ groupId: g, membershipId: p });
  call.mockResolvedValue({ groupId: g, membershipId: s, left: true });
  await expect(service.leave(g, p)).rejects.toThrow('INVALID_RESPONSE');
});
