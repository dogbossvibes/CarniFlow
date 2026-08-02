import { readFileSync } from 'fs';

const source = () => readFileSync('app/track/run.tsx', 'utf8');

describe('TrackRunScreen arming flow', () => {
  it('does not auto-start when the approach is armed', () => {
    const src = source();

    expect(src).not.toContain("beginSearchNow('automatic')");
    expect(src).not.toContain('beginSearchNow("automatic")');
    expect(src).not.toMatch(/approach\.armed[\s\S]{0,120}beginSearchNow/);
  });

  it('keeps the handler-distance choice inside the scrollable arming overlay', () => {
    const src = source();
    const armingOverlay = src.slice(src.indexOf('{arming && ('), src.indexOf('{/* Steuerung */}'));

    expect(armingOverlay).toContain('<ScrollView');
    expect(armingOverlay).toContain('Abstand zum Hund');
    expect(armingOverlay).toContain('([5, 10] as const).map');
    expect(armingOverlay).toContain('setSearchHandlerDistanceM(d)');
    expect(armingOverlay).toContain('accessibilityLabel="Jetzt starten"');
  });

  it('starts the search only from explicit user actions', () => {
    const src = source();

    expect(src).toContain("if (decision === 'at-start') { beginSearchNow('manual-at-start'); return; }");
    expect(src).toContain("onPress: () => beginSearchNow('manual-override')");
    expect(src).toContain('onPress={handleManualStart}');
    expect(src).toContain('if (startedRef.current) return;');
  });
});
