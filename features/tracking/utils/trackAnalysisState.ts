// Welchen Zustand hat die automatische Analyse (Track Score 2.0) einer Fährte?
//
// REIN LESEND: diese Datei berechnet nichts, speichert nichts und verändert
// weder Analytics noch Tracking-, Corner-, Motion-, Persistenz- oder
// Recovery-Logik. Sie beantwortet nur die Frage, WELCHE Darstellung der
// Detail-Screen zeigen soll — damit der Analysebereich nicht mehr
// kommentarlos komplett verschwindet.
//
// Hintergrund: `payload_json.run.analytics` wird ausschliesslich beim
// normalen Absuche-Abschluss geschrieben (app/track/run.tsx → handleFinish →
// computeTrackAnalyticsV2). Fehlt es, gibt es genau zwei Fälle, die für den
// Nutzer völlig unterschiedlich bedeuten:
//   • es gab noch gar keine Absuche      → die Analyse steht noch aus
//   • es gab eine Absuche, aber keine Analyse → sie ist für diesen Lauf nicht da
// Bisher sahen beide identisch aus, nämlich gar nicht.

/** Nur die Felder, die für die Entscheidung gebraucht werden. */
export interface TrackAnalysisSource {
  track_data?: { run?: Record<string, unknown> | null } | null;
  runs?: unknown[] | null;
}

export type TrackAnalysisState =
  /** Analytics vorhanden → bestehende Track-Score-2.0-Karte. */
  | 'available'
  /** Keine Absuche vorhanden → Analyse steht noch aus. */
  | 'pending_search'
  /** Absuche vorhanden, aber ohne Analytics. */
  | 'unavailable';

/** Existiert überhaupt eine Absuche zu dieser Fährte? */
export function hasSearchRun(data: TrackAnalysisSource | null | undefined): boolean {
  if (!data) return false;
  if (data.track_data?.run) return true;
  return Array.isArray(data.runs) && data.runs.length > 0;
}

/**
 * @param data      Detail-Datensatz (lokal wie remote — beide Pfade reichen
 *                  `track_data.run` unverändert durch)
 * @param analytics das bereits ausgelesene `track_data.run.analytics`
 */
export function trackAnalysisState(
  data: TrackAnalysisSource | null | undefined,
  analytics: unknown,
): TrackAnalysisState {
  if (analytics) return 'available';
  return hasSearchRun(data) ? 'unavailable' : 'pending_search';
}

/**
 * Kurze, NICHT interpretierende Faktenzeile für den QA-Diagnosemodus. Bewusst
 * keine geratene Ursache („kein Start-Lock", „über Recovery beendet") — nur
 * das, was im Datensatz wirklich steht.
 */
export function analysisQaFacts(data: TrackAnalysisSource | null | undefined): string {
  const run = (data?.track_data?.run ?? null) as Record<string, unknown> | null;
  if (!run) return 'QA: kein run-Objekt im Datensatz · analytics=fehlt';
  const points = Array.isArray(run.run_points) ? run.run_points.length : 0;
  const dist = typeof run.distance_meters === 'number' ? `${Math.round(run.distance_meters)} m` : '—';
  const dur = typeof run.duration_seconds === 'number' ? `${Math.round(run.duration_seconds)} s` : '—';
  return `QA: run vorhanden · run_points=${points} · distance=${dist} · dauer=${dur} · analytics=fehlt`;
}
