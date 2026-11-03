import { deleteTrackSession } from '@/features/tracking/services/trackService';
import { deleteTrainingSession } from '@/services/training';
import { deleteGpsCaptures } from '../gpsCapture';
import { setGpsCaptureAccount } from '../gpsCaptureScope';
let mockRemoteDelete: () => Promise<{ error: { message: string } | null }>;
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ delete: () => ({ eq: () => mockRemoteDelete() }) }) } }));
jest.mock('@/features/tracking-transfer/runtime', () => ({ mutateOwnTransfer: async () => ({ handled: false, error: null }) }));
jest.mock('../gpsCapture', () => ({ deleteGpsCaptures: jest.fn(async () => {}) }));
beforeEach(() => { jest.clearAllMocks(); setGpsCaptureAccount('owner', true); mockRemoteDelete = async () => ({ error: null }); });
afterEach(() => setGpsCaptureAccount(null));
it.each(['track', 'legacy'])('cleans local GPS archives after successful %s deletion', async route => {
  if (route === 'track') expect((await deleteTrackSession('session')).error).toBeNull();
  else expect((await deleteTrainingSession('session')).error).toBeNull();
  expect(deleteGpsCaptures).toHaveBeenCalledWith('session');
});
it.each(['track', 'legacy'])('retains GPS archives when %s deletion fails', async route => {
  mockRemoteDelete = async () => ({ error: { message: 'denied' } });
  if (route === 'track') expect((await deleteTrackSession('session')).error).toBe('denied');
  else expect((await deleteTrainingSession('session')).error?.message).toBe('denied');
  expect(deleteGpsCaptures).not.toHaveBeenCalled();
});
it.each(['track', 'legacy'])('a delayed %s delete cannot erase archives of a newly logged-in account', async route => {
  mockRemoteDelete = async () => { setGpsCaptureAccount('new-owner'); return { error: null }; };
  if (route === 'track') expect((await deleteTrackSession('session')).error).toBe('ACCOUNT_CHANGED');
  else await expect(deleteTrainingSession('session')).rejects.toThrow('ACCOUNT_CHANGED');
  expect(deleteGpsCaptures).not.toHaveBeenCalled();
});
