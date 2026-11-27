import { dismissCoachSuggestion, loadDismissedCoachKeys, parseDismissed, parsePrefs, withRule, EMPTY_PREFS } from '../storage';
const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
}));
const mockInsert = jest.fn(async () => ({ error: null }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(() => ({ insert: mockInsert })) } }));


describe('Coach-Einstellungen und Ausblenden', () => {
  beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; mockInsert.mockClear(); });

  it('kaputte oder fremde Einstellungen fallen auf Standard zurück', () => {
    expect(parsePrefs(null)).toEqual(EMPTY_PREFS);
    expect(parsePrefs('{kaputt')).toEqual(EMPTY_PREFS);
    expect(parsePrefs(JSON.stringify({ hiddenInProfile: 'ja', disabledRules: { d1: ['corner', 'unbekannt', 'corner'], d2: 'x' } })))
      .toEqual({ hiddenInProfile: false, disabledRules: { d1: ['corner'] } });
  });

  it('Regel aus und wieder ein je Hund', () => {
    const off = withRule(EMPTY_PREFS, 'd1', 'corner', false);
    expect(off.disabledRules).toEqual({ d1: ['corner'] });
    expect(withRule(off, 'd1', 'corner', true).disabledRules).toEqual({});
  });

  it('«Nicht passend» wirkt lokal und meldet nur den Schlüssel an den Server', async () => {
    await dismissCoachSuggestion('u1', 'd1', 'coach:v1:d1:2026-11-28:corner:faehrte');
    expect(parseDismissed(mockStore['anyvo.coachWeek.dismissed.v1:u1'])).toEqual(['coach:v1:d1:2026-11-28:corner:faehrte']);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1', dog_id: 'd1', insight_type: 'training_gap', is_dismissed: true, data: { key: 'coach:v1:d1:2026-11-28:corner:faehrte' },
    }));
    const keys = await loadDismissedCoachKeys('u1', ['coach:v1:d1:x:pause:faehrte', 'training_gap:alt']);
    expect(keys.sort()).toEqual(['coach:v1:d1:2026-11-28:corner:faehrte', 'coach:v1:d1:x:pause:faehrte']);
  });

  it('Server lehnt ab oder fällt aus: lokal bleibt ausgeblendet', async () => {
    mockInsert.mockImplementationOnce(async () => { throw new Error('offline'); });
    await dismissCoachSuggestion('u2', 'd1', 'coach:v1:k');
    expect(await loadDismissedCoachKeys('u2', [])).toEqual(['coach:v1:k']);
  });
});
