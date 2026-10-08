// Kundenfähige Fährtendiagnose — REINE, testbare Logik (kein React/Expo/Native).
//
// Zwei Aufgaben, beide rein lesend auf bereits GESPEICHERTEN Daten einer Fährte:
//   1. Zusammenfassung für die Auswertung („Fährtendiagnose"): nur Werte, die im
//      Datensatz wirklich stehen — nichts wird geschätzt oder erfunden.
//   2. Support-Export ohne Live-Mitschnitt: fehlt die Support-Capture (ältere Fährte,
//      reine Legefährte, ausserhalb der Retention), wird ein klar als `persisted`
//      gekennzeichneter Export aus gelegter Linie, Markern und gespeichertem Suchlauf
//      gebaut. Live-only Daten (Roh-/Filter-Ströme, Cursor-Samples) gibt es dann
//      nicht — sie werden NICHT nachgebildet.
//
// Datenschutz: identisch zum bestehenden Support-Export — relative Meter/Zeiten ab dem
// ersten gelegten Punkt, keine IDs/Daten/Namen; abschliessend assertSupportPrivacy().
// Kein Eingriff in Aufzeichnung, Erkennung, Analyse oder Persistenz.
import { buildQaTrackExport, assertNoAbsoluteData, toMs, type RawLayPoint, type RawTrackMarker } from '@/features/tracking/utils/qaTrackExport';
import { assertSupportPrivacy, type SupportExport } from '@/features/tracking/utils/supportDiagnostics';
import { getGpsQuality } from '@/features/tracking/utils/gpsFilter';
import { formatApproxDeviationM } from '@/features/tracking/utils/formatDeviation';
import type { TranslationKey } from '@/i18n/de-CH';

const M_PER_DEG = 111320;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ── Eingaben aus dem bestehenden Detail-Datensatz (lokal oder remote, gleiche Form) ──

/** Gelegte Punkte (point_type 'lay' oder ohne Typ) mit gültigen Koordinaten. */
export function layPointsFromDetail(data: Record<string, any> | null | undefined): RawLayPoint[] {
  const pts = Array.isArray(data?.points) ? data!.points : [];
  return pts
    .filter((p: any) => p && (p.point_type ?? 'lay') === 'lay' && isNum(p.latitude) && isNum(p.longitude))
    .map((p: any) => ({ latitude: p.latitude, longitude: p.longitude, accuracy: isNum(p.accuracy) ? p.accuracy : null, timestamp: p.timestamp ?? 0 }));
}

export function markersFromDetail(data: Record<string, any> | null | undefined): RawTrackMarker[] {
  const ms = Array.isArray(data?.markers) ? data!.markers : [];
  return ms.filter((m: any) => m && typeof m.marker_type === 'string').map((m: any) => ({
    marker_type: m.marker_type, angle_kind: m.angle_kind ?? null, material: m.material ?? null,
    latitude: isNum(m.latitude) ? m.latitude : null, longitude: isNum(m.longitude) ? m.longitude : null,
    distance_from_start: isNum(m.distance_from_start) ? m.distance_from_start : null, created_at: m.created_at ?? null,
  }));
}

/** Gespeicherter Suchlauf (track_data.run bzw. erster track_runs-Eintrag) — nur Zahlen/Punkte. */
export interface PersistedRunInput {
  runPoints:              { lat: number; lng: number; t?: number | string | null }[];
  durationSeconds:        number | null;
  distanceMeters:         number | null;
  articlesFound:          number | null;
  totalObjects:           number | null;
  averageDeviationMeters: number | null;
}

export function runFromDetail(data: Record<string, any> | null | undefined): PersistedRunInput | null {
  const run = data?.track_data?.run ?? null;
  const row = Array.isArray(data?.runs) ? data!.runs[0] ?? null : null;
  if (!run && !row) return null;
  const pick = (k: string) => (isNum(row?.[k]) ? row[k] : isNum(run?.[k]) ? run[k] : null);
  const rawPts = Array.isArray(row?.run_points) && row.run_points.length ? row.run_points
    : Array.isArray(run?.run_points) ? run.run_points : [];
  return {
    runPoints: rawPts.filter((p: any) => p && isNum(p.lat) && isNum(p.lng)).map((p: any) => ({ lat: p.lat, lng: p.lng, t: p.t ?? null })),
    durationSeconds:        pick('duration_seconds'),
    distanceMeters:         pick('distance_meters'),
    articlesFound:          isNum(data?.articles_found) ? data!.articles_found : pick('articles_found'),
    totalObjects:           isNum(run?.total_objects) ? run.total_objects : null,
    averageDeviationMeters: pick('average_deviation_meters'),
  };
}

// ── 1. Zusammenfassung für die Auswertung ──

export type CustomerDiagnosisKind = 'searched' | 'lay_only';

/** Anzeigewert: übersetzbarer Text (Key + Parameter, Parameter ggf. selbst Keys) oder neutrale Zahl/Dauer. */
export type CustomerDiagnosisValue =
  | { textKey: TranslationKey; params?: Record<string, string | number>; paramKeys?: Record<string, TranslationKey> }
  | { text: string };

export interface CustomerDiagnosisRow { key: string; labelKey: TranslationKey; value: CustomerDiagnosisValue }

export interface CustomerDiagnosisSummary {
  kind: CustomerDiagnosisKind;
  rows: CustomerDiagnosisRow[];
  /** Mindestens zwei gültige gelegte Punkte → Diagnose aus gespeicherten Daten möglich. */
  hasLayGeometry: boolean;
}

// Bestehende GPS-Qualitätsbegriffe (wie im Lege-Screen) — keine zweite Terminologie.
const QUALITY_KEY: Record<ReturnType<typeof getGpsQuality>, TranslationKey> = {
  'sehr-gut': 'track.gpsVeryGood', 'gut': 'track.gpsGood', 'mittel': 'track.gpsMedium', 'schwach': 'track.gpsPoor',
};

export function medianAccuracy(points: readonly RawLayPoint[]): number | null {
  const a = points.map(p => p.accuracy).filter(isNum).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** Sprachneutrale Dauer „m:ss min". */
function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
}

const meters = (m: number): CustomerDiagnosisValue => ({ textKey: 'track.customerDiagnosis.meters', params: { meters: m } });

/**
 * Verständliche Zusammenfassung — jede Zeile nur, wenn der Wert im Datensatz steht.
 * `searched` richtet sich nach dem gespeicherten Suchlauf (track_data.run / track_runs).
 * Liefert ausschliesslich i18n-Keys/Parameter; übersetzt wird in der UI.
 */
export function buildCustomerDiagnosisSummary(data: Record<string, any> | null | undefined): CustomerDiagnosisSummary {
  const lay = layPointsFromDetail(data);
  const markers = markersFromDetail(data);
  const run = runFromDetail(data);
  const kind: CustomerDiagnosisKind = run ? 'searched' : 'lay_only';
  const rows: CustomerDiagnosisRow[] = [];
  const P = 'track.customerDiagnosis.';

  const acc = medianAccuracy(lay);
  if (acc != null) rows.push({ key: 'gps', labelKey: `${P}gps` as TranslationKey, value: {
    textKey: `${P}gpsValue` as TranslationKey, params: { meters: Math.round(acc) }, paramKeys: { quality: QUALITY_KEY[getGpsQuality(acc)] },
  } });
  if (lay.length) rows.push({ key: 'layPoints', labelKey: `${P}layPoints` as TranslationKey, value: { text: String(lay.length) } });
  if (isNum(data?.distance_meters)) rows.push({ key: 'distance', labelKey: `${P}distance` as TranslationKey, value: meters(Math.round(data!.distance_meters)) });

  const corners = isNum(data?.corners_total) ? data!.corners_total : markers.length ? markers.filter(m => m.marker_type === 'winkel').length : null;
  if (corners != null) rows.push({ key: 'corners', labelKey: `${P}corners` as TranslationKey, value: { text: String(corners) } });
  const objects = isNum(data?.articles_total) ? data!.articles_total : markers.length ? markers.filter(m => m.marker_type === 'gegenstand').length : null;
  if (objects != null) {
    const found = run?.articlesFound;
    rows.push({ key: 'objects', labelKey: `${P}objects` as TranslationKey, value: kind === 'searched' && isNum(found)
      ? { textKey: `${P}objectsFound` as TranslationKey, params: { found, total: objects } }
      : { text: String(objects) } });
  }

  rows.push({ key: 'search', labelKey: `${P}search` as TranslationKey, value: { textKey: (kind === 'searched' ? `${P}searched` : `${P}notSearched`) as TranslationKey } });
  if (run) {
    if (isNum(run.durationSeconds)) rows.push({ key: 'searchDuration', labelKey: 'track.searchDuration', value: { text: clock(run.durationSeconds) } });
    rows.push({ key: 'searchTrack', labelKey: `${P}searchTrack` as TranslationKey, value: run.runPoints.length > 1
      ? { textKey: `${P}searchTrackRecorded` as TranslationKey, params: { count: run.runPoints.length } }
      : { textKey: `${P}searchTrackNone` as TranslationKey } });
    if (isNum(run.averageDeviationMeters)) rows.push({ key: 'deviation', labelKey: `${P}deviation` as TranslationKey, value: { text: formatApproxDeviationM(run.averageDeviationMeters) } });
    rows.push({ key: 'analysis', labelKey: `${P}analysis` as TranslationKey, value: { textKey: (data?.track_data?.run?.analytics ? `${P}available` : `${P}notAvailable`) as TranslationKey } });
  }
  return { kind, rows, hasLayGeometry: lay.length >= 2 };
}

/** Übersetzt einen Anzeigewert mit der übergebenen `t`-Funktion (UI-Grenze). */
export function formatDiagnosisValue(v: CustomerDiagnosisValue, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  if ('text' in v) return v.text;
  const params: Record<string, string | number> = { ...(v.params ?? {}) };
  for (const [name, key] of Object.entries(v.paramKeys ?? {})) params[name] = t(key);
  return t(v.textKey, params);
}

// ── 2. Support-Export aus gespeicherten Daten (ohne Live-Mitschnitt) ──

export interface PersistedSearchExport {
  pointCount:             number;
  /** Meter relativ zum ERSTEN GELEGTEN Punkt (gleicher Ursprung wie `points`); tMs relativ zum ersten Suchpunkt. */
  points:                 { x: number; y: number; tMs: number | null }[];
  durationS:              number | null;
  distanceM:              number | null;
  articlesFound:          number | null;
  totalObjects:           number | null;
  averageDeviationM:      number | null;
}

export type PersistedSupportExport = SupportExport & {
  /** `persisted` = aus gespeicherten Daten erstellt; Live-Ströme der Absuche fehlen bewusst. */
  diagnosticsSource: 'persisted';
  persistedSearch?: PersistedSearchExport;
};

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Baut den Export aus gespeicherten Daten. null, wenn keine verwertbare gelegte Linie
 * (< 2 gültige Punkte) — dann gibt es nichts Ehrliches zu teilen. Wirft nur bei
 * Privacy-Verstoss (wie der bestehende Support-Export).
 */
export function buildPersistedSupportExport(input: {
  layPoints: readonly RawLayPoint[];
  markers:   readonly RawTrackMarker[];
  run:       PersistedRunInput | null;
}): PersistedSupportExport | null {
  const lay = input.layPoints.filter(p => isNum(p.latitude) && isNum(p.longitude));
  if (lay.length < 2) return null;
  const full = buildQaTrackExport('support', lay, input.markers, null, null);
  assertNoAbsoluteData(full);
  const { sessionId: _dropped, ...rest } = full;
  void _dropped;

  let persistedSearch: PersistedSearchExport | undefined;
  if (input.run) {
    const lat0 = lay[0].latitude, lng0 = lay[0].longitude;
    const mPerLng = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
    const ts = input.run.runPoints.map(p => (p.t == null ? NaN : toMs(p.t)));
    const t0 = ts.find(isNum);
    persistedSearch = {
      pointCount: input.run.runPoints.length,
      points: input.run.runPoints.map((p, i) => ({
        x: round3((p.lng - lng0) * mPerLng),
        y: round3((p.lat - lat0) * M_PER_DEG),
        tMs: t0 != null && isNum(ts[i]) ? ts[i] - t0 : null,
      })),
      durationS:         input.run.durationSeconds,
      distanceM:         input.run.distanceMeters,
      articlesFound:     input.run.articlesFound,
      totalObjects:      input.run.totalObjects,
      averageDeviationM: input.run.averageDeviationMeters,
    };
  }
  const out: PersistedSupportExport = {
    exportType: 'support', diagnosticsSource: 'persisted', ...rest,
    ...(persistedSearch ? { persistedSearch } : {}),
  };
  assertSupportPrivacy(out);
  return out;
}
