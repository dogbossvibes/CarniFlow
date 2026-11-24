import { forgetDogExams } from '@/features/exam-book/store';
import { supabase } from '@/lib/supabase';
import type { NewDog } from '@/types';
import { notifyDailyWidgetDataChanged } from '@/features/widgets/dailyWidgetRefresh';
import { collectDogStorageRefs, removeDogStorageRefs, type StorageRef } from '@/services/dogStorageCleanup';

export function getDogs(userId: string) {
  return supabase
    .from('dogs')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
}

export async function addDog(userId: string, dog: NewDog) {
  const payload = { ...dog, owner_id: userId };
  const { data, error } = await supabase
    .from('dogs')
    .insert(payload)
    .select()
    .single();
  if (!error) notifyDailyWidgetDataChanged();
  return { data, error };
}

export function getDogById(dogId: string) {
  return supabase.from('dogs').select('*').eq('id', dogId).single();
}

export function updateDog(dogId: string, updates: Partial<NewDog>) {
  return supabase
    .from('dogs')
    .update(updates)
    .eq('id', dogId)
    .select()
    .single()
    .then(result => { if (!result.error) notifyDailyWidgetDataChanged(); return result; });
}

export function deleteDog(dogId: string) {
  return supabase.from('dogs').delete().eq('id', dogId)
    .then(result => { if (!result.error) notifyDailyWidgetDataChanged(); return result; });
}

// Tabellen mit direkter dog_id-Referenz — werden vor dem Hund gelöscht, damit
// keine Fremdschlüssel blockieren und keine Waisen-Daten zurückbleiben.
// Kinder von training_sessions (track_points/markers/runs) hängen per session_id
// und werden über deren ON-DELETE-CASCADE mitgelöscht.
const DOG_DEPENDENT_TABLES = [
  'training_recommendations',
  'training_embeddings',
  'ai_insights',
  'training_analysis',
  'calendar_events',
  'shared_trainings',
  'training_units',
  'training_sessions',
] as const;

// Löscht den Hund inkl. abhängiger Daten (best-effort je Tabelle). Gibt erst
// einen Fehler zurück, wenn das Löschen des Hundes selbst scheitert.
// Hochgeladene Dateien (Foto, Dokumente, Trainingsmedien) werden vorher ermittelt
// und erst NACH nachweislich erfolgreichem Löschen des Hundes entfernt.
export async function deleteDogWithDependents(dogId: string): Promise<{ error: Error | null }> {
  let ownerId: string | null = null;
  let storageRefs: StorageRef[] = [];
  try {
    const { data: { user } } = await supabase.auth.getUser();
    ownerId = user?.id ?? null;
    if (ownerId) storageRefs = await collectDogStorageRefs(dogId, ownerId);
  } catch (e) {
    console.warn('[deleteDog] Dateien nicht ermittelt:', (e as Error)?.message ?? e);
  }

  let widgetDataChanged = false;
  try {
    for (const table of DOG_DEPENDENT_TABLES) {
      const { error } = await supabase.from(table).delete().eq('dog_id', dogId);
      if (!error && table === 'calendar_events') widgetDataChanged = true;
      if (error) console.warn(`[deleteDog] ${table}:`, error.message);   // z. B. Tabelle ohne dog_id → ignorieren
    }
    const { data, error } = await supabase.from('dogs').delete().eq('id', dogId).select('id');
    if (error) return { error: new Error(error.message) };
    widgetDataChanged = true;

    // Nur wenn die Datenbank das Löschen bestätigt (RLS kann ohne Fehler 0 Zeilen
    // löschen), dürfen die Dateien weg — sonst bleiben sie beim weiter bestehenden Hund.
    if (storageRefs.length > 0 && (data?.length ?? 0) > 0) await removeDogStorageRefs(storageRefs);
    // Prüfungsbuch: Serverzeilen löscht der Fremdschlüssel mit (on delete cascade);
    // lokal nur die Zeilen genau dieses Hundes, erst nach bestätigtem Löschen.
    if (ownerId && (data?.length ?? 0) > 0) await forgetDogExams(ownerId, dogId).catch(() => {});
    return { error: null };
  } finally {
    // Calendar deletion can succeed before a later request fails; invalidate once.
    if (widgetDataChanged) notifyDailyWidgetDataChanged();
  }
}
