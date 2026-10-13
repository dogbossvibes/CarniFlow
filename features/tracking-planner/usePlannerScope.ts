import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import { plannerRepository } from './repository';
export function usePlannerScope() {
 const { session } = useSession(); const userId = session?.user.id ?? null;
 const [, setEpoch] = useState(0); const scope = useRef({ userId, epoch: 0 });
 const renderedUser = useRef(userId);
 if (renderedUser.current !== userId) {
  renderedUser.current = userId;
  // Context may render before our auth listener. That is an identity boundary too.
  if (scope.current.userId !== userId) scope.current = { userId, epoch: scope.current.epoch + 1 };
 }
 const epoch = scope.current.epoch;
 useEffect(() => {
  const { data } = supabase.auth.onAuthStateChange((event, next) => {
   const nextId = event === 'SIGNED_OUT' ? null : next?.user.id ?? null;
   // SIGNED_IN also fires when refocusing the same authenticated session.
   // Only a real identity transition invalidates drafts and pending operations.
   if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && nextId !== scope.current.userId)) {
    scope.current = { userId: nextId, epoch: scope.current.epoch + 1 }; setEpoch(scope.current.epoch);
   }
  }); return () => data.subscription.unsubscribe();
 }, []);
 // Recreate after sign-out/sign-in even when the same account returns.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const repository = useMemo(() => userId ? plannerRepository(userId, () => scope.current) : null, [userId, epoch]);
 return { userId, epoch, repository, scope };
}
