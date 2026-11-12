/** Fachtyp and geometry are independent. Identity survives local/remote UUID changes. */
export type AngleDirection = 'links' | 'rechts' | 'unresolved';
export type AngleSharpness = 'normal' | 'sharp' | 'unresolved';
export interface SpecialGeometry {
  geometryDirection?: AngleDirection;
  geometrySharpness?: AngleSharpness;
  geometrySource?: 'manual' | 'gps';
}
export interface AngleIdentity extends SpecialGeometry {
  id?: string;
  type?: string;
  angleKind?: string | null;
  lat?: number | null;
  lng?: number | null;
  distance_from_start?: number | null;
}
const fachKinds = ['bw', 'ow', 'gw'];
const geometricKinds = ['links', 'rechts', 'spitz_links', 'spitz_rechts'];
export const isSpecialAngle = (kind: string | null | undefined) => [...fachKinds, 'abriss'].includes(kind ?? '');

export function readSpecialGeometry(value: unknown): SpecialGeometry {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  if (!['links', 'rechts', 'unresolved'].includes(String(v.geometryDirection))) return {};
  return {
    geometryDirection: v.geometryDirection as AngleDirection,
    geometrySharpness: ['normal', 'sharp', 'unresolved'].includes(String(v.geometrySharpness)) ? v.geometrySharpness as AngleSharpness : 'unresolved',
    ...(v.geometrySource === 'manual' || v.geometrySource === 'gps' ? { geometrySource: v.geometrySource } : {}),
  };
}

export function specialAngleKey(m: AngleIdentity): string | null {
  if (!isSpecialAngle(m.angleKind) || m.lat == null || m.lng == null
    || !Number.isFinite(m.lat) || !Number.isFinite(m.lng) || Math.abs(m.lat) > 90 || Math.abs(m.lng) > 180
    || typeof m.distance_from_start !== 'number' || !Number.isFinite(m.distance_from_start)) return null;
  return `${m.angleKind}:${m.lat.toFixed(7)}:${m.lng.toFixed(7)}:${m.distance_from_start.toFixed(1)}`;
}

/** New metadata matches by key. Legacy metadata requires matching types/counts (old cap: 100). */
export function attachSpecialGeometry<T extends AngleIdentity>(markers: readonly T[], entries: unknown): (T & SpecialGeometry)[] {
  const rows = Array.isArray(entries) ? entries.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object') : [];
  const manual = markers.filter(m => fachKinds.includes(m.angleKind ?? ''));
  const legacy = (rows.length === manual.length || (rows.length === 100 && manual.length > 100))
    && rows.every((e, i) => !('markerKey' in e) && e.manualMarkerType === manual[i].angleKind);
  return markers.map(m => {
    const key = specialAngleKey(m);
    const candidates = rows.filter(e => e.markerKey === key && e.manualMarkerType === m.angleKind);
    if (key && candidates.length === 1 && markers.filter(other => specialAngleKey(other) === key).length === 1) {
      return { ...m, ...readSpecialGeometry(candidates[0]) };
    }
    const i = manual.indexOf(m);
    return legacy && i >= 0 ? { ...m, ...readSpecialGeometry(rows[i]) } : m;
  });
}

/** Display/count projection only; original markers stay intact. Never merge ambiguous matches. */
export function projectAngleMarkers<T extends AngleIdentity>(markers: readonly T[]): T[] {
  const matches = new Map<T, T>();
  for (const manual of markers) {
    if (!fachKinds.includes(manual.angleKind ?? '') || !manual.geometryDirection || manual.geometryDirection === 'unresolved') continue;
    const candidates = markers.filter(m => m.type === 'winkel' && geometricKinds.includes(m.angleKind ?? '')
      && m.lat != null && m.lng != null && manual.lat != null && manual.lng != null
      && typeof m.distance_from_start === 'number' && typeof manual.distance_from_start === 'number'
      && Math.abs(m.distance_from_start - manual.distance_from_start) <= 3
      && Math.hypot((m.lat - manual.lat) * 111320, (m.lng - manual.lng) * 111320 * Math.cos(manual.lat * Math.PI / 180)) <= 3
      && (m.angleKind!.endsWith('rechts') ? 'rechts' : 'links') === manual.geometryDirection
      && (!manual.geometrySharpness || manual.geometrySharpness === 'unresolved'
        || (m.angleKind!.startsWith('spitz') ? 'sharp' : 'normal') === manual.geometrySharpness));
    if (candidates.length === 1) matches.set(manual, candidates[0]);
  }
  const hidden = new Set([...matches.values()].filter(auto => [...matches.values()].filter(m => m === auto).length === 1));
  return markers.filter(m => !hidden.has(m));
}

export const countLaidCorners = (markers: readonly AngleIdentity[]) => projectAngleMarkers(markers)
  .filter(m => m.type === 'winkel' && m.angleKind !== 'abriss' && m.angleKind !== 'absatz').length;

export function specialAngleBadge(m: SpecialGeometry & { angleKind?: string | null }): string | null {
  if (!isSpecialAngle(m.angleKind)) return null;
  const base = m.angleKind === 'abriss' ? 'A' : m.angleKind!.toUpperCase();
  return m.geometryDirection === 'links' || m.geometryDirection === 'rechts'
    ? `${base} ${m.angleKind !== 'abriss' && m.geometrySharpness === 'sharp' ? 'S' : ''}${m.geometryDirection === 'links' ? 'L' : 'R'}`
    : base;
}
