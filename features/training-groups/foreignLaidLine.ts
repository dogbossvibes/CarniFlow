// Fremd gelegte Gruppenfährte: Eine andere Person hat gelegt, die Hundeführer:in hat die
// Fährte im Gruppentraining übernommen und abgesucht. Wie bei «Auswertung teilen» (#146,
// Variante B) verlässt die gelegte Linie der Leger:in das Gerät der Hundeführer:in nicht:
// Trainer-Freigabe und Export enthalten nur Absuche und Kennzahlen.
//
// Rein und ohne Datenbankzugriff. Gespeicherte Daten werden nie verändert; es entsteht
// immer eine neue Kopie. Erkannt wird die Fährte an der Markierung, die beim Übernehmen
// gesetzt wird (groupTrackLocal.ts). Eigene Gruppenfährten (#150) tragen sie nicht.

/** Gleicher Schlüssel wie GROUP_TRACK_KEY in blindSearch.ts (dort mit Datenbankzugriff, deshalb hier nicht importiert). */
export const FOREIGN_LAID_KEY = 'groupTrack';
/** Kennzeichen in der Kopie: Anzeige und Export erklären damit, warum die gelegte Linie fehlt. */
export const LAID_LINE_WITHHELD = 'laidLineWithheld';

type Rec = Record<string, unknown>;
const record = (v: unknown): Rec => v != null && typeof v === 'object' && !Array.isArray(v) ? v as Rec : {};

function validMarker(value: unknown): boolean {
  const m = record(value);
  return m.version === 1 && typeof m.trackId === 'string' && m.trackId.length > 0;
}

/** Fährtendetail (wie in der Fährtenansicht) oder lokales payload_json einer übernommenen Gruppenfährte. */
export function isForeignLaidGroupTrack(detail: unknown): boolean {
  const d = record(detail);
  return validMarker(record(d.track_data)[FOREIGN_LAID_KEY]) || validMarker(d[FOREIGN_LAID_KEY]);
}
export function isForeignLaidPayload(payloadJson: string | null | undefined): boolean {
  try { return validMarker(record(JSON.parse(payloadJson ?? '{}'))[FOREIGN_LAID_KEY]); } catch { return false; }
}

/**
 * Die Fährtenansicht lädt zuerst die Server-Zeile; die Markierung liegt aber in der lokalen Kopie
 * (und erst seit dem Sync-Nachtrag auch in track_data auf dem Server). Trägt eines von beiden die
 * Markierung, trägt sie auch das Ergebnis. Nur im Speicher; gleiche Referenz, wenn nichts zu tun ist.
 */
export function carryForeignLaidMarker<T>(detail: T, localDetail: unknown): T {
  if (detail == null || typeof detail !== 'object' || isForeignLaidGroupTrack(detail)) return detail;
  const local = record(localDetail);
  const marker = validMarker(record(local.track_data)[FOREIGN_LAID_KEY]) ? record(local.track_data)[FOREIGN_LAID_KEY]
    : validMarker(local[FOREIGN_LAID_KEY]) ? local[FOREIGN_LAID_KEY] : null;
  if (!marker) return detail;
  const d = detail as unknown as Rec;
  return { ...d, track_data: { ...record(d.track_data), [FOREIGN_LAID_KEY]: marker } } as unknown as T;
}

/** Die Markierung selbst (für den Abgleich mit dem Server), sonst null. */
export function readForeignLaidMarker(detail: unknown): Rec | null {
  const d = record(detail), value = record(d.track_data)[FOREIGN_LAID_KEY] ?? d[FOREIGN_LAID_KEY];
  if (!validMarker(value)) return null;
  const m = record(value);
  return { version: 1, trackId: m.trackId, blind: m.blind === true };
}

// Koordinaten und Linien in Kennzahlen (z. B. Positionen von Gegenständen in der Analyse)
// stammen von der gelegten Linie und werden entfernt. Die Absuchelinie selbst bleibt.
const COORDINATE_KEY = /(latitude|longitude|lat|lng|lon)$/i;
const GEOMETRY_KEY = /(points|polyline|polygon|geometry|path|coordinates)$/i;
function withoutCoordinates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCoordinates);
  if (value == null || typeof value !== 'object') return value;
  const out: Rec = {};
  for (const [key, item] of Object.entries(value as Rec)) {
    if (COORDINATE_KEY.test(key) || GEOMETRY_KEY.test(key)) continue;
    out[key] = withoutCoordinates(item);
  }
  return out;
}

function pick(source: Rec, keys: readonly string[]): Rec {
  const out: Rec = {};
  for (const key of keys) if (Object.hasOwn(source, key)) out[key] = source[key];
  return out;
}

// Positivliste: Nur was hier steht, kommt in die Kopie. Neue Felder im Fährtendetail
// bleiben damit automatisch draussen, bis sie bewusst aufgenommen werden.
const SESSION_KEYS = ['id', 'owner_id', 'dog_id', 'dog', 'owner_name', 'type', 'category', 'status', 'session_date',
  'started_at', 'ended_at', 'created_at', 'duration_seconds', 'search_duration_seconds', 'distance_meters',
  'articles_found', 'articles_total', 'average_deviation_meters', 'gps_quality_average', 'rating', 'score',
  'temperature', 'weather_condition', 'wetter', 'wind_speed', 'humidity', 'notes', 'objectReview'] as const;
const RUN_KEYS = ['id', 'run_id', 'started_at', 'ended_at', 'duration_seconds', 'distance_meters', 'articles_found',
  'total_objects', 'average_deviation_meters', 'breaks', 'score', 'continuity'] as const;

function searchRun(value: unknown): Rec {
  const run = record(value);
  return {
    ...pick(run, RUN_KEYS),
    // Die Absuche ist die eigene Linie der Hundeführer:in und bleibt unverändert.
    ...(Array.isArray(run.run_points) ? { run_points: run.run_points } : {}),
    ...(run.analytics != null ? { analytics: withoutCoordinates(run.analytics) } : {}),
    ...(run.object_snapshot != null ? { object_snapshot: withoutCoordinates(run.object_snapshot) } : {}),
  };
}

/**
 * Kopie eines Fährtendetails ohne alles, was von der Leger:in stammt: gelegte Punkte, Marker,
 * Abschnitte, Winkelgeometrie, Startkoordinate und Ortsname. Es bleiben Absuchelinie und Kennzahlen.
 * Die Eingabe bleibt unberührt.
 */
export function searchOnlyDetail(detail: unknown): Rec {
  const d = record(detail), td = record(d.track_data);
  return {
    ...pick(d, SESSION_KEYS),
    ...(d.objectReview != null ? { objectReview: withoutCoordinates(d.objectReview) } : {}),
    ...(d.engine != null ? { engine: pick(record(d.engine), ['average_accuracy']) } : {}),
    points: [],
    markers: [],
    runs: Array.isArray(d.runs) ? d.runs.map(searchRun) : [],
    track_data: {
      ...(td.run != null ? { run: searchRun(td.run) } : {}),
      ...(td.score != null ? { score: td.score } : {}),
      ...(td.evaluated_at != null ? { evaluated_at: td.evaluated_at } : {}),
    },
    [LAID_LINE_WITHHELD]: true,
  };
}

/** Für Wege, die das Detail weitergeben: fremd gelegt → nur Absuche und Kennzahlen; sonst unverändert (gleiche Referenz). */
export function withoutForeignLaidLine<T>(detail: T): T | Rec {
  return isForeignLaidGroupTrack(detail) ? searchOnlyDetail(detail) : detail;
}
