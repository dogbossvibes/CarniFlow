import type { DogDewormingEntryRow, DogHealthEntryRow, DogVetRow, DogDocumentRow } from '@/services/dogHub';
import type { HealthCondition, HealthMedication, HealthVaccination } from '@/types/health';
import type { HealthOverviewData } from '@/services/healthService';

export type HealthTimelineKind = 'vaccination' | 'parasite' | 'medication' | 'vet' | 'weight' | 'condition' | 'document';
export type HealthTimelineFilter = 'all' | HealthTimelineKind | 'condition_group';

export interface HealthTimelineItem {
  id: string;
  kind: HealthTimelineKind;
  title: string;
  date: string | null;
  detail: string | null;
}

function safeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : null;
}

function timelineId(kind: HealthTimelineKind, id: string): string { return `${kind}:${id}`; }

export function buildHealthTimeline(data: HealthOverviewData): HealthTimelineItem[] {
  const vaccinations = data.vaccinations.map((row: HealthVaccination) => ({ id: timelineId('vaccination', row.id), kind: 'vaccination' as const, title: row.vaccine_name || row.vaccine_type, date: safeDate(row.administered_on), detail: row.clinic_name }));
  const parasites = data.parasites.map((row: DogDewormingEntryRow) => ({ id: timelineId('parasite', row.id), kind: 'parasite' as const, title: row.product || parasiteLabel(row.treatment_type), date: safeDate(row.treatment_date), detail: row.next_due_date ? `Fällig ${row.next_due_date}` : null }));
  const medications = data.medications.map((row: HealthMedication) => ({ id: timelineId('medication', row.id), kind: 'medication' as const, title: row.name, date: safeDate(row.starts_on), detail: [row.dosage, row.frequency, row.is_active ? 'aktiv' : 'inaktiv'].filter(Boolean).join(' · ') || null }));
  const vets = data.vetVisits.map((row: DogVetRow) => ({ id: timelineId('vet', row.id), kind: 'vet' as const, title: row.reason || 'Tierarztbesuch', date: safeDate(row.appointment_at), detail: row.clinic_name }));
  const weights = data.entries.filter(e => e.weight_kg != null).map((row: DogHealthEntryRow) => ({ id: timelineId('weight', row.id), kind: 'weight' as const, title: 'Gewicht', date: safeDate(row.entry_date), detail: `${row.weight_kg} kg` }));
  const conditions = data.conditions.map((row: HealthCondition) => ({ id: timelineId('condition', row.id), kind: 'condition' as const, title: row.name, date: safeDate(row.started_on || row.created_at), detail: conditionLabel(row.kind) }));
  const documents = data.documents.map((row: DogDocumentRow) => ({ id: timelineId('document', row.id), kind: 'document' as const, title: row.title || 'Gesundheitsdokument', date: safeDate(row.issued_on || row.created_at), detail: row.subtype }));
  return [...vaccinations, ...parasites, ...medications, ...vets, ...weights, ...conditions, ...documents].sort((a, b) => {
    const aTime = a.date ? Date.parse(a.date) : null;
    const bTime = b.date ? Date.parse(b.date) : null;
    if (aTime == null && bTime != null) return 1;
    if (aTime != null && bTime == null) return -1;
    if (aTime != null && bTime != null && aTime !== bTime) return bTime - aTime;
    return a.id.localeCompare(b.id) || a.title.localeCompare(b.title);
  });
}

export function filterHealthTimeline(items: HealthTimelineItem[], filter: HealthTimelineFilter): HealthTimelineItem[] {
  if (filter === 'all') return items;
  if (filter === 'condition_group') return items.filter(item => item.kind === 'condition');
  return items.filter(item => item.kind === filter);
}

export function parasiteLabel(value: string | null | undefined): string {
  return value === 'flea_tick' ? 'Parasitenprophylaxe' : value === 'heartworm' ? 'Herzwurmbehandlung' : value === 'other' ? 'Parasitenbehandlung' : 'Entwurmung';
}

export function conditionLabel(value: HealthCondition['kind']): string {
  return value === 'diagnosis' ? 'Diagnose' : value === 'allergy' ? 'Allergie' : 'Unverträglichkeit';
}
