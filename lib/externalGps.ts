import { useSyncExternalStore } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { pushPoint, setExternalMode } from '@/lib/trackRecorder';
import { acquireBleOperationLease, type BleOperationLease } from './bleOperationLease';

// Externes Bluetooth-GPS. react-native-ble-plx ist nativ → defensiv laden, damit
// ein Dev-Client ohne das Modul nicht crasht (dann ist BLE_AVAILABLE = false).
// Generischer NMEA-über-Notify-Reader: funktioniert mit GPS-Empfängern, die NMEA
// streamen. Geräte mit proprietärem Protokoll (z. B. Bad Elf) brauchen die
// MFi-Kopplung in den iOS-Einstellungen (systemweit, ohne Code).
let BlePlx: typeof import('react-native-ble-plx') | null = null;
try { BlePlx = require('react-native-ble-plx'); } catch { BlePlx = null; }
export const BLE_AVAILABLE = BlePlx != null;

export interface GpsDevice { id: string; name: string; }
export interface BleState {
  scanning:    boolean;
  devices:     GpsDevice[];
  connectedId: string | null;
  status:      'idle' | 'scanning' | 'connecting' | 'connected' | 'error';
  error:       string | null;
}

let state: BleState = { scanning: false, devices: [], connectedId: null, status: 'idle', error: null };
const listeners = new Set<() => void>();
function emit() { state = { ...state }; for (const l of listeners) l(); }
function set(p: Partial<BleState>) { state = { ...state, ...p }; emit(); }

let manager: InstanceType<NonNullable<typeof BlePlx>['BleManager']> | null = null;
function getManager() {
  if (!BlePlx) return null;
  if (!manager) manager = new BlePlx.BleManager();
  return manager;
}

// ── base64 → ASCII (NMEA ist ASCII) ──
function b64ToAscii(b64: string): string {
  if (typeof atob === 'function') return atob(b64);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let out = '';
  let buffer = 0, bits = 0;
  for (const ch of b64) {
    const i = chars.indexOf(ch);
    if (i < 0 || ch === '=') continue;
    buffer = (buffer << 6) | i; bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buffer >> bits) & 0xff); }
  }
  return out;
}

// ── NMEA-Parsing ──
let nmeaBuf = '';
let lastPush = 0;
function maybePush(lat: number, lng: number, acc: number | null) {
  const now = Date.now();
  if (now - lastPush < 900) return;   // GGA+RMC entprellen → max ~1 Punkt/s
  lastPush = now;
  pushPoint(lat, lng, acc);
}
function nmeaCoord(val: string, hemi: string): number | null {
  const v = parseFloat(val);
  if (!Number.isFinite(v)) return null;
  const deg = Math.floor(v / 100);
  const min = v - deg * 100;
  let dec = deg + min / 60;
  if (hemi === 'S' || hemi === 'W') dec = -dec;
  return dec;
}
function parseNmea(line: string) {
  if (!line.startsWith('$')) return;
  const f = line.split('*')[0].split(',');
  const type = f[0].slice(3);
  if (type === 'GGA') {
    const lat = nmeaCoord(f[2], f[3]);
    const lng = nmeaCoord(f[4], f[5]);
    const hdop = parseFloat(f[8]);
    if (lat != null && lng != null && f[6] !== '0') maybePush(lat, lng, Number.isFinite(hdop) ? hdop * 5 : null);
  } else if (type === 'RMC') {
    const lat = nmeaCoord(f[3], f[4]);
    const lng = nmeaCoord(f[5], f[6]);
    if (f[2] === 'A' && lat != null && lng != null) maybePush(lat, lng, null);
  }
}
function feedNmea(chunk: string) {
  nmeaBuf += chunk;
  const lines = nmeaBuf.split(/\r?\n/);
  nmeaBuf = lines.pop() ?? '';
  for (const line of lines) parseNmea(line.trim());
}

// ── Android-Berechtigungen ──
async function ensureAndroidPerms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const res = await PermissionsAndroid.requestMultiple([
      'android.permission.BLUETOOTH_SCAN' as any,
      'android.permission.BLUETOOTH_CONNECT' as any,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return Object.values(res).every(v => v === 'granted');
  } catch { return false; }
}

let operationLease: BleOperationLease | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let scanGeneration = 0, scanPending = false, scanRunning = false;
let scanStart: Promise<void> | null = null, scanStopping: Promise<boolean> | null = null;
function claimGps(): boolean {
  operationLease ??= acquireBleOperationLease('external-gps');
  return operationLease != null;
}
function releaseGpsIfIdle(): void {
  if (!disconnecting && !pendingConnectionId && !scanPending && !scanRunning && !scanStopping && !state.scanning && state.status !== 'connecting' && !state.connectedId) {
    operationLease?.release(); operationLease = null;
  }
}

// ── Öffentliche API ──
export async function startScan() {
  if (disconnecting || state.status === 'connecting' || state.connectedId) return;
  const m = getManager();
  if (!m) { set({ status: 'error', error: 'Bluetooth nicht verfügbar (neuer Build nötig).' }); return; }
  if (!(await stopScan())) return;
  if (!claimGps()) { set({ status: 'error', error: 'Bluetooth-Diagnose läuft. Bitte zuerst beenden.' }); return; }
  const id = ++scanGeneration;
  scanPending = true;
  if (!(await ensureAndroidPerms())) {
    if (id !== scanGeneration) return;
    scanPending = false;
    set({ status: 'error', error: 'Bluetooth-Berechtigung fehlt.' }); releaseGpsIfIdle(); return;
  }
  if (id !== scanGeneration) return;
  scanPending = false; scanRunning = true;
  set({ scanning: true, status: 'scanning', devices: [], error: null });
  try {
    scanStart = Promise.resolve().then(() => m.startDeviceScan(null, null, (error, device) => {
      if (id !== scanGeneration) return;
      if (error) { void stopScan(); set({ status: 'error', error: error.message }); return; }
      if (!device) return;
      const name = device.name || device.localName || '';
      if (name && /gps|elf|garmin|dual|gnss|glo|bt-?\d+/i.test(name)) {
        if (!state.devices.some(d => d.id === device.id)) set({ devices: [...state.devices, { id: device.id, name }] });
      }
    }));
    await scanStart;
    if (id === scanGeneration) scanTimer = setTimeout(() => { void stopScan(); }, 12000);
  } catch (error) {
    if (id !== scanGeneration) return;
    void stopScan();
    set({ status: 'error', error: error instanceof Error ? error.message : 'Bluetooth-Scan fehlgeschlagen.' });
  }
}

export async function stopScan(): Promise<boolean> {
  scanGeneration++; scanPending = false;
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  if (scanStopping) return scanStopping;
  if (state.scanning) set({ scanning: false, status: state.status === 'connecting' ? 'connecting' : state.connectedId ? 'connected' : 'idle' });
  if (!scanRunning) { releaseGpsIfIdle(); return true; }
  scanStopping = (async () => {
    try {
      try { await scanStart; } catch { /* failed starts still need cleanup */ }
      await getManager()?.stopDeviceScan();
      scanRunning = false;
      return true;
    } catch {
      set({ status: 'error', error: 'Bluetooth-Scan konnte nicht beendet werden. Bitte erneut stoppen.' });
      return false;
    } finally { scanStopping = null; releaseGpsIfIdle(); }
  })();
  return scanStopping;
}

let pendingConnectionId: string | null = null;
let connectionGeneration = 0;
let disconnecting: Promise<void> | null = null;
let connectionStart: ReturnType<NonNullable<typeof BlePlx>['BleManager']['prototype']['connectToDevice']> | null = null;
const monitorSubs: { remove: () => void }[] = [];
function removeMonitors() { for (const sub of monitorSubs.splice(0)) sub.remove(); }

export async function connectDevice(id: string) {
  const m = getManager();
  if (!m || disconnecting || pendingConnectionId || state.connectedId) return;
  if (!claimGps()) { set({ status: 'error', error: 'Bluetooth-Diagnose läuft. Bitte zuerst beenden.' }); return; }
  const attempt = ++connectionGeneration;
  pendingConnectionId = id; connectionStart = null;
  set({ status: 'connecting', error: null });
  if (!(await stopScan())) { pendingConnectionId = null; return; }
  if (attempt !== connectionGeneration) return;
  let connected = false;
  try {
    connectionStart = m.connectToDevice(id, { timeout: 10000 });
    const dev = await connectionStart;
    connected = true;
    if (attempt !== connectionGeneration) return; // disconnect owns late-start cleanup
    await dev.discoverAllServicesAndCharacteristics();
    const services = await dev.services();
    for (const svc of services) {
      const chars = await svc.characteristics();
      if (attempt !== connectionGeneration) return; // disconnect owns late-start cleanup
      for (const ch of chars) {
        if (ch.isNotifiable) monitorSubs.push(ch.monitor((err, c) => {
          if (attempt !== connectionGeneration || err || !c?.value) return;
          feedNmea(b64ToAscii(c.value));
        }));
      }
    }
    if (!monitorSubs.length) throw new Error('Keine lesbare GPS-Charakteristik gefunden.');
    pendingConnectionId = null;
    setExternalMode(true);
    set({ connectedId: id, status: 'connected' });
    dev.onDisconnected(() => {
      if (attempt !== connectionGeneration) return;
      connectionGeneration++; removeMonitors();
      setExternalMode(false); set({ connectedId: null, status: 'idle' }); releaseGpsIfIdle();
    });
  } catch (e) {
    if (attempt !== connectionGeneration) return;
    removeMonitors();
    if (connected) {
      try { await m.cancelDeviceConnection(id); }
      catch { if (attempt === connectionGeneration) set({ connectedId: id }); } // retain ownership until explicit disconnect
    }
    if (attempt !== connectionGeneration) return;
    pendingConnectionId = null;
    set({ status: 'error', error: e instanceof Error ? e.message : 'Verbindung fehlgeschlagen.' });
    releaseGpsIfIdle();
  }
}

export function disconnectDevice(): Promise<void> {
  if (disconnecting) return disconnecting;
  disconnecting = Promise.resolve().then(async () => {
  connectionGeneration++;
  const id = state.connectedId ?? pendingConnectionId;
  removeMonitors();
  const m = getManager();
  if (id && m && (state.connectedId || connectionStart)) {
    try {
      try { await connectionStart; } catch { /* no established connection */ }
      await m.cancelDeviceConnection(id);
    }
    catch {
      // Do not release an uncertain native connection to a diagnostic scan.
      pendingConnectionId = null; setExternalMode(false);
      set({ connectedId: id, status: 'error', error: 'Bluetooth-Verbindung konnte nicht beendet werden. Bitte erneut trennen.' });
      return;
    }
  }
  pendingConnectionId = null; connectionStart = null;
  setExternalMode(false);
  set({ connectedId: null, status: 'idle' });
  releaseGpsIfIdle();
  }).finally(() => { disconnecting = null; releaseGpsIfIdle(); });
  return disconnecting;
}

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
function getSnapshot() { return state; }
export function useExternalGps(): BleState { return useSyncExternalStore(subscribe, getSnapshot, getSnapshot); }
