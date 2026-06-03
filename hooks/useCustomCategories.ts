import { useQuery } from '@tanstack/react-query';
import type { CustomCategory } from '@/types/customCategory';
import { getCustomCategories } from '@/services/customCategoryService';
import { useSession } from '@/hooks/useSession';

export function useCustomCategories() {
  const { session } = useSession();
  const uid = session?.user.id;

  const query = useQuery({
    queryKey: ['customCategories', uid],
    enabled:  !!uid,
    queryFn:  async (): Promise<CustomCategory[]> => {
      const { data } = await getCustomCategories(uid!);
      return (data as CustomCategory[]) ?? [];
    },
  });

  return {
    categories: query.data ?? [],
    loading:    uid ? query.isPending : false,
    refresh:    query.refetch,
  };
}
