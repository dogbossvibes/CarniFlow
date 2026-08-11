// Reine, testbare Abbildung: Absuche-Ergebnis (SearchResult + Kontext) → persistierte
// Run-Struktur für local_training_sessions.payload_json.run. Enthält alles, was heute
// nur an finishTrackRun (remote) übergeben wird, plus die stabile client-Run-UUID.

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
  };
}
