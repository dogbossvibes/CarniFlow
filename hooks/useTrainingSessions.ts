import { useCallback, useEffect, useState } from 'react';
import type { TrainingSession } from '@/types';
import { getTrainingSessions } from '@/services/training';
import { useSession } from '@/hooks/useSession';

export function useTrainingSessions(dogId?: string) {
  const { session } = useSession();
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) { setLoading(false); return; }

    setLoading(true);
    setError(null);
    const { data, error: err } = await getTrainingSessions(uid, dogId);
    if (err) setError(err.message);
    else     setSessions((data as TrainingSession[]) ?? []);
    setLoading(false);
  }, [session?.user.id, dogId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { sessions, loading, error, refresh };
}
