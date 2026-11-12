import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dog } from '@/types';
import { getDogs } from '@/services/dogs';
import { useSession } from '@/hooks/useSession';

export function useDogs() {
  const { session } = useSession();
  const [dogs, setDogs]       = useState<Dog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const generation = useRef(0);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = ++generation.current;
    const uid = session?.user.id;
    if (!uid) { setDogs([]); setLoadedUserId(null); setLoading(false); return; }

    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await getDogs(uid);
      if (token !== generation.current) return;
      if (err) setError(err.message);
      else { setDogs((data ?? []).filter(d => d.owner_id === uid)); setLoadedUserId(uid); }
    } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : 'Dogs unavailable'); }
    finally { if (token === generation.current) setLoading(false); }
  }, [session?.user.id]);

  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { void refresh(); return invalidate; }, [refresh, invalidate]);

  return { dogs: loadedUserId === session?.user.id ? dogs : [], loading, error, refresh };
}
