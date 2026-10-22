import { createAndroidGreetingPlayer } from '../androidGreetingPlayer';

const mockNative = { getApiVersion: jest.fn(), beginSession: jest.fn(), play: jest.fn(), cancel: jest.fn(), stop: jest.fn() };
const mockRequire = jest.fn();
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: (...args: unknown[]) => mockRequire(...args) }));
beforeEach(() => {
  mockRequire.mockReset().mockReturnValue(mockNative);
  mockNative.getApiVersion.mockReset().mockReturnValue(1);
  mockNative.beginSession.mockReset().mockReturnValue('opaque-token');
  mockNative.play.mockReset().mockResolvedValue(true);
  mockNative.cancel.mockReset(); mockNative.stop.mockReset().mockResolvedValue(true);
});
test('old binaries and incompatible APIs fail closed without a player or mode fallback', () => {
  mockRequire.mockReturnValueOnce(null); expect(createAndroidGreetingPlayer(2040)).toBeNull();
  mockNative.getApiVersion.mockReturnValueOnce(2); expect(createAndroidGreetingPlayer(2040)).toBeNull();
  mockNative.beginSession.mockReturnValueOnce(null); expect(createAndroidGreetingPlayer(0)).toBeNull();
  expect(mockNative.play).not.toHaveBeenCalled();
});
test('uses only an opaque native session token and remaining lifetime', async () => {
  const player = createAndroidGreetingPlayer(1500)!;
  expect(mockNative.beginSession).toHaveBeenCalledWith(1500);
  expect(await player.play()).toBe(true); await player.stop();
  expect(mockNative.cancel).toHaveBeenCalledWith('opaque-token'); expect(mockNative.stop).toHaveBeenCalledWith('opaque-token');
  expect(mockNative.cancel.mock.invocationCallOrder[0]).toBeLessThan(mockNative.stop.mock.invocationCallOrder[0]);
  expect(await player.play()).toBe(false); expect(mockNative.play).toHaveBeenCalledTimes(1);
});
test('stop synchronously invalidates queued playback and waits for native cleanup acknowledgement', async () => {
  let done!: (value: boolean) => void;
  mockNative.stop.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  const player = createAndroidGreetingPlayer(2040)!;
  const stopping = player.stop(); expect(player.stop()).toBe(stopping);
  let acknowledged = false; void stopping.then(() => { acknowledged = true; });
  expect(mockNative.cancel).toHaveBeenCalledTimes(1); expect(await player.play()).toBe(false); expect(acknowledged).toBe(false);
  done(true); await stopping; expect(acknowledged).toBe(true);
});
test('a late play response cannot reactivate a stopped session', async () => {
  let done!: (value: boolean) => void;
  mockNative.play.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  const player = createAndroidGreetingPlayer(2040)!; const playing = player.play();
  await player.stop(); done(true); expect(await playing).toBe(false);
});
test('native failures leave Home usable and do not change global sound settings', async () => {
  mockRequire.mockImplementationOnce(() => { throw new Error('unlinked'); }); expect(createAndroidGreetingPlayer(2040)).toBeNull();
  const player = createAndroidGreetingPlayer(2040)!; mockNative.play.mockRejectedValueOnce(new Error('context lost'));
  expect(await player.play()).toBe(false);
  mockNative.cancel.mockImplementationOnce(() => { throw new Error('released'); }); mockNative.stop.mockRejectedValueOnce(new Error('released'));
  await expect(player.stop()).resolves.toBeUndefined();
});
