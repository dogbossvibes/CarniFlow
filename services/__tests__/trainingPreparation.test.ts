import { loadTrainingPreparation } from '../trainingPreparation';
const mockUnits = jest.fn();
const mockSessions = jest.fn();
jest.mock('@/services/trainingUnitService', () => ({ getTrainingPreparationUnits: (...args: unknown[]) => mockUnits(...args) }));
jest.mock('@/services/training', () => ({ getTrainingSessions: (...args: unknown[]) => mockSessions(...args) }));
const old = { id: 'same-id', owner_id: 'owner', dog_id: 'dog', category: 'Schutzdienst', title: 'Revieren', notes: 'Old observation',
  type: null, session_date: '2026-10-19', created_at: '2026-10-19T10:00:00Z' };
const unit = { id: 'same-id', owner_id: 'owner', dog_id: 'dog', status: 'completed', session_date: '2026-10-20', created_at: '2026-10-20T10:00:00Z',
  exercises: [{ id: 'exercise', discipline: 'Schutzdienst', exercise_name: 'Revieren', notes: 'New observation' }] };
function query(data: unknown[], error: unknown = null) {
  const q = { eq: jest.fn(), or: jest.fn(), limit: jest.fn().mockResolvedValue({ data, error }) };
  q.eq.mockReturnValue(q); q.or.mockReturnValue(q); return q;
}
beforeEach(() => { mockUnits.mockReset().mockReturnValue(query([])); mockSessions.mockReset().mockReturnValue(query([])); });
it('reads both models by owner/dog/discipline, preserves old notes and unique source identities', async () => {
  const uq = query([unit]); const sq = query([old]); mockUnits.mockReturnValue(uq); mockSessions.mockReturnValue(sq);
  const result = await loadTrainingPreparation('owner', 'dog', 'Schutzdienst');
  expect(mockUnits).toHaveBeenCalledWith('owner', 'dog', 'Schutzdienst');
  expect(mockSessions).toHaveBeenCalledWith('owner', 'dog');
  expect(sq.eq).toHaveBeenCalledWith('category', 'Schutzdienst');
  expect(sq.or).toHaveBeenCalledWith('type.is.null,type.neq.track');
  expect(sq.limit).toHaveBeenCalledWith(101);
  expect(result.units.map(u => u.id)).toEqual(['same-id', 'legacy-session:same-id']);
  expect(result.units[1]).toMatchObject({ historySource: 'session', originalId: 'same-id', notes: 'Old observation', exercises: [{ notes: 'Old observation' }] });
  expect(old.id).toBe('same-id');
  expect(result.limited).toBe(false);
});
it('does not include GPS, another owner, dog, discipline, or active units even on a stale response', async () => {
  mockUnits.mockReturnValue(query([unit, { ...unit, owner_id: 'other' }, { ...unit, dog_id: 'other' }, { ...unit, status: 'active' }]));
  mockSessions.mockReturnValue(query([{ ...old, type: 'track' }, { ...old, owner_id: 'other' }, { ...old, dog_id: 'other' }, { ...old, category: 'Other' }]));
  expect((await loadTrainingPreparation('owner', 'dog', 'Schutzdienst')).units.map(u => u.id)).toEqual(['same-id']);
});
it.each([100, 101])('marks the %i boundary without an unbounded rendering list', async count => {
  mockSessions.mockReturnValue(query(Array.from({ length: count }, (_, i) => ({ ...old, id: `legacy-${i}` }))));
  const result = await loadTrainingPreparation('owner', 'dog', 'Schutzdienst');
  expect(result.units).toHaveLength(100); expect(result.limited).toBe(count > 100);
});
it.each(['units', 'sessions'] as const)('propagates %s failure instead of replacing the old history with a partial success', async source => {
  const error = new Error(source);
  (source === 'units' ? mockUnits : mockSessions).mockReturnValue(query([], error));
  await expect(loadTrainingPreparation('owner', 'dog', 'Schutzdienst')).rejects.toBe(error);
});
