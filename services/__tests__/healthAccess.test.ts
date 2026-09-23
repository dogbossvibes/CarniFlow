/* eslint-disable import/first */
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/services/connectionService', () => ({ listConnections: jest.fn() }));

import { HEALTH_PRESET_PERMISSIONS, healthGrantStatus, permissionsForPreset } from '@/services/healthService';

describe('health access grant presets', () => {
  it('keeps presets granular and read-only', () => {
    expect(permissionsForPreset('trainer')).toEqual(['can_view_health_summary', 'can_view_weight']);
    expect(permissionsForPreset('vet')).toContain('can_view_vet_reports');
    expect(permissionsForPreset('vet')).not.toContain('can_edit_health');
    expect(permissionsForPreset('vet')).not.toContain('can_add_vet_notes');
    expect(HEALTH_PRESET_PERMISSIONS.family).toContain('can_view_medications');
  });

  it('reports active, future, expired and revoked states from timestamps', () => {
    const now = new Date('2026-09-23T12:00:00Z');
    expect(healthGrantStatus({ starts_at: '2026-09-23T11:00:00Z', expires_at: null, revoked_at: null }, now)).toBe('active');
    expect(healthGrantStatus({ starts_at: '2026-09-24T00:00:00Z', expires_at: null, revoked_at: null }, now)).toBe('future');
    expect(healthGrantStatus({ starts_at: '2026-09-20T00:00:00Z', expires_at: '2026-09-22T00:00:00Z', revoked_at: null }, now)).toBe('expired');
    expect(healthGrantStatus({ starts_at: '2026-09-20T00:00:00Z', expires_at: null, revoked_at: '2026-09-21T00:00:00Z' }, now)).toBe('revoked');
  });
});
