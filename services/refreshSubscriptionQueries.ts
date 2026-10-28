import { queryClient } from '@/lib/queryClient';

export function refreshSubscriptionQueries(uid: string) {
  for (const name of ['capabilities', 'profile', 'userAccess']) {
    void queryClient.invalidateQueries({ queryKey: [name, uid] }).catch(() => {});
  }
}
