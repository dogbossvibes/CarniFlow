const mockInit = jest.fn();
const mockClose = jest.fn();
const mockCapture = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
jest.mock('@sentry/react-native', () => ({
  init: (...args: unknown[]) => mockInit(...args),
  close: (...args: unknown[]) => mockClose(...args),
  captureException: (...args: unknown[]) => mockCapture(...args),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGet(...args),
  setItem: (...args: unknown[]) => mockSet(...args),
}));

type Monitoring = typeof import('../monitoring');
const load = (): Monitoring => jest.requireActual('../monitoring');
const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
beforeEach(() => {
  jest.resetModules();
  mockInit.mockReset(); mockClose.mockReset().mockResolvedValue(undefined);
  mockCapture.mockReset(); mockGet.mockReset().mockResolvedValue(null);
  mockSet.mockReset().mockResolvedValue(undefined);
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.invalid/1';
});
afterAll(() => {
  if (originalDsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
});

test('missing DSN never initializes the SDK or loads a preference', async () => {
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  await load().initMonitoring();
  expect(mockInit).not.toHaveBeenCalled(); expect(mockGet).not.toHaveBeenCalled();
});
test('persisted opt-out prevents initialization', async () => {
  mockGet.mockResolvedValue('false'); await load().initMonitoring();
  expect(mockInit).not.toHaveBeenCalled();
});
test('an opt-out invalidates a preference read already in flight', async () => {
  const read = deferred<string>(); mockGet.mockReturnValue(read.promise);
  const api = load(); const boot = api.initMonitoring();
  await Promise.resolve(); expect(mockGet).toHaveBeenCalledTimes(1);
  const stop = api.setCrashReportingEnabled(false);
  read.resolve('true'); await Promise.all([boot, stop]);
  expect(mockInit).not.toHaveBeenCalled();
});
test('capture is blocked immediately while opt-out persistence is pending', async () => {
  const api = load(); await api.initMonitoring();
  const write = deferred<void>(); mockSet.mockReturnValue(write.promise);
  const stop = api.setCrashReportingEnabled(false);
  api.captureError(new Error('offline mocked regression'));
  expect(mockCapture).not.toHaveBeenCalled();
  write.resolve(); await stop; expect(mockClose).toHaveBeenCalledTimes(1);
});
test('the SDK event filter drops events after opt-out before close completes', async () => {
  const api = load(); await api.initMonitoring();
  const beforeSend = mockInit.mock.calls[0][0].beforeSend;
  const event = { message: 'offline mocked event' };
  expect(beforeSend(event)).toBe(event);
  const closing = deferred<void>(); mockClose.mockReturnValue(closing.promise);
  const stop = api.setCrashReportingEnabled(false);
  expect(beforeSend(event)).toBeNull();
  closing.resolve(); await stop;
});
test('parallel startup requests initialize once', async () => {
  const read = deferred<string>(); mockGet.mockReturnValue(read.promise);
  const api = load(); const a = api.initMonitoring(); const b = api.initMonitoring();
  read.resolve('true'); await Promise.all([a, b]);
  expect(mockInit).toHaveBeenCalledTimes(1);
});
test('reenabling waits for an older SDK close to finish', async () => {
  const api = load(); await api.initMonitoring();
  const closing = deferred<void>(); mockClose.mockReturnValue(closing.promise);
  const stop = api.setCrashReportingEnabled(false); await Promise.resolve();
  expect(mockClose).toHaveBeenCalledTimes(1);
  const start = api.setCrashReportingEnabled(true);
  await Promise.resolve(); await Promise.resolve();
  expect(mockInit).toHaveBeenCalledTimes(1);
  closing.resolve(); await Promise.all([stop, start]);
  expect(mockInit).toHaveBeenCalledTimes(2);
});
test('rapid settings changes persist in decision order and final opt-out wins', async () => {
  const first = deferred<void>(); mockSet.mockImplementationOnce(() => first.promise);
  const api = load(); const start = api.setCrashReportingEnabled(true);
  const stop = api.setCrashReportingEnabled(false);
  await Promise.resolve(); expect(mockSet).toHaveBeenCalledTimes(1);
  first.resolve(); await Promise.all([start, stop]);
  expect(mockSet.mock.calls.map(call => call[1])).toEqual(['true', 'false']);
  expect(mockInit).not.toHaveBeenCalled();
});
test('failed persistence cannot reopen reporting after opt-out', async () => {
  const api = load(); await api.initMonitoring();
  mockSet.mockRejectedValue(new Error('storage unavailable'));
  await api.setCrashReportingEnabled(false); await api.initMonitoring();
  api.captureError(new Error('offline mocked regression'));
  expect(mockInit).toHaveBeenCalledTimes(1); expect(mockCapture).not.toHaveBeenCalled();
});
test('failed close leaves local capture blocked and later lifecycle work usable', async () => {
  const api = load(); await api.initMonitoring();
  mockClose.mockRejectedValue(new Error('native close unavailable'));
  await api.setCrashReportingEnabled(false);
  api.captureError(new Error('offline mocked regression'));
  expect(mockCapture).not.toHaveBeenCalled();
  await api.setCrashReportingEnabled(true); expect(mockInit).toHaveBeenCalledTimes(2);
});
test('initialization failure is contained and a later attempt may retry', async () => {
  mockInit.mockImplementationOnce(() => { throw new Error('SDK unavailable'); });
  const api = load(); await expect(api.initMonitoring()).resolves.toBeUndefined();
  api.captureError(new Error('offline mocked regression'));
  expect(mockCapture).not.toHaveBeenCalled();
  await api.initMonitoring(); expect(mockInit).toHaveBeenCalledTimes(2);
});
test('existing enabled capture and extra data contract is preserved', async () => {
  const api = load(); await api.initMonitoring();
  const error = new Error('offline mocked regression'); const extra = { component: 'unit-test' };
  api.captureError(error, extra);
  expect(mockCapture).toHaveBeenCalledWith(error, { extra });
  expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: 0, enabled: true }));
});
