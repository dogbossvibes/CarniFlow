import { projectSharedDogs, type ReceivedHealthGrant } from '../model';
import { scopeSharedHealth, mayOpenHealthDocument } from '../records';
import type { HealthOverviewData } from '@/services/healthService';
const now = Date.parse('2026-10-29T12:00:00Z');
const grant = (patch: Partial<ReceivedHealthGrant> = {}): ReceivedHealthGrant => ({ grant_id: 'g', dog_id: 'd', dog_name: 'Yam', owner_display_name: 'Owner', starts_at: '2026-01-01', expires_at: null, permissions: ['can_view_weight'], ...patch });
describe('recipient discovery', () => {
  it('merges only currently active grants per dog without duplicate grants', () => {
    const result = projectSharedDogs([grant(), grant(), grant({ grant_id: 'g2', permissions: ['can_view_medications'] }), grant({ grant_id: 'future', starts_at: '2027-01-01', permissions: ['can_view_diagnoses'] })], now);
    expect(result).toHaveLength(1);
    expect(result[0].grants).toHaveLength(2);
    expect(result[0].permissions).toEqual(['can_view_weight', 'can_view_medications']);
  });
  it.each(['2026-10-29T12:00:00Z', '2026-01-01', 'invalid'])('rejects expired or malformed expiry %s', expires_at => {
    expect(projectSharedDogs([grant({ expires_at })], now)).toEqual([]);
  });
  it('rejects malformed starts, no read rights and write rights', () => {
    expect(projectSharedDogs([grant({ starts_at: 'invalid' }), grant({ permissions: [] }), grant({ permissions: ['can_edit_health'] as never })], now)).toEqual([]);
  });
  it('drops rights belonging to the expiring grant only', () => {
    const rows = [grant({ expires_at: '2026-10-29T12:01:00Z' }), grant({ grant_id: 'g2', permissions: ['can_view_medications'] })];
    expect(projectSharedDogs(rows, now + 60000)[0].permissions).toEqual(['can_view_medications']);
  });
});
describe('granular recipient record projection', () => {
  const data: HealthOverviewData = { entries: [], vaccinations: [], medications: [], conditions: [], parasites: [], vetVisits: [], documents: [] };
  const document = (subtype: string | null = null, category = 'health') => ({ id: 'doc', dog_id: 'd', kind: 'health', title: 'Report', category, subtype, file_url: 'private/file', issued_on: null, note: null, created_at: null });
  it('keeps lab and vet-report permissions separate from general health documents', () => {
    expect(mayOpenHealthDocument(['can_view_health_documents'], document('lab'))).toBe(false);
    expect(mayOpenHealthDocument(['can_view_lab_results'], document('lab'))).toBe(true);
    expect(mayOpenHealthDocument(['can_view_lab_results'], document('vet_report'))).toBe(false);
    expect(mayOpenHealthDocument(['can_view_health_documents'], document(null, 'breeding'))).toBe(false);
  });
  it('removes data from other connection permissions and does not mutate source', () => {
    const source = { ...data, documents: [document('lab'), document('vet_report')] };
    expect(scopeSharedHealth(source, ['can_view_lab_results']).documents.map(d => d.subtype)).toEqual(['lab']);
    expect(source.documents).toHaveLength(2);
    expect(scopeSharedHealth(source, []).documents).toEqual([]);
  });
});
