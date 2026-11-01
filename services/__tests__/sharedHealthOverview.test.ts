import { readSharedWeightEntries, loadSharedHealthOverview } from '../sharedHealthOverview';
const mockRpc = jest.fn(); const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args), from: (...args: unknown[]) => mockFrom(...args) } }));
jest.mock('@/services/healthService', () => ({ HEALTH_SECTION_LIMIT: 120 }));
const weight = { id: 'w', dog_id: 'd', entry_date: '2026-10-30', weight_kg: 31.6, created_at: null };
function query(data: unknown = [], error: unknown = null) {
  const chain = { select: jest.fn(), eq: jest.fn(), in: jest.fn(), or: jest.fn(), order: jest.fn(), limit: jest.fn().mockResolvedValue({ data, error }) };
  for (const method of ['select', 'eq', 'in', 'or', 'order'] as const) chain[method].mockReturnValue(chain);
  return chain;
}
beforeEach(() => { mockRpc.mockReset().mockResolvedValue({ data: [], error: null }); mockFrom.mockReset().mockImplementation(() => query()); });
it('loads only five weight fields and strips private legacy fields', async () => {
  mockRpc.mockResolvedValue({ data: [{ ...weight, note: 'private', load_level: 'hoch', is_rest_day: true }], error: null });
  expect(await readSharedWeightEntries('d')).toEqual([weight]);
  expect(mockRpc).toHaveBeenCalledWith('list_shared_dog_weights', { p_dog_id: 'd' });
  expect(mockFrom).not.toHaveBeenCalled();
});
it.each([{ code: 'PGRST202' }, { message: 'offline' }])('has no table fallback for RPC failure %p', async error => {
  mockRpc.mockResolvedValue({ data: null, error });
  await expect(readSharedWeightEntries('d')).rejects.toThrow('shared_weight_unavailable');
  expect(mockFrom).not.toHaveBeenCalled();
});
it.each([null, {}, [{ ...weight, dog_id: 'other' }], [{ ...weight, entry_date: '2026-02-31' }], [{ ...weight, weight_kg: '31' }], [{ ...weight, created_at: 'invalid' }]])('rejects invalid RPC payload %p', async data => {
  mockRpc.mockResolvedValue({ data, error: null });
  await expect(readSharedWeightEntries('d')).rejects.toThrow('shared_weight_invalid_response');
});
it.each([120, 121])('keeps display cap and sentinel distinct at %s rows', async count => {
  mockRpc.mockResolvedValue({ data: Array.from({ length: count }, (_, i) => ({ ...weight, id: String(i) })), error: null });
  const result = await loadSharedHealthOverview('d', ['can_view_weight']);
  expect(result.entries).toHaveLength(120); expect(result.sectionLimits).toEqual(count === 121 ? { entries: true } : {});
  expect(mockFrom).not.toHaveBeenCalled();
});
it('keeps RPC failure distinct from a genuine empty result', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
  const failed = await loadSharedHealthOverview('d', ['can_view_weight']);
  expect(failed.sectionErrors).toEqual({ entries: 'shared_weight_unavailable' });
  mockRpc.mockResolvedValue({ data: [], error: null });
  expect((await loadSharedHealthOverview('d', ['can_view_weight'])).sectionErrors).toEqual({});
});
it('does not read anything for summary or emergency-only grants', async () => {
  await loadSharedHealthOverview('d', ['can_view_health_summary', 'can_view_emergency_info']);
  expect(mockRpc).not.toHaveBeenCalled(); expect(mockFrom).not.toHaveBeenCalled();
});
it('requests only the allowed condition kind, never all health tables', async () => {
  const q = query(); mockFrom.mockReturnValue(q);
  await loadSharedHealthOverview('d', ['can_view_diagnoses']);
  expect(mockFrom.mock.calls).toEqual([['dog_health_conditions']]);
  expect(q.in).toHaveBeenCalledWith('kind', ['diagnosis']);
});
it('restricts document metadata request to health and still applies subtype permission', async () => {
  const q = query([{ id: 'l', dog_id: 'd', kind: 'health', category: 'health', subtype: 'lab', title: 'lab' }, { id: 'v', dog_id: 'd', kind: 'tierarzt', category: null, subtype: null, title: 'report' }]); mockFrom.mockReturnValue(q);
  const result = await loadSharedHealthOverview('d', ['can_view_lab_results']);
  expect(mockFrom.mock.calls).toEqual([['dog_documents']]); expect(q.or).toHaveBeenCalledWith('category.eq.health,and(category.is.null,kind.in.(impfpass,hd_ed,gesundheit,tierarzt))');
  expect(result.documents.map(d => d.id)).toEqual(['l']);
});
it('rejects foreign table rows instead of rendering them', async () => {
  mockFrom.mockReturnValue(query([{ id: 'v', dog_id: 'other', vaccine_type: 'Rabies', administered_on: '2026-10-30' }]));
  const result = await loadSharedHealthOverview('d', ['can_view_vaccinations']);
  expect(result.vaccinations).toEqual([]); expect(result.sectionErrors).toEqual({ vaccinations: 'shared_health_unavailable' });
});
