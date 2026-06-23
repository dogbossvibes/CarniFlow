import { deleteTrainingUnit } from '@/services/trainingUnitService';
import { deleteTrainingSession } from '@/services/training';
import { deleteTrackSession } from '@/features/tracking/services/trackService';
import type { FeedItem } from '@/services/trainingFeed';

// Löscht einen Eintrag der vereinheitlichten Trainings-Zeitleiste, je nach
// Quelle in der richtigen Tabelle. Hard delete (konsistent mit dem bestehenden
// Verhalten der App). RLS stellt sicher, dass nur eigene Einträge löschbar sind.
// Rückgabe: { error } — null = erfolgreich.
export async function deleteFeedItem(item: FeedItem): Promise<{ error: string | null }> {
  try {
    if (item.source === 'track') {
      const r = await deleteTrackSession(item.id);          // Result<null>
      return { error: r.error };
    }
    if (item.source === 'unit') {
      const { error } = await deleteTrainingUnit(item.id);  // Supabase-Result
      return { error: error ? error.message : null };
    }
    // 'session' (legacy training_sessions)
    const { error } = await deleteTrainingSession(item.id);
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: (e as Error)?.message ?? 'unknown' };
  }
}
