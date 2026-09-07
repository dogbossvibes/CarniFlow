import { readFileSync } from 'fs';

const source = () => readFileSync('app/track/run.tsx', 'utf8');

describe('TrackRunScreen arming flow', () => {
  // Root-Cause-Fix (Build 43, Abschnitt 1 des Audits — widersprüchliche
  // "Ansatz erreicht"/"Noch nicht am Startpunkt"-Anzeige): `approach.armed`
  // ist jetzt bewusst DIE EINE Definition, die sowohl das Banner als auch
  // handleManualStart (ein expliziter onPress-Handler, siehe Test unten)
  // lesen — vorher gab es dafür eine ZWEITE, separate Prüfung
  // (classifyManualStart), die genau den beobachteten Widerspruch erzeugte.
  // Die eigentliche Schutzvorkehrung — kein AUTOMATISCHER Start ohne
  // Nutzer-Tap — bleibt unverändert und wird unten weiterhin geprüft: kein
  // useEffect darf `approach.armed` autonom mit `beginSearchNow` verknüpfen.
  it('does not start automatically when the approach becomes armed (nur via explizitem onPress, siehe handleManualStart)', () => {
    const src = source();

    expect(src).not.toContain("beginSearchNow('automatic')");
    expect(src).not.toContain('beginSearchNow("automatic")');
    expect(src).not.toMatch(/useEffect\([\s\S]{0,260}approach\.armed[\s\S]{0,260}beginSearchNow/);
    // approach.armed darf beginSearchNow nur innerhalb von handleManualStart
    // erreichen (explizite Nutzeraktion), nicht ausserhalb davon.
    const handleManualStartBlock = src.slice(src.indexOf('const handleManualStart'), src.indexOf('}, [approach.armed, approach.distanceM, beginSearchNow]);'));
    expect(handleManualStartBlock).toMatch(/approach\.armed[\s\S]{0,60}beginSearchNow/);
  });

  it('keeps the handler-distance choice inside the scrollable arming overlay', () => {
    const src = source();
    const armingOverlay = src.slice(src.indexOf('{arming && ('), src.indexOf('{/* Steuerung */}'));

    expect(armingOverlay).toContain('<ScrollView');
    expect(armingOverlay).toContain("t('track.searchHandlerDistanceLabel')");
    expect(armingOverlay).toContain('HANDLER_DISTANCES_M.map');
    expect(armingOverlay).toContain('setSearchHandlerDistanceM(d)');
    expect(armingOverlay).toContain("accessibilityLabel={t('track.searchStartNow')}");
  });

  it('starts the search only from explicit user actions', () => {
    const src = source();

    expect(src).toContain("if (approach.armed) { beginSearchNow('manual-at-start'); return; }");
    expect(src).toContain("onPress: () => beginSearchNow('manual-override')");
    expect(src).toContain('onPress={handleManualStart}');
    expect(src).toContain('if (startedRef.current) return;');
  });

  it('does not render countdown or automatic-start copy in the arming overlay', () => {
    const src = source();
    const armingOverlay = src.slice(src.indexOf('{arming && ('), src.indexOf('{/* Steuerung */}'));

    expect(armingOverlay).not.toContain('kurz halten');
    expect(armingOverlay).not.toContain('Suchzeit startet automatisch');
    expect(armingOverlay).not.toContain('fixesRemaining');
    expect(armingOverlay).not.toContain('<ActivityIndicator size="small" color={FT.acc} />');
    expect(armingOverlay).toContain("t('track.searchApproachReached')");
    expect(armingOverlay).toContain("t('track.gpsStabilizing')");
    expect(armingOverlay).toContain("t('track.searchApproachHint')");
  });

  it('keeps recovery separate from a fresh manual start', () => {
    const src = source();
    const recoveryBlock = src.slice(src.indexOf('const resumeSearch'), src.indexOf('// Beenden:'));
    const beginBlock = src.slice(src.indexOf('const beginSearchNow'), src.indexOf('// Manueller „Jetzt starten"'));

    expect(recoveryBlock).toContain("setSessionStatus('searching')");
    expect(recoveryBlock).toContain('s.start({ points: saved.map');
    expect(beginBlock).toContain('useTrackingStore.getState().startSearchSession(null, startMs)');
    expect(src).not.toMatch(/setArming\(false\)[\s\S]{0,160}approach\.armed/);
  });
});
