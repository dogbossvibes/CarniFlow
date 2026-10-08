import { createShellyDiagnostics } from '../shellyDiagnostics';
import { acquireBleOperationLease, getBleOperationOwner } from '@/lib/bleOperationLease';
import { BTHOME_SERVICE_UUID } from '../bthomeButton';
import type { Device, BleError, State, ScanOptions } from 'react-native-ble-plx';
function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup() {
  let callback!: (error: BleError | null, device: Device | null) => void, app!: (state: string) => void, radio!: (state: State) => void;
  const removeRadio = jest.fn(), removeApp = jest.fn();
  const scanner = { state: jest.fn(async () => 'PoweredOn' as State), onStateChange: jest.fn((fn: (state: State) => void) => { radio = fn; return { remove: removeRadio }; }),
    startDeviceScan: jest.fn(async (_uuids: string[] | null, _opts: ScanOptions | null, fn: typeof callback) => { callback = fn; }), stopDeviceScan: jest.fn(async () => {}) };
  const deps = { manager: jest.fn(() => scanner), permission: jest.fn(async () => true), appState: () => 'active', onAppState: (fn: (state: string) => void) => { app = fn; return { remove: removeApp }; }, now: () => 1000 };
  const service = createShellyDiagnostics(deps);
  const receive = (id = 'shelly', base64 = 'RAABAVA6AQ==') => callback(null, { id, name: 'Shelly BLU', serviceData: { [BTHOME_SERVICE_UUID]: base64 } } as unknown as Device);
  return { service, deps, scanner, receive, removeRadio, removeApp, app: (s: string) => app(s), radio: (s: State) => radio(s), fail: () => callback({ message: 'scan failed' } as BleError, null) };
}
it('refuses diagnostics while external GPS owns BLE and never stops a foreign scan', async () => {
  const gps = acquireBleOperationLease('external-gps')!; const t = setup();
  await t.service.start(); await t.service.stop();
  expect(t.service.getSnapshot().status).toBe('idle'); expect(t.deps.manager).not.toHaveBeenCalled(); expect(t.scanner.stopDeviceScan).not.toHaveBeenCalled(); gps.release();
});
it('cancels permission-wait startup without starting a late scan', async () => {
  const t = setup(), permission = deferred<boolean>(); t.deps.permission.mockReturnValue(permission.promise);
  const started = t.service.start(); await t.service.stop(); permission.resolve(true); await started;
  expect(t.scanner.startDeviceScan).not.toHaveBeenCalled(); expect(getBleOperationOwner()).toBeNull();
});
it.each(['permission', 'radio', 'module'])('handles unavailable %s without stopping any native scan', async reason => {
  const t = setup();
  if (reason === 'permission') t.deps.permission.mockResolvedValue(false);
  if (reason === 'radio') t.scanner.state.mockResolvedValue('PoweredOff' as State);
  if (reason === 'module') t.deps.manager.mockReturnValue(null as never);
  await t.service.start(); expect(t.service.getSnapshot().status).toBe('error'); expect(getBleOperationOwner()).toBeNull(); expect(t.scanner.stopDeviceScan).not.toHaveBeenCalled();
});
it('observes selected packets only, suppresses duplicate advertisements and reports unsupported encrypted data', async () => {
  const t = setup(); await t.service.start(); t.receive(); t.service.select('shelly');
  t.receive(); t.receive(); t.receive('other'); t.receive('shelly', 'RT oB'.replace(' ', ''));
  expect(t.service.getSnapshot()).toMatchObject({ packetCount: 3, duplicateCount: 1, invalidCount: 1, lastEvent: { button: 1, packetId: 1, receivedAt: 1000 } });
  const snapshot = t.service.getSnapshot(); await t.service.stop(); t.receive(); expect(t.service.getSnapshot().packetCount).toBe(snapshot.packetCount);
});
it.each(['app', 'radio', 'scan'])('stops own scan on %s failure and removes subscriptions', async trigger => {
  const t = setup(); await t.service.start();
  if (trigger === 'app') t.app('background'); if (trigger === 'radio') t.radio('PoweredOff' as State); if (trigger === 'scan') t.fail();
  await flush(); expect(t.scanner.stopDeviceScan).toHaveBeenCalledTimes(1); expect(t.removeRadio).toHaveBeenCalledTimes(1); expect(t.removeApp).toHaveBeenCalledTimes(1); expect(getBleOperationOwner()).toBeNull(); expect(t.service.getSnapshot().status).toBe('error');
});
it('retains ownership until late native start and stop both settle; repeated stop is idempotent', async () => {
  const t = setup(), start = deferred<void>(), stop = deferred<void>();
  t.scanner.startDeviceScan.mockImplementation(() => start.promise); t.scanner.stopDeviceScan.mockReturnValue(stop.promise);
  const starting = t.service.start(); await flush(); const stopping = t.service.stop(); const duplicateStop = t.service.stop();
  expect(acquireBleOperationLease('external-gps')).toBeNull(); expect(t.scanner.stopDeviceScan).not.toHaveBeenCalled();
  start.resolve(); await starting; await flush(); expect(t.scanner.stopDeviceScan).toHaveBeenCalledTimes(1); expect(acquireBleOperationLease('external-gps')).toBeNull();
  stop.resolve(); await stopping; await duplicateStop; expect(getBleOperationOwner()).toBeNull();
});
it('keeps uncertain failed-stop ownership until explicit cleanup succeeds', async () => {
  const t = setup(); await t.service.start(); t.scanner.stopDeviceScan.mockRejectedValueOnce(new Error('native stop'));
  await t.service.stop(); expect(t.service.getSnapshot().stopRetryRequired).toBe(true); expect(acquireBleOperationLease('external-gps')).toBeNull();
  await t.service.stop(); expect(getBleOperationOwner()).toBeNull(); expect(t.service.getSnapshot().stopRetryRequired).toBe(false);
});
it('handles rejected native scan startup without unhandled rejection', async () => {
  const t = setup(); t.scanner.startDeviceScan.mockRejectedValue(new Error('native start'));
  await t.service.start(); await flush(); expect(t.service.getSnapshot().status).toBe('error'); expect(t.scanner.stopDeviceScan).toHaveBeenCalledTimes(1); expect(getBleOperationOwner()).toBeNull();
});
