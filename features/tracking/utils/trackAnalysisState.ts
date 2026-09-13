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

import type { TrackAnalytics } from '@/features/tracking/engine/trackAnalytics';

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
  if (isUsableTrackAnalytics(analytics)) return 'available';
  return hasSearchRun(data) ? 'unavailable' : 'pending_search';
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * „Verwertbare" Analyse = genau die Felder, die die Analyse-Karte rendert
 * (Track Score, Confidence-Band, Ø Spurtreue, Ø Tempo, Neuansätze, Ecken/
 * Gegenstände). Ein bloss truthy-Objekt (z. B. `{}` aus einem abgebrochenen
 * Schreibvorgang) reicht NICHT — sonst würde die Karte mit leeren Werten
 * oder gar nicht rendern, während der Zustand „available" meldet. Keine
 * Versionshürde: v1 und v2 gelten gleichermassen, solange sie vollständig sind.
 */
export function isUsableTrackAnalytics(a: unknown): a is TrackAnalytics {
  if (!a || typeof a !== 'object') return false;
  const x = a as Record<string, unknown>;
  const dev = x.deviation as Record<string, unknown> | undefined;
  const pace = x.pace as Record<string, unknown> | undefined;
  const reacq = x.reacquisition as Record<string, unknown> | undefined;
  return isNum(x.trackScore)
    && typeof x.analysisConfidenceBand === 'string'
    && !!dev && isNum(dev.meanM)
    && !!pace && isNum(pace.avgMps)
    && !!reacq && isNum(reacq.count)
    && Array.isArray(x.corners) && Array.isArray(x.objects);
}

/**
 * Hat die Absuche verwertbare Geometrie (> 0 m Suchspur) erzeugt?
 *
 * Gemeinsame Quelle für Warnhinweis UND Default der manuellen Abschnitts-
 * Bewertung. Bisher zählte NUR `runs[0].distance_meters` (remote track_runs-
 * Zeile bzw. lokale Run-Ergänzung). Production-Befund 13.09.2026 (Session mit
 * 134 m Fährte, Track Score 90): track_runs war nie synchronisiert (0 Zeilen),
 * `track_data.run` in training_sessions führte aber distance_meters=136 m UND
 * analytics — der Screen zeigte deshalb gleichzeitig „keine verwertbare
 * Suchspur" und einen automatischen Track Score. `track_data.run` ist auf
 * beiden Pfaden (lokal wie remote) vorhanden und wird daher zuerst gelesen;
 * die runs-Zeile bleibt als zweite Quelle.
 */
export function hasSearchGeometry(data: TrackAnalysisSource | null | undefined): boolean {
  const run = data?.track_data?.run ?? null;
  const fromTrackData = run && isNum(run.distance_meters) ? run.distance_meters : null;
  const row = Array.isArray(data?.runs) ? (data!.runs[0] as { distance_meters?: unknown } | undefined) : undefined;
  const fromRow = row && isNum(row.distance_meters) ? row.distance_meters : null;
  return Math.max(fromTrackData ?? 0, fromRow ?? 0) > 0;
}

export interface TrackAnalysisAvailability {
  state: TrackAnalysisState;
  /** Nur bei state === 'available' gesetzt — dieselbe Referenz wie track_data.run.analytics. */
  analytics: TrackAnalytics | null;
  hasSearchGeometry: boolean;
  /**
   * Gelber Hinweis „Automatische Auswertung nicht verfügbar — keine verwertbare
   * Suchspur". Per Konstruktion NIE gleichzeitig mit einer verwertbaren
   * Analyse: liegt eine vor, gibt es eine automatische Auswertung, der Satz
   * wäre falsch.
   */
  showNoSearchTrackWarning: boolean;
}

/**
 * EINE Source of Truth für den Detail-/Auswertungs-Screen: Analyse-Zustand,
 * verwertbares Analytics-Objekt, Geometrie-Signal und Warnhinweis werden aus
 * demselben Datensatz abgeleitet — keine zweite, unabhängige Prüfung im Screen.
 */
export function trackAnalysisAvailability(data: TrackAnalysisSource | null | undefined): TrackAnalysisAvailability {
  const raw = data?.track_data?.run?.analytics;
  const state = trackAnalysisState(data, raw);
  const analytics = state === 'available' ? (raw as TrackAnalytics) : null;
  const geometry = hasSearchGeometry(data);
  return {
    state, analytics, hasSearchGeometry: geometry,
    showNoSearchTrackWarning: !geometry && state !== 'available',
  };
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
