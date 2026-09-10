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

  it('zeigt statt eines leeren Bereichs einen Empty State — beide Fälle unterscheidbar', () => {
    const src = source();
    // Zustand kommt aus dem reinen Helfer, nicht aus einer neuen Screen-Logik.
    expect(src).toContain("import { trackAnalysisState, analysisQaFacts } from '@/features/tracking/utils/trackAnalysisState';");
    expect(src).toContain('const analysisState = trackAnalysisState(data, analytics);');
    expect(src).toContain("{analysisState === 'pending_search' && (");
    expect(src).toContain("{analysisState === 'unavailable' && (");
    // Texte kommen aus i18n, nicht hartkodiert.
    expect(src).toContain("t('track.analysisPending')");
    expect(src).toContain("t('track.analysisPendingHint')");
    expect(src).toContain("t('track.analysisUnavailable')");
  });

  it('nennt im normalen Nutzer-UI keine technischen Begriffe', () => {
    const src = source();
    const start = src.indexOf("{analysisState === 'pending_search' && (");
    const end = src.indexOf('{analytics && (', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    for (const word of ['START_LOCKED', 'payload', 'Recovery', 'endSearch']) {
      // Erlaubt ist der Begriff nur in Kommentaren, nicht in gerendertem Text.
      const rendered = block.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
      expect(rendered.join('\n')).not.toContain(word);
    }
  });

  it('der technische Grund erscheint ausschliesslich im QA-Diagnosemodus', () => {
    const src = source();
    expect(src).toContain('const qaDiagnostics = isQaDiagnosticsEnabled();');
    expect(src).toContain('{qaDiagnostics && <Text style={s.analyseEmptyQa}>{analysisQaFacts(data)}</Text>}');
  });

  it('Begriffstrennung: manueller Score ist als manuelle Bewertung benannt', () => {
    const src = source();
    expect(src).toContain("label={t('track.manualScoreLabel')}");
    expect(src).toContain("GESAMTPUNKTZAHL · {t('track.manualScoreLabel')}");
    // Der automatische Wert behält sein bestehendes Label.
    expect(src).toContain('TRACK SCORE (AUTOMATISCH)');
  });

  it('die bestehende Track-Score-2.0-Karte bleibt unverändert gerendert', () => {
    const src = source();
    expect(src).toContain('{analytics && (');
    expect(src).toContain('<Text style={s.analyseScoreVal}>{analytics.trackScore}<Text style={s.analyseScoreMax}>/100</Text></Text>');
    expect(src).toContain('<SectionLabel>Analyse</SectionLabel>');
  });

  it('keine Tracking-/Analyse-/Recovery-Logik im Screen verändert', () => {
    const src = source();
    // Der Screen berechnet weiterhin NICHTS selbst.
    expect(src).not.toContain('computeTrackAnalytics');
    expect(src).not.toContain('computeTrackAnalyticsV2');
    expect(src).not.toContain('finalizeLocalTrackRun');
    expect(src).not.toContain('buildRunResultPayload');
    // Und der Helfer schreibt nichts.
    const helper = readFileSync('features/tracking/utils/trackAnalysisState.ts', 'utf8');
    expect(helper).not.toContain('AsyncStorage');
    expect(helper).not.toContain('await ');
    expect(helper).not.toMatch(/\bset[A-Z]/);
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
