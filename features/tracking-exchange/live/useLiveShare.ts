/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect -- Altbestand (bereits im Live-Stand 072b3b07), bewusst unveraendert; nur Kommentar, keine Verhaltensaenderung. */
import { isLiveShareReleaseReady } from './releaseGate';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { LiveShareController, type LiveShareTransport, type ShareState, type StartShare } from './liveShareController';
import { RevocationJournal } from './revocationJournal';
import { loadHomeZones } from '@/features/home-zone/store';
import { insideHomeZone } from '@/features/home-zone/zones';

/** homeZonePaused: Position liegt in der Heimzone (Issue #115) und wird nicht gesendet. */
export type LiveShareUiState = ShareState & { permissionDenied: boolean; preparing: boolean; homeZonePaused?: boolean };
const IDLE: LiveShareUiState = { phase: 'idle', issue: null, permissionDenied: false, preparing: false };
/** permission_denied: Standortzugriff verweigert; failed: jeder andere Grund (auch Abbruch). */
export type LiveShareStartResult = 'started' | 'permission_denied' | 'failed';
/** So lange darf die App nach dem Berechtigungsdialog brauchen, um wieder aktiv zu sein (#142). */
export const PERMISSION_RESUME_TIMEOUT_MS = 3_000;

/** Mount once in a session-scoped provider. Navigation may keep this provider
 * mounted; app background/unmount always ends sending. Only its own foreground
 * subscription is removed, never the recorder's native/background location owner.
 */
export function useLiveShare(userId: string | null, transport: LiveShareTransport, journal: RevocationJournal) {
  const [state, setState] = useState<LiveShareUiState>(IDLE);
  // Wechselt Konto, Transport oder Journal, beginnt die Anzeige neu bei IDLE. Das geschieht
  // beim Rendern (nicht im Effekt), damit kein Zustand des alten Kontos sichtbar wird.
  const [scope, setScope] = useState({ userId, transport, journal });
  if (scope.userId !== userId || scope.transport !== transport || scope.journal !== journal) {
    setScope({ userId, transport, journal });
    setState(IDLE);
  }
  // Layout-Effekt: läuft vor dem Aufräumen des alten Controllers, der damit schon das neue
  // Konto sieht und nichts mehr für das alte widerruft oder sendet.
  const owner = useRef(userId);
  useLayoutEffect(() => { owner.current = userId; }, [userId]);
  const controller = useRef<LiveShareController | null>(null);
  const source = useRef<Location.LocationSubscription | null>(null);
  const generation = useRef(0);
  const preparing = useRef(false);
  const online = useRef<boolean | null>(null);
  // #142: Der Systemdialog für die Standortberechtigung legt die App auf Android kurz in den
  // Hintergrund. Solange er offen ist, wird noch nichts gesendet; dieser Wechsel bricht den
  // Start deshalb nicht ab. Danach muss die App wieder aktiv sein, sonst startet nichts.
  const permissionPrompt = useRef(false);
  const resumed = useRef<((active: boolean) => void) | null>(null);
  const releaseSource = useCallback(() => {
    const current = source.current; source.current = null; current?.remove();
  }, []);
  const stop = useCallback((issue: ShareState['issue'] = null) => {
    generation.current++; preparing.current = false; releaseSource();
    resumed.current?.(false);
    setState(s => ({ ...s, preparing: false }));
    return controller.current?.stop(issue) ?? Promise.resolve();
  }, [releaseSource]);

  useEffect(() => {
    const instance = new LiveShareController(transport, journal, () => owner.current,
      () => performance.now(), next => {
        if (controller.current !== instance) return;
        if (next.phase !== 'sharing' && next.phase !== 'starting') releaseSource();
        setState({ ...next, preparing: false, permissionDenied: false });
      });
    controller.current = instance;
    if (userId) void instance.retryPending();
    const listener = AppState.addEventListener('change', next => {
      // Permission UI may temporarily be inactive before a grant exists.
      if (next === 'background' || (next === 'inactive' && instance.snapshot.phase === 'sharing')) {
        if (permissionPrompt.current) return; // nur der Berechtigungsdialog, es läuft noch kein Teilen
        void stop();
      } else if (next === 'active') {
        if (userId) void instance.retryPending();
        resumed.current?.(true);
      }
    });
    const network = NetInfo.addEventListener(status => {
      if (status.isConnected === false || status.isInternetReachable === false) {
        online.current = false; void stop('connection');
      } else if (status.isConnected === true) {
        online.current = true;
        if (AppState.currentState === 'active' && userId) void instance.retryPending();
      }
    });
    const timer = setInterval(() => instance.tick(), 1000);
    const cleanup = () => {
      listener.remove(); network(); clearInterval(timer);
      generation.current++; preparing.current = false; resumed.current?.(false);
      if (controller.current === instance) controller.current = null;
      releaseSource(); instance.dispose();
    };
    return cleanup;
  }, [userId, transport, journal, releaseSource, stop]);

  const attempt = useCallback(async (input: StartShare, denied: () => void): Promise<boolean> => {
    if (!isLiveShareReleaseReady()) return false;
    const instance = controller.current;
    if (!instance || preparing.current || input.userId !== owner.current || AppState.currentState !== 'active') return false;
    if (online.current === false) {
      setState({ ...IDLE, phase: 'error', issue: 'connection' }); return false;
    }
    const initial = instance.snapshot;
    if (initial.phase === 'sharing' || initial.phase === 'starting') return false;
    const token = ++generation.current;
    const current = () => token === generation.current && controller.current === instance
      && input.userId === owner.current && AppState.currentState === 'active';
    preparing.current = true;
    setState(s => ({ ...s, preparing: true, permissionDenied: false }));
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!current()) return false;
      if (permission.status !== 'granted') {
        // Gleicher Versuch, gleiches Konto, nicht gestoppt; der App-Zustand zählt erst nach dem Dialog.
        const sameAttempt = () => token === generation.current && controller.current === instance
          && input.userId === owner.current;
        permissionPrompt.current = true;
        try {
          permission = await Location.requestForegroundPermissionsAsync();
          if (!sameAttempt()) return false;
          if (permission.status !== 'granted') {
            denied(); setState({ ...IDLE, permissionDenied: true }); return false;
          }
          // Die Antwort kann vor der Rückkehr in den Vordergrund eintreffen: kurz darauf warten.
          // Bleibt die App im Hintergrund, startet das Teilen nicht.
          if (AppState.currentState !== 'active' && !await new Promise<boolean>(resolve => {
            const done = (active: boolean) => { clearTimeout(timer); resumed.current = null; resolve(active); };
            const timer = setTimeout(() => done(false), PERMISSION_RESUME_TIMEOUT_MS);
            resumed.current = done;
          })) return false;
        } finally { permissionPrompt.current = false; }
      }
      if (!current()) return false;
      // Heimzone: Zonen vor dem ersten Senden lesen. Nicht lesbar = nicht starten.
      let zones: Awaited<ReturnType<typeof loadHomeZones>>;
      try { zones = await loadHomeZones(); }
      catch { if (current()) setState({ ...IDLE, phase: 'error', issue: 'storage' }); return false; }
      if (!current()) return false;
      if (!await instance.retryPending()) {
        if (current()) setState({ phase: 'revoke_pending', issue: 'connection', permissionDenied: false, preparing: false });
        return false;
      }
      if (!current()) return false;
      if (!await instance.start(input) || !current()) {
        if (controller.current === instance && token === generation.current) await instance.stop();
        return false;
      }
      const subscription = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High, distanceInterval: 0, timeInterval: 5_000,
      }, fix => {
        if (!current() || instance.snapshot.phase !== 'sharing') return;
        const ageMs = Date.now() - fix.timestamp;
        if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 10_000 || fix.coords.accuracy == null) return;
        // In der Heimzone (inkl. GPS-Ungenauigkeit) wird keine Position gesendet.
        const paused = insideHomeZone({ lat: fix.coords.latitude, lng: fix.coords.longitude }, zones, fix.coords.accuracy);
        setState(s => (s.homeZonePaused ?? false) === paused ? s : { ...s, homeZonePaused: paused });
        if (paused) return;
        void instance.position({ latitude: fix.coords.latitude, longitude: fix.coords.longitude,
          accuracyM: fix.coords.accuracy }, performance.now() - ageMs);
      }, () => { if (current()) { releaseSource(); void instance.stop('connection'); } });
      if (!current() || instance.snapshot.phase !== 'sharing') { subscription.remove(); return false; }
      source.current = subscription;
      return true;
    } catch {
      if (current()) {
        releaseSource();
        setState({ phase: 'error', issue: 'connection', permissionDenied: false, preparing: false });
        await instance.stop('connection');
      }
      return false;
    } finally {
      if (token === generation.current) {
        preparing.current = false;
        setState(s => ({ ...s, preparing: false }));
      }
    }
  }, [releaseSource]);
  /** Wie start, nennt aber den Grund, damit die Oberfläche eine zutreffende Meldung zeigen kann. */
  const startResult = useCallback(async (input: StartShare): Promise<LiveShareStartResult> => {
    let permissionDenied = false;
    const started = await attempt(input, () => { permissionDenied = true; });
    return started ? 'started' : permissionDenied ? 'permission_denied' : 'failed';
  }, [attempt]);
  const start = useCallback(async (input: StartShare): Promise<boolean> =>
    await startResult(input) === 'started', [startResult]);

  return { state, start, startResult, stop, retryPending: () => controller.current?.retryPending() ?? Promise.resolve(false) };
}
