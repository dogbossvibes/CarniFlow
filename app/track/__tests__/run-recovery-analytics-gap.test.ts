import { readFileSync } from 'fs';

// Punkt 8 der Sensor-Fusion-Nachbesserung: geprüft, NICHT improvisiert.
// Dokumentiert und verankert die bekannte Einschränkung, dass der Recovery-
// Kurzpfad (endSearch, ausgelöst über den "Beenden"-Button des Recovery-
// Dialogs) KEINE Track-Analytics erzeugt — er läuft nicht über den laufenden
// useSearchRecorder, sondern nur auf rohen, aus SQLite wiederhergestellten
// Punkten (dieselbe bestehende Einschränkung wie score/deviationAvgM/
// foundObjects/breaks in diesem Pfad, siehe die 0/leer-Defaults dort).
const source = () => readFileSync('app/track/run.tsx', 'utf8');

describe('Recovery-Kurzpfad (endSearch) — Analytics-Lücke dokumentiert (Punkt 8, bekannte Einschränkung)', () => {
  it('endSearch ruft buildRunResultPayload OHNE analytics auf', () => {
    const src = source();
    const endSearchStart = src.indexOf('const endSearch = async');
    const endSearchNextFn = src.indexOf('const discardSearch');
    expect(endSearchStart).toBeGreaterThan(-1);
    expect(endSearchNextFn).toBeGreaterThan(endSearchStart);
    const endSearchBody = src.slice(endSearchStart, endSearchNextFn);
    expect(endSearchBody).toContain('buildRunResultPayload');
    expect(endSearchBody).not.toMatch(/analytics:\s*computeTrackAnalytics/);
    // Die bereits VOR dieser Nachbesserung bestehende Einschränkung bleibt
    // unverändert sichtbar — score/deviationAvgM/foundObjects/breaks sind
    // durch Continuity korrigiert: unbekannter Score bleibt null; belegte Daten erhalten.
    expect(endSearchBody).toContain('score: null');
    expect(endSearchBody).toContain('breaks: runState.breaks');
  });

  it('the unavailable recovery score is documented without invented analytics)', () => {
    const src = source();
    expect(src).toContain('Recovery has no complete per-fix analytics history');
  });

  it('handleFinish (der normale Abschluss-Pfad, MIT laufendem Recorder) erzeugt Analytics weiterhin', () => {
    const src = source();
    const handleFinishStart = src.indexOf('const handleFinish = async');
    expect(handleFinishStart).toBeGreaterThan(-1);
    const handleFinishBody = src.slice(handleFinishStart, src.indexOf('// 2) Remote-Transport', handleFinishStart));
    // Version 3 erweitert denselben v1/v2-Kern; Recovery-Kurzpfad bleibt unverändert.
    expect(handleFinishBody).toContain('computeTrackAnalyticsV3');
    expect(handleFinishBody).toMatch(/analytics,/);
    expect(handleFinishBody).toMatch(/pointsTimeSec:\s*res\.pointsTimeSec/);
  });
});


it('awaits successful point persistence before either finalization path', () => {
  const src = source();
  for (const [start, end] of [['const endSearch = async', 'const discardSearch'], ['const handleFinish = async', '// 2) Remote-Transport']]) {
    const body = src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start)));
    const gate = body.indexOf('if (!(await flushSearchPoints(');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(body.indexOf('await finalizeLocalTrackRun('));
    expect(body.slice(gate, body.indexOf('await finalizeLocalTrackRun('))).toContain('return;');
  }
});
