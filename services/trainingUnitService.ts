import { supabase } from '@/lib/supabase';
import type { TrainingUnit, TrainingExercise, AudioFile } from '@/types/trainingUnit';
import type { TrainingMetrics } from '@/types/analytics';

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

export function setUnitShared(id: string, shared: boolean) {
  return supabase.from('training_units').update({ shared_with_trainer: shared }).eq('id', id);
}

export function deleteTrainingUnit(id: string) {
  return supabase.from('training_units').delete().eq('id', id);
}

export type { TrainingUnit, TrainingExercise };
