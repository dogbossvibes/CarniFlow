import { isLiveShareReleaseReady } from './releaseGate';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { LiveShareController, type LiveShareTransport, type ShareState, type StartShare } from './liveShareController';
import { RevocationJournal } from './revocationJournal';

export type LiveShareUiState = ShareState & { permissionDenied: boolean; preparing: boolean };
const IDLE: LiveShareUiState = { phase: 'idle', issue: null, permissionDenied: false, preparing: false };

/** Mount once in a session-scoped provider. Navigation may keep this provider
 * mounted; app background/unmount always ends sending. Only its own foreground
 * subscription is removed, never the recorder's native/background location owner.
 */
export function useLiveShare(userId: string | null, transport: LiveShareTransport, journal: RevocationJournal) {
  const [state, setState] = useState<LiveShareUiState>(IDLE);
  const owner = useRef(userId); owner.current = userId;
  const controller = useRef<LiveShareController | null>(null);
  const source = useRef<Location.LocationSubscription | null>(null);
  const generation = useRef(0);
  const preparing = useRef(false);
  const online = useRef<boolean | null>(null);
  const releaseSource = useCallback(() => {
    const current = source.current; source.current = null; current?.remove();
  }, []);
  const stop = useCallback((issue: ShareState['issue'] = null) => {
    generation.current++; preparing.current = false; releaseSource();
    setState(s => ({ ...s, preparing: false }));
    return controller.current?.stop(issue) ?? Promise.resolve();
  }, [releaseSource]);

  useEffect(() => {
    setState(IDLE);
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
        void stop();
      } else if (next === 'active' && userId) void instance.retryPending();
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
      generation.current++; preparing.current = false;
      if (controller.current === instance) controller.current = null;
      releaseSource(); instance.dispose();
    };
    return cleanup;
  }, [userId, transport, journal, releaseSource, stop]);

  const start = useCallback(async (input: StartShare): Promise<boolean> => {
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
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (!current()) return false;
      if (permission.status !== 'granted') {
        setState({ ...IDLE, permissionDenied: true }); return false;
      }
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

  return { state, start, stop, retryPending: () => controller.current?.retryPending() ?? Promise.resolve(false) };
}
