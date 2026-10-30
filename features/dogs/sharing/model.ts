import { HEALTH_PERMISSIONS, type HealthPermission } from '@/types/health';
import type { TranslationKey } from '@/i18n';

export type SharedReadPermission = Extract<HealthPermission, `can_view_${string}`>;
export interface ReceivedHealthGrant {
  grant_id: string; dog_id: string; dog_name: string; owner_display_name: string | null;
  starts_at: string; expires_at: string | null; permissions: SharedReadPermission[];
}
export interface SharedDog {
  id: string; name: string; ownerName: string | null; grants: ReceivedHealthGrant[];
  permissions: SharedReadPermission[];
}
export const SHARED_PERMISSION_LABELS: Record<SharedReadPermission, TranslationKey> = {
  can_view_health_summary: 'health.uxSummaryPermission', can_view_weight: 'health.recordWeight',
  can_view_vaccinations: 'health.uxVaccinations', can_view_parasite_treatments: 'health.recordParasites',
  can_view_medications: 'health.uxMedications', can_view_diagnoses: 'health.recordConditions',
  can_view_allergies: 'health.uxAllergiesPermission', can_view_vet_visits: 'health.uxVetAppointments',
  can_view_vet_reports: 'health.uxVetReports', can_view_lab_results: 'health.uxLabResults',
  can_view_health_documents: 'health.uxHealthDocuments', can_view_emergency_info: 'health.recordEmergencyTitle',
};
export const RECORD_PERMISSIONS: SharedReadPermission[] = ['can_view_weight', 'can_view_vaccinations', 'can_view_parasite_treatments', 'can_view_medications', 'can_view_diagnoses', 'can_view_allergies', 'can_view_vet_visits'];
export const DOCUMENT_PERMISSIONS: SharedReadPermission[] = ['can_view_health_documents', 'can_view_lab_results', 'can_view_vet_reports'];
const readPermissions = HEALTH_PERMISSIONS.filter((p): p is SharedReadPermission => p.startsWith('can_view_'));

// The RPC enforces identity/connection/revocation. Reject malformed or expired
// rows locally as well; this projection never grants server authorization.
export function projectSharedDogs(rows: ReceivedHealthGrant[], now = Date.now()): SharedDog[] {
  const dogs = new Map<string, SharedDog>();
  for (const row of rows) {
    const start = Date.parse(row.starts_at);
    const end = row.expires_at === null ? Infinity : Date.parse(row.expires_at);
    const permissions = readPermissions.filter(p => row.permissions?.includes(p));
    if (!Number.isFinite(start) || start > now || !(end > now) || !permissions.length || !row.dog_id || !row.dog_name) continue;
    const dog = dogs.get(row.dog_id) ?? { id: row.dog_id, name: row.dog_name, ownerName: row.owner_display_name, grants: [], permissions: [] };
    if (dog.grants.some(g => g.grant_id === row.grant_id)) continue;
    dog.grants.push({ ...row, permissions });
    dog.permissions = readPermissions.filter(p => dog.permissions.includes(p) || permissions.includes(p));
    dogs.set(row.dog_id, dog);
  }
  return [...dogs.values()].sort((a, b) => a.name.localeCompare(b.name));
}
