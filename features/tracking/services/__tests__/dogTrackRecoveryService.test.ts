import { dogRecoveryCandidates } from '../dogTrackRecoveryService';
import type { LocalTrainingSession } from '@/features/sync/types/sync';

jest.mock('@/features/training/repositories/localTrainingRepository', () => ({ getLocalTrainingSessions: jest.fn() }));
const row = (overrides: Partial<LocalTrainingSession> = {}): LocalTrainingSession => ({ local_id: 's', user_id: 'u', dog_id: 'd', type: 'track', ended_at: '2026-10-08T10:00:00Z', started_at: '2026-10-08T09:00:00Z', payload_json: '{}', ...overrides } as LocalTrainingSession);
it('finds cancelled tracks after removal from the active registry, using the original session ID', () => {
  expect(dogRecoveryCandidates([row({ payload_json: JSON.stringify({ trackLifecycleStatus: 'cancelled' }) })], 'u', 'd')).toEqual([{ id: 's', date: '2026-10-08T09:00:00Z', cancelled: true }]);
});
it.each([{ user_id: 'other' }, { dog_id: 'other' }, { type: 'obedience' }, { deleted_at: '2026-10-08' }, { ended_at: null }, { payload_json: '{broken' }, { payload_json: '{"run":{}}' }, { payload_json: '{"trackLifecycleStatus":"completed_without_app"}' }])('excludes ineligible records %s', invalid => {
  expect(dogRecoveryCandidates([row(invalid as Partial<LocalTrainingSession>)], 'u', 'd')).toEqual([]);
});
it('retains older recoverable tracks when a newer training exists, deduplicated and sorted', () => {
  expect(dogRecoveryCandidates([row({ local_id: 'old', started_at: '2026-09-01' }), row(), row(), row({ local_id: 'finished', payload_json: '{"run":{}}' })], 'u', 'd').map(r => r.id)).toEqual(['s', 'old']);
});
