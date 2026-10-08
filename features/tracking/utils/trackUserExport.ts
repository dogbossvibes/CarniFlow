import { restoreLayContinuity } from './trackContinuity';

/** User export contract. Deliberately separate from anonymised QA exports. */
export interface ExportPoint { lat: number; lng: number; time?: string }
export interface ExportContinuity { version: 1; hasGaps: true; searchHasGaps?: boolean; referenceHasGaps?: boolean }
export interface ExportMarker { label: string; kind: string; lat: number; lng: number; material: string | null }
export interface TrackUserExport {
  format: 'anyvo-track'; version: 1; exportedAt: string;
  date: string | null; title: string; notes: string | null;
  reference: ExportPoint[][]; search: ExportPoint[][]; markers: ExportMarker[];
  summary: { referenceM: number | null; searchM: number | null; durationS: number | null;
    found: number | null; total: number | null; analysisScore: number | null; confidence: string | null };
  conditions: { temperatureC: number | null; humidityPercent: number | null; windSpeed: number | null; weather: string | null };
  /** Present only for explicit gap evidence; absent does not prove full observation. */
  continuity?: ExportContinuity;
  /** These are recorded receiver positions, not a separately measured dog track. */
  positionMeaning: 'recorded-receiver-position';
}
const MAX_POINTS = 100_000;
export const record = (v: unknown): Record<string, unknown> => v != null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const nonnegative = (v: unknown): number | null => { const n = number(v); return n != null && n >= 0 ? n : null; };
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
function iso(v: unknown): string | undefined {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v)) return undefined;
  const n = Date.parse(v); return Number.isFinite(n) ? new Date(n).toISOString() : undefined;
}
function coordinate(lat: unknown, lng: unknown): ExportPoint | null {
  const a = number(lat), b = number(lng);
  return a != null && b != null && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
}
function segments(raw: unknown[], kind: 'lay' | 'search', startedAt?: string): ExportPoint[][] {
  if (raw.length > MAX_POINTS) throw new Error('export-too-large');
  const out: ExportPoint[][] = []; let part: ExportPoint[] = [];
  const flush = () => { if (part.length) out.push(part); part = []; };
  for (const value of raw) {
    const p = record(value);
    if (kind === 'lay' && p.point_type != null && p.point_type !== 'lay') { flush(); continue; }
    const point = kind === 'lay' ? coordinate(p.latitude, p.longitude) : coordinate(p.lat, p.lng);
    if (!point) { flush(); continue; } // Never draw across invalid stored coordinates.
    const elapsed = nonnegative(p.t);
    const time = kind === 'lay' ? iso(p.timestamp)
      : startedAt && elapsed != null && elapsed < 7 * 86400 ? new Date(Date.parse(startedAt) + elapsed * 1000).toISOString() : undefined;
    if (time) point.time = time;
    if (p.breakBefore === true) flush(); // Boundary belongs BEFORE this accepted point.
    part.push(point);
  }
  flush(); return out;
}
export function buildTrackUserExport(value: unknown, exportedAt: string, includeNotes = false): TrackUserExport {
  if (!iso(exportedAt)) throw new Error('invalid-export-date');
  const d = record(value), td = record(d.track_data), run = record(td.run), row = record(array(d.runs)[0]);
  const runMatches = !(typeof row.id === 'string' && typeof run.run_id === 'string' && row.id !== run.run_id);
  const analytics = runMatches ? record(run.analytics) : {};
  if (includeNotes && typeof d.notes === 'string' && d.notes.length > 20_000) throw new Error('export-too-large');
  const rawLay = array(d.points);
  if (rawLay.length > MAX_POINTS) throw new Error('export-too-large');
  const layPoints = rawLay.map(value => {
    const p = record(value);
    return { ...p, point_type: p.point_type, timestamp: typeof p.timestamp === 'string' ? p.timestamp : undefined,
      payload_json: typeof p.payload_json === 'string' ? p.payload_json : undefined, breakBefore: p.breakBefore === true };
  });
  const restoredLay = restoreLayContinuity(layPoints, td.layContinuity);
  let reference = segments(restoredLay, 'lay');
  // Canonical stored run_points; smoothed replay_points must not replace measurement data in GPX.
  const searchPoints = array(row.run_points ?? (runMatches ? run.run_points : undefined));
  let search = segments(searchPoints, 'search', iso(row.started_at ?? (runMatches ? run.started_at : undefined)));
  const referenceGap = restoredLay.some(p => p.breakBefore === true && (p.point_type == null || p.point_type === 'lay'));
  const searchGap = searchPoints.some(p => record(p).breakBefore === true);
  const gapRecords = [row.continuity, ...(runMatches ? [run.continuity, analytics.continuity] : [])]
    .map(record).filter(c => c.version === 1 && c.hasGaps === true).map(c =>
      typeof c.searchHasGaps === 'boolean' && typeof c.referenceHasGaps === 'boolean' && (c.searchHasGaps || c.referenceHasGaps)
        ? c : { version: 1, hasGaps: true });
  const direction = (key: 'searchHasGaps' | 'referenceHasGaps', observed: boolean): boolean | undefined =>
    observed || gapRecords.some(c => c[key] === true) ? true : gapRecords.some(c => c[key] === false) ? false : undefined;
  const continuity: ExportContinuity | undefined = referenceGap || searchGap || gapRecords.length
    ? { version: 1, hasGaps: true, searchHasGaps: direction('searchHasGaps', searchGap), referenceHasGaps: direction('referenceHasGaps', referenceGap) } : undefined;
  // Explicit gaps without a stored boundary cannot safely form connecting lines.
  if (!referenceGap && gapRecords.some(c => c.referenceHasGaps !== false)) reference = reference.flat().map(p => [p]);
  if (!searchGap && gapRecords.some(c => c.searchHasGaps !== false)) search = search.flat().map(p => [p]);
  const markers: ExportMarker[] = []; let objectNo = 0;
  for (const value of array(d.markers)) {
    const m = record(value), point = coordinate(m.latitude, m.longitude);
    const kind = text(m.marker_type) ?? 'marker';
    const label = kind === 'gegenstand' && m.material !== 'duebel' ? `G${++objectNo}` : kind;
    if (!point) continue;
    markers.push({ ...point, label, kind, material: text(m.material) });
  }
  return {
    format: 'anyvo-track', version: 1, exportedAt, title: text(record(d.dog).name) ?? 'ANYVO',
    date: text(d.session_date), notes: includeNotes ? text(d.notes) : null,
    reference, search, markers,
    summary: { referenceM: nonnegative(d.distance_meters), searchM: nonnegative(row.distance_meters ?? (runMatches ? run.distance_meters : undefined)),
      durationS: nonnegative(row.duration_seconds ?? (runMatches ? run.duration_seconds : undefined)), found: nonnegative(row.articles_found ?? (runMatches ? d.articles_found ?? run.articles_found : null)),
      total: nonnegative(d.articles_total ?? run.total_objects), analysisScore: !continuity && typeof analytics.trackScore === 'number' && analytics.trackScore <= 100 ? nonnegative(analytics.trackScore) : null, confidence: text(analytics.analysisConfidenceBand) },
    conditions: { temperatureC: number(d.temperature), humidityPercent: number(d.humidity), windSpeed: nonnegative(d.wind_speed), weather: text(d.weather_condition ?? d.wetter) },
    ...(continuity ? { continuity } : {}),
    positionMeaning: 'recorded-receiver-position',
  };
}
export function escapeXml(value: string): string {
  return value.replace(/[\uD800-\uDFFF]/gu, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
export function trackExportGpx(data: TrackUserExport): string {
  const track = (parts: ExportPoint[][], name: string) => parts.length ? `<trk><name>${name}</name>${parts.map(part => `<trkseg>${part.map(p =>
    `<trkpt lat="${p.lat}" lon="${p.lng}">${p.time ? `<time>${p.time}</time>` : ''}</trkpt>`).join('')}</trkseg>`).join('')}</trk>` : '';
  const continuity = data.continuity;
  const namespace = continuity ? ' xmlns:anyvo="urn:anyvo:track-continuity:1"' : '';
  const extension = continuity ? `<extensions><anyvo:continuity version="1" hasGaps="true"${typeof continuity.referenceHasGaps === 'boolean' ? ` referenceHasGaps="${continuity.referenceHasGaps}"` : ''}${typeof continuity.searchHasGaps === 'boolean' ? ` searchHasGaps="${continuity.searchHasGaps}"` : ''}/></extensions>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ANYVO" xmlns="http://www.topografix.com/GPX/1/1"${namespace}><metadata><name>${escapeXml(data.title)}</name>${data.notes ? `<desc>${escapeXml(data.notes)}</desc>` : ''}${extension}</metadata>${data.markers.map(m =>
    `<wpt lat="${m.lat}" lon="${m.lng}"><name>${escapeXml(m.label)}</name><type>${escapeXml(m.kind)}</type></wpt>`).join('')}${track(data.reference, 'Reference')}${track(data.search, 'Recorded search')}</gpx>\n`;
}
