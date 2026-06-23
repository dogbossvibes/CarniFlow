import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/components/ui/Toast';
import { deleteFeedItem } from '@/services/deleteTraining';
import type { FeedItem } from '@/services/trainingFeed';

// Lösch-Logik für die vereinheitlichte Trainings-Zeitleiste (useTrainingFeed):
// optimistisches Entfernen aus dem React-Query-Cache, Lösch-Aufruf, Toast und
// Rollback bei Fehler. Liefert `onDelete(item)` + das Toast-Element.
export function useFeedDelete(dogId?: string) {
  const qc = useQueryClient();
  const { session } = useSession();
  const uid = session?.user.id;
  const { showToast, toast } = useToast();

  const onDelete = useCallback(async (item: FeedItem) => {
    const key = ['trainingFeed', uid, dogId ?? null] as const;
    const prev = qc.getQueryData<FeedItem[]>(key);

    // Optimistisch aus der Liste entfernen.
    qc.setQueryData<FeedItem[]>(key, old =>
      (old ?? []).filter(f => !(f.id === item.id && f.source === item.source)),
    );

    const { error } = await deleteFeedItem(item);
    if (error) {
      if (prev) qc.setQueryData(key, prev);            // Rollback
      showToast('Training konnte nicht gelöscht werden.');
      return;
    }
    showToast('Training gelöscht');
    // Alle Feed-Consumer (Dashboard, Stats, andere Hunde-Filter) synchronisieren.
    qc.invalidateQueries({ queryKey: ['trainingFeed'] });
  }, [qc, uid, dogId, showToast]);

  return { onDelete, toast };
}
