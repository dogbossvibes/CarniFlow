import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session-context';
import { supabase } from '@/lib/supabase';
import { loadReceivedHealthDogs } from '@/services/sharedHealthDogs';
import { projectSharedDogs, sharedDogSignature, type ReceivedHealthGrant } from '@/features/dogs/sharing/model';

type State = { scope: string; rows: ReceivedHealthGrant[]; epoch: number; loading: boolean; error: boolean };
const fingerprint = (rows: ReceivedHealthGrant[]) => projectSharedDogs(rows).map(sharedDogSignature).join('|');

/** Memory only. Every private read/action is bound to an active, online account/focus/epoch. */
export function useSharedHealthDogs(dogId?: string) {
  const { user } = useSession();
  const account = user?.id ?? '';
  const scope = `${account}:${dogId ?? ''}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const accountRef = useRef(account); accountRef.current = account;
  const live = useRef({ mounted: false, focused: false, online: false, active: AppState.currentState === 'active', authAccount: account });
  const request = useRef(0);
  const [state, setState] = useState<State>({ scope, rows: [], epoch: 0, loading: !!account, error: false });
  const latest = useRef(state);
  const publish = useCallback((next: State) => { latest.current = next; setState(next); }, []);
  const enabled = useCallback(() => live.current.mounted && live.current.focused && live.current.online && live.current.active &&
    !!accountRef.current && live.current.authAccount === accountRef.current, []);
  const invalidate = useCallback((error = false) => {
    ++request.current;
    publish({ scope: scopeRef.current, rows: [], epoch: latest.current.epoch + 1, loading: !error && !!accountRef.current && live.current.focused && live.current.active && !live.current.online, error });
  }, [publish]);
  const reload = useCallback(async (silent = false) => {
    const id = ++request.current;
    if (scopeRef.current !== scope || !enabled()) return;
    const before = latest.current;
    publish({ ...before, scope, rows: silent && before.scope === scope ? before.rows : [], loading: !silent, error: false,
      epoch: silent && before.scope === scope ? before.epoch : before.epoch + 1 });
    try {
      const rows = await loadReceivedHealthDogs(dogId);
      if (id !== request.current || scopeRef.current !== scope || !enabled()) return;
      const current = latest.current;
      const same = fingerprint(current.rows) === fingerprint(rows);
      publish({ scope, rows: same ? current.rows : rows, epoch: same ? current.epoch : current.epoch + 1, loading: false, error: false });
    } catch {
      if (id === request.current && scopeRef.current === scope && enabled()) invalidate(true);
    }
  }, [scope, dogId, enabled, publish, invalidate]);

  useLayoutEffect(() => {
    const lifecycle = live.current;
    lifecycle.mounted = true;
    return () => { lifecycle.mounted = false; lifecycle.focused = false; };
  }, []);
  useFocusEffect(useCallback(() => {
    live.current.focused = true;
    live.current.online = false;
    live.current.active = AppState.currentState === 'active';
    live.current.authAccount = account;
    invalidate();
    const app = AppState.addEventListener('change', next => {
      live.current.active = next === 'active';
      invalidate();
      if (live.current.active) void reload();
    });
    const network = NetInfo.addEventListener(next => {
      const online = next.isConnected === true && next.isInternetReachable !== false;
      const changed = live.current.online !== online;
      live.current.online = online;
      if (!online) invalidate(true);
      else if (changed) void reload();
    });
    // Auth callback invalidates synchronously, before React's context rerender/passive cleanup.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? '';
      live.current.authAccount = next;
      if (next !== account) invalidate();
    });
    const timer = setInterval(() => { void reload(true); }, 30_000);
    return () => {
      live.current.focused = false;
      invalidate();
      clearInterval(timer); app.remove(); network(); subscription.unsubscribe();
    };
  }, [account, invalidate, reload]));

  const visible = state.scope === scope && enabled();
  // Re-evaluate time on every render; expiry is also driven by an exact-boundary timer.
  const dogs = visible ? projectSharedDogs(state.rows) : [];
  const accessKey = visible ? `${scope}:${state.epoch}:${dogs.map(sharedDogSignature).join('|')}` : '';
  const isCurrent = useCallback((key: string) => {
    if (!key || !enabled() || latest.current.scope !== scopeRef.current) return false;
    return key === `${scopeRef.current}:${latest.current.epoch}:${fingerprint(latest.current.rows)}`;
  }, [enabled]);
  const nextExpiry = dogs.flatMap(d => d.grants).reduce((next, g) => Math.min(next, g.expires_at ? Date.parse(g.expires_at) : Infinity), Infinity);
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => { invalidate(); void reload(); }, Math.max(0, Math.min(2_147_483_647, nextExpiry - Date.now())));
    return () => clearTimeout(timer);
  }, [nextExpiry, invalidate, reload]);
  return { dogs, loading: state.scope === scope && state.loading, error: state.scope === scope && state.error, reload, accessKey, isCurrent };
}
