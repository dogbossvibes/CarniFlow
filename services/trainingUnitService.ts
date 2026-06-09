import { supabase } from '@/lib/supabase';
import type { TrainingUnit, TrainingExercise, AudioFile } from '@/types/trainingUnit';
import type { TrainingMetrics } from '@/types/analytics';

// Verbundene Trainer:innen mit view_trainings-Berechtigung über neue Aktivität
// der Kund:in informieren (best-effort, connection-basiert).
async function notifyTrainersOfActivity(ownerId: string, title: string) {
  try {
    const { data: conns } = await supabase
      .from('connections')
      .select('connected_user_id, connection_permissions(view_trainings)')
      .eq('owner_user_id', ownerId)
      .eq('status', 'accepted');
    const trainerIds = (conns ?? [])
      .filter((c: any) => c.connection_permissions?.view_trainings ?? c.connection_permissions?.[0]?.view_trainings)
      .map((c: any) => c.connected_user_id as string);
    if (!trainerIds.length) return;

    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', ownerId).single();
    const name = (prof?.full_name ?? 'Eine Kund:in') as string;

    await supabase.functions.invoke('notify', {
      body: { user_ids: trainerIds, title, body: `${name} hat eine neue Einheit abgeschlossen.`, data: { type: 'activity' } },
    });
  } catch { /* best-effort */ }
}

interface DocumentedUnitInput extends TrainingMetrics {
  dog_id:       string;
  session_date: string;
  started_at:   string | null;
  ended_at:     string | null;
  duration_sec: number | null;
  score:        number | null;
  notes:        string | null;
  photos:       string[];
  videos:       string[];
  audio_files:  AudioFile[];
  shared_with_trainer: boolean;
}

// Liste abgeschlossener Einheiten (mit Hund + Übungen) für den Verlauf.
export function getTrainingUnits(ownerId: string, dogId?: string) {
  let q = supabase
    .from('training_units')
    .select('*, dog:dogs(name), exercises:training_exercises(*)')
    .eq('owner_id', ownerId)
    .eq('status', 'completed')
    .order('session_date', { ascending: false })
    .order('created_at',   { ascending: false });
  if (dogId) q = q.eq('dog_id', dogId);
  return q;
}

export function getTrainingUnitById(id: string) {
  return supabase
    .from('training_units')
    .select('*, dog:dogs(name), exercises:training_exercises(*)')
    .eq('id', id)
    .single();
}

// Legt eine neue, laufende Einheit an (status 'active').
export async function createTrainingUnit(
  ownerId: string,
  dogId:   string,
) {
  return supabase
    .from('training_units')
    .insert({
      owner_id:     ownerId,
      dog_id:       dogId,
      session_date: new Date().toISOString().split('T')[0],
      started_at:   new Date().toISOString(),
      status:       'active',
    })
    .select('*')
    .single();
}

// Schließt die Einheit ab und persistiert alle Übungen.
export async function finishTrainingUnit(
  unitId:  string,
  updates: { duration_sec: number; rating: number | null; notes: string | null; shared_with_trainer?: boolean } & Partial<TrainingMetrics>,
  exercises: Omit<TrainingExercise, 'id' | 'unit_id' | 'created_at'>[],
) {
  const { error: unitErr } = await supabase
    .from('training_units')
    .update({ ...updates, ended_at: new Date().toISOString(), status: 'completed' })
    .eq('id', unitId);
  if (unitErr) return { error: unitErr };

  if (exercises.length > 0) {
    const { error } = await supabase
      .from('training_exercises')
      .insert(exercises.map(e => ({ ...e, unit_id: unitId })));
    if (error) return { error };
  }

  // Verbundene Trainer:innen (mit view_trainings) über die neue Einheit informieren.
  const { data: u } = await supabase.from('training_units').select('owner_id').eq('id', unitId).single();
  if (u?.owner_id) notifyTrainersOfActivity(u.owner_id, '🐾 Neues Training').catch(() => {});
  return { error: null };
}

// Nachträgliche Dokumentation: legt direkt eine ABGESCHLOSSENE Einheit an
// (mit Medien + Score + Zeiten) und persistiert die Übungen.
export async function createDocumentedUnit(
  ownerId:   string,
  unit:      DocumentedUnitInput,
  exercises: Omit<TrainingExercise, 'id' | 'unit_id' | 'created_at'>[],
) {
  const { data, error } = await supabase
    .from('training_units')
    .insert({ ...unit, owner_id: ownerId, status: 'completed' })
    .select('*')
    .single();
  if (error || !data) return { error, data: null };

  if (exercises.length > 0) {
    const { error: exErr } = await supabase
      .from('training_exercises')
      .insert(exercises.map(e => ({ ...e, unit_id: data.id })));
    if (exErr) return { error: exErr, data: null };
  }
  notifyTrainersOfActivity(ownerId, '🐾 Neue Aktivität').catch(() => {});
  return { error: null, data };
}

// Bearbeiten einer dokumentierten Einheit: Felder aktualisieren + Übungen
// komplett ersetzen (alte löschen, neue einfügen).
export async function updateDocumentedUnit(
  unitId:    string,
  unit:      DocumentedUnitInput,
  exercises: Omit<TrainingExercise, 'id' | 'unit_id' | 'created_at'>[],
) {
  const { error } = await supabase.from('training_units').update(unit).eq('id', unitId);
  if (error) return { error };

  const { error: delErr } = await supabase.from('training_exercises').delete().eq('unit_id', unitId);
  if (delErr) return { error: delErr };

  if (exercises.length > 0) {
    const { error: exErr } = await supabase
      .from('training_exercises')
      .insert(exercises.map(e => ({ ...e, unit_id: unitId })));
    if (exErr) return { error: exErr };
  }
  return { error: null };
}

export function deleteTrainingUnit(id: string) {
  return supabase.from('training_units').delete().eq('id', id);
}

export type { TrainingUnit, TrainingExercise };
