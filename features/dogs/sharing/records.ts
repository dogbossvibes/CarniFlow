import type { HealthOverviewData, HealthSection } from '@/services/healthService';
import { isHealthDocument } from '@/features/dogs/documentCategories';
import type { SharedReadPermission } from './model';
import type { DogDocumentRow, DogHealthEntryRow } from '@/services/dogHub';
export type HealthWeightEntry = Pick<DogHealthEntryRow, 'id' | 'dog_id' | 'entry_date' | 'weight_kg' | 'created_at'>;
export type SharedHealthOverviewData = Omit<HealthOverviewData, 'entries'> & { entries: HealthWeightEntry[] };


export function emptySharedHealth(): SharedHealthOverviewData {
  return { entries: [], vaccinations: [], medications: [], conditions: [], parasites: [], vetVisits: [], documents: [] };
}

export function mayOpenHealthDocument(permissions: readonly SharedReadPermission[], doc: Pick<DogDocumentRow, 'kind' | 'category' | 'subtype'>) {
  if (!isHealthDocument(doc)) return false;
  // Match can_view_dog_document: legacy Tierarzt without subtype is a vet report.
  const subtype = doc.subtype ?? (doc.kind === 'tierarzt' ? 'vet_report' : 'other');
  return permissions.includes(subtype === 'lab' ? 'can_view_lab_results' : subtype === 'vet_report' ? 'can_view_vet_reports' : 'can_view_health_documents');
}

// Defence in depth in addition to table RLS. A denied section must never be
// shown as an empty, healthy result or leak through a pre-existing connection.
export function scopeSharedHealth(data: SharedHealthOverviewData, permissions: readonly SharedReadPermission[]): SharedHealthOverviewData {
  const has = (p: SharedReadPermission) => permissions.includes(p);
  const allowed: Record<HealthSection, boolean> = {
    entries: has('can_view_weight'), vaccinations: has('can_view_vaccinations'), medications: has('can_view_medications'),
    conditions: has('can_view_diagnoses') || has('can_view_allergies'), parasites: has('can_view_parasite_treatments'),
    vetVisits: has('can_view_vet_visits'), documents: has('can_view_health_documents') || has('can_view_lab_results') || has('can_view_vet_reports'),
  };
  return {
    ...data,
    entries: has('can_view_weight') ? data.entries : [],
    vaccinations: has('can_view_vaccinations') ? data.vaccinations : [],
    medications: has('can_view_medications') ? data.medications : [],
    conditions: data.conditions.filter(c => has(c.kind === 'diagnosis' ? 'can_view_diagnoses' : 'can_view_allergies')),
    parasites: has('can_view_parasite_treatments') ? data.parasites : [],
    vetVisits: has('can_view_vet_visits') ? data.vetVisits : [],
    documents: data.documents.filter(doc => mayOpenHealthDocument(permissions, doc)),
    sectionErrors: Object.fromEntries(Object.entries(data.sectionErrors ?? {}).filter(([key]) => allowed[key as HealthSection])),
    sectionLimits: Object.fromEntries(Object.entries(data.sectionLimits ?? {}).filter(([key]) => allowed[key as HealthSection])),
  };
}
