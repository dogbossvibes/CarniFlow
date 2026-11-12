import fixture from './fixtures/backend-cloud-v1.json';
import { ensureOwnTransferLocal, mutateOwnTransfer, syncOwnTransfer } from '../runtime';
const receipt = fixture.accept.receipt;
let mockEpoch = 0, mockUser: string = receipt.recipientUserId;
const mockRow = jest.fn(), mockRemote = jest.fn(), mockRpc = jest.fn(), mockEdit = jest.fn(), mockSync = jest.fn(), mockImport = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: mockUser } } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockRemote }) }) }) } }));
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({ getFirstAsync: mockRow }) }));
jest.mock('../rpc', () => ({ createSupabaseTransferClient: () => ({ epoch: () => mockEpoch, dispose: jest.fn(), call: mockRpc }) }));
jest.mock('../localStore', () => ({ createTransferLocalStore: (scope: () => unknown) => ({ currentScope: scope }) }));
jest.mock('../ownSync', () => ({ createOwnSync: () => ({ edit: mockEdit, sync: mockSync }) }));
jest.mock('../ownImport', () => ({ importOwnCopy: (...args: unknown[]) => mockImport(...args) }));
const row = () => ({ local_id: receipt.ownSessionId, user_id: receipt.recipientUserId, dog_id: receipt.recipientDogId, payload_json: JSON.stringify({ trackTransferReceipt: receipt }) });
beforeEach(() => { jest.clearAllMocks(); mockEpoch = 0; mockUser = receipt.recipientUserId;
  mockRow.mockResolvedValue(row()); mockRemote.mockResolvedValue({ data: null, error: null }); mockEdit.mockResolvedValue(undefined); mockSync.mockResolvedValue(undefined); });
it.each([{ notes: 'own' }, { lyingTimeMinutes: 42 }, { evaluation: { legs: [], score: 80, evaluatedAt: '2026-10-11T10:00:00.000Z' } }])('routes direct mutation through durable own-sync: %s', async patch => {
  expect(await mutateOwnTransfer(receipt.ownSessionId, patch)).toEqual({ handled: true, error: null });
  expect(mockEdit).toHaveBeenCalledWith(receipt.ownSessionId, patch); expect(mockRemote).not.toHaveBeenCalled();
});
it('routes delete through the same revisioned path', async () => {
  expect(await mutateOwnTransfer(receipt.ownSessionId, 'delete')).toEqual({ handled: true, error: null }); expect(mockSync).toHaveBeenCalledWith(receipt.ownSessionId, true);
});
it('restores the current cloud copy before the first edit on a new device', async () => {
  mockRow.mockResolvedValue(null); mockRemote.mockResolvedValue({ data: { owner_id: receipt.recipientUserId, track_data: { trackTransferReceipt: receipt } }, error: null });
  mockRpc.mockResolvedValue(fixture.restore);
  expect(await mutateOwnTransfer(receipt.ownSessionId, { notes: 'new' })).toEqual({ handled: true, error: null });
  expect(mockRpc).toHaveBeenCalledWith(receipt.recipientUserId, 'restore', { receiptId: receipt.receiptId });
  expect(mockImport).toHaveBeenCalledWith(expect.anything(), receipt.recipientUserId, receipt, fixture.restore.ownCopy);
});
it('never falls back to ordinary writing after a failed transfer edit', async () => {
  mockEdit.mockRejectedValue(new Error('TRANSFER_REVISION_CONFLICT'));
  expect(await mutateOwnTransfer(receipt.ownSessionId, { notes: 'local' })).toEqual({ handled: true, error: 'TRANSFER_REVISION_CONFLICT' }); expect(mockRemote).not.toHaveBeenCalled();
});
it('rejects foreign receipt ownership before writes', async () => {
  mockUser = 'different'; expect((await mutateOwnTransfer(receipt.ownSessionId, 'delete')).handled).toBe(true); expect(mockSync).not.toHaveBeenCalled(); expect(mockEdit).not.toHaveBeenCalled();
});
it('retains ordinary paths only for a proven non-transfer session', async () => {
  mockRow.mockResolvedValue({ ...row(), payload_json: '{}' });
  expect(await mutateOwnTransfer(receipt.ownSessionId, { notes: null })).toEqual({ handled: false, error: null });
  expect(await syncOwnTransfer({ ...row(), payload_json: '{}' } as never)).toBeNull(); expect(mockEdit).not.toHaveBeenCalled();
});
it('never considers an unavailable backend proof of an ordinary session', async () => {
  mockRow.mockResolvedValue(null); mockRemote.mockResolvedValue({ data: null, error: { message: 'offline' } });
  expect(await mutateOwnTransfer(receipt.ownSessionId, 'delete')).toEqual({ handled: true, error: 'CONNECTION' }); expect(mockSync).not.toHaveBeenCalled();
});

it('direct detail restore hydrates the current own copy without any mutation', async () => {
  mockRow.mockResolvedValue(null); mockRemote.mockResolvedValue({ data: { owner_id: receipt.recipientUserId, track_data: { trackTransferReceipt: receipt } }, error: null });
  mockRpc.mockResolvedValue(fixture.restore);
  expect(await ensureOwnTransferLocal(receipt.ownSessionId)).toEqual({ handled: true, error: null });
  expect(mockImport).toHaveBeenCalledWith(expect.anything(), receipt.recipientUserId, receipt, fixture.restore.ownCopy);
  expect(mockEdit).not.toHaveBeenCalled(); expect(mockSync).not.toHaveBeenCalled();
});
it('rejects a restore bound to a changed dog/run before importing or editing', async () => {
  mockRow.mockResolvedValue(null); mockRemote.mockResolvedValue({ data: { owner_id: receipt.recipientUserId, track_data: { trackTransferReceipt: receipt } }, error: null });
  mockRpc.mockResolvedValue({ ...fixture.restore, receipt: { ...receipt, ownRunId: '00000000-0000-4000-8000-000000000099' } });
  expect(await ensureOwnTransferLocal(receipt.ownSessionId)).toEqual({ handled: true, error: 'INVALID_RESPONSE' });
  expect(mockImport).not.toHaveBeenCalled(); expect(mockEdit).not.toHaveBeenCalled();
});
