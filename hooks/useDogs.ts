import { useCallback, useEffect, useState } from 'react';
import type { Dog } from '@/types';
import { getDogs } from '@/services/dogs';
import { useSession } from '@/hooks/useSession';

export function useDogs() {
  const { session } = useSession();
  const [dogs, setDogs]       = useState<Dog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) { setLoading(false); return; }

    setLoading(true);
    setError(null);
    const { data, error: err } = await getDogs(uid);
    if (err) setError(err.message);
    else     setDogs(data ?? []);
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => { refresh(); }, [refresh]);

  return { dogs, loading, error, refresh };
}
