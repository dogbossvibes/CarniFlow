export type HealthConditionKind = 'diagnosis' | 'allergy' | 'intolerance';

export type HealthConditionStatus =
  | 'active'
  | 'resolved'
  | 'chronic'
  | 'suspected'
  | 'historical'
  | 'inactive'
  | 'other';

export type ParasiteTreatmentType = 'deworming' | 'flea_tick' | 'heartworm' | 'other';

export type HealthRolePreset = 'trainer' | 'vet' | 'family' | 'caregiver' | 'guest' | 'custom';

export type HealthPermission =
  | 'can_view_health_summary'
  | 'can_view_weight'
  | 'can_view_vaccinations'
  | 'can_view_parasite_treatments'
  | 'can_view_medications'
  | 'can_view_diagnoses'
  | 'can_view_allergies'
  | 'can_view_vet_visits'
  | 'can_view_vet_reports'
  | 'can_view_lab_results'
  | 'can_view_health_documents'
  | 'can_view_emergency_info'
  | 'can_edit_health'
  | 'can_add_vet_notes';

export type HealthCalendarSourceType =
  | 'health_vaccination'
  | 'health_parasite_treatment'
  | 'health_medication'
  | 'health_vet_visit'
  | 'health_check';

export interface HealthVaccination {
  id: string;
  owner_id: string;
  dog_id: string;
  vaccine_type: string;
  administered_on: string;
  next_due_on: string | null;
  clinic_name: string | null;
  vaccine_name: string | null;
  note: string | null;
  document_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthMedication {
  id: string;
  owner_id: string;
  dog_id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthCondition {
  id: string;
  owner_id: string;
  dog_id: string;
  kind: HealthConditionKind;
  name: string;
  status: HealthConditionStatus;
  started_on: string | null;
  ended_on: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthAccessGrant {
  id: string;
  dog_id: string;
  owner_id: string;
  connection_id: string | null;
  grantee_user_id: string;
  role_preset: HealthRolePreset;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  can_view_health_summary: boolean;
  can_view_weight: boolean;
  can_view_vaccinations: boolean;
  can_view_parasite_treatments: boolean;
  can_view_medications: boolean;
  can_view_diagnoses: boolean;
  can_view_allergies: boolean;
  can_view_vet_visits: boolean;
  can_view_vet_reports: boolean;
  can_view_lab_results: boolean;
  can_view_health_documents: boolean;
  can_view_emergency_info: boolean;
  can_edit_health: boolean;
  can_add_vet_notes: boolean;
  created_at: string;
  updated_at: string;
}

export const HEALTH_PERMISSIONS: readonly HealthPermission[] = [
  'can_view_health_summary',
  'can_view_weight',
  'can_view_vaccinations',
  'can_view_parasite_treatments',
  'can_view_medications',
  'can_view_diagnoses',
  'can_view_allergies',
  'can_view_vet_visits',
  'can_view_vet_reports',
  'can_view_lab_results',
  'can_view_health_documents',
  'can_view_emergency_info',
  'can_edit_health',
  'can_add_vet_notes',
];
