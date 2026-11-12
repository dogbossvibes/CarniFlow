import { finalizeLocalTrackRun } from '@/features/training/repositories/localTrainingRepository';
import { deleteSearchPointsBySession } from '@/features/tracking/repositories/localTrackRepository';
import { createTransferRunScope } from '../runScope';
import { parseTransferReceipt } from '../importPlan';
import fixture from './fixtures/backend-cloud-v1.json';
const mockDb = jest.fn(), mockWrite = jest.fn(), mockRead = jest.fn();
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: () => mockDb() }));
const receipt = parseTransferReceipt(fixture.accept.receipt), pending = { transferReceipt: receipt, sessionId: receipt.ownSessionId, dogId: receipt.recipientDogId, runId: receipt.ownRunId };
beforeEach(() => { jest.clearAllMocks(); mockDb.mockResolvedValue({ getFirstAsync: mockRead, runAsync: mockWrite }); mockRead.mockResolvedValue({ payload_json: JSON.stringify({ trackTransferReceipt: receipt }) }); });
it('rechecks after the asynchronous parent read before finalizing any local payload', async () => {
  const scope = createTransferRunScope(receipt.recipientUserId), token = scope.token();
  mockRead.mockImplementation(async () => { scope.setUser('B', true); scope.setUser(receipt.recipientUserId, true); return { payload_json: JSON.stringify({ trackTransferReceipt: receipt }) }; });
  await expect(finalizeLocalTrackRun(receipt.ownSessionId, {}, () => { scope.assert(token, pending); })).rejects.toThrow('ACCOUNT_CHANGED');
  expect(mockWrite).not.toHaveBeenCalled();
});
it('rechecks after database opening before deleting search points', async () => {
  const scope = createTransferRunScope(receipt.recipientUserId), token = scope.token();
  mockDb.mockImplementation(async () => { scope.dispose(); return { runAsync: mockWrite }; });
  await expect(deleteSearchPointsBySession(receipt.ownSessionId, () => { scope.assert(token, pending); })).rejects.toThrow('ACCOUNT_CHANGED'); expect(mockWrite).not.toHaveBeenCalled();
});
