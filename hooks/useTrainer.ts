import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { getMyTrainerProfile } from '@/services/trainerService';
import type { TrainerProfile } from '@/types/trainer';

// Trainer-Profil (Bio/Spezialgebiete) des eingeloggten Users. Verbindungen,
// Kunden und Aktivität laufen jetzt über connectionService (Connection-Modell).
export function useMyTrainerProfile() {
  const { session } = useSession();
  const uid = session?.user.id;
  const q = useQuery({
    queryKey: ['trainerProfile', uid],
    enabled:  !!uid,
    queryFn:  async () => {
      const { data } = await getMyTrainerProfile(uid!);
      return (data as TrainerProfile) ?? null;
    },
  });
  return { trainerProfile: q.data ?? null, loading: uid ? q.isPending : false, refresh: q.refetch };
}
