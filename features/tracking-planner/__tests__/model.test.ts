import { editPlan, parsePlan, plannedDistance, type PlanEdit } from '../model';
const a = { latitude: 47, longitude: 8, object: false }, b = { ...a, latitude: 47.001, object: true };
const fixture = () => ({ id: 'plan-1', name: ' Field ', points: [a,b] });
it('keeps intended geometry separate and strips measured metadata', () => {
 const plan = parsePlan({ ...fixture(), score: 100, points: [{ ...a, accuracy: 1, timestamp: 5 }, b] });
 expect(plan).toEqual({ ...fixture(), name: 'Field' }); expect(plannedDistance(plan.points)).toBeCloseTo(111.195, 2);
});
it.each([NaN, Infinity, -91, 91])('rejects invalid latitude %s', latitude => {
 expect(() => parsePlan({ ...fixture(), points: [{ ...a, latitude }, b] })).toThrow('INVALID');
});
it.each([null, {}, { ...fixture(), points: [a] }, { ...fixture(), points: [a,a] }, { ...fixture(), name: ' ' }, { ...fixture(), points: Array(201).fill(a) }])('rejects invalid/empty/degenerate plans', value => expect(() => parsePlan(value)).toThrow());
it('uses the short distance across the date line', () => {
 expect(plannedDistance([{ ...a, latitude: 0, longitude: 179.999 }, { ...a, latitude: 0, longitude: -179.999 }])).toBeCloseTo(222.39, 1);
});
it('object editing, dragging, deletion and undo preserve original input', () => {
 const initial: PlanEdit = { points: [a,b], undo: [], selected: 1 };
 const moved = editPlan(initial, { type: 'move', index: 1, point: { ...b, latitude: 47.002, object: false } });
 expect(moved.points[1].object).toBe(true); expect(initial.points[1]).toEqual(b);
 const removed = editPlan(moved, { type: 'remove' }); expect(removed.points).toEqual([a]);
 expect(editPlan(removed, { type: 'undo' }).points).toEqual(moved.points);
 expect(editPlan(initial, { type: 'object' }).points[1].object).toBe(false);
});
it('bounds history and rejects invalid additions/selection', () => {
 let state: PlanEdit = { points: [], undo: [], selected: null };
 for(let i=0;i<201;i++) state=editPlan(state,{type:'add',point:a});
 expect(state.points).toHaveLength(200); expect(state.undo).toHaveLength(30);
 expect(editPlan(state,{type:'add',point:{...a,latitude:NaN}})).toBe(state);
 expect(editPlan(state,{type:'select',index:201})).toBe(state);
});
