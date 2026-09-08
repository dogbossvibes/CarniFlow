import type { LocalTrainingSession, LocalTrackPoint, LocalTrackMarker } from '@/features/sync/types/sync';

// Reine, testbare Zusammensetzung des Detail-/Auswertungs-Datensatzes aus lokalen
// (SQLite) Quellen — Fallback für eine noch nicht synchronisierte Fährte, damit der
// Detail-Screen NIE „nicht gefunden" zeigt. Shape = kompatibel zu getTrackSessionById
// (points / markers / runs / track_data). Die Absuche-Spur kommt aus payload_json.run.

function parseArr(s: string | null): string[] | null {
  if (!s) return null;
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : null; } catch { return null; }
}
function parseObj(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// Persistiertes payload_json.run → derselbe Shape, den der Detail-Screen von
// einer remote geladenen track_runs-Zeile bekommt (getTrackSessionById macht
// dort `select('*')`). Bewusst EXPLIZIT gemappt statt `{ ...run }`: das
// Payload aus buildRunResultPayload enthält zusätzlich interne/transiente
// Felder (run_id, breaks, score, total_objects, search_handler_distance_m,
// analytics), die in track_runs gar nicht existieren — ein blindes Spread
// würde lokal und remote wieder auseinanderlaufen lassen. Die Spaltenliste
// hier entspricht 1:1 dem, was upsertRemoteTrackRun in track_runs schreibt.
//
// Root-Cause-Fix (Feldtest BUILD40 + EXPO, "Automatische Auswertung nicht
// verfügbar" trotz sichtbarer 40 m Suchspur): beide lokalen Pfade haben den
// Run bisher auf `[{ run_points }]` reduziert. app/track/[id].tsx prüft aber
// `runs[0].distance_meters` — das war lokal damit IMMER undefined, also
// hasValidGeometry=false, egal wie lang die Absuche wirklich war. Auf dem
// Remote-Pfad funktionierte dieselbe Prüfung, weil track_runs die Spalte
// wirklich führt; deshalb fiel es erst bei einem offline gelaufenen Feldtest
// auf. Die 40 m lagen die ganze Zeit in payload_json.run.distance_meters.
export interface LocalTrackRunRow {
  id: string | null;
  session_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  average_deviation_meters: number | null;
  articles_found: number | null;
  run_points: any;
}

function runRowFromPayload(run: Record<string, any>): LocalTrackRunRow {
  return {
    id:                       run.run_id ?? null,
    session_id:               run.session_id ?? null,
    started_at:               run.started_at ?? null,
    ended_at:                 run.ended_at ?? null,
    duration_seconds:         run.duration_seconds ?? null,
    distance_meters:          run.distance_meters ?? null,
    average_deviation_meters: run.average_deviation_meters ?? null,
    articles_found:           run.articles_found ?? null,
    run_points:               run.run_points ?? [],
  };
}

// Nur die Run-Ergänzung aus payload_json.run — für den Fall, dass eine remote-Session
// existiert, deren track_runs (Absuche) aber noch nicht synchronisiert ist. null, wenn
// kein/kaputtes payload_json.run. Kanonisch bleibt remote track_runs.run_points; dies
// füllt nur die Lücke bis der Run gesynct ist.
export function runSupplementFromPayload(payloadJson: string | null): {
  // Shape wie eine remote track_runs-Zeile (siehe runRowFromPayload) — die
  // Auswertung liest daraus run_points UND distance_meters.
  runs: LocalTrackRunRow[]; track_data: { run: any };
  articles_found: number | null; average_deviation_meters: number | null; score: number | null;
} | null {
  const payload = parseObj(payloadJson);
  const run = payload?.run ?? null;
  if (!run) return null;
  return {
    runs: run.run_points ? [runRowFromPayload(run)] : [],
    track_data: { run },
    articles_found: run.articles_found ?? null,
    average_deviation_meters: run.average_deviation_meters ?? null,
    score: run.score ?? null,
  };
}

export function buildLocalTrackDetail(
  local: LocalTrainingSession, points: LocalTrackPoint[], markers: LocalTrackMarker[],
): Record<string, any> {
  const payload = parseObj(local.payload_json) ?? {};
  const run = payload.run ?? null;
  const time = local.started_at ?? local.created_at ?? null;
  return {
    id:                 local.local_id,
    dog_id:             local.dog_id,
    dog:                null,   // Hundename lokal nicht vorhanden → Screen fällt auf 'Fährte' zurück
    session_date:       time ? time.slice(0, 10) : null,
    created_at:         local.created_at ?? null,
    notes:              local.notes ?? null,
    surface_types:      parseArr(local.surface_types),
    terrain_conditions: parseArr(local.terrain_conditions),
    temperature:        local.temperature,
    weather_condition:  local.weather_condition,
    wetter:             local.weather_condition,
    wind_speed:         local.wind_speed,
    humidity:           local.humidity,
    distance_meters:    payload.distanceMeters ?? run?.distance_meters ?? null,
    corners_total:      payload.cornersTotal ?? null,
    articles_total:     payload.articlesTotal ?? run?.total_objects ?? null,
    articles_found:     run?.articles_found ?? null,
    average_deviation_meters: run?.average_deviation_meters ?? null,
    rating:             payload.score ?? local.score ?? null,
    score:              payload.score ?? run?.score ?? local.score ?? null,
    track_data:         {
      ...(payload.segments ? { segments: payload.segments } : {}),
      ...(run ? { run } : {}),
      ...(payload.legs ? { legs: payload.legs } : {}),
      ...(payload.score != null ? { score: payload.score } : {}),
      ...(payload.evaluated_at ? { evaluated_at: payload.evaluated_at } : {}),
    },
    points: points.map(p => ({
      latitude: p.latitude, longitude: p.longitude, point_type: p.point_type ?? 'lay',
      accuracy: p.accuracy ?? null, timestamp: p.timestamp,
    })),
    markers: markers.map(m => ({
      id: m.local_id, marker_type: m.marker_type, latitude: m.latitude, longitude: m.longitude,
      angle_kind: m.angle_kind, material: m.material, distance_from_start: m.distance_from_start,
      note: m.note, audio_url: m.audio_remote_url, created_at: m.created_at, found: false,
    })),
    // Kanonische Absuche-Spur aus payload_json.run (derselbe Shape wie eine
    // remote track_runs-Zeile — inkl. distance_meters, siehe runRowFromPayload).
    runs: run?.run_points ? [runRowFromPayload(run)] : [],
    _localOnly: true,
  };
}
