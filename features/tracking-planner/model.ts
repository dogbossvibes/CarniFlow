/** Plans contain intended coordinates only, never measured fixes or results. */
export interface PlanPoint { latitude: number; longitude: number; object: boolean }
export interface TrackPlan { id: string; name: string; points: PlanPoint[] }
export interface StoredPlan { plan: TrackPlan; revision: number }
export const PLAN_LIMITS = { points: 200, plans: 100, name: 80 } as const;
export class PlanError extends Error {}
export function parsePlan(value: unknown): TrackPlan {
 const p = value as TrackPlan | null;
 if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(p.id) || typeof p.name !== 'string'
  || !p.name.trim() || p.name.trim().length > PLAN_LIMITS.name || !Array.isArray(p.points)
  || p.points.length < 2 || p.points.length > PLAN_LIMITS.points) throw new PlanError('INVALID');
 const points = p.points.map(point => {
  if (!point || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 85
   || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180 || typeof point.object !== 'boolean') throw new PlanError('INVALID');
  return { latitude: point.latitude, longitude: point.longitude, object: point.object };
 });
 const plan = { id: p.id, name: p.name.trim(), points };
 if (plannedDistance(points) < 1) throw new PlanError('SHORT');
 return plan;
}
export function plannedDistance(points: readonly PlanPoint[]): number {
 const radians = Math.PI / 180;
 return points.slice(1).reduce((sum, b, i) => {
  const a = points[i];
  const h = Math.sin((b.latitude - a.latitude) * radians / 2) ** 2
   + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin((b.longitude - a.longitude) * radians / 2) ** 2;
  return sum + 6371008.8 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
 }, 0);
}
export interface PlanEdit { points: PlanPoint[]; undo: PlanPoint[][]; selected: number | null }
export type PlanAction = { type: 'add'; point: PlanPoint } | { type: 'move'; index: number; point: PlanPoint }
 | { type: 'select'; index: number } | { type: 'object' } | { type: 'remove' } | { type: 'undo' };
export function editPlan(state: PlanEdit, action: PlanAction): PlanEdit {
 if (action.type === 'select') return action.index >= 0 && action.index < state.points.length ? { ...state, selected: action.index } : state;
 if (action.type === 'undo') return state.undo.length ? { points: state.undo[state.undo.length - 1], undo: state.undo.slice(0, -1), selected: null } : state;
 let points = [...state.points], selected = state.selected;
 if (action.type === 'add' || action.type === 'move') {
  const p = action.point;
  if (!Number.isFinite(p.latitude) || Math.abs(p.latitude) > 85 || !Number.isFinite(p.longitude) || Math.abs(p.longitude) > 180) return state;
  if (action.type === 'add') {
   if (points.length >= PLAN_LIMITS.points) return state;
   points.push({ ...p, object: false }); selected = points.length - 1;
  } else {
   if (!points[action.index]) return state;
   points[action.index] = { ...p, object: points[action.index].object };
  }
 } else {
  if (selected === null || !points[selected]) return state;
  if (action.type === 'object') points[selected] = { ...points[selected], object: !points[selected].object };
  else { points.splice(selected, 1); selected = null; }
 }
 return { points, selected, undo: [...state.undo.slice(-29), state.points] };
}
