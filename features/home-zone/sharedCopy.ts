import { chordCrossesZone, insideHomeZone, type HomeZone } from './zones';

// Heimzone bei Trainer-Freigaben (Issue #121): gekürzte Kopie der Fährtendetails.
// Trainer:innen lesen diese Kopie statt der Originaltabellen. Gespeicherte
// Originaldaten werden nie verändert; die Eingabe bleibt unberührt.

export const SHARED_COPY_VERSION = 1;
/** Obergrenze für die gespeicherte Kopie (Zeichen im JSON). Darüber: keine Kopie, alter Warnweg. */
export const SHARED_COPY_MAX_CHARS = 4_000_000;
export interface SharedTrackCopy { copy: Record<string, unknown>; json: string; allRemoved: boolean }
type Json = unknown;
type Ctx = { zones: readonly HomeZone[]; removed: number; kept: number };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const LAT = /^(.*?)(latitude|lat)$/i;
const LNG: Record<string, string[]> = { latitude: ['longitude', 'Longitude'], lat: ['lng', 'Lng', 'lon', 'Lon', 'long', 'Long'] };

/** Koordinatenpaare eines Objekts, auch mit Präfix (apexLat/apexLng, minLat/minLng). */
function coordinatePairs(r: Record<string, unknown>): { latKey: string; lngKey: string; plain: boolean }[] {
  const out: { latKey: string; lngKey: string; plain: boolean }[] = [];
  for (const latKey of Object.keys(r)) {
    const m = LAT.exec(latKey);
    if (!m || !finite(r[latKey])) continue;
    const lngKey = LNG[m[2].toLowerCase()].map(suffix => m[1] + suffix).find(key => finite(r[key]));
    if (lngKey) out.push({ latKey, lngKey, plain: m[1] === '' });
  }
  return out;
}
const plainPoint = (value: Json): { lat: number; lng: number } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>, pair = coordinatePairs(r).find(p => p.plain);
  return pair ? { lat: r[pair.latKey] as number, lng: r[pair.lngKey] as number } : null;
};
const isMarker = (value: Json) => !!value && typeof value === 'object' && ('marker_type' in value || 'type' in value);

function scrub(value: Json, ctx: Ctx): Json {
  if (typeof value === 'string') {
    // Eingebettetes JSON (z. B. payload_json) ebenfalls kürzen.
    const first = value.trimStart()[0];
    if (first !== '{' && first !== '[') return value;
    let parsed: Json;
    try { parsed = JSON.parse(value); } catch { return value; }
    const before = ctx.removed, next = scrub(parsed, ctx);
    return ctx.removed === before ? value : JSON.stringify(next);
  }
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const out: Json[] = [];
    let needsBreak = false, previous: { lat: number; lng: number } | null = null;
    for (const item of value) {
      const point = plainPoint(item);
      if (point && insideHomeZone(point, ctx.zones)) { ctx.removed++; needsBreak = true; continue; }
      let next = scrub(item, ctx);
      if (point) {
        ctx.kept++;
        // Linien nie über einen entfernten Abschnitt hinweg verbinden.
        if (!isMarker(item) && (needsBreak || (previous && chordCrossesZone(previous, point, ctx.zones)))) {
          next = { ...(next as Record<string, unknown>), breakBefore: true };
        }
        needsBreak = false; previous = point;
      }
      out.push(next);
    }
    return out;
  }
  const source = value as Record<string, unknown>, out: Record<string, unknown> = {};
  const hidden = new Set<string>();
  for (const pair of coordinatePairs(source)) {
    if (insideHomeZone({ lat: source[pair.latKey] as number, lng: source[pair.lngKey] as number }, ctx.zones)) {
      hidden.add(pair.latKey); hidden.add(pair.lngKey); ctx.removed++;
    } else ctx.kept++;
  }
  for (const key of Object.keys(source)) out[key] = hidden.has(key) ? null : scrub(source[key], ctx);
  return out;
}

/** null = die Fährte berührt keine Zone (keine Kopie nötig). Wirft 'shared-copy-too-large'. */
export function buildSharedTrackCopy(detail: unknown, zones: readonly HomeZone[]): SharedTrackCopy | null {
  if (!zones.length || !detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const ctx: Ctx = { zones, removed: 0, kept: 0 };
  const scrubbed = scrub(detail, ctx) as Record<string, unknown>;
  if (!ctx.removed) return null;
  // Ortsname kann die Adresse nennen; lokale Hilfsfelder gehören nicht in die Kopie.
  const copy: Record<string, unknown> = { ...scrubbed, location_name: null, homeZoneApplied: true, sharedCopyVersion: SHARED_COPY_VERSION };
  const json = JSON.stringify(copy);
  if (json.length > SHARED_COPY_MAX_CHARS) throw new Error('shared-copy-too-large');
  return { copy, json, allRemoved: ctx.kept === 0 };
}

/** Prüfhilfe: findet jede Koordinate in einer Zone, auch in eingebettetem JSON und mit Präfix. */
export function findHomeZoneCoordinates(value: Json, zones: readonly HomeZone[]): number {
  if (typeof value === 'string') {
    const first = value.trimStart()[0];
    if (first !== '{' && first !== '[') return 0;
    try { return findHomeZoneCoordinates(JSON.parse(value), zones); } catch { return 0; }
  }
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + findHomeZoneCoordinates(item, zones), 0);
  const r = value as Record<string, unknown>;
  let count = coordinatePairs(r).filter(p => insideHomeZone({ lat: r[p.latKey] as number, lng: r[p.lngKey] as number }, zones)).length;
  for (const key of Object.keys(r)) count += findHomeZoneCoordinates(r[key], zones);
  return count;
}
