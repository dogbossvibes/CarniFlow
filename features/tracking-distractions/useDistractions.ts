import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { create } from 'zustand';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import { parentRepository } from './parentRepository';
import { distractionRepository, type StoredDistraction } from './repository';
export const useDistractionVisibility = create<{ hidden: Record<string, boolean>; toggle(id: string): void }>(set => ({ hidden: {}, toggle: id => set(s => ({ hidden: { ...s.hidden, [id]: !s.hidden[id] } })) }));
export function useDistractions(parentId: string | undefined) {
 const { session } = useSession(); const userId = session?.user.id ?? null;
 const [, renderEpoch] = useState(0), scope = useRef({ userId, epoch: 0 });
 const renderedUser = useRef(userId);
 if (renderedUser.current !== userId) {
  renderedUser.current = userId;
  if (scope.current.userId !== userId) scope.current = { userId, epoch: scope.current.epoch + 1 };
 }
 const epoch = scope.current.epoch;
 const [result, setResult] = useState<{ key: string; rows: StoredDistraction[] } | null>(null), [error, setError] = useState<unknown>(null);
 const generation = useRef(0), alive = useRef(true);
 useEffect(() => { const generationBox = generation; alive.current = true; const { data } = supabase.auth.onAuthStateChange((event, next) => {
  const nextId = event === 'SIGNED_OUT' ? null : next?.user.id ?? null;
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' && nextId !== scope.current.userId) {
   scope.current = { userId: nextId, epoch: scope.current.epoch + 1 }; generation.current++; renderEpoch(scope.current.epoch); setResult(null);
  }
 }); return () => { alive.current = false; generationBox.current++; data.subscription.unsubscribe(); }; }, []);
 // Both auth callbacks and context-first identity changes invalidate old repositories.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const repository = useMemo(() => userId ? distractionRepository(userId, () => scope.current) : null, [userId, epoch]);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const parents = useMemo(() => userId ? parentRepository(userId, () => scope.current) : null, [userId, epoch]);
 const refresh = useCallback(async () => {
  const token = ++generation.current; setResult(null); setError(null);
  if (!repository || !parentId) return;
  try { const result = await repository.list(parentId); if (alive.current && token === generation.current) setResult({ key: `${userId}:${epoch}:${parentId}`, rows: result }); }
  catch (e) { if (alive.current && token === generation.current) setError(e); }
 }, [repository, parentId, userId, epoch]);
 useFocusEffect(useCallback(() => { void refresh(); return () => { generation.current++; }; }, [refresh]));
 const rows = result?.key === `${userId}:${epoch}:${parentId}` ? result.rows : [];
 return { userId, epoch, repository, parents, rows, error, refresh, scope };
}

export function useDistractionOverlays(parentId: string | undefined) {
 const { rows } = useDistractions(parentId), hidden = useDistractionVisibility(s => s.hidden);
 return useMemo(() => rows.filter(r => r.track.finishedAtMs !== null && !hidden[r.track.id]).map(r => r.track), [rows, hidden]);
}
