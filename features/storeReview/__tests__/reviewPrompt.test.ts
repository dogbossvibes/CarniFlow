import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetPendingReviewForTests, maybeRequestReview, noteSuccessfulSearch, reviewStateKey,
  sanitizeReviewState, shouldAskForReview, REVIEW_DELAY_MS,
} from '../reviewPrompt';

const DAY = 86_400_000;
const T0 = Date.parse('2026-11-24T12:00:00Z');
const native = () => ({ isAvailableAsync: jest.fn(async () => true), requestReview: jest.fn(async () => {}) });
const noWait = jest.fn(async () => {});
const deps = (n: ReturnType<typeof native> | null, busy = false, now = T0) => ({ native: n, isTrackBusy: () => busy, nowMs: () => now, wait: noWait });
const stored = async (u: string) => sanitizeReviewState(JSON.parse((await AsyncStorage.getItem(reviewStateKey(u))) ?? 'null'));

async function searches(user: string, count: number, now = T0, prefix = 'r') {
  for (let i = 0; i < count; i++) await noteSuccessfulSearch(user, `s-${prefix}${i}`, `${prefix}${i}`, now);
}

beforeEach(async () => { await AsyncStorage.clear(); __resetPendingReviewForTests(); noWait.mockClear(); });

describe('Bewertungsdialog nach erfolgreicher Absuche', () => {
  it('fragt erst nach der 3. erfolgreichen Absuche, auf deren Auswertung, nach kurzer Pause', async () => {
    const n = native();
    await searches('u1', 2);
    expect(await maybeRequestReview('s-r1', deps(n))).toBe(false);
    await noteSuccessfulSearch('u1', 's-r2', 'r2', T0);
    expect(await maybeRequestReview('s-other', deps(n))).toBe(false);
    expect(n.requestReview).not.toHaveBeenCalled();
    await noteSuccessfulSearch('u1', 's-r3', 'r3', T0);
    expect(await maybeRequestReview('s-r3', deps(n))).toBe(true);
    expect(noWait).toHaveBeenCalledWith(REVIEW_DELAY_MS);
    expect(n.requestReview).toHaveBeenCalledTimes(1);
    expect((await stored('u1')).lastPromptAt).toBe(new Date(T0).toISOString());
  });

  it('zählt dieselbe Absuche nur einmal', async () => {
    for (let i = 0; i < 5; i++) await noteSuccessfulSearch('u2', 's', 'same-run', T0);
    expect((await stored('u2')).successfulSearches).toBe(1);
  });

  it('höchstens einmal in 90 Tagen', async () => {
    const n = native();
    await searches('u3', 3);
    expect(await maybeRequestReview('s-r2', deps(n))).toBe(true);
    await noteSuccessfulSearch('u3', 's-a', 'a', T0 + 89 * DAY);
    expect(await maybeRequestReview('s-a', deps(n, false, T0 + 89 * DAY))).toBe(false);
    await noteSuccessfulSearch('u3', 's-b', 'b', T0 + 90 * DAY);
    expect(await maybeRequestReview('s-b', deps(n, false, T0 + 90 * DAY))).toBe(true);
    expect(n.requestReview).toHaveBeenCalledTimes(2);
  });

  it('nie, solange gelegt oder gesucht wird oder die Auswertung schon verlassen ist', async () => {
    const n = native();
    await searches('u4', 3);
    expect(await maybeRequestReview('s-r2', deps(n, true))).toBe(false);
    expect(n.requestReview).not.toHaveBeenCalled();
    expect((await stored('u4')).lastPromptAt).toBeNull();
  });

  it('ohne natives Modul (heutiger Build) passiert nichts und nichts wirft', async () => {
    await searches('u5', 3);
    await expect(maybeRequestReview('s-r2', deps(null))).resolves.toBe(false);
    expect((await stored('u5')).lastPromptAt).toBeNull();
  });

  it('nicht verfügbar (z. B. TestFlight): kein Dialog, kein Datum', async () => {
    const n = native(); n.isAvailableAsync.mockResolvedValue(false);
    await searches('u6', 3);
    expect(await maybeRequestReview('s-r2', deps(n))).toBe(false);
    expect(n.requestReview).not.toHaveBeenCalled();
    expect((await stored('u6')).lastPromptAt).toBeNull();
  });

  it('Fehler im Systemdialog bricht nichts ab und fragt trotzdem nicht sofort wieder', async () => {
    const n = native(); n.requestReview.mockRejectedValue(new Error('ERR_STORE_REVIEW_FAILED'));
    await searches('u7', 3);
    await expect(maybeRequestReview('s-r2', deps(n))).resolves.toBe(false);
    expect((await stored('u7')).lastPromptAt).not.toBeNull();
  });

  it('ohne Konto, Fährte oder Absuche-ID wird nichts gezählt', async () => {
    await noteSuccessfulSearch(null, 's', 'r', T0);
    await noteSuccessfulSearch('u8', null, 'r', T0);
    await noteSuccessfulSearch('u8', 's', null, T0);
    expect((await stored('u8')).successfulSearches).toBe(0);
  });

  it('beschädigter Speicher fällt auf Null zurück', () => {
    expect(sanitizeReviewState('kaputt')).toEqual({ successfulSearches: 0, lastPromptAt: null, countedRunIds: [] });
    expect(sanitizeReviewState({ successfulSearches: -2, lastPromptAt: 'nie', countedRunIds: [1, 'x'] }))
      .toEqual({ successfulSearches: 0, lastPromptAt: null, countedRunIds: ['x'] });
    expect(shouldAskForReview({ successfulSearches: 3, lastPromptAt: null, countedRunIds: [] }, T0)).toBe(true);
  });
});
