import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createTransferRunScope } from './runScope';
export function useTransferRunScope(userId: string | null) {
  const [scope] = useState(() => createTransferRunScope(userId));
  const [, rerender] = useState(0);
  useEffect(() => { scope.setUser(userId); rerender(n => n + 1); }, [scope, userId]);
  useEffect(() => {
    scope.mount(); rerender(n => n + 1);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        scope.setUser(session?.user.id ?? null, true); rerender(n => n + 1);
      }
    });
    return () => { scope.dispose(); data.subscription.unsubscribe(); };
  }, [scope]);
  return scope;
}
