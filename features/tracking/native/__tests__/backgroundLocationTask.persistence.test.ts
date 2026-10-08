import * as TaskManager from 'expo-task-manager';
import { setTrackFixHandler } from '../backgroundLocationTask';

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-location', () => ({ Accuracy: { BestForNavigation: 6 }, ActivityType: { Fitness: 3 } }));
const task = (body: unknown): Promise<void> => (TaskManager.defineTask as jest.Mock).mock.calls[0][1](body);
const locations = [{ timestamp: 1000 }, { timestamp: 2000 }];
afterEach(() => setTrackFixHandler(null));

it('does not complete the task before its point write completes', async () => {
  let release!: () => void;
  const handler = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  setTrackFixHandler(handler);
  let done = false;
  const work = task({ data: { locations }, error: null }).then(() => { done = true; });
  await Promise.resolve();
  expect(done).toBe(false);
  expect(handler).toHaveBeenCalledTimes(1);
  release();
  await work;
  expect(handler).toHaveBeenCalledTimes(2);
});

it('keeps an in-flight batch bound to its original handler after a recorder switch', async () => {
  let release!: () => void;
  const oldHandler = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  const newHandler = jest.fn();
  setTrackFixHandler(oldHandler);
  const work = task({ data: { locations }, error: null });
  setTrackFixHandler(newHandler);
  release();
  await work;
  expect(oldHandler).toHaveBeenLastCalledWith(locations[1]);
  expect(newHandler).not.toHaveBeenCalled();
});

it('surfaces a persistence failure instead of acknowledging a successful task', async () => {
  setTrackFixHandler(jest.fn().mockRejectedValue(new Error('SQLite unavailable')));
  await expect(task({ data: { locations }, error: null })).rejects.toThrow('SQLite unavailable');
});

it('does not assign unowned fixes to a recorder', async () => {
  setTrackFixHandler(null);
  await expect(task({ data: { locations }, error: null })).resolves.toBeUndefined();
});
