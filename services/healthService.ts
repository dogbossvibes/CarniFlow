import { supabase } from '@/lib/supabase';
import { createOwnEvent, deleteCalendarEvent, updateCalendarEvent } from '@/services/calendarService';
import { listConnections } from '@/services/connectionService';
import { isHealthDocument } from '@/features/dogs/documentCategories';
import type { ConnectionView } from '@/types/connection';
import { HEALTH_PERMISSIONS, type HealthCondition, type HealthMedication, type HealthPermission, type HealthRolePreset, type HealthVaccination } from '@/types/health';
import type { DogDocumentRow, DogDewormingEntryRow, DogHealthEntryRow, DogVetRow } from '@/services/dogHub';

export type HealthConditionRow = HealthCondition;
export type HealthMedicationRow = HealthMedication;
export type HealthVaccinationRow = HealthVaccination;
export type HealthSection = 'entries' | 'vaccinations' | 'medications' | 'conditions' | 'parasites' | 'vetVisits' | 'documents';
export type ReminderSyncStatus = 'synced' | 'not_required' | 'failed';
export interface HealthMutationResult<T> { data: T | null; error: { message: string } | null; reminderSync: ReminderSyncStatus; }

export type HealthGrantStatus = 'active' | 'future' | 'expired' | 'revoked';
export type HealthAccessGrantInput = Pick<HealthAccessGrantRow, 'connection_id' | 'grantee_user_id' | 'role_preset' | 'starts_at' | 'expires_at'> & Partial<Pick<HealthAccessGrantRow, HealthPermission>>;
export type HealthAccessGrantRow = import('@/types/health').HealthAccessGrant;
export interface HealthGrantConnection extends ConnectionView { eligible: boolean; }

export const HEALTH_PRESET_PERMISSIONS: Record<Exclude<HealthRolePreset, 'custom'>, readonly HealthPermission[]> = {
  vet: ['can_view_health_summary', 'can_view_weight', 'can_view_vaccinations', 'can_view_parasite_treatments', 'can_view_medications', 'can_view_diagnoses', 'can_view_allergies', 'can_view_vet_visits', 'can_view_vet_reports', 'can_view_lab_results', 'can_view_health_documents', 'can_view_emergency_info'],
  trainer: ['can_view_health_summary', 'can_view_weight'],
  family: ['can_view_health_summary', 'can_view_weight', 'can_view_parasite_treatments', 'can_view_medications', 'can_view_allergies', 'can_view_emergency_info'],
  caregiver: ['can_view_health_summary', 'can_view_weight', 'can_view_parasite_treatments', 'can_view_medications', 'can_view_allergies', 'can_view_emergency_info'],
  guest: ['can_view_health_summary'],
};

export function healthGrantStatus(grant: Pick<HealthAccessGrantRow, 'starts_at' | 'expires_at' | 'revoked_at'>, now = new Date()): HealthGrantStatus {
  if (grant.revoked_at) return 'revoked';
  if (new Date(grant.starts_at).getTime() > now.getTime()) return 'future';
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export function permissionsForPreset(preset: HealthRolePreset): readonly HealthPermission[] {
  return preset === 'custom' ? [] : HEALTH_PRESET_PERMISSIONS[preset];
}

export interface HealthOverviewData {
  entries: DogHealthEntryRow[];
  vaccinations: HealthVaccinationRow[];
  medications: HealthMedicationRow[];
  conditions: HealthConditionRow[];
  parasites: DogDewormingEntryRow[];
  vetVisits: DogVetRow[];
  documents: DogDocumentRow[];
  sectionErrors?: Partial<Record<HealthSection, string>>;
}

async function ownerId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');
  return user.id;
}

async function readOptional<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<{ data: T; error?: string }> {
  const { data, error } = await query;
  return { data: data ?? ([] as T), ...(error ? { error: error.message } : {}) };
}

export async function loadHealthOverview(dogId: string): Promise<HealthOverviewData> {
  const [entries, vaccinations, medications, conditions, parasites, vetVisits, documents] = await Promise.all([
    readOptional<DogHealthEntryRow[]>(supabase.from('dog_health_entries').select('*').eq('dog_id', dogId).order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(120)),
    readOptional<HealthVaccinationRow[]>(supabase.from('dog_health_vaccinations').select('*').eq('dog_id', dogId).order('administered_on', { ascending: false }).limit(120)),
    readOptional<HealthMedicationRow[]>(supabase.from('dog_health_medications').select('*').eq('dog_id', dogId).order('starts_on', { ascending: false }).limit(120)),
    readOptional<HealthConditionRow[]>(supabase.from('dog_health_conditions').select('*').eq('dog_id', dogId).order('started_on', { ascending: false }).limit(120)),
    readOptional<DogDewormingEntryRow[]>(supabase.from('dog_deworming_entries').select('*').eq('dog_id', dogId).order('treatment_date', { ascending: false }).limit(120)),
    readOptional<DogVetRow[]>(supabase.from('dog_vet_appointments').select('*').eq('dog_id', dogId).order('appointment_at', { ascending: false }).limit(120)),
    readOptional<DogDocumentRow[]>(supabase.from('dog_documents').select('*').eq('dog_id', dogId).order('created_at', { ascending: false }).limit(120)),
  ]);
  const sectionErrors: HealthOverviewData['sectionErrors'] = {};
  ([['entries', entries], ['vaccinations', vaccinations], ['medications', medications], ['conditions', conditions], ['parasites', parasites], ['vetVisits', vetVisits], ['documents', documents]] as const).forEach(([key, result]) => { if (result.error) sectionErrors[key] = result.error; });
  return { entries: entries.data, vaccinations: vaccinations.data, medications: medications.data, conditions: conditions.data, parasites: parasites.data, vetVisits: vetVisits.data, documents: documents.data.filter(isHealthDocument), sectionErrors };
}

export async function loadHealthAccessGrants(dogId: string): Promise<{ data: HealthAccessGrantRow[]; error: { message: string } | null }> {
  const result = await supabase.from('dog_health_access_grants').select('*').eq('dog_id', dogId).order('created_at', { ascending: false });
  return { data: (result.data as HealthAccessGrantRow[]) ?? [], error: result.error };
}

export async function loadHealthGrantConnections(): Promise<{ data: HealthGrantConnection[]; error: { message: string } | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: { message: 'Nicht eingeloggt' } };
  const result = await listConnections(user.id);
  return { data: result.filter(connection => connection.myRole === 'owner' && connection.status === 'accepted').map(connection => ({ ...connection, eligible: true })), error: null };
}

function grantPayload(input: HealthAccessGrantInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    connection_id: input.connection_id,
    grantee_user_id: input.grantee_user_id,
    role_preset: input.role_preset,
    starts_at: input.starts_at,
    expires_at: input.expires_at,
  };
  for (const permission of HEALTH_PERMISSIONS) payload[permission] = input[permission] ?? false;
  return payload;
}

export async function createHealthAccessGrant(dogId: string, input: HealthAccessGrantInput): Promise<{ data: HealthAccessGrantRow | null; error: { message: string } | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { message: 'Nicht eingeloggt' } };
  const result = await supabase.from('dog_health_access_grants').insert({ dog_id: dogId, owner_id: user.id, ...grantPayload(input) }).select('*').single();
  return { data: result.data as HealthAccessGrantRow | null, error: result.error };
}

export async function updateHealthAccessGrant(id: string, input: Partial<HealthAccessGrantInput>): Promise<{ data: HealthAccessGrantRow | null; error: { message: string } | null }> {
  const payload: Record<string, unknown> = {};
  for (const key of ['connection_id', 'grantee_user_id', 'role_preset', 'starts_at', 'expires_at', ...HEALTH_PERMISSIONS] as const) {
    if (key in input) payload[key] = input[key];
  }
  const result = await supabase.from('dog_health_access_grants').update(payload).eq('id', id).select('*').single();
  return { data: result.data as HealthAccessGrantRow | null, error: result.error };
}

export async function revokeHealthAccessGrant(id: string): Promise<{ error: { message: string } | null }> {
  const result = await supabase.from('dog_health_access_grants').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  return { error: result.error };
}

export async function createVaccination(dogId: string, input: Omit<HealthVaccination, 'id' | 'owner_id' | 'dog_id' | 'created_at' | 'updated_at'>) {
  const owner_id = await ownerId();
  const result = await supabase.from('dog_health_vaccinations').insert({ owner_id, dog_id: dogId, ...input }).select().single();
  return withReminder(result, () => syncHealthReminder(owner_id, dogId, 'health_vaccination', result.data?.id, result.data?.next_due_on, result.data ? `Impfung · ${result.data.vaccine_name || result.data.vaccine_type}` : 'Impfung'));
}

export async function createMedication(dogId: string, input: Omit<HealthMedication, 'id' | 'owner_id' | 'dog_id' | 'created_at' | 'updated_at'>) {
  const owner_id = await ownerId();
  const result = await supabase.from('dog_health_medications').insert({ owner_id, dog_id: dogId, ...input }).select().single();
  return withReminder(result, () => syncHealthReminder(owner_id, dogId, 'health_medication', result.data?.id, result.data?.starts_on, result.data ? `Medikament · ${result.data.name}` : 'Medikament'));
}

export async function createCondition(dogId: string, input: Omit<HealthCondition, 'id' | 'owner_id' | 'dog_id' | 'created_at' | 'updated_at'>) {
  const owner_id = await ownerId();
  const result = await supabase.from('dog_health_conditions').insert({ owner_id, dog_id: dogId, ...input }).select().single();
  return withReminder(result, async () => 'not_required');
}

export async function createParasiteTreatment(dogId: string, input: { treatment_date: string; product: string | null; next_due_date: string | null; treatment_type: string; note: string | null }) {
  const owner_id = await ownerId();
  const result = await supabase.from('dog_deworming_entries').insert({ owner_id, dog_id: dogId, ...input }).select().single();
  return withReminder(result, () => syncHealthReminder(owner_id, dogId, 'health_parasite_treatment', result.data?.id, result.data?.next_due_date, result.data ? parasiteTitle(result.data.treatment_type, result.data.product) : 'Parasitenbehandlung'));
}

export async function createVetVisit(dogId: string, input: { appointment_at: string; clinic_name: string | null; reason: string | null; note: string | null }) {
  const owner_id = await ownerId();
  const result = await supabase.from('dog_vet_appointments').insert({ owner_id, dog_id: dogId, status: 'scheduled', ...input }).select().single();
  return withReminder(result, () => syncHealthReminder(owner_id, dogId, 'health_vet_visit', result.data?.id, result.data?.appointment_at, result.data ? `Tierarzt · ${result.data.reason || 'Termin'}` : 'Tierarzttermin'));
}

export async function createWeightEntry(dogId: string, input: { entry_date: string; weight_kg: number; note: string | null }) {
  const owner_id = await ownerId();
  const result = await supabase.from('dog_health_entries').insert({ owner_id, dog_id: dogId, weight_kg: input.weight_kg, entry_date: input.entry_date, load_level: null, is_rest_day: false, is_intense: false, note: input.note }).select().single();
  return withReminder(result, async () => 'not_required');
}

export async function updateVaccination(id: string, input: Partial<Omit<HealthVaccination, 'id' | 'owner_id' | 'dog_id' | 'created_at' | 'updated_at'>>) {
  const current = await supabase.from('dog_health_vaccinations').select('owner_id,dog_id').eq('id', id).single();
  const result = await supabase.from('dog_health_vaccinations').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  return withReminder(result, () => syncHealthReminder(current.data?.owner_id, current.data?.dog_id, 'health_vaccination', result.data?.id, result.data?.next_due_on, result.data ? `Impfung · ${result.data.vaccine_name || result.data.vaccine_type}` : 'Impfung'));
}
export async function updateMedication(id: string, input: Partial<Omit<HealthMedication, 'id' | 'owner_id' | 'dog_id' | 'created_at' | 'updated_at'>>) {
  const current = await supabase.from('dog_health_medications').select('owner_id,dog_id').eq('id', id).single();
  const result = await supabase.from('dog_health_medications').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  return withReminder(result, () => syncHealthReminder(current.data?.owner_id, current.data?.dog_id, 'health_medication', result.data?.id, result.data?.starts_on, result.data ? `Medikament · ${result.data.name}` : 'Medikament'));
}
export async function updateCondition(id: string, input: Partial<Omit<HealthCondition, 'id' | 'owner_id' | 'dog_id' | 'created_at' | 'updated_at'>>) { const result = await supabase.from('dog_health_conditions').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).select().single(); return withReminder(result, async () => 'not_required'); }
export async function updateParasiteTreatment(id: string, input: Partial<{ treatment_date: string; product: string | null; next_due_date: string | null; treatment_type: string; note: string | null }>) {
  const current = await supabase.from('dog_deworming_entries').select('owner_id,dog_id').eq('id', id).single();
  const result = await supabase.from('dog_deworming_entries').update(input).eq('id', id).select().single();
  return withReminder(result, () => syncHealthReminder(current.data?.owner_id, current.data?.dog_id, 'health_parasite_treatment', result.data?.id, result.data?.next_due_date, result.data ? parasiteTitle(result.data.treatment_type, result.data.product) : 'Parasitenbehandlung'));
}
export async function updateVetVisit(id: string, input: Partial<{ appointment_at: string; clinic_name: string | null; reason: string | null; diagnosis: string | null; treatment: string | null; note: string | null; status: string }>) {
  const current = await supabase.from('dog_vet_appointments').select('owner_id,dog_id').eq('id', id).single();
  const result = await supabase.from('dog_vet_appointments').update(input).eq('id', id).select().single();
  return withReminder(result, () => syncHealthReminder(current.data?.owner_id, current.data?.dog_id, 'health_vet_visit', result.data?.id, result.data?.appointment_at, result.data ? `Tierarzt · ${result.data.reason || 'Termin'}` : 'Tierarzttermin'));
}
export async function updateWeightEntry(id: string, input: Partial<{ entry_date: string; weight_kg: number; note: string | null }>) { const result = await supabase.from('dog_health_entries').update(input).eq('id', id).select().single(); return withReminder(result, async () => 'not_required'); }

export async function deleteVaccination(id: string) { return deleteHealthRow('dog_health_vaccinations', id, 'health_vaccination'); }
export async function deleteMedication(id: string) { return deleteHealthRow('dog_health_medications', id, 'health_medication'); }
export async function deleteCondition(id: string) { return deleteHealthRow('dog_health_conditions', id); }
export async function deleteParasiteTreatment(id: string) { return deleteHealthRow('dog_deworming_entries', id, 'health_parasite_treatment'); }
export async function deleteVetVisit(id: string) { return deleteHealthRow('dog_vet_appointments', id, 'health_vet_visit'); }
export async function deleteWeightEntry(id: string) { return deleteHealthRow('dog_health_entries', id); }

type ReminderSource = 'health_vaccination' | 'health_parasite_treatment' | 'health_medication' | 'health_vet_visit';
type HealthRowResult = { id: string; owner_id: string; dog_id: string; [key: string]: unknown };

async function deleteHealthRow(table: string, id: string, source_type?: ReminderSource): Promise<HealthMutationResult<null>> {
  const current = await supabase.from(table).select('id,owner_id,dog_id').eq('id', id).single();
  if (current.error || !current.data) return { data: null, error: current.error ?? { message: 'Gesundheitseintrag nicht gefunden' }, reminderSync: 'not_required' };
  const result = await supabase.from(table).delete().eq('id', id);
  if (result.error) return { data: null, error: result.error, reminderSync: 'not_required' };
  const reminderSync = source_type ? await removeHealthReminder(current.data.owner_id, source_type, id) : 'not_required';
  return { data: null, error: null, reminderSync };
}

async function withReminder<T extends HealthRowResult>(result: { data: T | null; error: { message: string } | null }, sync: () => Promise<ReminderSyncStatus>): Promise<HealthMutationResult<T>> {
  if (result.error || !result.data) return { data: result.data, error: result.error, reminderSync: 'not_required' };
  return { data: result.data, error: null, reminderSync: await sync() };
}

async function syncHealthReminder(owner_id: string | undefined, dog_id: string | undefined, source_type: ReminderSource, source_id: string | undefined, start_at: string | null | undefined, title: string): Promise<ReminderSyncStatus> {
  if (!owner_id || !dog_id || !source_id) return 'failed';
  const existing = await supabase.from('calendar_events').select('id').eq('owner_id', owner_id).eq('source_type', source_type).eq('source_id', source_id).maybeSingle();
  if (existing.error) return 'failed';
  const applicable = !!start_at && Number.isFinite(new Date(start_at).getTime()) && new Date(start_at).getTime() > Date.now();
  if (!applicable) {
    if (!existing.data) return 'not_required';
    const removed = await deleteCalendarEvent(existing.data.id);
    return removed.error ? 'failed' : 'not_required';
  }
  const payload = { dog_id, dog_ids: [dog_id], title, start_at: new Date(start_at!).toISOString(), source_type, source_id };
  if (existing.data) {
    const updated = await updateCalendarEvent(existing.data.id, payload);
    return updated.error ? 'failed' : 'synced';
  }
  const created = await createOwnEvent(owner_id, { ...payload, trainer_id: null, type: 'reminder', types: ['reminder'], end_at: null, location: null, discipline: null, notes: 'Gesundheitsakte', reminder_minutes: [1440], repeat: 'none' });
  return created.error ? 'failed' : 'synced';
}

async function removeHealthReminder(owner_id: string, source_type: ReminderSource, source_id: string): Promise<ReminderSyncStatus> {
  const existing = await supabase.from('calendar_events').select('id').eq('owner_id', owner_id).eq('source_type', source_type).eq('source_id', source_id).maybeSingle();
  if (existing.error) return 'failed';
  if (!existing.data) return 'not_required';
  const removed = await deleteCalendarEvent(existing.data.id);
  return removed.error ? 'failed' : 'synced';
}

function parasiteTitle(type: string | null, product: string | null): string { return product || (type === 'flea_tick' ? 'Parasitenprophylaxe' : type === 'heartworm' ? 'Herzwurmbehandlung' : 'Entwurmung'); }
