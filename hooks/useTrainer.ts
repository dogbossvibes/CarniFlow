import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { getMyTrainerProfile } from '@/services/trainerService';
import { getMyTrainers, getMyClients, getClientActivity } from '@/services/coachService';
import type { ActivityItem, TrainerProfile } from '@/types/trainer';

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

// Client-Sicht: meine Trainer.
export function useMyTrainers() {
  const { session } = useSession();
  const uid = session?.user.id;
  const q = useQuery({
    queryKey: ['myTrainers', uid],
    enabled:  !!uid,
    queryFn:  () => getMyTrainers(uid!),
  });
  return { trainers: q.data ?? [], loading: uid ? q.isPending : false, refresh: q.refetch };
}

// Trainer-Sicht: meine Kunden.
export function useClients() {
  const { session } = useSession();
  const uid = session?.user.id;
  const q = useQuery({
    queryKey: ['clients', uid],
    enabled:  !!uid,
    queryFn:  () => getMyClients(uid!),
  });
  return { clients: q.data ?? [], loading: uid ? q.isPending : false, refresh: q.refetch };
}

// Trainer-Sicht: Activity-Feed geteilter Einheiten.
export function useClientActivity() {
  const { session } = useSession();
  const uid = session?.user.id;
  const q = useQuery({
    queryKey: ['clientActivity', uid],
    enabled:  !!uid,
    queryFn:  async (): Promise<ActivityItem[]> => {
      const { data } = await getClientActivity(uid!);
      return data;
    },
  });
  return { activity: q.data ?? [], loading: uid ? q.isPending : false, refresh: q.refetch };
}
