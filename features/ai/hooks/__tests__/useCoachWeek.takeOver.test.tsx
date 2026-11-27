import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CoachSuggestion } from '@/features/ai/coachWeek';
import { useCoachWeek } from '../useCoachWeek';

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(() => ({ insert: jest.fn(async () => ({ error: null })) })) } }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('@/features/ai/services/insightService', () => ({
  loadCoachDataset: jest.fn(async () => ({ units: [], tracks: [], entries: [], lastByDog: {} })),
  fetchDismissedKeys: jest.fn(async () => new Set<string>()),
}));
jest.mock('@/features/dogs/heatCycles', () => ({ getHeatCycles: jest.fn(async () => []) }));
jest.mock('@/features/exam-book/store', () => ({ examBookAvailable: () => false, listExamsForDog: jest.fn(async () => []) }));
const mockGetEvents = jest.fn();
const mockCreate = jest.fn();
const mockCreated: Record<string, unknown>[] = [];
jest.mock('@/services/calendarService', () => ({
  getCalendarEvents: (...a: unknown[]) => mockGetEvents(...a),
  createOwnEvent: (...a: unknown[]) => mockCreate(...a),
}));


const dog = { id: 'd1', owner_id: 'u1', birth_date: null, discipline: 'IGP', gender: 'male' as const };
const sg = (key: string, date: string, discipline: CoachSuggestion['discipline'] = 'faehrte'): CoachSuggestion =>
  ({ key, rule: 'pause', discipline, focus: 'maintain', date, params: {}, reasons: [], priority: 50, hard: false });

type Api = ReturnType<typeof useCoachWeek>;
let api!: Api;
const keep = (a: Api) => { api = a; };
function Probe({ d, onApi }: { d: typeof dog; onApi: (a: Api) => void }) { onApi(useCoachWeek(d, true)); return null; }
async function mount(d = dog) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  let r!: ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(<QueryClientProvider client={qc}><Probe d={d} onApi={keep} /></QueryClientProvider>); });
  return r;
}

describe('Coach übernehmen', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    mockGetEvents.mockReset(); mockCreate.mockReset();
    mockGetEvents.mockResolvedValue({ data: [], error: null });
    mockCreated.length = 0;
    mockCreate.mockImplementation(async (_uid: string, ev: Record<string, unknown>) => {
      const row = { ...ev, id: `new-${mockCreated.length + 1}`, owner_id: 'u1', status: 'confirmed' };
      mockCreated.push(row);
      return { data: row, error: null };
    });
  });

  it('legt nur Neues an, merkt die Termin-ID und überspringt beim zweiten Mal', async () => {
    const r = await mount();
    const items = [sg('coach:v1:a', '2026-11-28'), sg('coach:v1:b', '2026-11-30', 'unterordnung')].map(s => ({ suggestion: s, title: 'T', notes: 'N' }));
    let res!: Awaited<ReturnType<typeof api.takeOver>>;
    await act(async () => { res = await api.takeOver(items); });
    expect(res).toEqual({ created: 2, skipped: 0, failed: 0 });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[0][1]).not.toHaveProperty('source_type');
    expect(JSON.parse(mockStore['anyvo.coachWeek.planned.v1:u1'])).toEqual({ 'coach:v1:a': 'new-1', 'coach:v1:b': 'new-2' });
    // Server kennt die neuen Termine jetzt.
    mockGetEvents.mockResolvedValue({ data: [...mockCreated], error: null });
    await act(async () => { res = await api.takeOver(items); });
    expect(res).toEqual({ created: 0, skipped: 2, failed: 0 });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    act(() => r.unmount());
  });

  it('Termine nicht lesbar: nichts anlegen (keine Doppel)', async () => {
    const r = await mount();
    mockGetEvents.mockResolvedValue({ data: null, error: { message: 'offline' } });
    let res!: Awaited<ReturnType<typeof api.takeOver>>;
    await act(async () => { res = await api.takeOver([{ suggestion: sg('coach:v1:a', '2026-11-28'), title: 'T', notes: 'N' }]); });
    expect(res).toEqual({ created: 0, skipped: 0, failed: 1 });
    expect(mockCreate).not.toHaveBeenCalled();
    act(() => r.unmount());
  });

  it('Anlegen schlägt fehl: gezählt, nichts gemerkt', async () => {
    const r = await mount();
    mockCreate.mockResolvedValueOnce({ data: null, error: { message: 'nein' } });
    let res!: Awaited<ReturnType<typeof api.takeOver>>;
    await act(async () => { res = await api.takeOver([{ suggestion: sg('coach:v1:a', '2026-11-28'), title: 'T', notes: 'N' }]); });
    expect(res).toEqual({ created: 0, skipped: 0, failed: 1 });
    expect(mockStore['anyvo.coachWeek.planned.v1:u1']).toBeUndefined();
    act(() => r.unmount());
  });

  it('fremder Hund: nie anlegen', async () => {
    const r = await mount({ ...dog, owner_id: 'jemand' });
    let res!: Awaited<ReturnType<typeof api.takeOver>>;
    await act(async () => { res = await api.takeOver([{ suggestion: sg('coach:v1:a', '2026-11-28'), title: 'T', notes: 'N' }]); });
    expect(res.created).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
    act(() => r.unmount());
  });
});
