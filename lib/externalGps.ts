import { useSyncExternalStore } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { pushPoint, setExternalMode } from '@/lib/trackRecorder';

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

// ── Öffentliche API ──
export async function startScan() {
  const m = getManager();
  if (!m) { set({ status: 'error', error: 'Bluetooth nicht verfügbar (neuer Build nötig).' }); return; }
  if (!(await ensureAndroidPerms())) { set({ status: 'error', error: 'Bluetooth-Berechtigung fehlt.' }); return; }

  set({ scanning: true, status: 'scanning', devices: [], error: null });
  m.startDeviceScan(null, null, (error, device) => {
    if (error) { set({ scanning: false, status: 'error', error: error.message }); return; }
    if (!device) return;
    const name = device.name || device.localName || '';
    if (name && /gps|elf|garmin|dual|gnss|glo|bt-?\d+/i.test(name)) {
      if (!state.devices.some(d => d.id === device.id)) {
        set({ devices: [...state.devices, { id: device.id, name }] });
      }
    }
  });
  setTimeout(stopScan, 12000);
}

export function stopScan() {
  getManager()?.stopDeviceScan();
  if (state.scanning) set({ scanning: false, status: state.connectedId ? 'connected' : 'idle' });
}

let monitorSub: { remove: () => void } | null = null;

export async function connectDevice(id: string) {
  const m = getManager();
  if (!m) return;
  stopScan();
  set({ status: 'connecting', error: null });
  try {
    const dev = await m.connectToDevice(id, { timeout: 10000 });
    await dev.discoverAllServicesAndCharacteristics();
    const services = await dev.services();
    let subscribed = false;
    for (const svc of services) {
      const chars = await svc.characteristics();
      for (const ch of chars) {
        if (ch.isNotifiable) {
          monitorSub = ch.monitor((err, c) => {
            if (err || !c?.value) return;
            feedNmea(b64ToAscii(c.value));
          });
          subscribed = true;
        }
      }
    }
    if (!subscribed) { set({ status: 'error', error: 'Keine lesbare GPS-Charakteristik gefunden.' }); return; }
    setExternalMode(true);
    set({ connectedId: id, status: 'connected' });
    dev.onDisconnected(() => { setExternalMode(false); set({ connectedId: null, status: 'idle' }); });
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : 'Verbindung fehlgeschlagen.' });
  }
}

export async function disconnectDevice() {
  monitorSub?.remove();
  monitorSub = null;
  const m = getManager();
  if (state.connectedId && m) { try { await m.cancelDeviceConnection(state.connectedId); } catch { /* egal */ } }
  setExternalMode(false);
  set({ connectedId: null, status: 'idle' });
}

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
function getSnapshot() { return state; }
export function useExternalGps(): BleState { return useSyncExternalStore(subscribe, getSnapshot, getSnapshot); }
