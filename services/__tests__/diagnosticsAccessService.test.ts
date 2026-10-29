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
it('distinguishes server denial from network failure without granting either', async () => {
  setDiagnosticsSession('owner');
  mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
  expect(await refreshDiagnosticsAccess()).toBe('unavailable'); expect(hasDiagnosticsAccess()).toBe(false);
  mockSingle.mockResolvedValueOnce({ data: { can_use_internal_tracking_diagnostics: false }, error: null });
  expect(await refreshDiagnosticsAccess()).toBe('denied'); expect(hasDiagnosticsAccess()).toBe(false);
});

it.each([0, 408, 429, 503])('keeps a still-valid grant on retryable status %i without renewing its lease', async status => {
  setDiagnosticsSession('owner');
  mockSingle.mockResolvedValueOnce({ data: { can_use_internal_tracking_diagnostics: true }, error: null, status: 200 });
  expect(await refreshDiagnosticsAccess()).toBe('allowed');
  const { expiresAt, generation } = getDiagnosticsAccessSnapshot();
  jest.advanceTimersByTime(20_000);
  mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'temporary failure' }, status });
  expect(await refreshDiagnosticsAccess()).toBe('unavailable');
  expect(hasDiagnosticsAccess()).toBe(true);
  expect(getDiagnosticsAccessSnapshot()).toMatchObject({ expiresAt, generation, allowed: true });
  jest.advanceTimersByTime(40_001);
  expect(hasDiagnosticsAccess()).toBe(false);
});
it.each([400, 401, 403, 406])('revokes an existing grant on nonretryable status %i', async status => {
  setDiagnosticsSession('owner');
  mockSingle.mockResolvedValueOnce({ data: { can_use_internal_tracking_diagnostics: true }, error: null, status: 200 });
  await refreshDiagnosticsAccess();
  mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'request denied' }, status });
  expect(await refreshDiagnosticsAccess()).toBe('unavailable');
  expect(hasDiagnosticsAccess()).toBe(false);
});
it('revokes an existing grant after an explicit false or malformed successful response', async () => {
  setDiagnosticsSession('owner');
  mockSingle.mockResolvedValue({ data: { can_use_internal_tracking_diagnostics: true }, error: null, status: 200 });
  await refreshDiagnosticsAccess();
  mockSingle.mockResolvedValueOnce({ data: { can_use_internal_tracking_diagnostics: false }, error: null, status: 200 });
  expect(await refreshDiagnosticsAccess()).toBe('denied');
  expect(hasDiagnosticsAccess()).toBe(false);
  await refreshDiagnosticsAccess();
  mockSingle.mockResolvedValueOnce({ data: { can_use_internal_tracking_diagnostics: 'true' }, error: null, status: 200 });
  expect(await refreshDiagnosticsAccess()).toBe('unavailable');
  expect(hasDiagnosticsAccess()).toBe(false);
});
it('never grants access on an initial offline request, including after account change', async () => {
  setDiagnosticsSession('owner');
  mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'offline' }, status: 0 });
  expect(await refreshDiagnosticsAccess()).toBe('unavailable');
  expect(hasDiagnosticsAccess()).toBe(false);
  setDiagnosticsSession('other');
  mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'offline' }, status: 0 });
  expect(await refreshDiagnosticsAccess()).toBe('unavailable');
  expect(hasDiagnosticsAccess()).toBe(false);
});
it('does not restore an expired grant after an offline response', async () => {
  setDiagnosticsSession('owner');
  mockSingle.mockResolvedValueOnce({ data: { can_use_internal_tracking_diagnostics: true }, error: null, status: 200 });
  await refreshDiagnosticsAccess();
  jest.advanceTimersByTime(60_001);
  mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'offline' }, status: 0 });
  expect(await refreshDiagnosticsAccess()).toBe('unavailable');
  expect(hasDiagnosticsAccess()).toBe(false);
});
