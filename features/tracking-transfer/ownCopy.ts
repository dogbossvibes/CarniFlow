import { parseTrackTransferReference, type TrackTransferReference } from './reference';
import { parseTransferReceipt, type TrackTransferReceipt } from './importPlan';
import type { Evaluation, OwnCopy, OwnPatch, OwnRun, RunPoint } from './cloudContract';
export class TransferCopyError extends Error {
  constructor(readonly code: string = 'INVALID_RESPONSE') { super(code); this.name = 'TransferCopyError'; }
}
const bad = (): never => { throw new TransferCopyError(); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : bad();
}
function keys(v: unknown, required: string[], optional: string[] = []) {
  const o = record(v);
  if (required.some(k => !Object.hasOwn(o, k)) || Object.keys(o).some(k => !required.includes(k) && !optional.includes(k))) bad();
  return o;
}
function num(v: unknown, min = 0, max = 2147483647, integer = false): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isSafeInteger(v)) ? v : bad();
}
function nullable<T>(v: unknown, fn: (x: unknown) => T): T | null { return v === null ? null : fn(v); }
function text(v: unknown, max: number): string { return typeof v === 'string' && v.length <= max ? v : bad(); }
function iso(v: unknown): string {
  const s = text(v, 24), n = Date.parse(s);
  return Number.isFinite(n) && new Date(n).toISOString() === s ? s : bad();
}
function jsonClone<T>(value: T, maxBytes: number): T {
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { return bad(); }
  if (typeof encoded !== 'string') return bad();
  let bytes = 0;
  for (const c of encoded) { const n = c.codePointAt(0)!; bytes += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4; }
  if (bytes > maxBytes) throw new TransferCopyError('REFERENCE_TOO_LARGE');
  return JSON.parse(encoded) as T;
}
/** JSONB ordering is not mutation identity; compare canonical JSON values. */
export function canonicalJson(value: unknown): string {
  const visit = (v: unknown, depth: number): unknown => {
    if (depth > 64) return bad();
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : bad();
    if (Array.isArray(v)) return v.map(x => visit(x, depth + 1));
    const o = record(v); return Object.fromEntries(Object.keys(o).sort().map(k => [k, visit(o[k], depth + 1)]));
  };
  return JSON.stringify(visit(value, 0));
}
export function parseEvaluation(v: unknown): Evaluation {
  const o = keys(v, ['legs', 'score', 'evaluatedAt']);
  if (!Array.isArray(o.legs) || o.legs.length > 256) return bad();
  return { score: num(o.score, 0, 100), evaluatedAt: iso(o.evaluatedAt), legs: o.legs.map(value => {
    const leg = keys(value, ['name', 'score', 'max']), max = num(leg.max, 0, 1000000);
    return { name: text(leg.name, 200), max, score: num(leg.score, 0, max) };
  }) };
}
export function parseOwnRun(v: unknown, receipt: TrackTransferReceipt): OwnRun {
  const required = ['run_id','session_id','started_at','ended_at','duration_seconds','score','average_deviation_meters','articles_found','total_objects','distance_meters','breaks','search_handler_distance_m','run_points'];
  const optional = ['continuity','object_detections','object_snapshot','analytics','replay_points'];
  const o = keys(v, required, optional);
  if (o.run_id !== receipt.ownRunId || o.session_id !== receipt.ownSessionId) return bad();
  const points = (value: unknown): RunPoint[] => {
    if (!Array.isArray(value) || value.length > 20000) return bad();
    let last = -1;
    return value.map(p => {
      const a = keys(p, ['lat','lng'], ['t','breakBefore']);
      const result: RunPoint = { lat: num(a.lat, -90, 90), lng: num(a.lng, -180, 180) };
      if (Object.hasOwn(a, 't')) { result.t = num(a.t); if (result.t < last) bad(); last = result.t; }
      if (Object.hasOwn(a, 'breakBefore')) { if (typeof a.breakBefore !== 'boolean') bad(); result.breakBefore = a.breakBefore as boolean; }
      return result;
    });
  };
  const result: OwnRun = { run_id: receipt.ownRunId, session_id: receipt.ownSessionId, started_at: iso(o.started_at), ended_at: iso(o.ended_at),
    duration_seconds: num(o.duration_seconds, 0, 2147483647, true), score: nullable(o.score, x => num(x, 0, 100)),
    average_deviation_meters: nullable(o.average_deviation_meters, x => num(x, 0, 1000000)),
    articles_found: num(o.articles_found, 0, 2147483647, true), total_objects: num(o.total_objects, 0, 2147483647, true),
    distance_meters: num(o.distance_meters, 0, 10000000), breaks: num(o.breaks, 0, 2147483647, true),
    search_handler_distance_m: nullable(o.search_handler_distance_m, x => num(x, 0, 10000000)), run_points: points(o.run_points) };
  if (Date.parse(result.ended_at) < Date.parse(result.started_at) || result.articles_found > result.total_objects) bad();
  for (const k of ['continuity','object_snapshot','analytics'] as const) if (Object.hasOwn(o, k)) result[k] = record(o[k]);
  if (Object.hasOwn(o, 'object_detections')) { if (!Array.isArray(o.object_detections)) bad(); result.object_detections = o.object_detections as unknown[]; }
  if (Object.hasOwn(o, 'replay_points')) result.replay_points = points(o.replay_points);
  return jsonClone(result, 4000000);
}
export function parseOwnCopy(value: unknown, receiptValue: unknown): OwnCopy<TrackTransferReference> {
  const receipt = parseTransferReceipt(receiptValue);
  jsonClone(value, 9100000);
  const o = keys(value, ['version','revision','reference','pointIds','markerIds','createdAtMs','metadata','evaluation','run']);
  if (o.version !== 1) bad();
  const reference = parseTrackTransferReference(o.reference);
  const ids = (v: unknown, length: number): string[] => {
    if (!Array.isArray(v) || v.length !== length || v.some(id => typeof id !== 'string' || !uuid.test(id)) || new Set(v).size !== length) return bad();
    return [...v];
  };
  const m = keys(o.metadata, ['title','notes','rating','lyingTimeMinutes']);
  return { version: 1, revision: num(o.revision, 1, 10001, true), reference,
    pointIds: ids(o.pointIds, reference.points.length), markerIds: ids(o.markerIds, reference.markers.length),
    createdAtMs: num(o.createdAtMs, 1, 8640000000000000, true),
    metadata: { title: nullable(m.title, x => text(x, 200)), notes: nullable(m.notes, x => text(x, 20000)),
      rating: nullable(m.rating, x => num(x, 1, 5, true)), lyingTimeMinutes: nullable(m.lyingTimeMinutes, x => num(x, 0, 2147483647, true)) },
    evaluation: nullable(o.evaluation, parseEvaluation), run: nullable(o.run, x => parseOwnRun(x, receipt)) };
}
export function parseOwnPatch(value: unknown, receipt: TrackTransferReceipt): OwnPatch {
  const p = keys(value, [], ['title','notes','rating','lyingTimeMinutes','evaluation','run']);
  if (!Object.keys(p).length) return bad();
  const result: OwnPatch = {};
  if (Object.hasOwn(p, 'title')) result.title = nullable(p.title, x => text(x, 200));
  if (Object.hasOwn(p, 'notes')) result.notes = nullable(p.notes, x => text(x, 20000));
  if (Object.hasOwn(p, 'rating')) result.rating = nullable(p.rating, x => num(x, 1, 5, true));
  if (Object.hasOwn(p, 'lyingTimeMinutes')) result.lyingTimeMinutes = nullable(p.lyingTimeMinutes, x => num(x, 0, 2147483647, true));
  if (Object.hasOwn(p, 'evaluation')) result.evaluation = parseEvaluation(p.evaluation);
  if (Object.hasOwn(p, 'run')) result.run = parseOwnRun(p.run, receipt);
  return result;
}
