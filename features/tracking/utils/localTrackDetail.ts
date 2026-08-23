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

// Nur die Run-Ergänzung aus payload_json.run — für den Fall, dass eine remote-Session
// existiert, deren track_runs (Absuche) aber noch nicht synchronisiert ist. null, wenn
// kein/kaputtes payload_json.run. Kanonisch bleibt remote track_runs.run_points; dies
// füllt nur die Lücke bis der Run gesynct ist.
export function runSupplementFromPayload(payloadJson: string | null): {
  runs: { run_points: any }[]; track_data: { run: any };
  articles_found: number | null; average_deviation_meters: number | null; score: number | null;
} | null {
  const payload = parseObj(payloadJson);
  const run = payload?.run ?? null;
  if (!run) return null;
  return {
    runs: run.run_points ? [{ run_points: run.run_points }] : [],
    track_data: { run },
    articles_found: run.articles_found ?? null,
    average_deviation_meters: run.average_deviation_meters ?? null,
    score: run.score ?? null,
  };
}

// Lokale Bewertung (legs/score/notes/evaluated_at) aus payload_json — für den Fall,
// dass eine REMOTE-Session existiert, deren gesyncte Bewertung aber ÄLTER (oder leer)
// ist als die lokal zuletzt gespeicherte (pending Sync / fehlgeschlagener Sync).
// null, wenn lokal keine Bewertung vorliegt.
export interface LocalEvalSupplement {
  legs: any[] | null;
  score: number | null;
  notes: string | null;
  evaluatedAt: string | null;
}
export function evalSupplementFromPayload(
  payloadJson: string | null, localScore: number | null, localNotes: string | null,
): LocalEvalSupplement | null {
  const payload = parseObj(payloadJson) ?? {};
  const legs = Array.isArray(payload.legs) ? payload.legs : null;
  const score = payload.score ?? localScore ?? null;
  const evaluatedAt = payload.evaluated_at ?? null;
  // Nur ergänzen, wenn wirklich eine Bewertung existiert (legs ODER expliziter Score
  // aus einer Ausarbeitung). Sonst würde ein leeres Supplement Remote-Daten verdrängen.
  if (!legs && score == null && evaluatedAt == null) return null;
  return { legs, score, notes: localNotes ?? null, evaluatedAt };
}

// Überlagert die lokale Bewertung auf einen REMOTE-Detaildatensatz — local-first:
// nur, wenn die lokale Bewertung NEUER ist als die remote (evaluated_at-Vergleich)
// ODER remote noch gar keine legs/score hat. Reine, testbare Funktion. Verschiebt den
// Winkel/Marker NICHT — nur track_data.legs/score/evaluated_at + top-level score/notes.
export function overlayLocalEval(
  remote: Record<string, any>, local: LocalEvalSupplement | null,
): Record<string, any> {
  if (!local) return remote;
  const rtd = (remote.track_data && typeof remote.track_data === 'object') ? remote.track_data : {};
  const remoteEvalAt: string | null = rtd.evaluated_at ?? null;
  const remoteHasEval = Array.isArray(rtd.legs) && rtd.legs.length > 0;
  const localNewer = local.evaluatedAt != null
    && (remoteEvalAt == null || Date.parse(local.evaluatedAt) > Date.parse(remoteEvalAt));
  // Lokale Bewertung nur übernehmen, wenn sie neuer ist ODER remote keine hat.
  if (!localNewer && remoteHasEval) return remote;
  return {
    ...remote,
    notes: local.notes ?? remote.notes ?? null,
    score: local.score ?? remote.score ?? null,
    track_data: {
      ...rtd,
      ...(local.legs ? { legs: local.legs } : {}),
      ...(local.score != null ? { score: local.score } : {}),
      ...(local.evaluatedAt ? { evaluated_at: local.evaluatedAt } : {}),
    },
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
    // Kanonische Absuche-Spur aus payload_json.run.run_points (wie remote track_runs.run_points).
    runs: run?.run_points ? [{ run_points: run.run_points }] : [],
    _localOnly: true,
  };
}
