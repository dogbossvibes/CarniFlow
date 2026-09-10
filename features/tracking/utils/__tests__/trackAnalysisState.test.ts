// Darstellungs-Zustand des Analysebereichs im Track-Detail.
//
// Rein lesend: geprüft wird ausschliesslich, WELCHE Darstellung gezeigt wird —
// nichts an Analytics-Berechnung, Tracking, Corner, Motion, Persistenz oder
// Recovery.
import {
  trackAnalysisState, hasSearchRun, analysisQaFacts,
} from '@/features/tracking/utils/trackAnalysisState';

const analyticsV2 = { analyticsVersion: 2, trackScore: 84, analysisConfidenceBand: 'good' };

describe('trackAnalysisState', () => {
  it('nur gelegte Fährte, keine Absuche → Hinweis „nach der Absuche"', () => {
    expect(trackAnalysisState({ track_data: {}, runs: [] }, undefined)).toBe('pending_search');
    expect(trackAnalysisState({ track_data: null, runs: null }, undefined)).toBe('pending_search');
    expect(trackAnalysisState(null, undefined)).toBe('pending_search');
    expect(trackAnalysisState({}, undefined)).toBe('pending_search');
  });

  it('Absuche vorhanden, aber ohne Analytics → „Analyse nicht verfügbar"', () => {
    // Recovery-Kurzpfad: run vorhanden, analytics fehlt.
    expect(trackAnalysisState({ track_data: { run: { run_points: [{ lat: 1, lng: 2 }] } } }, undefined)).toBe('unavailable');
    // Auch wenn nur die runs-Liste da ist (remote geladene track_runs-Zeile).
    expect(trackAnalysisState({ runs: [{ distance_meters: 40 }] }, undefined)).toBe('unavailable');
  });

  it('Absuche mit Analytics → bestehende Analyse-Karte', () => {
    expect(trackAnalysisState({ track_data: { run: { analytics: analyticsV2 } } }, analyticsV2)).toBe('available');
    // Analytics haben Vorrang, auch wenn die runs-Liste leer ist (z. B. lokal
    // ohne run_points, aber mit gespeicherter Analyse).
    expect(trackAnalysisState({ runs: [] }, analyticsV2)).toBe('available');
  });

  it('v1-Analytics zählen genauso als vorhanden — keine Versionshürde für die Karte', () => {
    const v1 = { analyticsVersion: 1, trackScore: 71, analysisConfidenceBand: 'fair' };
    expect(trackAnalysisState({ track_data: { run: { analytics: v1 } } }, v1)).toBe('available');
  });

  it('lokal und remote führen zum selben Ergebnis (beide Pfade reichen run durch)', () => {
    const local = { track_data: { run: { run_points: [], distance_meters: 40 } }, runs: [], _localOnly: true } as never;
    const remote = { track_data: { run: { distance_meters: 40 } }, runs: [{ distance_meters: 40 }] };
    expect(trackAnalysisState(local, undefined)).toBe(trackAnalysisState(remote, undefined));
  });
});

describe('hasSearchRun', () => {
  it('erkennt eine Absuche an track_data.run oder an der runs-Liste', () => {
    expect(hasSearchRun({ track_data: { run: {} } })).toBe(true);
    expect(hasSearchRun({ runs: [{}] })).toBe(true);
    expect(hasSearchRun({ track_data: { run: null }, runs: [] })).toBe(false);
    expect(hasSearchRun(undefined)).toBe(false);
  });
});

describe('analysisQaFacts', () => {
  it('nennt nur Fakten aus dem Datensatz — keine geratene Ursache', () => {
    const line = analysisQaFacts({ track_data: { run: { run_points: [1, 2, 3], distance_meters: 41.6, duration_seconds: 92.4 } } } as never);
    expect(line).toContain('run_points=3');
    expect(line).toContain('distance=42 m');
    expect(line).toContain('dauer=92 s');
    expect(line).toContain('analytics=fehlt');
    // Keine Spekulation über den Grund.
    for (const word of ['START_LOCK', 'Recovery', 'payload', 'weil']) expect(line).not.toContain(word);
  });

  it('kommt ohne run-Objekt zurecht', () => {
    expect(analysisQaFacts({})).toContain('kein run-Objekt');
  });
});
