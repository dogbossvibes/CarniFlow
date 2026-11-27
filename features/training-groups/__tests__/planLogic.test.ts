import { canEditEntries, canEditPlan, canRespond, entryState, moveEntry, myEntries, nextPosition, parseLying, sortPlans, validatePlanInput } from '../plans/planLogic';

const ME = 'me', BEA = 'bea';
const e = (over: Record<string, unknown>) => ({ entryId: 'x', position: 1, handlerUserId: BEA, layerUserId: null, handlerResponse: 'open', dog: null, ...over }) as never;

describe('Trainingspläne: Ablauf', () => {
  it('was in welchem Status möglich ist', () => {
    expect(['draft', 'published', 'started', 'done', 'cancelled'].map(s => [canEditPlan(s as never), canEditEntries(s as never), canRespond(s as never)]))
      .toEqual([[true, true, false], [true, true, true], [false, true, true], [false, false, false], [false, false, false]]);
  });
  it('meine Zeilen als Hundeführer:in und Leger:in (eigene Fährte nur einmal)', () => {
    const plan = { entries: [e({ entryId: 'a', handlerUserId: ME }), e({ entryId: 'b', layerUserId: ME }), e({ entryId: 'c', handlerUserId: ME, layerUserId: ME })] };
    const m = myEntries(plan, ME);
    expect(m.handler.map((x: any) => x.entryId)).toEqual(['a', 'c']);
    expect(m.layer.map((x: any) => x.entryId)).toEqual(['b']);
    expect(myEntries(plan, null)).toEqual({ handler: [], layer: [] });
  });
  it('Zustand einer Zeile', () => {
    expect(entryState(e({ handlerResponse: 'yes', dog: { dogId: 'd', name: 'Luna', breed: null } }))).toBe('yes');
    expect(entryState(e({ handlerResponse: 'yes' }))).toBe('dog_missing');
    expect(entryState(e({ handlerResponse: 'no' }))).toBe('no');
    expect(entryState(e({}))).toBe('open');
  });
  it('Position und Verschieben', () => {
    expect(nextPosition([])).toBe(1);
    expect(nextPosition([{ position: 3 }, { position: 1 }] as never)).toBe(4);
    const list = [{ entryId: 'a', position: 1 }, { entryId: 'b', position: 2 }, { entryId: 'c', position: 3 }] as never;
    expect(moveEntry(list, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveEntry(list, 'c', 1)).toBeNull();
    expect(moveEntry(list, 'zz', 1)).toBeNull();
  });
  it('Sortierung: kommende zuerst, fertige/abgesagte am Ende', () => {
    const now = Date.UTC(2027, 2, 10);
    const p = (id: string, at: number, status = 'published') => ({ planId: id, startsAtMs: at, status }) as never;
    expect(sortPlans([p('old', now - 5 * 86400_000), p('later', now + 9 * 86400_000), p('soon', now + 86400_000), p('x', now + 2 * 86400_000, 'cancelled')], now)
      .map((x: any) => x.planId)).toEqual(['soon', 'later', 'old', 'x']);
  });
  it('Eingaben prüfen', () => {
    expect(validatePlanInput({ title: ' ', startsAtMs: 1 })).toBe('plans.errTitle');
    expect(validatePlanInput({ title: 'Tag', startsAtMs: null })).toBe('plans.errDate');
    expect(validatePlanInput({ title: 'Tag', startsAtMs: 1, notes: 'x'.repeat(1001) })).toBe('plans.errTooLong');
    expect(validatePlanInput({ title: 'Tag', startsAtMs: 1 })).toBeNull();
    expect(parseLying('')).toEqual({ ok: true, value: null });
    expect(parseLying('60')).toEqual({ ok: true, value: 60 });
    expect(parseLying('601')).toEqual({ ok: false });
    expect(parseLying('1,5')).toEqual({ ok: false });
  });
});
