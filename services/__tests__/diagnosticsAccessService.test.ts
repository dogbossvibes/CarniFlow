import { refreshDiagnosticsAccess } from '../diagnosticsAccessService';
import { setDiagnosticsSession, revokeDiagnosticsAccess, hasDiagnosticsAccess, getDiagnosticsAccessSnapshot } from '@/lib/diagnosticsAccessState';
const mockSingle = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: (fields: string) => { mockSelect(fields); return { eq: (key: string, uid: string) => { mockEq(key, uid); return { abortSignal: () => ({ single: () => mockSingle() }) }; } }; } }) } }));
beforeEach(() => { jest.useFakeTimers(); setDiagnosticsSession(null); mockSingle.mockReset(); mockSelect.mockClear(); mockEq.mockClear(); });
afterEach(() => { revokeDiagnosticsAccess(); jest.useRealTimers(); });
it('uses a narrow own-account read, never tester roles', async () => {
  setDiagnosticsSession('owner'); mockSingle.mockResolvedValue({ data: { can_use_internal_tracking_diagnostics: true }, error: null });
  await refreshDiagnosticsAccess(); expect(hasDiagnosticsAccess()).toBe(true);
  expect(mockSelect).toHaveBeenCalledWith('can_use_internal_tracking_diagnostics'); expect(mockEq).toHaveBeenCalledWith('id', 'owner');
});
it.each([{ data: null, error: { message: 'missing column' } }, { data: { can_use_internal_tracking_diagnostics: false, is_internal_tester: true, tester_level: 'admin' }, error: null }, { data: { can_use_internal_tracking_diagnostics: 'true' }, error: null }])('denies unavailable, false or malformed capabilities', async response => {
  setDiagnosticsSession('owner'); mockSingle.mockResolvedValue(response); await refreshDiagnosticsAccess(); expect(hasDiagnosticsAccess()).toBe(false);
});
it('ignores an old positive response after account switch', async () => {
  setDiagnosticsSession('owner'); let finish!: (v: unknown) => void; mockSingle.mockReturnValueOnce(new Promise(r => { finish = r; }));
  const old = refreshDiagnosticsAccess(); setDiagnosticsSession('other'); finish({ data: { can_use_internal_tracking_diagnostics: true }, error: null }); await old;
  expect(getDiagnosticsAccessSnapshot().userId).toBe('other'); expect(hasDiagnosticsAccess()).toBe(false);
});
it('a later denial wins over an older delayed success', async () => {
  setDiagnosticsSession('owner'); let finish!: (v: unknown) => void; mockSingle.mockReturnValueOnce(new Promise(r => { finish = r; }));
  const old = refreshDiagnosticsAccess(); mockSingle.mockResolvedValueOnce({ data: null, error: {} }); await refreshDiagnosticsAccess();
  finish({ data: { can_use_internal_tracking_diagnostics: true }, error: null }); await old; expect(hasDiagnosticsAccess()).toBe(false);
});
