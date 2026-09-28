import type { DogDewormingEntryRow, DogHealthEntryRow, DogVetRow, DogDocumentRow } from '@/services/dogHub';
import type { HealthCondition, HealthMedication, HealthVaccination } from '@/types/health';
import type { HealthOverviewData } from '@/services/healthService';
// Type-only import — heatCycles.ts pulls in lib/supabase (→ AsyncStorage) at
// module scope. This file was previously free of that dependency and is
// imported very widely (every Health test file included); importing the
// runtime `durationDays` from there would drag that whole chain in here too.
// `import type` erases at compile time, so only the type comes along; the
// one-line duration formula below is intentionally duplicated from
// heatCycles.ts's own durationDays (kept byte-identical) rather than
// importing it — not a second parallel Läufigkeits-*business logic*, just
// avoiding an unrelated dependency-chain regression for a single pure sum.
import type { HeatCycle } from '@/features/dogs/heatCycles';
import { fromISODate } from '@/features/dogs/dateInput';

// Byte-identical to heatCycles.ts's own durationDays — see the import-type
// note above for why it is duplicated here instead of imported.
function heatDurationDays(start: string, end: string | null): number | null {
  if (!end) return null;
  const startDate = fromISODate(start);
  const endDate = fromISODate(end);
  if (!startDate || !endDate) return null;
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
}

export type HealthTimelineKind = 'vaccination' | 'parasite' | 'medication' | 'vet' | 'weight' | 'condition' | 'document' | 'heat';
export type HealthTimelineFilter = 'all' | HealthTimelineKind | 'condition_group';

export interface HealthTimelineItem {
  id: string;
  kind: HealthTimelineKind;
  title: string;
  date: string | null;
  detail: string | null;
  // Phase 3 (28.09.2026): an optional second line for the Verlauf card — used
  // for the vaccination "Nächste Fälligkeit" label so it is always visible
  // on the card itself, not only inside the detail sheet. The DB column is
  // next_due_on — there is no separate valid_until field, so this must never
  // be worded "Gültig bis" (a distinct semantic that doesn't exist here).
  secondary?: string | null;
}

function safeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : null;
}

function timelineId(kind: HealthTimelineKind, id: string): string { return `${kind}:${id}`; }

// Local dd.mm.yyyy formatter (CH-Format), matching the convention used
// elsewhere for Health dates, without pulling in the screen's own formatDate.
function fmtDayMonthYear(value: string): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}` : null;
}

// Läufigkeit-Integration (29.09.2026): optionaler 2. Parameter, additiv —
// jeder bestehende Aufrufer, der nur `data` übergibt, bleibt unverändert
// funktionsfähig (Default `[]`). Gender-Gating (nur Hündinnen) passiert
// beim Aufrufer (app/dog-health-record/[id].tsx via isFemaleDog) — diese
// Funktion bleibt rein und rendert einfach, was ihr übergeben wird. Die
// vollständige, spezialisierte Historie bleibt im eigenen
// Läufigkeit-Bereich (components/dogs/HealthHeatSection.tsx); dies ist nur
// eine zweite, kompakte Darstellung derselben Daten — kein zweites
// Datenmodell.
export function buildHealthTimeline(data: HealthOverviewData, heatCycles: HeatCycle[] = []): HealthTimelineItem[] {
  const vaccinations = data.vaccinations.map((row: HealthVaccination) => ({ id: timelineId('vaccination', row.id), kind: 'vaccination' as const, title: row.vaccine_name || row.vaccine_type, date: safeDate(row.administered_on), detail: row.clinic_name, secondary: row.next_due_on ? `Nächste Fälligkeit: ${fmtDayMonthYear(row.next_due_on) ?? row.next_due_on}` : null }));
  const parasites = data.parasites.map((row: DogDewormingEntryRow) => ({ id: timelineId('parasite', row.id), kind: 'parasite' as const, title: row.product || parasiteLabel(row.treatment_type), date: safeDate(row.treatment_date), detail: row.next_due_date ? `Fällig ${row.next_due_date}` : null }));
  const medications = data.medications.map((row: HealthMedication) => ({ id: timelineId('medication', row.id), kind: 'medication' as const, title: row.name, date: safeDate(row.starts_on), detail: [row.dosage, row.frequency, row.is_active ? 'aktiv' : 'inaktiv'].filter(Boolean).join(' · ') || null }));
  const vets = data.vetVisits.map((row: DogVetRow) => ({ id: timelineId('vet', row.id), kind: 'vet' as const, title: row.reason || 'Tierarztbesuch', date: safeDate(row.appointment_at), detail: row.clinic_name }));
  const weights = data.entries.filter(e => e.weight_kg != null).map((row: DogHealthEntryRow) => ({ id: timelineId('weight', row.id), kind: 'weight' as const, title: 'Gewicht', date: safeDate(row.entry_date), detail: `${row.weight_kg} kg` }));
  const conditions = data.conditions.map((row: HealthCondition) => ({ id: timelineId('condition', row.id), kind: 'condition' as const, title: row.name, date: safeDate(row.started_on || row.created_at), detail: conditionLabel(row.kind) }));
  const documents = data.documents.map((row: DogDocumentRow) => ({ id: timelineId('document', row.id), kind: 'document' as const, title: row.title || 'Gesundheitsdokument', date: safeDate(row.issued_on || row.created_at), detail: row.subtype }));
  const heat = heatCycles.map((cycle: HeatCycle) => { const duration = heatDurationDays(cycle.startDate, cycle.endDate); return { id: timelineId('heat', cycle.id), kind: 'heat' as const, title: 'Läufigkeit', date: safeDate(cycle.startDate), detail: cycle.endDate ? `${fmtDayMonthYear(cycle.startDate)} – ${fmtDayMonthYear(cycle.endDate)}` : `Seit ${fmtDayMonthYear(cycle.startDate)}`, secondary: duration ? `${duration} Tage` : null }; });
  return [...vaccinations, ...parasites, ...medications, ...vets, ...weights, ...conditions, ...documents, ...heat].sort((a, b) => {
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
