import { startScan, stopScan, connectDevice, disconnectDevice } from '../externalGps';
import { acquireBleOperationLease, getBleOperationOwner } from '../bleOperationLease';
import { getRecordedPoints, resetRecorder, isExternalMode } from '../trackRecorder';
const mockManager = { startDeviceScan: jest.fn(async () => {}), stopDeviceScan: jest.fn(async () => {}), connectToDevice: jest.fn(), cancelDeviceConnection: jest.fn(async () => {}) };
jest.mock('react-native-ble-plx', () => ({ BleManager: jest.fn(() => mockManager) }));
let notify: (error: unknown, value: { value: string }) => void;
const remove = jest.fn();
const device = () => ({ discoverAllServicesAndCharacteristics: async () => {}, services: async () => [{ characteristics: async () => [{ isNotifiable: true, monitor: (fn: typeof notify) => { notify = fn; return { remove }; } }] }], onDisconnected: jest.fn() });
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(a => { resolve = a; }); return { promise, resolve }; }
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
beforeEach(() => { jest.clearAllMocks(); resetRecorder(); mockManager.stopDeviceScan.mockResolvedValue(undefined); mockManager.cancelDeviceConnection.mockResolvedValue(undefined); mockManager.connectToDevice.mockResolvedValue(device()); });
afterEach(async () => { mockManager.stopDeviceScan.mockResolvedValue(undefined); mockManager.cancelDeviceConnection.mockResolvedValue(undefined); await disconnectDevice(); await stopScan(); });
it('does not start or stop a Shelly-owned scan', async () => {
  const shelly = acquireBleOperationLease('shelly-diagnostics')!;
  await startScan(); await stopScan(); expect(mockManager.startDeviceScan).not.toHaveBeenCalled(); expect(mockManager.stopDeviceScan).not.toHaveBeenCalled(); shelly.release();
});
it('retains GPS ownership while async native stop settles', async () => {
  await startScan(); const stop = deferred<void>(); mockManager.stopDeviceScan.mockReturnValueOnce(stop.promise);
  const stopping = stopScan(); await flush(); expect(acquireBleOperationLease('shelly-diagnostics')).toBeNull(); stop.resolve(); await stopping; expect(getBleOperationOwner()).toBeNull();
});
it('keeps ownership from scan through connection and external NMEA continues unaffected', async () => {
  await startScan(); const pending = deferred<ReturnType<typeof device>>(); mockManager.connectToDevice.mockReturnValueOnce(pending.promise);
  const connecting = connectDevice('gps'); await flush(); expect(acquireBleOperationLease('shelly-diagnostics')).toBeNull();
  pending.resolve(device()); await connecting; expect(isExternalMode()).toBe(true); expect(acquireBleOperationLease('shelly-diagnostics')).toBeNull();
  notify(null, { value: 'JEdQR0dBLDEyMzUxOSw0ODA3LjAzOCxOLDExMzEuMDAwLEUsMSwwOCwwLjksNTQ1LjQsTSw0Ni45LE0sLCoyDQo=' });
  expect(getRecordedPoints()).toHaveLength(1); expect(getRecordedPoints()[0].lat).toBeCloseTo(48.1173, 8); expect(getRecordedPoints()[0].accuracy_m).toBe(4.5);
  await disconnectDevice(); expect(remove).toHaveBeenCalledTimes(1); expect(isExternalMode()).toBe(false); expect(getBleOperationOwner()).toBeNull();
});
it('disconnect waits for a late connection start and cancels it before releasing ownership', async () => {
  const pending = deferred<ReturnType<typeof device>>(); mockManager.connectToDevice.mockReturnValueOnce(pending.promise);
  const connecting = connectDevice('gps'); await flush(); const disconnecting = disconnectDevice(); await flush(); expect(acquireBleOperationLease('shelly-diagnostics')).toBeNull();
  pending.resolve(device()); await connecting; await disconnecting;
  expect(mockManager.cancelDeviceConnection).toHaveBeenCalledWith('gps'); expect(isExternalMode()).toBe(false); expect(getBleOperationOwner()).toBeNull();
});
it('failed stop retains lease until a successful retry', async () => {
  await startScan(); mockManager.stopDeviceScan.mockRejectedValueOnce(new Error('stop'));
  expect(await stopScan()).toBe(false); expect(acquireBleOperationLease('shelly-diagnostics')).toBeNull(); expect(await stopScan()).toBe(true); expect(getBleOperationOwner()).toBeNull();
});

it('duplicate disconnect calls share cleanup and cannot release ownership early', async () => {
  await connectDevice('gps'); const canceled = deferred<void>(); mockManager.cancelDeviceConnection.mockReturnValueOnce(canceled.promise);
  const first = disconnectDevice(), second = disconnectDevice(); expect(first).toBe(second); await flush();
  expect(acquireBleOperationLease('shelly-diagnostics')).toBeNull(); expect(mockManager.cancelDeviceConnection).toHaveBeenCalledTimes(1);
  canceled.resolve(); await first; expect(getBleOperationOwner()).toBeNull();
});
