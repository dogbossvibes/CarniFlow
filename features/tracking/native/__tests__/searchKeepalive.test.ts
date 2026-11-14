// T-209: Android-Absuche hält die Ortung mit Vordergrund-Dienst wach; iOS bleibt unberührt.
const mockStart = jest.fn(async (..._args: unknown[]) => {});
const mockStop = jest.fn(async (..._args: unknown[]) => {});
let mockRunning = false;
const mockDefine = jest.fn();
let mockOS = 'android';

jest.mock('react-native', () => ({ Platform: { get OS() { return mockOS; } } }));
jest.mock('expo-task-manager', () => ({ defineTask: (...args: unknown[]) => mockDefine(...args) }));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, BestForNavigation: 6 },
  startLocationUpdatesAsync: async (...args: unknown[]) => { await mockStart(...args); mockRunning = true; },
  stopLocationUpdatesAsync: async (...args: unknown[]) => { await mockStop(...args); mockRunning = false; },
  hasStartedLocationUpdatesAsync: async () => mockRunning,
}));

type Mod = typeof import('../searchKeepalive');
const load = (os: string): Mod => {
  mockOS = os;
  let mod!: Mod;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  jest.isolateModules(() => { mod = require('../searchKeepalive'); });
  return mod;
};

beforeEach(() => {
  mockStart.mockReset().mockResolvedValue(undefined);
  mockStop.mockReset().mockResolvedValue(undefined);
  mockDefine.mockReset();
  mockRunning = false;
});

describe('Android', () => {
  it('startet einen eigenen Vordergrund-Dienst mit Benachrichtigung, der mit der App endet', async () => {
    const k = load('android');
    expect(mockDefine).toHaveBeenCalledWith(k.SEARCH_KEEPALIVE_TASK, expect.any(Function));
    await k.startSearchKeepalive();
    expect(mockStart).toHaveBeenCalledTimes(1);
    const [task, opts] = mockStart.mock.calls[0] as [string, any];
    expect(task).toBe('anyvo-absuche-bg');
    expect(task).not.toBe('anyvo-faehrte-bg');   // Legen-Task bleibt unberührt
    expect(opts.foregroundService).toEqual(expect.objectContaining({ killServiceOnDestroy: true }));
    expect(opts.foregroundService.notificationTitle).toMatch(/Absuche/);
  });

  it('ist idempotent und stoppt sauber', async () => {
    const k = load('android');
    await k.startSearchKeepalive();
    await k.startSearchKeepalive();
    expect(mockStart).toHaveBeenCalledTimes(1);
    await k.stopSearchKeepalive();
    await k.stopSearchKeepalive();
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockRunning).toBe(false);
  });

  it('ein Stopp während des Starts lässt keinen Dienst zurück', async () => {
    const k = load('android');
    let release!: () => void;
    mockStart.mockImplementationOnce(() => new Promise<void>(r => { release = r; }));
    const started = k.startSearchKeepalive();
    for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
    expect(mockStart).toHaveBeenCalledTimes(1);   // Start läuft gerade
    const stopped = k.stopSearchKeepalive();
    release();
    await Promise.all([started, stopped]);
    expect(mockRunning).toBe(false);
  });

  it('Startfehler (z. B. App nicht im Vordergrund) werfen nicht', async () => {
    const k = load('android');
    mockStart.mockRejectedValueOnce(new Error('ForegroundServiceStartNotAllowed'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(k.startSearchKeepalive()).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('ein verwaister Dienst ohne laufende Absuche beendet sich beim ersten Rückruf', async () => {
    const k = load('android');
    mockRunning = true;   // z. B. nach App-Neustart von TaskManager wiederhergestellt
    const executor = mockDefine.mock.calls[0][1] as (body: unknown) => Promise<void>;
    await executor({ data: { locations: [] }, error: null });
    expect(mockStop).toHaveBeenCalledWith(k.SEARCH_KEEPALIVE_TASK);
    expect(mockRunning).toBe(false);
  });

  it('während einer laufenden Absuche bleibt der Dienst beim Rückruf bestehen', async () => {
    const k = load('android');
    await k.startSearchKeepalive();
    const executor = mockDefine.mock.calls[0][1] as (body: unknown) => Promise<void>;
    await executor({ data: { locations: [] }, error: null });
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockRunning).toBe(true);
  });
});

describe('iOS', () => {
  it('definiert keinen Task und startet nichts', async () => {
    const k = load('ios');
    expect(mockDefine).not.toHaveBeenCalled();
    await k.startSearchKeepalive();
    await k.stopSearchKeepalive();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
  });
});
