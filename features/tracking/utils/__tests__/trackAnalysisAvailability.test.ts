/**
 * EINE Source of Truth für Warnhinweis + Analyse-Karte im Auswertungs-Screen.
 *
 * Production-Befund 13.09.2026 (training_sessions 84b3c0ea…): 134 m Fährte,
 * track_data.run mit distance_meters=136.4 UND analytics (v2, Track Score 90),
 * aber track_runs = 0 Zeilen (Run-Sync scheiterte) → der Screen zeigte
 * „Automatische Auswertung nicht verfügbar — keine verwertbare Suchspur" UND
 * 90/100 gleichzeitig. Warnhinweis las runs[0].distance_meters, die Karte
 * track_data.run.analytics. Hier: beides aus demselben Helfer.
 */
import {
  trackAnalysisAvailability, isUsableTrackAnalytics, hasSearchGeometry,
} from '@/features/tracking/utils/trackAnalysisState';

const full = (over: Record<string, unknown> = {}) => ({
  analyticsVersion: 2, trackScore: 90, analysisConfidenceBand: 'excellent', analysisConfidenceHint: null,
  deviation: { meanM: 0.7 }, pace: { avgMps: 0.1 }, reacquisition: { count: 0, meanSec: null, maxSec: null },
  corners: [{ side: 'rechts', atM: 62.9 }, { side: 'links', atM: 129.9 }], objects: [], ...over,
});

describe('trackAnalysisAvailability — Production-Shape 84b3c0ea (remote, track_runs nie synchronisiert)', () => {
  const data = {
    distance_meters: 134.0, corners_total: 3,
    track_data: { run: { distance_meters: 136.44, duration_seconds: 884, analytics: full() } },
    runs: [],   // track_runs = 0 Zeilen
  };
  it('Analyse verfügbar, Karte rendert dasselbe Objekt, KEIN Warnhinweis', () => {
    const a = trackAnalysisAvailability(data);
    expect(a.state).toBe('available');
    expect(a.analytics).toBe(data.track_data.run.analytics);   // dieselbe Referenz, keine Kopie
    expect(a.hasSearchGeometry).toBe(true);                     // aus track_data.run.distance_meters
    expect(a.showNoSearchTrackWarning).toBe(false);
  });
});

describe('trackAnalysisAvailability — Zustände', () => {
  it('1. analytics v2 verwertbar → available + kein Warnhinweis, selbst bei runs[] leer und ohne distance', () => {
    const a = trackAnalysisAvailability({ track_data: { run: { analytics: full() } }, runs: [] });
    expect(a.state).toBe('available');
    expect(a.analytics).not.toBeNull();
    expect(a.showNoSearchTrackWarning).toBe(false);
  });
  it('2. keine verwertbare Analyse + 0 m Suchspur → Warnhinweis, KEIN automatischer Score', () => {
    const a = trackAnalysisAvailability({ track_data: { run: { distance_meters: 0, run_points: [] } }, runs: [{ distance_meters: 0 }] });
    expect(a.state).toBe('unavailable');
    expect(a.analytics).toBeNull();
    expect(a.showNoSearchTrackWarning).toBe(true);
  });
  it('2b. gar keine Absuche → pending_search + Warnhinweis (Suchspur fehlt), kein Score', () => {
    const a = trackAnalysisAvailability({ track_data: {}, runs: [] });
    expect(a.state).toBe('pending_search');
    expect(a.analytics).toBeNull();
    expect(a.showNoSearchTrackWarning).toBe(true);
  });
  it('3. Absuche mit Geometrie, aber ohne Analytics (Recovery-Kurzpfad) → unavailable, kein Warnhinweis „keine Suchspur"', () => {
    const a = trackAnalysisAvailability({ track_data: { run: { distance_meters: 40, run_points: [{ lat: 1, lng: 2 }] } }, runs: [] });
    expect(a.state).toBe('unavailable');
    expect(a.showNoSearchTrackWarning).toBe(false);
  });
  it('4. truthy, aber unvollständiges analytics-Objekt täuscht KEINE Karte vor', () => {
    for (const bad of [{}, { trackScore: 90 }, { trackScore: 'x', analysisConfidenceBand: 'good' }, full({ deviation: null }), full({ corners: undefined }), true, 'yes']) {
      expect(isUsableTrackAnalytics(bad)).toBe(false);
      const a = trackAnalysisAvailability({ track_data: { run: { distance_meters: 40, analytics: bad } }, runs: [] });
      expect(a.state).toBe('unavailable');
      expect(a.analytics).toBeNull();
    }
  });
  it('5. Invariante: Warnhinweis und Analyse-Objekt schliessen sich in jeder Kombination aus', () => {
    const analyticsVariants = [undefined, {}, full(), full({ analyticsVersion: 1 })];
    const runVariants = [undefined, { distance_meters: 0 }, { distance_meters: 136 }, { run_points: [] }];
    const rowVariants = [undefined, [], [{ distance_meters: 0 }], [{ distance_meters: 25 }]];
    for (const an of analyticsVariants) for (const run of runVariants) for (const rows of rowVariants) {
      const data = { track_data: { run: run ? { ...run, ...(an !== undefined ? { analytics: an } : {}) } : undefined }, runs: rows };
      const a = trackAnalysisAvailability(data as never);
      expect(a.showNoSearchTrackWarning && a.analytics != null).toBe(false);
      expect(a.state === 'available').toBe(a.analytics != null);
    }
  });
});

describe('hasSearchGeometry — track_data.run zuerst, runs-Zeile als zweite Quelle', () => {
  it('liest beide Quellen; > 0 m in einer davon genügt', () => {
    expect(hasSearchGeometry({ track_data: { run: { distance_meters: 136 } }, runs: [] })).toBe(true);
    expect(hasSearchGeometry({ track_data: { run: {} }, runs: [{ distance_meters: 25 }] })).toBe(true);
    expect(hasSearchGeometry({ track_data: { run: { distance_meters: 0 } }, runs: [{ distance_meters: 0 }] })).toBe(false);
    expect(hasSearchGeometry({ track_data: { run: { distance_meters: null } }, runs: [{ distance_meters: null }] })).toBe(false);
    expect(hasSearchGeometry({ runs: [] })).toBe(false);
    expect(hasSearchGeometry(null)).toBe(false);
  });
  it('lokal (runSupplement-Shape) und remote (track_runs-Zeile) führen zum selben Ergebnis', () => {
    const local  = { track_data: { run: { run_points: [], distance_meters: 40 } }, runs: [{ distance_meters: 40 }] };
    const remote = { track_data: { run: { distance_meters: 40 } }, runs: [{ distance_meters: 40 }] };
    expect(hasSearchGeometry(local)).toBe(hasSearchGeometry(remote));
  });
});
