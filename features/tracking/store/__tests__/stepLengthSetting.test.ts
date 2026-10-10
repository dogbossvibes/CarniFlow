import { createStepLengthSetting } from '../stepLengthSetting';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));

function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function setup(value: string | null = '0.68391') {
  const storage = { getItem: jest.fn(async () => value), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) };
  return { storage, store: createStepLengthSetting(storage) };
}
it('reads the existing scalar without rewriting or rounding it', async () => {
  const { store, storage } = setup(); await store.load();
  expect(store.getSnapshot().stepLengthM).toBe(0.68391);
  expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
});
it.each([NaN, Infinity, 0, -0.4])('rejects invalid %s without erasing a value', async value => {
  const { store, storage } = setup(); await store.load();
  await expect(store.save(value)).rejects.toThrow('INVALID_STEP_LENGTH');
  expect(store.getSnapshot().stepLengthM).toBe(0.68391); expect(storage.removeItem).not.toHaveBeenCalled();
});
it('waits for a delayed initial read before a new save and notifies all mounted consumers after persistence', async () => {
  const { store, storage } = setup(); const reading = deferred<string | null>();
  storage.getItem.mockReturnValueOnce(reading.promise);
  const a = jest.fn(), b = jest.fn(); store.subscribe(a); store.subscribe(b);
  const load = store.load(), save = store.save(0.79);
  await Promise.resolve(); expect(storage.setItem).not.toHaveBeenCalled();
  reading.resolve('0.68'); await load; await save;
  expect(store.getSnapshot().stepLengthM).toBe(0.79); expect(a).toHaveBeenCalledTimes(2); expect(b).toHaveBeenCalledTimes(2);
});
it('retains the previous value after write/reset failure and permits explicit retry', async () => {
  const { store, storage } = setup(); await store.load();
  storage.setItem.mockRejectedValueOnce(new Error('disk full'));
  await expect(store.save(0.79)).rejects.toThrow('disk full'); expect(store.getSnapshot().stepLengthM).toBe(0.68391);
  storage.removeItem.mockRejectedValueOnce(new Error('reset failed'));
  await expect(store.save(null)).rejects.toThrow('reset failed'); expect(store.getSnapshot().stepLengthM).toBe(0.68391);
  await store.save(0.78); expect(store.getSnapshot().stepLengthM).toBe(0.78);
});
it('serializes overlapping confirmed writes and reset in invocation order', async () => {
  const { store, storage } = setup(); const writing = deferred<void>();
  storage.setItem.mockReturnValueOnce(writing.promise); await store.load();
  const first = store.save(0.72), second = store.save(null);
  await Promise.resolve(); await Promise.resolve(); expect(storage.removeItem).not.toHaveBeenCalled();
  writing.resolve(); await first; await second;
  expect(store.getSnapshot().stepLengthM).toBeUndefined();
  expect(storage.removeItem).toHaveBeenCalledWith('track_step_length_m');
});
it('reports read failures, performs no blind overwrite and recovers on retry', async () => {
  const { store, storage } = setup(); storage.getItem.mockRejectedValueOnce(new Error('read failed'));
  await expect(store.save(0.78)).rejects.toThrow('read failed');
  expect(storage.setItem).not.toHaveBeenCalled(); expect(store.getSnapshot().loadError).toBe(true);
  await store.load(); expect(store.getSnapshot().stepLengthM).toBe(0.68391); expect(store.getSnapshot().loadError).toBe(false);
});
