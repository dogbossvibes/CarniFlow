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
    // hart auf 0/leer gesetzt (kein Reconstruct aus rohen Punkten).
    expect(endSearchBody).toContain('score: 0, deviationAvgM: 0, foundObjects: 0, totalObjects: 0');
  });

  it('die Einschränkung ist im Code klar dokumentiert (BEKANNTE EINSCHRÄNKUNG)', () => {
    const src = source();
    expect(src).toContain('BEKANNTE EINSCHRÄNKUNG (Punkt 8 der Nachbesserung');
  });

  it('handleFinish (der normale Abschluss-Pfad, MIT laufendem Recorder) erzeugt Analytics weiterhin', () => {
    const src = source();
    const handleFinishStart = src.indexOf('const handleFinish = async');
    expect(handleFinishStart).toBeGreaterThan(-1);
    const handleFinishBody = src.slice(handleFinishStart, handleFinishStart + 3000);
    expect(handleFinishBody).toContain('computeTrackAnalytics');
    expect(handleFinishBody).toMatch(/analytics,?\s*\n?\s*\}\)\)/);
  });
});
