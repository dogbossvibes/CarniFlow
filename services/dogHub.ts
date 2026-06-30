import { supabase } from '@/lib/supabase';

// Lese-Zugriff auf die Dog-Hub-Tabellen (DOG_HUB_SETUP.sql). Fail-soft: bei
// Fehlern/leeren Tabellen wird null/[] geliefert, die UI zeigt dann Fallbacks.

export interface DogGoalRow {
  id: string; dog_id: string; title: string;
  overall_pct: number; parts: { label: string; pct: number }[]; is_active: boolean;
}
export interface DogDocumentRow {
  id: string; dog_id: string; kind: string; title: string | null;
  file_url: string | null; issued_on: string | null; note: string | null;
}
export interface DogHealthEntryRow {
  id: string; dog_id: string; entry_date: string; weight_kg: number | null;
  load_level: 'leicht' | 'mittel' | 'hoch' | null; is_rest_day: boolean; is_intense: boolean; note: string | null;
}
export interface DogVetRow { id: string; dog_id: string; appointment_at: string; reason: string | null }

export interface DogHubExtras {
  goal:      DogGoalRow | null;
  documents: DogDocumentRow[];
  health:    DogHealthEntryRow[];
  nextVet:   DogVetRow | null;
}

export async function getActiveDogGoal(dogId: string): Promise<DogGoalRow | null> {
  const { data } = await supabase.from('dog_goals')
    .select('*').eq('dog_id', dogId).eq('is_active', true)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return { ...data, parts: Array.isArray(data.parts) ? data.parts : [] } as DogGoalRow;
}

export async function getDogDocuments(dogId: string): Promise<DogDocumentRow[]> {
  const { data } = await supabase.from('dog_documents')
    .select('*').eq('dog_id', dogId).order('created_at', { ascending: false });
  return (data ?? []) as DogDocumentRow[];
}

export async function getRecentDogHealth(dogId: string): Promise<DogHealthEntryRow[]> {
  const { data } = await supabase.from('dog_health_entries')
    .select('*').eq('dog_id', dogId).order('entry_date', { ascending: false }).limit(60);
  return (data ?? []) as DogHealthEntryRow[];
}

// Signed-URL (10 Min.) zum Öffnen/Herunterladen eines Dokuments aus dem
// privaten Bucket `dog-documents`. file_url ist der Objekt-Pfad.
export async function getDogDocumentUrl(path: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage.from('dog-documents').createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  } catch { return null; }
}

export async function getNextVetAppointment(dogId: string): Promise<DogVetRow | null> {
  const { data } = await supabase.from('dog_vet_appointments')
    .select('*').eq('dog_id', dogId).gte('appointment_at', new Date().toISOString())
    .order('appointment_at', { ascending: true }).limit(1).maybeSingle();
  return (data ?? null) as DogVetRow | null;
}

// ── Schreiben (Editoren) ─────────────────────────────────────────────────────
async function requireUid(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');
  return user.id;
}

export interface DogGoalInput { title: string; overall_pct: number; parts: { label: string; pct: number }[] }
export async function saveDogGoal(dogId: string, goalId: string | null, input: DogGoalInput) {
  const owner = await requireUid();
  if (goalId) {
    return supabase.from('dog_goals')
      .update({ ...input, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', goalId).select().single();
  }
  return supabase.from('dog_goals')
    .insert({ owner_id: owner, dog_id: dogId, ...input, is_active: true }).select().single();
}

export interface DogHealthInput {
  entry_date?: string; weight_kg: number | null;
  load_level: 'leicht' | 'mittel' | 'hoch' | null; is_rest_day: boolean; is_intense: boolean; note: string | null;
}
export async function addDogHealthEntry(dogId: string, input: DogHealthInput) {
  const owner = await requireUid();
  return supabase.from('dog_health_entries').insert({ owner_id: owner, dog_id: dogId, ...input }).select().single();
}

export async function addDogVetAppointment(dogId: string, appointmentAt: string, reason: string | null) {
  const owner = await requireUid();
  return supabase.from('dog_vet_appointments')
    .insert({ owner_id: owner, dog_id: dogId, appointment_at: appointmentAt, reason }).select().single();
}

export interface DogDocumentInput { kind: string; title: string | null; file_url: string | null; issued_on: string | null; note: string | null }
export async function addDogDocument(dogId: string, input: DogDocumentInput) {
  const owner = await requireUid();
  return supabase.from('dog_documents').insert({ owner_id: owner, dog_id: dogId, ...input }).select().single();
}

// Alles für den Hub in einem Rutsch (parallel).
export async function getDogHubExtras(dogId: string): Promise<DogHubExtras> {
  const [goal, documents, health, nextVet] = await Promise.all([
    getActiveDogGoal(dogId).catch(() => null),
    getDogDocuments(dogId).catch(() => []),
    getRecentDogHealth(dogId).catch(() => []),
    getNextVetAppointment(dogId).catch(() => null),
  ]);
  return { goal, documents, health, nextVet };
}
