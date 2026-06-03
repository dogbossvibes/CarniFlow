import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { getProfile } from '@/services/profileService';
import type { Profile } from '@/types';

// Profil über React Query — geteilter Cache über ALLE Komponenten (Tab-Layout,
// Profil-Screen, …). So wirkt eine Rollenänderung („Trainer werden") sofort
// überall, sobald ['profile'] invalidiert wird.
export function useProfile() {
  const { session } = useSession();
  const uid = session?.user.id;

  const query = useQuery({
    queryKey: ['profile', uid],
    enabled:  !!uid,
    queryFn:  async (): Promise<Profile | null> => {
      const { data } = await getProfile(uid!);
      return (data as Profile) ?? null;
    },
  });

  const profile = query.data ?? null;

  const isPremium =
    profile?.plan === 'premium' &&
    (profile.plan_expires_at === null || new Date(profile.plan_expires_at) > new Date());

  const planExpiresAt = profile?.plan_expires_at ? new Date(profile.plan_expires_at) : null;
  const role = profile?.role ?? 'user';

  return {
    profile,
    loading:       uid ? query.isPending : false,
    isPremium,
    planExpiresAt,
    role,
    isTrainer:     role === 'trainer',
    refresh:       query.refetch,
  };
}
