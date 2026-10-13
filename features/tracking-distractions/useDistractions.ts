import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { create } from 'zustand';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import { distractionRepository, type StoredDistraction } from './repository';
export const useDistractionVisibility = create<{ hidden: Record<string, boolean>; toggle(id: string): void }>(set => ({ hidden: {}, toggle: id => set(s => ({ hidden: { ...s.hidden, [id]: !s.hidden[id] } })) }));
export function useDistractions(parentId: string | undefined) {
 const { session } = useSession(); const userId = session?.user.id ?? null;
 const [epoch, setEpoch] = useState(0), scope = useRef({ userId, epoch }); scope.current = { userId, epoch };
 const [result, setResult] = useState<{ key: string; rows: StoredDistraction[] } | null>(null), [error, setError] = useState<unknown>(null);
 const generation = useRef(0), alive = useRef(true);
 useEffect(() => { const generationBox = generation; alive.current = true; const { data } = supabase.auth.onAuthStateChange(event => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') { scope.current = { ...scope.current, epoch: scope.current.epoch + 1 }; generation.current++; setEpoch(scope.current.epoch); setResult(null); }
 }); return () => { alive.current = false; generationBox.current++; data.subscription.unsubscribe(); }; }, []);
 // A fresh repository captures the new auth epoch, including A → B → A.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const repository = useMemo(() => userId ? distractionRepository(userId, () => scope.current) : null, [userId, epoch]);
 const refresh = useCallback(async () => {
  const token = ++generation.current; setResult(null); setError(null);
  if (!repository || !parentId) return;
  try { const result = await repository.list(parentId); if (alive.current && token === generation.current) setResult({ key: `${userId}:${epoch}:${parentId}`, rows: result }); }
  catch (e) { if (alive.current && token === generation.current) setError(e); }
 }, [repository, parentId, userId, epoch]);
 useFocusEffect(useCallback(() => { void refresh(); return () => { generation.current++; }; }, [refresh]));
 const rows = result?.key === `${userId}:${epoch}:${parentId}` ? result.rows : [];
 return { userId, epoch, repository, rows, error, refresh, scope };
}

export function useDistractionOverlays(parentId: string | undefined) {
 const { rows } = useDistractions(parentId), hidden = useDistractionVisibility(s => s.hidden);
 return useMemo(() => rows.filter(r => r.track.finishedAtMs !== null && !hidden[r.track.id]).map(r => r.track), [rows, hidden]);
}
