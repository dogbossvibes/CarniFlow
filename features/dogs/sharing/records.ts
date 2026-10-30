import type { SharedHealthOverviewData } from '@/services/healthService';
import { isHealthDocument } from '@/features/dogs/documentCategories';
import type { SharedReadPermission } from './model';
import type { DogDocumentRow } from '@/services/dogHub';

export function mayOpenHealthDocument(permissions: readonly SharedReadPermission[], doc: DogDocumentRow) {
  if (!isHealthDocument(doc)) return false;
  return permissions.includes(doc.subtype === 'lab' ? 'can_view_lab_results' : doc.subtype === 'vet_report' ? 'can_view_vet_reports' : 'can_view_health_documents');
}

// Defence in depth in addition to table RLS. A denied section must never be
// shown as an empty, healthy result or leak through a pre-existing connection.
export function scopeSharedHealth(data: SharedHealthOverviewData, permissions: readonly SharedReadPermission[]): SharedHealthOverviewData {
  const has = (p: SharedReadPermission) => permissions.includes(p);
  return {
    ...data,
    entries: has('can_view_weight') ? data.entries : [],
    vaccinations: has('can_view_vaccinations') ? data.vaccinations : [],
    medications: has('can_view_medications') ? data.medications : [],
    conditions: data.conditions.filter(c => has(c.kind === 'diagnosis' ? 'can_view_diagnoses' : 'can_view_allergies')),
    parasites: has('can_view_parasite_treatments') ? data.parasites : [],
    vetVisits: has('can_view_vet_visits') ? data.vetVisits : [],
    documents: data.documents.filter(doc => mayOpenHealthDocument(permissions, doc)),
  };
}
