/** Reproductions of unfixed 3f44b1d behavior; these are NOT acceptance tests for the fix. */
import { enqueueSearchPoint, flushSearchPoints, resetSearchBuffer } from '../searchPersist';
import { createLocalSearchPointsBatch, type NewTrackPoint } from '../../repositories/localTrackRepository';

jest.mock('../../repositories/localTrackRepository', () => ({ createLocalSearchPointsBatch: jest.fn() }));
const write = createLocalSearchPointsBatch as jest.Mock;
const point = (latitude: number): NewTrackPoint => ({ latitude, longitude: 0, timestamp: '2026-10-08T10:00:00Z' });

beforeEach(() => { write.mockReset().mockResolvedValue(undefined); resetSearchBuffer('baseline'); });

it('reproduces completion reporting success while its pending SQLite write later fails', async () => {
  let reject!: (error: Error) => void;
  write.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
  enqueueSearchPoint(point(1));
  const pending = flushSearchPoints();
  expect(await flushSearchPoints()).toBe(true);
  reject(new Error('SQLite temporarily unavailable'));
  expect(await pending).toBe(false);
  expect(await flushSearchPoints()).toBe(true); // clean up the requeued baseline data
});

it('reproduces a failed write from session A being requeued into the new session B', async () => {
  let reject!: (error: Error) => void;
  write.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
  resetSearchBuffer('session-A');
  enqueueSearchPoint(point(1));
  const pendingA = flushSearchPoints();
  resetSearchBuffer('session-B');
  enqueueSearchPoint(point(2));
  reject(new Error('write A failed'));
  expect(await pendingA).toBe(false);
  await flushSearchPoints();
  expect(write).toHaveBeenLastCalledWith('session-B', [
    { ...point(1), point_type: 'search' }, { ...point(2), point_type: 'search' },
  ]);
});
