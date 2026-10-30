import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session-context';
import { loadReceivedHealthDogs } from '@/services/sharedHealthDogs';
import { projectSharedDogs, type SharedDog } from '@/features/dogs/sharing/model';

// No persistent cache for somebody else's health access. A background/focus
// change clears it, account changes synchronously hide it, stale reads lose.
export function useSharedHealthDogs(dogId?: string) {
  const { user } = useSession();
  const scope = `${user?.id ?? ''}:${dogId ?? ''}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const generation = useRef(0);
  const [state, setState] = useState<{ scope: string; dogs: SharedDog[]; loading: boolean; error: boolean }>({ scope, dogs: [], loading: true, error: false });
  const reload = useCallback(async (silent = false) => {
    const run = ++generation.current;
    if (!silent || !user) setState({ scope, dogs: [], loading: !!user, error: false });
    if (!user) return;
    try {
      const rows = await loadReceivedHealthDogs(dogId);
      if (run === generation.current && currentScope.current === scope) {
        const dogs = projectSharedDogs(rows);
        setState(previous => ({ scope, dogs: previous.scope === scope && JSON.stringify(previous.dogs) === JSON.stringify(dogs) ? previous.dogs : dogs, loading: false, error: false }));
      }
    } catch {
      if (run === generation.current && currentScope.current === scope) setState({ scope, dogs: [], loading: false, error: true });
    }
  }, [scope, user, dogId]);
  useFocusEffect(useCallback(() => {
    void reload();
    const subscription = AppState.addEventListener('change', state => {
      ++generation.current;
      setState({ scope, dogs: [], loading: true, error: false });
      if (state === 'active') void reload();
    });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void reload(true); }, 30000);
    return () => { ++generation.current; subscription.remove(); clearInterval(timer); setState({ scope, dogs: [], loading: true, error: false }); };
  }, [reload, scope]));
  useEffect(() => {
    const expiries = state.dogs.flatMap(dog => dog.grants).map(grant => grant.expires_at ? Date.parse(grant.expires_at) : Infinity);
    const next = Math.min(...expiries);
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => { void reload(); }, Math.max(1, Math.min(2147483647, next - Date.now())));
    return () => clearTimeout(timer);
  }, [state.dogs, reload]);
  const visible = state.scope === scope ? state : { dogs: [], loading: !!user, error: false };
  // Expiry is checked on every render, including before another async refresh.
  const dogs = useMemo(() => projectSharedDogs(visible.dogs.flatMap(dog => dog.grants)), [visible.dogs]);
  return { ...visible, dogs, reload };
}
