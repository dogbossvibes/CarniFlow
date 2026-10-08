import { getTrackPreview } from '../trackPreviewService';

const mockRemote = jest.fn(), mockLocal = jest.fn(), mockRow = jest.fn();
jest.mock('../trackService', () => ({ getTrackSessionById: (...args: unknown[]) => mockRemote(...args) }));
jest.mock('../trackHistoryService', () => ({ getLocalTrackDetail: (...args: unknown[]) => mockLocal(...args) }));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({ getLocalTrainingSessionById: (...args: unknown[]) => mockRow(...args) }));
const local = { id: 's', dog_id: 'd', points: [{ latitude: 47, longitude: 8 }, { latitude: 47.001, longitude: 8.001 }] };
beforeEach(() => { jest.clearAllMocks(); mockRow.mockResolvedValue({ local_id: 's', user_id: 'u', dog_id: 'd', type: 'track' }); mockLocal.mockResolvedValue(local); mockRemote.mockResolvedValue({ data: null }); });
it('draws local pending GPS without requiring a network request', async () => {
  expect((await getTrackPreview('s', 'd', 'u', true))?.lay).toHaveLength(2); expect(mockRemote).not.toHaveBeenCalled();
});
it('fills a missing remote GPS path from the same owned local session', async () => {
  mockRemote.mockResolvedValue({ data: { id: 's', dog_id: 'd', owner_id: 'u', points: [] } });
  expect((await getTrackPreview('s', 'd', 'u'))?.lay[0]).toEqual({ lat: 47, lng: 8 });
});
it('preserves recorded remote geometry without blending it with local positions', async () => {
  mockRemote.mockResolvedValue({ data: { id: 's', dog_id: 'd', owner_id: 'u', points: [{ latitude: 48, longitude: 9 }] } });
  expect((await getTrackPreview('s', 'd', 'u'))?.lay).toEqual([{ lat: 48, lng: 9 }]);
});
it.each([{ user_id: 'someone-else' }, { dog_id: 'other-dog' }, { deleted_at: 'yesterday' }, { type: 'training' }])('rejects foreign/deleted/nontrack local data %s', async invalid => {
  mockRow.mockResolvedValue({ user_id: 'u', dog_id: 'd', type: 'track', ...invalid });
  mockRemote.mockResolvedValue({ data: { ...local, owner_id: 'someone-else' } });
  expect(await getTrackPreview('s', 'd', 'u')).toBeNull(); expect(mockLocal).not.toHaveBeenCalled();
});
