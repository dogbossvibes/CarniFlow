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
    rating:             null,
    score:              run?.score ?? local.score ?? null,
    track_data:         {
      ...(payload.segments ? { segments: payload.segments } : {}),
      ...(run ? { run } : {}),
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
