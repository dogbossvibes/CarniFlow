/** Bounded wire contract. No owner/dog rights, search results, notes, audio or device IDs. */
export const TRANSFER_LIMITS = { points: 20_000, markers: 256, segments: 128, bytes: 4_000_000 } as const;
export class TransferReferenceError extends Error {
  constructor(readonly code: 'REFERENCE_INVALID' | 'REFERENCE_TOO_LARGE' | 'REFERENCE_CHANGED' | 'SOURCE_INCOMPLETE') {
    super(code); this.name = 'TransferReferenceError';
  }
}
type Obj = Record<string, unknown>;
const invalid = (): never => { throw new TransferReferenceError('REFERENCE_INVALID'); };
function object(v: unknown, keys: readonly string[]): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return invalid();
  const r = v as Obj;
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k))) return invalid();
  return r;
}
function num(v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : invalid();
}
function integer(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = num(v, min, max); return Number.isSafeInteger(n) ? n : invalid();
}
function bool(v: unknown): boolean { return typeof v === 'boolean' ? v : invalid(); }
function str(v: unknown, max: number): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) return invalid();
  // Reject lone UTF-16 surrogates: server and client must agree on encoded content.
  for (const c of v) { const n = c.codePointAt(0)!; if (n >= 0xd800 && n <= 0xdfff) return invalid(); }
  return v;
}
function nullable<T>(v: unknown, parse: (x: unknown) => T): T | null { return v === null ? null : parse(v); }
function choice<T extends string>(v: unknown, values: readonly T[]): T {
  return typeof v === 'string' && values.includes(v as T) ? v as T : invalid();
}
function list<T>(v: unknown, max: number, parse: (x: unknown) => T, min = 0): T[] {
  if (!Array.isArray(v) || v.length < min) return invalid();
  if (v.length > max) throw new TransferReferenceError('REFERENCE_TOO_LARGE');
  return v.map(parse);
}
function unique(values: readonly string[]) { if (new Set(values).size !== values.length) invalid(); }
function coordinate(v: unknown) {
  const o = object(v, ['lat', 'lng']); return { lat: num(o.lat, -90, 90), lng: num(o.lng, -180, 180) };
}
const positive = (v: unknown) => num(v, 0);
const time = (v: unknown) => integer(v, 1, 8_640_000_000_000_000);
const quality = (v: unknown) => num(v, 0, 1);
const markerTypes = ['gegenstand', 'winkel', 'verleitung', 'sprachmarker'] as const;
const materials = ['stoff', 'filz', 'holz', 'duebel', 'leder', 'plastik', 'metall', 'teppich', 'diverses'] as const;
const angles = ['links', 'rechts', 'spitz_links', 'spitz_rechts', 'spitz', 'absatz', 'abriss', 'gw', 'ow', 'bw'] as const;
const segmentTypes = ['no_food', 'low_food', 'intensive_food', 'distraction', 'surface_change', 'custom'] as const;
function point(v: unknown) {
  const o = object(v, ['lat', 'lng', 't', 'accuracy', 'altitude', 'speed', 'heading', 'breakBefore', 'measuredDistanceM']);
  return { lat: num(o.lat, -90, 90), lng: num(o.lng, -180, 180), t: time(o.t),
    accuracy: nullable(o.accuracy, positive), altitude: nullable(o.altitude, x => num(x, -100_000, 100_000)),
    speed: nullable(o.speed, x => num(x, -1, 1000)), heading: nullable(o.heading, x => num(x, -1, 360)),
    breakBefore: bool(o.breakBefore), measuredDistanceM: nullable(o.measuredDistanceM, positive) };
}
function marker(v: unknown) {
  const o = object(v, ['id', 'type', 'material', 'angleKind', 'lat', 'lng', 'accuracy', 'distanceFromStartM', 't']);
  const lat = nullable(o.lat, x => num(x, -90, 90)), lng = nullable(o.lng, x => num(x, -180, 180));
  if ((lat === null) !== (lng === null)) invalid();
  return { id: str(o.id, 128), type: choice(o.type, markerTypes), material: nullable(o.material, x => choice(x, materials)),
    angleKind: nullable(o.angleKind, x => choice(x, angles)), lat, lng, accuracy: nullable(o.accuracy, positive),
    distanceFromStartM: nullable(o.distanceFromStartM, positive), t: time(o.t) };
}
function segment(v: unknown, count: number) {
  const o = object(v, ['id', 'type', 'customLabel', 'plannedLengthSteps', 'startStep', 'endStep', 'startCoordinate',
    'endCoordinate', 'startedAt', 'completedAt', 'status', 'voiceEnabled', 'createdAt', 'updatedAt', 'colorToken',
    'startTrackPointIndex', 'endTrackPointIndex']);
  const result = { id: str(o.id, 128), type: choice(o.type, segmentTypes), customLabel: nullable(o.customLabel, x => str(x, 40)),
    plannedLengthSteps: num(o.plannedLengthSteps, 1, 500), startStep: positive(o.startStep), endStep: positive(o.endStep),
    startCoordinate: nullable(o.startCoordinate, coordinate), endCoordinate: nullable(o.endCoordinate, coordinate),
    startedAt: nullable(o.startedAt, time), completedAt: nullable(o.completedAt, time),
    status: choice(o.status, ['planned', 'active', 'completed', 'cancelled'] as const), voiceEnabled: bool(o.voiceEnabled),
    createdAt: time(o.createdAt), updatedAt: time(o.updatedAt), colorToken: nullable(o.colorToken, x => str(x, 40)),
    startTrackPointIndex: nullable(o.startTrackPointIndex, x => integer(x, 0, count - 1)),
    endTrackPointIndex: nullable(o.endTrackPointIndex, x => integer(x, 0, count - 1)) };
  if (result.endStep < result.startStep || result.updatedAt < result.createdAt
    || (result.startedAt !== null && result.completedAt !== null && result.completedAt < result.startedAt)
    || (result.startTrackPointIndex !== null && result.endTrackPointIndex !== null && result.endTrackPointIndex < result.startTrackPointIndex)) invalid();
  return result;
}
function manualGeometry(v: unknown) {
  const o = object(v, ['markers', 'truncated']);
  return { truncated: bool(o.truncated), markers: list(o.markers, 100, x => {
    const m = object(x, ['manualMarkerType', 'geometryDirection', 'geometrySharpness', 'geometryQuality', 'confidence',
      'motionDirection', 'directionAgrees', 'classificationSource']);
    return { manualMarkerType: choice(m.manualMarkerType, ['ow', 'bw', 'gw'] as const),
      geometryDirection: choice(m.geometryDirection, ['links', 'rechts', 'unresolved'] as const),
      geometrySharpness: choice(m.geometrySharpness, ['normal', 'sharp', 'unresolved'] as const),
      geometryQuality: nullable(m.geometryQuality, quality), confidence: nullable(m.confidence, quality),
      motionDirection: nullable(m.motionDirection, x => choice(x, ['links', 'rechts'] as const)),
      directionAgrees: nullable(m.directionAgrees, bool), classificationSource: nullable(m.classificationSource, x => str(x, 80)) };
  }) };
}

/** Always reconstructs in canonical key order. Does not round coordinates or timestamps. */
export function parseTrackTransferReference(value: unknown) {
  const o = object(value, ['version', 'startedAtMs', 'finishedAtMs', 'distanceM', 'durationSeconds', 'points', 'markers', 'segments', 'manualAngleGeometry']);
  if (o.version !== 1) invalid();
  const startedAtMs = time(o.startedAtMs), finishedAtMs = time(o.finishedAtMs);
  if (finishedAtMs < startedAtMs) invalid();
  const points = list(o.points, TRANSFER_LIMITS.points, point, 2);
  const markers = list(o.markers, TRANSFER_LIMITS.markers, marker);
  for (let i = 0; i < points.length; i++) {
    if (points[i].t < startedAtMs || points[i].t > finishedAtMs || (i > 0 && points[i].t < points[i - 1].t)) invalid();
  }
  for (let i = 0; i < markers.length; i++) {
    if (markers[i].t < startedAtMs || markers[i].t > finishedAtMs || (i > 0 && markers[i].t < markers[i - 1].t)) invalid();
  }
  unique(markers.map(m => m.id));
  const segments = list(o.segments, TRANSFER_LIMITS.segments, s => segment(s, points.length));
  unique(segments.map(s => s.id));
  const result = { version: 1 as const, startedAtMs, finishedAtMs, distanceM: nullable(o.distanceM, positive),
    durationSeconds: nullable(o.durationSeconds, positive), points, markers, segments,
    manualAngleGeometry: nullable(o.manualAngleGeometry, manualGeometry) };
  const manual = result.markers.filter(m => m.angleKind === 'ow' || m.angleKind === 'bw' || m.angleKind === 'gw');
  if (result.manualAngleGeometry && (result.manualAngleGeometry.markers.length !== Math.min(manual.length, 100)
    || result.manualAngleGeometry.truncated !== (manual.length > 100)
    || result.manualAngleGeometry.markers.some((m, i) => m.manualMarkerType !== manual[i].angleKind))) invalid();
  let bytes = 0;
  for (const c of JSON.stringify(result)) { const n = c.codePointAt(0)!; bytes += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4; }
  if (bytes > TRANSFER_LIMITS.bytes) throw new TransferReferenceError('REFERENCE_TOO_LARGE');
  return result;
}
export type TrackTransferReference = ReturnType<typeof parseTrackTransferReference>;

/** Full semantic comparison, independent of JSONB key ordering. Never compare only counts or a client-made digest. */
export function assertSameTrackTransferReference(expected: TrackTransferReference, received: unknown): TrackTransferReference {
  const left = parseTrackTransferReference(expected), right = parseTrackTransferReference(received);
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new TransferReferenceError('REFERENCE_CHANGED');
  return right;
}
