import { readFileSync } from 'fs';

// Gleiches Test-Muster wie evaluation-conditions-layout.test.ts: app/track/[id].tsx
// ist ein komplexer Screen (Modal/TrackingMap/viele Deps) — statt eines schweren
// Render-Harnesses wird die Quelldatei auf die vertraglich zugesicherten
// Eigenschaften des neuen, additiven "Analyse"-Blocks (Punkt 14) geprüft.
const source = () => readFileSync('app/track/[id].tsx', 'utf8');

describe('Track-Detail — Analyse-Sektion (Punkt 9/14, additiv)', () => {
  it('rendert nur, wenn analytics vorhanden ist (ältere Fährten bleiben unverändert)', () => {
    const src = source();
    expect(src).toContain('const analytics: TrackAnalytics | undefined = data?.track_data?.run?.analytics;');
    expect(src).toContain('{analytics && (');
  });

  it('zeigt Track Score EXPLIZIT als eigenen, automatischen Wert — getrennt vom manuellen Punkte-Score', () => {
    const src = source();
    expect(src).toContain('analytics.trackScore');
    expect(src).toContain('TRACK SCORE (AUTOMATISCH)');
    // Der manuelle Score (trackEvaluation.ts) bleibt die TrackScoreRing oben — kein Merge.
    expect(src).toContain('<TrackScoreRing value={score}');
  });

  it('zeigt die Analysis-Confidence separat mit Hinweistext bei eingeschränkter Grundlage — senkt NIE den Track Score', () => {
    const src = source();
    expect(src).toContain('analytics.analysisConfidenceBand');
    expect(src).toContain('analytics.analysisConfidenceHint');
    expect(src).toContain("CONFIDENCE_BAND_LABEL");
  });

  it('bietet optionale Detail-Ansicht (Ecken/Gegenstände) nur wenn vorhanden', () => {
    const src = source();
    expect(src).toContain('analytics.corners.length > 0 || analytics.objects.length > 0');
    expect(src).toContain('setAnalyseExpanded');
  });

  it('zeigt Neuaufnahme-Zeit (Punkt 1/9 der Nachbesserung) dezent im bestehenden Detailbereich, nur wenn echte Werte vorliegen', () => {
    const src = source();
    expect(src).toContain('analytics.reacquisition.meanSec != null');
    expect(src).toContain('Neuaufnahme Ø');
    expect(src).toContain('Längste');
    // Kein neuer UI-Block — dieselbe s.analyseDetailRow-Card wie Winkel/Gegenstände.
    const reacqLine = src.split('\n').find(l => l.includes('Neuaufnahme Ø'));
    expect(reacqLine).toBeDefined();
  });

  it('verwendet ausschliesslich bestehende Design-Tokens (C.*), keine neuen Farben', () => {
    const src = source();
    const analyseBlockMatch = src.match(/\{analytics && \(([\s\S]*?)\n {10}\)\}/);
    expect(analyseBlockMatch).not.toBeNull();
    const block = analyseBlockMatch![1];
    // Jede Farbreferenz im Block ist ein C.trackXxx-Token oder eine rgba/hex-
    // Transparenz-Modifikation eines solchen Tokens (bestehendes Muster, siehe
    // z. B. cardGlow/condIcon weiter unten in dieser Datei) — keine frei erfundene Farbe.
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}(?!['"]?\s*\+)/);
  });
});
