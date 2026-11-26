jest.mock('@/lib/supabase', () => ({ supabase: {} }));
import { canLayFor, confirmedCount, dayEvaluation, dayRow, participationFor } from '../plans/dayLogic';

const A = 'anna', B = 'bea';
const entry = (over: Record<string, unknown> = {}) => ({ entryId: 'e1', position: 1, handlerUserId: B, handlerName: 'Bea', layerUserId: A, layerName: 'Anna',
  dog: { dogId: 'luna', name: 'Luna', breed: null }, plannedLyingMinutes: 60, trackKind: 'igp1', fieldNote: null, blind: false,
  handlerResponse: 'yes', layerResponse: 'yes', trackId: null, updatedAtMs: 1, ...over }) as never;
const part = (userId: string, dogId: string) => ({ participationId: `p-${userId}-${dogId}`, userId, displayName: userId, dogId, dogName: dogId, colorKey: null });
const track = (over: Record<string, unknown> = {}) => ({ trackId: 't1', sessionId: 's', layerUserId: A, handlerUserId: B, handlerParticipationId: 'p', dogId: 'luna',
  blind: false, status: 'lying', createdAtMs: 0, laidAtMs: 0, searchStartedAtMs: null, searchedAtMs: null, area: null, distanceM: null, kind: 'track', ...over }) as never;

describe('Ablaufliste am Tag', () => {
  it('Teilnahme: gleicher Mensch und gleicher Hund', () => {
    expect(participationFor(entry(), [part(B, 'rex'), part(B, 'luna')])?.dogId).toBe('luna');
    expect(participationFor(entry(), [part(B, 'rex')])).toBeNull();
    expect(participationFor(entry({ dog: null }), [part(B, 'rex')])?.dogId).toBe('rex');
  });
  it('Stand nur aus der echten Fährte', () => {
    expect(dayRow(entry({ handlerResponse: 'no', dog: null }), [], [], 0).state).toBe('declined');
    expect(dayRow(entry(), [], [], 0).state).toBe('not_joined');
    expect(dayRow(entry(), [], [part(B, 'luna')], 0).state).toBe('planned');
    expect(dayRow(entry({ trackId: 't1' }), [track({ status: 'laying', laidAtMs: null })], [], 0).state).toBe('laying');
    expect(dayRow(entry({ trackId: 't1' }), [track({ status: 'searching', searchStartedAtMs: 1 })], [], 5).state).toBe('searching');
    expect(dayRow(entry({ trackId: 't1' }), [track({ status: 'searched', searchStartedAtMs: 1, searchedAtMs: 2 })], [], 5).state).toBe('done');
    expect(dayRow(entry({ trackId: 't1' }), [track({ status: 'revoked' })], [part(B, 'luna')], 0).state).toBe('planned');   // zurückgezogen: neu legen
  });
  it('Hinweis «Liegezeit erreicht» erst ab der geplanten Zeit', () => {
    expect(dayRow(entry({ trackId: 't1' }), [track()], [], 59 * 60_000).lyingReached).toBe(false);
    const r = dayRow(entry({ trackId: 't1' }), [track()], [], 60 * 60_000);
    expect(r).toMatchObject({ state: 'lying', lyingMs: 3_600_000, lyingReached: true });
    expect(dayRow(entry({ trackId: 't1', plannedLyingMinutes: null }), [track()], [], 9e9).lyingReached).toBe(false);
  });
  it('Legen nur durch die eingetragene Leger:in, im Training, ohne bestehende Fährte', () => {
    const row = dayRow(entry(), [], [part(B, 'luna')], 0);
    expect(canLayFor(row, A, [part(A, 'ayla')])).toBe(true);
    expect(canLayFor(row, B, [part(B, 'luna')])).toBe(false);
    expect(canLayFor(row, A, [])).toBe(false);
    expect(canLayFor(dayRow(entry({ trackId: 't1' }), [track()], [part(B, 'luna')], 0), A, [part(A, 'ayla')])).toBe(false);
  });
  it('Tagesauswertung: nur Geteiltes', () => {
    const done = dayRow(entry({ trackId: 't1' }), [track({ status: 'searched', searchedAtMs: 1, searchStartedAtMs: 1 })], [], 2);
    expect(dayEvaluation(done, []).kind).toBe('not_shared');
    expect(dayEvaluation(done, [{ trackId: 't1' } as never]).kind).toBe('shared');
    expect(dayEvaluation(dayRow(entry(), [], [], 0), []).kind).toBe('not_searched');
    expect(dayEvaluation(dayRow(entry({ handlerResponse: 'no', dog: null }), [], [], 0), []).kind).toBe('declined');
    expect(confirmedCount([entry(), entry({ handlerResponse: 'open', dog: null })])).toEqual({ yes: 1, total: 2 });
  });
});
