import { coldIntent, localRun } from '../../services/objectReview/__tests__/intentFixtures';
import React from 'react';
import { AppState } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useTrackObjectReview, type TrackObjectReviewController } from '../useTrackObjectReview';
import { baseline, key, request } from '../../services/objectReview/__tests__/fixtures';
const mockCached = jest.fn(); const mockPending = jest.fn(); const mockRead = jest.fn(); const mockQueue = jest.fn(); const mockInitialize = jest.fn(); const mockSync = jest.fn(); const mockQueueIntent = jest.fn(); const mockResolveIntent = jest.fn();
let mockUser = key.ownerId;
jest.mock('@/features/sync/services/syncEngine', () => ({ updateSyncCounts: async () => {} }));
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: mockUser ? { id: mockUser } : null }) }));
jest.mock('../../services/objectReview/repository', () => ({ cachedReview: (...a: any[]) => mockCached(...a), pendingReview: (...a: any[]) => mockPending(...a) }));
jest.mock('../../services/objectReview/service', () => ({ readObjectReview: (...a: any[]) => mockRead(...a), initializeObjectReview: (...a: any[]) => mockInitialize(...a),
  queueAutoDetectionIntent: (...a: any[]) => mockQueueIntent(...a), resolveAutoDetectionIntent: (...a: any[]) => mockResolveIntent(...a),
  queueObjectChanges: (...a: any[]) => mockQueue(...a), syncObjectReviews: (...a: any[]) => mockSync(...a), acceptCurrentReview: jest.fn() }));
let latest: TrackObjectReviewController; let renderer: any;
function Harness({ runId = key.runId }: { runId?: string }) { latest = useTrackObjectReview({ ...key, runId, localRun: localRun() }); return null; }
const mount = async (runId?: string) => { await act(async () => { renderer = TestRenderer.create(<Harness runId={runId} />); }); };
beforeEach(() => { jest.resetAllMocks(); jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() }); mockUser = key.ownerId; mockCached.mockImplementation(async k => baseline({ runId: k.runId })); mockPending.mockResolvedValue(null); });
afterEach(() => { act(() => renderer?.unmount()); jest.restoreAllMocks(); });
it('loads cached data offline without initializing a baseline', async () => {
  mockRead.mockRejectedValue(new Error('REVIEW_OFFLINE')); await mount();
  expect(latest.review?.runId).toBe(key.runId); expect(latest.busy).toBe(false); expect(mockInitialize).not.toHaveBeenCalled();
});
it('does not show an earlier run after a delayed read finishes', async () => {
  let finish!: () => void; mockRead.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await mount(); await act(async () => { renderer.update(<Harness runId="run-b" />); });
  expect(latest.review?.runId).toBe('run-b');
  await act(async () => finish()); expect(latest.review?.runId).toBe('run-b'); expect(latest.busy).toBe(false);
});
it('immediately hides old account data and ignores its delayed response', async () => {
  let finish!: () => void; mockRead.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await mount(); mockUser = 'other'; await act(async () => renderer.update(<Harness />));
  expect(latest.available).toBe(false); expect(latest.review).toBeNull();
  await act(async () => finish()); expect(latest.review).toBeNull();
});
it('double tap enqueues once; the offline draft is exposed as pending before a remote response', async () => {
  await mount(); mockRead.mockRejectedValue(new Error('REVIEW_OFFLINE'));
  mockQueue.mockImplementation(async () => { mockPending.mockResolvedValue({ request: request(), state: 'pending', lastError: null }); });
  await act(async () => { await Promise.all([latest.save(request().changes, 0), latest.save(request().changes, 0)]); });
  expect(mockQueue).toHaveBeenCalledTimes(1); expect(latest.pending?.request.operationId).toBe('op-a'); expect(latest.review?.revision).toBe(0);
});
it('does not silently change the expected revision after a newer cached version is loaded', async () => {
  await mount(); mockCached.mockResolvedValue(baseline({ revision: 7 })); mockQueue.mockRejectedValue(new Error('REVIEW_STALE_BASELINE'));
  await act(async () => { await latest.save(request().changes, 0); });
  expect(mockQueue).toHaveBeenCalledWith(key, 0, request().changes); expect(String(latest.error)).toContain('REVIEW_STALE_BASELINE');
});


it('C1 offers recorded local auto detections with no cached baseline and saves without a remote read', async () => {
  mockCached.mockResolvedValue(null); mockRead.mockRejectedValue(new Error('REVIEW_OFFLINE'));
  await mount(); expect(latest.review).toBeNull(); expect(latest.localAutoObjects).toHaveLength(2);
  mockQueueIntent.mockImplementation(async () => { mockPending.mockResolvedValue({ request: coldIntent(), state: 'pending', lastError: null }); });
  const reads = mockRead.mock.calls.length;
  let saved = false;
  await act(async () => { saved = await latest.queueAutoIntent('local-auto-a'); });
  expect(saved).toBe(true); expect(mockRead).toHaveBeenCalledTimes(reads);
  expect(latest.pending?.request).toEqual(coldIntent()); expect(latest.review).toBeNull();
});
it('cold intents reload after navigation and are hidden immediately on run/account changes', async () => {
  mockCached.mockResolvedValue(null);
  mockPending.mockImplementation(async k => k.runId === key.runId ? { request: coldIntent(), state: 'pending', lastError: null } : null);
  await mount(); expect(latest.pending?.request.operationId).toBe('intent-a');
  await act(async () => renderer.update(<Harness runId="another-run" />));
  expect(latest.pending).toBeNull(); expect(latest.localAutoObjects).toEqual([]);
  await act(async () => renderer.update(<Harness />));
  expect(latest.pending?.request.operationId).toBe('intent-a');
  mockUser = 'another-owner'; await act(async () => renderer.update(<Harness />));
  expect(latest.pending).toBeNull(); expect(latest.localAutoObjects).toEqual([]); expect(latest.available).toBe(false);
});
