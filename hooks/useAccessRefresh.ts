import { useEffect } from 'react';
import { AppState } from 'react-native';

// Access queries are account-keyed. On resume, re-read administrative revocations.
// Multiple observers share the query; avoid cancelling an in-flight refresh.
export function useAccessRefresh(
  userId: string | undefined,
  refetch: (options: { cancelRefetch: boolean }) => Promise<unknown>,
) {
  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch({ cancelRefetch: false });
    });
    return () => subscription.remove();
  }, [userId, refetch]);
}
