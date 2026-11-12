import { supabase } from '@/lib/supabase';
import { HEALTH_SECTION_LIMIT, type HealthSection } from '@/services/healthService';
import { fromISODate, toISODate } from '@/features/dogs/dateInput';
import { emptySharedHealth, mayOpenHealthDocument, type HealthWeightEntry, type SharedHealthOverviewData } from '@/features/dogs/sharing/records';
import type { SharedReadPermission } from '@/features/dogs/sharing/model';

type Row = Record<string, unknown>;
const stringOrNull = (value: unknown) => value == null || typeof value === 'string';
function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = fromISODate(value);
  return !!date && toISODate(date) === value;
}
function validWeight(value: unknown, dogId: string): value is HealthWeightEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Row;
  return typeof row.id === 'string' && !!row.id && row.dog_id === dogId && validDay(row.entry_date) &&
    typeof row.weight_kg === 'number' && Number.isFinite(row.weight_kg) &&
    (row.created_at === null || (typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))));
}

/** Exactly five RPC fields. NEVER fall back to dog_health_entries, including RPC-missing errors. */
export async function readSharedWeightEntries(dogId: string): Promise<HealthWeightEntry[]> {
  const { data, error } = await supabase.rpc('list_shared_dog_weights', { p_dog_id: dogId });
  if (error) throw new Error('shared_weight_unavailable');
  if (!Array.isArray(data) || data.length > HEALTH_SECTION_LIMIT + 1 || !data.every(row => validWeight(row, dogId))) throw new Error('shared_weight_invalid_response');
  return data.map(({ id, dog_id, entry_date, weight_kg, created_at }) => ({ id, dog_id, entry_date, weight_kg, created_at }));
}

/** Recipient reads only. Requested flags reduce queries; PostgreSQL RLS remains the authority. */
export async function loadSharedHealthOverview(dogId: string, permissions: readonly SharedReadPermission[]): Promise<SharedHealthOverviewData> {
  const result = emptySharedHealth();
  const has = (permission: SharedReadPermission) => permissions.includes(permission);
  const sectionErrors: NonNullable<SharedHealthOverviewData['sectionErrors']> = {};
  const sectionLimits: NonNullable<SharedHealthOverviewData['sectionLimits']> = {};
  async function read<K extends HealthSection>(key: K, query: PromiseLike<{ data: unknown; error: unknown }>, validate: (row: Row) => boolean) {
    try {
      const response = await query;
      if (response.error) throw new Error('shared_health_unavailable');
      if (!Array.isArray(response.data) || response.data.some(row => !row || typeof row !== 'object' ||
        typeof row.id !== 'string' || !row.id || row.dog_id !== dogId || !validate(row))) throw new Error('shared_health_invalid_response');
      if (response.data.length > HEALTH_SECTION_LIMIT) sectionLimits[key] = true;
      // Validation is specific to each existing table's display fields. No recipient writes.
      result[key] = response.data.slice(0, HEALTH_SECTION_LIMIT) as SharedHealthOverviewData[K];
    } catch { sectionErrors[key] = 'shared_health_unavailable'; }
  }
  const strings = (row: Row, fields: string[]) => fields.every(field => stringOrNull(row[field]));
  const tasks: Promise<void>[] = [];
  if (has('can_view_weight')) tasks.push((async () => {
    try { const rows = await readSharedWeightEntries(dogId); result.entries = rows.slice(0, HEALTH_SECTION_LIMIT); if (rows.length > HEALTH_SECTION_LIMIT) sectionLimits.entries = true; }
    catch { sectionErrors.entries = 'shared_weight_unavailable'; }
  })());
  if (has('can_view_vaccinations')) tasks.push(read('vaccinations', supabase.from('dog_health_vaccinations').select('*').eq('dog_id', dogId).order('administered_on', { ascending: false }).limit(HEALTH_SECTION_LIMIT + 1),
    row => validDay(row.administered_on) && typeof row.vaccine_type === 'string' && strings(row, ['vaccine_name', 'clinic_name', 'batch_number', 'note', 'next_due_on'])));
  if (has('can_view_medications')) tasks.push(read('medications', supabase.from('dog_health_medications').select('*').eq('dog_id', dogId).order('starts_on', { ascending: false }).limit(HEALTH_SECTION_LIMIT + 1),
    row => typeof row.name === 'string' && validDay(row.starts_on) && typeof row.is_active === 'boolean' && (row.dose_amount == null || typeof row.dose_amount === 'number') && strings(row, ['dosage', 'frequency', 'dose_unit', 'administration_route', 'prescribing_vet', 'note'])));
  if (has('can_view_diagnoses') || has('can_view_allergies')) {
    const kinds = [...(has('can_view_diagnoses') ? ['diagnosis'] : []), ...(has('can_view_allergies') ? ['allergy', 'intolerance'] : [])];
    tasks.push(read('conditions', supabase.from('dog_health_conditions').select('*').eq('dog_id', dogId).in('kind', kinds).order('started_on', { ascending: false }).limit(HEALTH_SECTION_LIMIT + 1),
      row => typeof row.kind === 'string' && kinds.includes(row.kind) && typeof row.name === 'string' && strings(row, ['started_on', 'created_at', 'status', 'note'])));
  }
  if (has('can_view_parasite_treatments')) tasks.push(read('parasites', supabase.from('dog_deworming_entries').select('*').eq('dog_id', dogId).order('treatment_date', { ascending: false }).limit(HEALTH_SECTION_LIMIT + 1),
    row => validDay(row.treatment_date) && strings(row, ['product', 'note', 'next_due_date', 'treatment_type'])));
  if (has('can_view_vet_visits')) tasks.push(read('vetVisits', supabase.from('dog_vet_appointments').select('*').eq('dog_id', dogId).order('appointment_at', { ascending: false }).limit(HEALTH_SECTION_LIMIT + 1),
    row => typeof row.appointment_at === 'string' && Number.isFinite(Date.parse(row.appointment_at)) && strings(row, ['reason', 'clinic_name', 'diagnosis', 'treatment', 'note'])));
  if (has('can_view_health_documents') || has('can_view_lab_results') || has('can_view_vet_reports')) tasks.push(read('documents', supabase.from('dog_documents').select('*').eq('dog_id', dogId)
    .or('category.eq.health,and(category.is.null,kind.in.(impfpass,hd_ed,gesundheit,tierarzt))').order('created_at', { ascending: false }).limit(HEALTH_SECTION_LIMIT + 1),
    row => typeof row.kind === 'string' && strings(row, ['title', 'category', 'subtype', 'file_url', 'issued_on', 'created_at', 'note'])));
  await Promise.all(tasks);
  result.documents = result.documents.filter(doc => mayOpenHealthDocument(permissions, doc));
  return { ...result, sectionErrors, sectionLimits };
}
