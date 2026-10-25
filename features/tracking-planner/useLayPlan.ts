import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlannerScope } from './usePlannerScope';
import type { StoredPlan } from './model';

/** Read-only snapshot for this screen and dog. Never enters the recorder or result. */
export function useLayPlan(dogId: string | null) {
 const { userId, epoch, repository, scope } = usePlannerScope();
 const scopeKey = JSON.stringify([userId, epoch, dogId]);
 // A → B → A must never revive A's old selection or pending requests.
 const identity = useRef({ scopeKey, generation: 0 });
 if (identity.current.scopeKey !== scopeKey) identity.current = { scopeKey, generation: identity.current.generation + 1 };
 const key = JSON.stringify([scopeKey, identity.current.generation]);
 const liveKey = useRef(key); liveKey.current = key;
 const request = useRef(0);
 const mounted = useRef(true);
 useEffect(() => { const requests = request; mounted.current = true; return () => { mounted.current = false; requests.current++; }; }, []);
 const [state, setState] = useState<{ key: string; rows: StoredPlan[]; selected: StoredPlan | null; loading: boolean; failed: boolean }>({ key, rows: [], selected: null, loading: false, failed: false });
 const valid = state.key === key && scope.current.userId === userId && scope.current.epoch === epoch;
 const refresh = useCallback(async () => {
  const token = ++request.current;
  if (!mounted.current || !repository || !dogId || liveKey.current !== key || scope.current.userId !== userId || scope.current.epoch !== epoch) return;
  setState(s => ({ key, rows: [], selected: s.key === key ? s.selected : null, loading: true, failed: false }));
  const current = () => mounted.current && token === request.current && liveKey.current === key && scope.current.userId === userId && scope.current.epoch === epoch;
  try { const rows = await repository.list(); if (current()) setState(s => ({ ...s, rows, loading: false })); }
  catch { if (current()) setState(s => ({ ...s, rows: [], loading: false, failed: true })); }
 }, [repository, dogId, key, scope, userId, epoch]);
 const select = (value: StoredPlan | null) => {
  if (!mounted.current || !valid || !userId || !dogId || liveKey.current !== key || scope.current.userId !== userId || scope.current.epoch !== epoch || (value && !state.rows.includes(value))) return;
  setState(s => ({ ...s, selected: value }));
 };
 return { key, enabled: !!userId && !!dogId, rows: valid ? state.rows : [], selected: valid ? state.selected : null,
  loading: valid && state.loading, failed: valid && state.failed, refresh, select };
}
