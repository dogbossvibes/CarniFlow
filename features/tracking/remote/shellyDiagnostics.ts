import { AppState, PermissionsAndroid, Platform } from 'react-native';
import type { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { acquireBleOperationLease, type BleOperationLease } from '@/lib/bleOperationLease';
import { BTHOME_SERVICE_UUID, decodeServiceData, parseBthomeButton, createButtonDeduplicator, type ButtonEvent } from './bthomeButton';

export interface ShellyDiagnosticDevice { id: string; name: string; lastReceivedAt: number; battery: number | null }
export interface ShellyDiagnosticsState {
  status: 'idle' | 'starting' | 'scanning' | 'stopping' | 'error'; error: string | null;
  devices: ShellyDiagnosticDevice[]; selectedId: string | null;
  packetCount: number; duplicateCount: number; invalidCount: number; stopRetryRequired: boolean;
  lastEvent: { button: ButtonEvent; receivedAt: number; packetId: number | null; withoutPacketId: boolean } | null;
}
type Scanner = Pick<BleManager, 'state' | 'onStateChange' | 'startDeviceScan' | 'stopDeviceScan'>;
export interface ShellyDiagnosticsDependencies {
  manager(): Scanner | null; permission(): Promise<boolean>;
  appState(): string | null; onAppState(fn: (value: string) => void): { remove(): void }; now(): number;
}
const INITIAL: ShellyDiagnosticsState = { status: 'idle', error: null, devices: [], selectedId: null, packetCount: 0, duplicateCount: 0, invalidCount: 0, stopRetryRequired: false, lastEvent: null };
export function createShellyDiagnostics(deps: ShellyDiagnosticsDependencies) {
  let snapshot = INITIAL, generation = 0, manager: Scanner | null = null;
  let lease: BleOperationLease | null = null, radioSub: Subscription | null = null, appSub: { remove(): void } | null = null;
  let scanStarted = false;
  let scanStart: Promise<void> | null = null, stopping: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const dedup = createButtonDeduplicator();
  const set = (patch: Partial<ShellyDiagnosticsState>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); };
  async function stop(error: string | null = null): Promise<void> {
    generation++;
    radioSub?.remove(); radioSub = null; appSub?.remove(); appSub = null;
    if (stopping) return stopping;
    const ownedLease = lease;
    if (!scanStarted) {
      lease = null; ownedLease?.release();
      set({ status: error ? 'error' : 'idle', error });
      return;
    }
    set({ status: 'stopping', error });
    // Keep ownership until the native start AND stop have settled. A late stop
    // must never cancel a newly acquired external GPS scan.
    stopping = (async () => {
      try {
        try { await scanStart; } catch { /* start failure still needs cleanup */ }
        await manager?.stopDeviceScan();
        scanStarted = false; lease = null; ownedLease?.release();
        set({ status: error ? 'error' : 'idle', error, stopRetryRequired: false });
      } catch {
        // Native state is uncertain: retain ownership; explicit stop can retry.
        set({ status: 'error', stopRetryRequired: true, error: 'Bluetooth-Scan konnte nicht beendet werden. Diagnose erneut stoppen.' });
      } finally { stopping = null; }
    })();
    return stopping;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    select: (id: string) => { if (snapshot.devices.some(d => d.id === id)) set({ selectedId: id, lastEvent: null, packetCount: 0, duplicateCount: 0, invalidCount: 0 }); },
    stop: () => stop(),
    async start() {
      if (lease || stopping || snapshot.status === 'starting' || snapshot.status === 'scanning') return;
      lease = acquireBleOperationLease('shelly-diagnostics');
      if (!lease) { set({ status: 'error', error: 'Externes GPS oder eine andere Bluetooth-Diagnose ist aktiv.' }); return; }
      const id = ++generation;
      const current = () => generation === id;
      dedup.reset();
      set({ ...INITIAL, status: 'starting' });
      try {
        appSub = deps.onAppState(value => { if (current() && value !== 'active') void stop('Diagnose bei App-Wechsel pausiert. Im Vordergrund erneut starten.'); });
        if (deps.appState() !== 'active') { void stop('Diagnose bitte im Vordergrund starten.'); return; }
        if (!(await deps.permission())) { if (current()) void stop('Bluetooth-Berechtigung fehlt.'); return; }
        if (!current()) return;
        manager = deps.manager();
        if (!manager) { void stop('Bluetooth-Modul nicht verfügbar. Ein passendes Binary ist erforderlich.'); return; }
        if ((await manager.state()) !== 'PoweredOn') { if (current()) void stop('Bluetooth ist nicht eingeschaltet.'); return; }
        if (!current()) return;
        radioSub = manager.onStateChange(value => { if (current() && value !== 'PoweredOn') void stop('Bluetooth wurde deaktiviert.'); }, false);
        if (!current()) { radioSub?.remove(); radioSub = null; return; }
        scanStarted = true;
        set({ status: 'scanning', error: null });
        scanStart = Promise.resolve().then(() => manager!.startDeviceScan([BTHOME_SERVICE_UUID], { allowDuplicates: true }, (error, device: Device | null) => {
          if (!current()) return;
          if (error) { void stop('Bluetooth-Scan fehlgeschlagen. Bitte erneut versuchen.'); return; }
          if (!device) return;
          const data = Object.entries(device.serviceData ?? {}).find(([uuid]) => uuid.toLowerCase() === BTHOME_SERVICE_UUID || uuid.toLowerCase() === 'fcd2')?.[1];
          if (!data) return;
          const bytes = decodeServiceData(data);
          const packet = bytes ? parseBthomeButton(bytes) : { ok: false as const, reason: 'malformed' };
          const now = deps.now();
          const name = device.name || device.localName || 'BTHome-Gerät';
          // Prototype candidate only; arbitrary BTHome devices never trigger tracking.
          const existing = snapshot.devices.find(d => d.id === device.id);
          const row = { id: device.id, name, lastReceivedAt: now, battery: packet.ok ? packet.battery ?? existing?.battery ?? null : existing?.battery ?? null };
          set({ devices: [...snapshot.devices.filter(d => d.id !== device.id), row].slice(-20) });
          if (device.id !== snapshot.selectedId) return;
          set({ packetCount: snapshot.packetCount + 1 });
          if (!packet.ok) { set({ invalidCount: snapshot.invalidCount + 1, error: `Paket nicht auswertbar: ${packet.reason}` }); return; }
          if (dedup.duplicate(device.id, packet, now)) { set({ duplicateCount: snapshot.duplicateCount + 1 }); return; }
          set({ error: null });
          if (packet.button != null) set({ lastEvent: { button: packet.button, receivedAt: now, packetId: packet.packetId, withoutPacketId: packet.packetId == null } });
        }));
        await scanStart;
      } catch {
        if (current()) void stop('Bluetooth-Diagnose konnte nicht gestartet werden.');
      }
    },
  };
}

let nativeManager: BleManager | null = null;
export const shellyDiagnostics = createShellyDiagnostics({
  manager: () => {
    if (nativeManager) return nativeManager;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BleManager: Manager } = require('react-native-ble-plx') as typeof import('react-native-ble-plx');
      nativeManager = new Manager(); return nativeManager;
    } catch { return null; }
  },
  permission: async () => {
    if (Platform.OS !== 'android') return Platform.OS === 'ios';
    const permissions = Number(Platform.Version) >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    try { const results = await PermissionsAndroid.requestMultiple(permissions); return permissions.every(p => results[p] === PermissionsAndroid.RESULTS.GRANTED); }
    catch { return false; }
  },
  appState: () => AppState.currentState,
  onAppState: fn => AppState.addEventListener('change', fn),
  now: Date.now,
});
