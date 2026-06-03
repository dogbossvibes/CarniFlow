import { useQuery } from '@tanstack/react-query';
import { getComments } from '@/services/commentService';
import type { TrainingComment } from '@/types/comment';

export function useComments(unitId: string | undefined) {
  const q = useQuery({
    queryKey: ['comments', unitId],
    enabled:  !!unitId,
    queryFn:  async (): Promise<TrainingComment[]> => {
      const { data } = await getComments(unitId!);
      return (data as TrainingComment[]) ?? [];
    },
  });
  return { comments: q.data ?? [], loading: !!unitId && q.isPending, refresh: q.refetch };
}
