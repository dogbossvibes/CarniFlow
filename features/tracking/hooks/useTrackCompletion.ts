import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getTrackCompletionById } from '../services/trackService';
import { hasFinalSearchRun } from '../store/trackRecovery';

export type TrackCompletionStatus = 'loading' | 'unknown' | 'absent' | 'open' | 'final';

/** Unknown remote completion never authorizes reopening an older local copy. */
export function useTrackCompletion({ sessionId, dogId, userId, revision = 0 }: {
  sessionId: string | null | undefined; dogId: string | null | undefined;
  userId: string | null | undefined; revision?: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const scope = JSON.stringify([sessionId, dogId, userId, revision, attempt]);
  const [result, setResult] = useState<{ scope: string; status: TrackCompletionStatus } | null>(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useFocusEffect(useCallback(() => {
    const token = ++generation.current;
    setResult(null);
    if (!sessionId || !dogId || !userId) return;
    let alive = true;
    void getTrackCompletionById(sessionId).then(({ data, error }) => {
      if (!alive || token !== generation.current) return;
      const matches = data?.id === sessionId && data.dog_id === dogId && data.owner_id === userId;
      const status: TrackCompletionStatus = error ? 'unknown' : !data ? 'absent'
        : !matches ? 'unknown' : hasFinalSearchRun(data) ? 'final' : 'open';
      setResult({ scope, status });
    }).catch(() => {
      if (alive && token === generation.current) setResult({ scope, status: 'unknown' });
    });
    return () => { alive = false; generation.current++; };
  }, [sessionId, dogId, userId, scope]));
  return {
    status: !sessionId || !dogId || !userId ? 'unknown' as const
      : result?.scope === scope ? result.status : 'loading' as const,
    retry,
  };
}
