import {
  listAcceptedTrainers, shareTrack, revokeTrackShare, getSharedTrack,
  listSharedTracksForTrainer, listTrackFeedback, addTrackFeedback,
  updateTrackFeedback, deleteTrackFeedback,
} from '../trackShareService';

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockConnections = jest.fn();
let mockResult: { data: any; error: any };
const mockQuery: any = {};
for (const method of ['select','eq','is','order','insert','update','delete','single','maybeSingle']) {
  mockQuery[method] = jest.fn(() => mockQuery);
}
mockQuery.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(mockResult).then(resolve, reject);
const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: {
  from: (...args: unknown[]) => mockFrom(...args),
  rpc: (...args: unknown[]) => mockRpc(...args),
  auth: { getUser: () => mockGetUser() },
} }));
jest.mock('@/services/connectionService', () => ({ listConnections: (...args: unknown[]) => mockConnections(...args) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockFrom.mockReturnValue(mockQuery);
  mockGetUser.mockResolvedValue({ data: { user: { id: 'viewer' } } });
  mockResult = { data: null, error: null };
  mockRpc.mockResolvedValue({ data: [{ dog_name: 'Synthetic dog', owner_name: 'Synthetic owner' }], error: null });
});

test('picker uses accepted owner-side connections only', async () => {
  const accepted = { id: 'a', myRole: 'owner', status: 'accepted' };
  mockConnections.mockResolvedValue([accepted, { myRole: 'owner', status: 'pending' }, { myRole: 'connected', status: 'accepted' }]);
  expect(await listAcceptedTrainers('owner')).toEqual([accepted]);
  expect(mockConnections).toHaveBeenCalledWith('owner');
});

test('unauthenticated sharing and trainer reads fail before querying', async () => {
  mockGetUser.mockResolvedValue({ data: { user: null } });
  expect((await shareTrack('track', 'trainer')).error).toBeTruthy();
  expect((await getSharedTrack('track')).data).toBeNull();
  expect((await listSharedTracksForTrainer()).data).toEqual([]);
  expect(mockFrom).not.toHaveBeenCalled();
});

test('share creation takes owner identity from authenticated user', async () => {
  await shareTrack('track', 'trainer');
  expect(mockQuery.insert).toHaveBeenCalledWith({ track_id: 'track', owner_user_id: 'viewer', trainer_user_id: 'trainer' });
});

test('trainer details scope by caller and active share, with name-only RPC', async () => {
  mockResult.data = { track_id: 'track', track: { id: 'track', distance_meters: 120 } };
  const result = await getSharedTrack('track');
  expect(mockQuery.eq).toHaveBeenCalledWith('trainer_user_id', 'viewer');
  expect(mockQuery.eq).toHaveBeenCalledWith('track_id', 'track');
  expect(mockQuery.is).toHaveBeenCalledWith('revoked_at', null);
  expect(mockQuery.select).toHaveBeenCalledWith('*, track:training_sessions(*)');
  expect(mockRpc).toHaveBeenCalledWith('shared_track_display', { p_track_id: 'track' });
  expect(result.data?.track.dog.name).toBe('Synthetic dog');
  expect(result.data?.track.owner_name).toBe('Synthetic owner');
});

test('concurrent revocation during display lookup yields no detail', async () => {
  mockResult.data = { track_id: 'track', track: { id: 'track' } };
  mockRpc.mockResolvedValue({ data: [], error: null });
  expect((await getSharedTrack('track')).data).toBeNull();
});

test('list is newest first and omits concurrently revoked shares', async () => {
  mockResult.data = [{ track_id: 'a', track: { id: 'a' } }, { track_id: 'b', track: { id: 'b' } }];
  mockRpc.mockResolvedValueOnce({ data: [{ dog_name: 'A', owner_name: 'Owner' }], error: null }).mockResolvedValueOnce({ data: [], error: null });
  expect((await listSharedTracksForTrainer()).data).toHaveLength(1);
  expect(mockQuery.order).toHaveBeenCalledWith('shared_at', { ascending: false });
});

test('display errors propagate instead of returning misleading partial data', async () => {
  mockResult.data = [{ track_id: 'a', track: { id: 'a' } }];
  mockRpc.mockResolvedValue({ data: null, error: { code: '42501' } });
  const result = await listSharedTracksForTrainer();
  expect(result.data).toEqual([]);
  expect(result.error).toEqual({ code: '42501' });
});

test('revocation only updates specified share timestamp', async () => {
  await revokeTrackShare('share');
  expect(mockQuery.eq).toHaveBeenCalledWith('id', 'share');
  expect(mockQuery.update).toHaveBeenCalledWith({ revoked_at: expect.any(String) });
  expect(mockQuery.delete).not.toHaveBeenCalled();
});

test('feedback reads are per-share and chronological', async () => {
  await listTrackFeedback('share');
  expect(mockQuery.eq).toHaveBeenCalledWith('track_share_id', 'share');
  expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: true });
});

test.each(['👍', '✅', '👀', '💡'] as const)('feedback preserves supported reaction %s and trims text', async reaction => {
  await addTrackFeedback('share', 'viewer', '  Feedback  ', reaction);
  expect(mockQuery.insert).toHaveBeenCalledWith({ track_share_id: 'share', author_user_id: 'viewer', body: 'Feedback', reaction });
});

test('feedback edit/delete scope to given message and expose server errors', async () => {
  mockResult.error = { code: '42501' };
  expect((await updateTrackFeedback('message', { body: '  Updated  ', reaction: null })).error).toEqual({ code: '42501' });
  expect(mockQuery.update).toHaveBeenCalledWith({ body: 'Updated', reaction: null });
  await deleteTrackFeedback('message');
  expect(mockQuery.eq).toHaveBeenCalledWith('id', 'message');
});
