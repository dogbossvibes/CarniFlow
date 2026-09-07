// Reine, testbare Abbildung: Absuche-Ergebnis (SearchResult + Kontext) → persistierte
// Run-Struktur für local_training_sessions.payload_json.run. Enthält alles, was heute
// nur an finishTrackRun (remote) übergeben wird, plus die stabile client-Run-UUID.

import type { TrackAnalytics } from '@/features/tracking/engine/trackAnalytics';

export interface RunResultSource {
  durationS:     number;
  score:         number;
  deviationAvgM: number;
  foundObjects:  number;
  totalObjects:  number;
  distanceM:     number;
  breaks:        unknown[];   // Länge = Abriss/Off-Track-Ereignisse
  points:        { latitude: number; longitude: number }[];
}

export function buildRunResultPayload(args: {
  runId:                 string;   // führende client-Run-UUID = track_runs.id
  sessionId:             string;   // parent training_sessions.id (== clientUuid)
  startedAtMs:           number;
  endedAtMs:             number;
  result:                RunResultSource;
  searchHandlerDistanceM?: number;
  // Punkt 10/12/13: additiv, KEINE Migration nötig — payload_json ist schemalos
  // (JSONB). Fehlt sie (z. B. Freilauf ohne Soll-Fährte, Recovery-Kurzpfad ohne
  // laufenden Recorder), bleibt das Feld schlicht weg — bestehende Konsumenten
  // (detail.tsx) müssen `analytics` immer optional behandeln.
  analytics?: TrackAnalytics;
}): Record<string, unknown> {
  const r = args.result;
  return {
    run_id:                    args.runId,
    session_id:                args.sessionId,
    started_at:                new Date(args.startedAtMs).toISOString(),
    ended_at:                  new Date(args.endedAtMs).toISOString(),
    duration_seconds:          r.durationS,
    score:                     r.score,
    average_deviation_meters:  r.deviationAvgM,
    articles_found:            r.foundObjects,
    total_objects:             r.totalObjects,
    distance_meters:           r.distanceM,
    breaks:                    r.breaks.length,
    search_handler_distance_m: args.searchHandlerDistanceM ?? null,
    run_points:                r.points.map(p => ({ lat: p.latitude, lng: p.longitude })),
    ...(args.analytics ? { analytics: args.analytics } : {}),
  };
}
