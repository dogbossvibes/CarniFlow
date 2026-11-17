import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { useLiveShare, PERMISSION_RESUME_TIMEOUT_MS, type LiveShareStartResult } from '../useLiveShare';
import { RevocationJournal } from '../revocationJournal';
let mockReleaseReady = true;
jest.mock('../releaseGate', () => ({ isLiveShareReleaseReady: () => mockReleaseReady }));

let mockNetwork: (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void;
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: (listener: typeof mockNetwork) => { mockNetwork = listener; return jest.fn(); } } }));
jest.mock('expo-location', () => ({ Accuracy: { High: 4 }, getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(), watchPositionAsync: jest.fn() }));
const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const input = { userId: user, sessionId: '20000000-0000-4000-8000-000000000001',
  dogId: '30000000-0000-4000-8000-000000000001', shareId: '40000000-0000-4000-8000-000000000001',
  recipientIds: [other], durationMs: 60_000 };
const transport = { start: jest.fn(), publish: jest.fn(), revoke: jest.fn() };
let journal: RevocationJournal, api: ReturnType<typeof useLiveShare>, tree: ReactTestRenderer;
let appState: (state: AppStateStatus) => void, fix: Location.LocationCallback, remove: jest.Mock;
const capture = (value: ReturnType<typeof useLiveShare>) => { api = value; };
function Harness({ uid = user }: { uid?: string }) {
  const value = useLiveShare(uid, transport, journal);
  React.useLayoutEffect(() => { capture(value); });
  return null;
}
beforeEach(() => {
  mockReleaseReady = true;
  jest.useFakeTimers(); jest.setSystemTime(1_000_000); jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => { appState = handler; return { remove: jest.fn() }; });
  const data = new Map<string, string>();
  journal = new RevocationJournal({ getItem: async k => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); } });
  transport.start.mockResolvedValue({ ...input, serverNowMs: 1_000_000, expiresAtMs: 1_060_000 });
  transport.publish.mockResolvedValue(undefined); transport.revoke.mockResolvedValue(undefined);
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  remove = jest.fn();
  jest.mocked(Location.watchPositionAsync).mockImplementation(async (_options, cb) => { fix = cb; return { remove }; });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
async function mount() { await act(async () => { tree = TestRenderer.create(<Harness />); }); }
async function start() { await act(async () => { await api.start(input); }); }
function emit(timestamp = Date.now()) { fix({ timestamp, coords: { latitude: 47, longitude: 8, accuracy: 4 } } as Location.LocationObject); }

it('does not request GPS until explicit consent and granted permission', async () => {
  await mount(); expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
  await start(); expect(api.state.permissionDenied).toBe(true);
  expect(transport.start).not.toHaveBeenCalled(); expect(Location.watchPositionAsync).not.toHaveBeenCalled();
});
it('removes only its own subscription at background and never auto-resumes', async () => {
  await mount(); await start();
  expect(api.state.phase).toBe('sharing');
  await act(async () => { emit(); }); expect(transport.publish).toHaveBeenCalledTimes(1);
  await act(async () => { appState('background'); });
  expect(remove).toHaveBeenCalledTimes(1);
  await act(async () => { appState('active'); emit(); });
  expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  expect(transport.publish).toHaveBeenCalledTimes(1);
});
it('removes a watcher resolving after unmount and ignores late callbacks', async () => {
  let resolve!: (s: Location.LocationSubscription) => void;
  const delayed = new Promise<Location.LocationSubscription>(r => { resolve = r; });
  jest.mocked(Location.watchPositionAsync).mockImplementation((_options, cb) => { fix = cb; return delayed; });
  await mount(); let starting!: Promise<boolean>;
  await act(async () => { starting = api.start(input); });
  await act(async () => { tree.unmount(); });
  await act(async () => { resolve({ remove }); await starting; emit(); });
  expect(remove).toHaveBeenCalledTimes(1); expect(transport.publish).not.toHaveBeenCalled();
});
it('clears the source on account switch and cannot publish an old-account fix', async () => {
  await mount(); await start();
  await act(async () => { tree.update(<Harness uid={other} />); });
  await act(async () => { emit(); });
  expect(remove).toHaveBeenCalledTimes(1); expect(transport.publish).not.toHaveBeenCalled();
  expect((await journal.list(user)).length).toBe(1);
});
it('rejects stale/future fixes and releases the owned watcher on a network failure', async () => {
  await mount(); await start();
  await act(async () => { emit(Date.now() - 10_001); emit(Date.now() + 1); });
  expect(transport.publish).not.toHaveBeenCalled();
  transport.publish.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { emit(); });
  expect(remove).toHaveBeenCalledTimes(1); expect(api.state.phase).toBe('stopped');
});
it('reports permission API failure without starting a server grant', async () => {
  await mount(); jest.mocked(Location.getForegroundPermissionsAsync).mockRejectedValueOnce(new Error('permission error'));
  await start(); expect(api.state.phase).toBe('error'); expect(transport.start).not.toHaveBeenCalled();
});

it('stops synchronously on known offline state and retries only revocation on reconnect', async () => {
  await mount(); await start(); transport.revoke.mockRejectedValueOnce(new Error('offline'));
  await act(async () => mockNetwork({ isConnected: false, isInternetReachable: null }));
  expect(remove).toHaveBeenCalledTimes(1); expect(api.state.phase).toBe('revoke_pending');
  await act(async () => mockNetwork({ isConnected: true, isInternetReachable: true }));
  expect(api.state.phase).toBe('stopped'); expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  expect(transport.start).toHaveBeenCalledTimes(1);
});
it('does not treat unknown connectivity as a definite disconnect', async () => {
  await mount(); await start();
  await act(async () => mockNetwork({ isConnected: null, isInternetReachable: null }));
  expect(remove).not.toHaveBeenCalled(); expect(api.state.phase).toBe('sharing');
});
it('invalidates an in-flight permission request on known offline state', async () => {
  let resolve!: (value: Location.LocationPermissionResponse) => void;
  jest.mocked(Location.getForegroundPermissionsAsync).mockReturnValue(new Promise(r => { resolve = r; }));
  await mount(); let pending!: Promise<boolean>;
  await act(async () => { pending = api.start(input); });
  await act(async () => mockNetwork({ isConnected: true, isInternetReachable: false }));
  await act(async () => { resolve({ status: 'granted' } as Location.LocationPermissionResponse); await pending; });
  expect(transport.start).not.toHaveBeenCalled(); expect(Location.watchPositionAsync).not.toHaveBeenCalled();
});
it('removes a pending watcher once it arrives after an offline notification', async () => {
  let resolve!: (value: Location.LocationSubscription) => void;
  jest.mocked(Location.watchPositionAsync).mockReturnValue(new Promise(r => { resolve = r; }));
  await mount(); let pending!: Promise<boolean>;
  await act(async () => { pending = api.start(input); });
  await act(async () => mockNetwork({ isConnected: false, isInternetReachable: false }));
  await act(async () => { resolve({ remove }); await pending; });
  expect(remove).toHaveBeenCalledTimes(1);
  expect(api.state.phase).not.toBe('sharing');
});
it('reports ACTIVE denial without starting GPS and still acknowledges the safe revocation', async () => {
  await mount(); transport.start.mockRejectedValueOnce(new Error('TRACKING_ACTIVE_REQUIRED'));
  await start();
  expect(api.state.issue).toBe('active_required');
  expect(api.state.phase).toBe('error');
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  expect(transport.revoke).toHaveBeenCalled();
  expect(await journal.list(user)).toEqual([]);
});

it('blocks the direct hook start before permissions and GPS while release is pending', async () => { mockReleaseReady=false; await mount(); await start(); expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled(); expect(Location.watchPositionAsync).not.toHaveBeenCalled(); expect(transport.start).not.toHaveBeenCalled(); });

describe('#142: erstes Einschalten mit Berechtigungsdialog', () => {
  const setAppState = (value: AppStateStatus) => Object.defineProperty(AppState, 'currentState', { configurable: true, value });
  const response = (status: string) => ({ status } as Location.LocationPermissionResponse);
  let answer: (value: Location.LocationPermissionResponse) => void, pending: Promise<LiveShareStartResult>;
  /** Berechtigung fehlt noch: der Systemdialog erscheint und legt die App wie auf Android in den Hintergrund. */
  async function openDialog(dialogState: AppStateStatus = 'background') {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(response('undetermined'));
    jest.mocked(Location.requestForegroundPermissionsAsync).mockReturnValue(new Promise(r => { answer = r; }));
    await mount();
    await act(async () => { pending = api.startResult(input); });
    await act(async () => { setAppState(dialogState); appState(dialogState); });
  }
  async function returnToApp() { await act(async () => { setAppState('active'); appState('active'); }); }

  it('Dialog → erlaubt → Teilen läuft beim ersten Versuch (Android: Dialog meldet background)', async () => {
    await openDialog();
    expect(api.state.preparing).toBe(true);
    // Android liefert die Antwort, bevor die App wieder als aktiv gemeldet wird.
    await act(async () => { answer(response('granted')); });
    expect(transport.start).not.toHaveBeenCalled();
    await returnToApp();
    let result!: LiveShareStartResult;
    await act(async () => { result = await pending; });
    expect(result).toBe('started');
    expect(api.state.phase).toBe('sharing'); expect(api.state.permissionDenied).toBe(false);
    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
    await act(async () => { emit(); }); expect(transport.publish).toHaveBeenCalledTimes(1);
  });
  it('Dialog → erlaubt → Teilen läuft, wenn die App schon vor der Antwort wieder aktiv ist', async () => {
    await openDialog(); await returnToApp();
    let result!: LiveShareStartResult;
    await act(async () => { answer(response('granted')); result = await pending; });
    expect(result).toBe('started'); expect(api.state.phase).toBe('sharing');
  });
  it('iOS: Dialog meldet inactive → erlaubt → Teilen läuft', async () => {
    await openDialog('inactive');
    await act(async () => { answer(response('granted')); });
    await returnToApp();
    let result!: LiveShareStartResult;
    await act(async () => { result = await pending; });
    expect(result).toBe('started'); expect(api.state.phase).toBe('sharing');
  });
  it('Dialog → verweigert → eigener Grund, Schalter bleibt aus, nichts wird gesendet', async () => {
    await openDialog();
    await act(async () => { answer(response('denied')); });
    await returnToApp();
    let result!: LiveShareStartResult;
    await act(async () => { result = await pending; });
    expect(result).toBe('permission_denied');
    expect(api.state.permissionDenied).toBe(true); expect(api.state.phase).toBe('idle'); expect(api.state.preparing).toBe(false);
    expect(transport.start).not.toHaveBeenCalled(); expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });
  it('start() meldet eine verweigerte Berechtigung weiterhin als false', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(response('denied'));
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(response('denied'));
    await mount(); let ok = true;
    await act(async () => { ok = await api.start(input); });
    expect(ok).toBe(false); expect(api.state.permissionDenied).toBe(true);
  });
  it('erlaubt, aber die App bleibt im Hintergrund → Teilen startet nicht', async () => {
    await openDialog();
    await act(async () => { answer(response('granted')); });
    await act(async () => { jest.advanceTimersByTime(PERMISSION_RESUME_TIMEOUT_MS); });
    let result!: LiveShareStartResult;
    await act(async () => { result = await pending; });
    expect(result).toBe('failed');
    expect(transport.start).not.toHaveBeenCalled(); expect(Location.watchPositionAsync).not.toHaveBeenCalled();
    expect(api.state.phase).not.toBe('sharing'); expect(api.state.preparing).toBe(false);
    // Spätere Rückkehr startet nichts nach; ein neuer Versuch ist möglich.
    await returnToApp();
    expect(transport.start).not.toHaveBeenCalled();
    await start(); expect(api.state.phase).toBe('sharing');
  });
  it('Stopp während des Dialogs bricht den Start ab', async () => {
    await openDialog();
    await act(async () => { await api.stop(); });
    await act(async () => { answer(response('granted')); });
    await returnToApp();
    let result!: LiveShareStartResult;
    await act(async () => { result = await pending; });
    expect(result).toBe('failed'); expect(transport.start).not.toHaveBeenCalled();
  });
  it('nach dem ersten Einschalten endet das Teilen weiterhin, wenn die App wirklich in den Hintergrund geht', async () => {
    await openDialog();
    await act(async () => { answer(response('granted')); });
    await returnToApp();
    await act(async () => { await pending; });
    expect(api.state.phase).toBe('sharing');
    await act(async () => { setAppState('background'); appState('background'); });
    expect(remove).toHaveBeenCalledTimes(1); expect(api.state.phase).not.toBe('sharing');
    expect(transport.revoke).toHaveBeenCalledTimes(1);
    await returnToApp(); await act(async () => { emit(); });
    expect(transport.publish).not.toHaveBeenCalled(); expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  });
  it('Hintergrund während der Vorbereitung ohne Dialog bricht den Start weiterhin ab', async () => {
    let resolve!: (value: Location.LocationPermissionResponse) => void;
    jest.mocked(Location.getForegroundPermissionsAsync).mockReturnValue(new Promise(r => { resolve = r; }));
    await mount(); let attempt!: Promise<boolean>;
    await act(async () => { attempt = api.start(input); });
    await act(async () => { setAppState('background'); appState('background'); });
    await returnToApp();
    await act(async () => { resolve(response('granted')); await attempt; });
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(transport.start).not.toHaveBeenCalled(); expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });
});

it('setzt die Anzeige beim Kontowechsel zurück und widerruft nichts für das alte Konto', async () => {
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
  await mount(); await start(); expect(api.state.permissionDenied).toBe(true);
  await act(async () => { tree.update(<Harness uid={other} />); });
  expect(api.state).toEqual({ phase: 'idle', issue: null, permissionDenied: false, preparing: false });
  expect(transport.revoke).not.toHaveBeenCalled();
});
