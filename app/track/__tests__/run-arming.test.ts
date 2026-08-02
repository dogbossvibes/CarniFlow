import { readFileSync } from 'fs';

const source = () => readFileSync('app/track/run.tsx', 'utf8');

describe('TrackRunScreen arming flow', () => {
  it('does not start when the approach is armed', () => {
    const src = source();

    expect(src).not.toContain("beginSearchNow('automatic')");
    expect(src).not.toContain('beginSearchNow("automatic")');
    expect(src).not.toMatch(/approach\.armed[\s\S]{0,120}beginSearchNow/);
    expect(src).not.toMatch(/useEffect\([\s\S]{0,260}approach\.armed[\s\S]{0,260}beginSearchNow/);
  });

  it('keeps the handler-distance choice inside the scrollable arming overlay', () => {
    const src = source();
    const armingOverlay = src.slice(src.indexOf('{arming && ('), src.indexOf('{/* Steuerung */}'));

    expect(armingOverlay).toContain('<ScrollView');
    expect(armingOverlay).toContain("t('track.searchHandlerDistanceLabel')");
    expect(armingOverlay).toContain('([5, 10] as const).map');
    expect(armingOverlay).toContain('setSearchHandlerDistanceM(d)');
    expect(armingOverlay).toContain("accessibilityLabel={t('track.searchStartNow')}");
  });

  it('starts the search only from explicit user actions', () => {
    const src = source();

    expect(src).toContain("if (decision === 'at-start') { beginSearchNow('manual-at-start'); return; }");
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
