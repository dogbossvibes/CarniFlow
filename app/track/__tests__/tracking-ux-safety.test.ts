import { readFileSync } from 'fs';

describe('tracking UX safety contract', () => {
  const legen = readFileSync('app/track/legen.tsx', 'utf8');
  const run = readFileSync('app/track/run.tsx', 'utf8');
  const overlay = readFileSync('features/tracking/components/PocketLockOverlay.tsx', 'utf8');

  it('protects both active screens with a real touch-catching pocket lock', () => {
    expect(legen).toContain('const [pocketLock, setPocketLock]');
    expect(run).toContain('const [pocketLock, setPocketLock]');
    expect(legen).toContain('<PocketLockOverlay');
    expect(run).toContain('<PocketLockOverlay');
    expect(overlay).toContain('pointerEvents="auto"');
    expect(overlay).toContain('onPress={() => undefined}');
    expect(overlay).toContain('onLongPress={onUnlock}');
    expect(overlay).toContain('delayLongPress={1800}');
  });

  it('does not pause or finalize from a normal pocket touch', () => {
    expect(legen).toContain('onPress={() => undefined} onLongPress={requestStop} onAccessibilityTap={requestStop} delayLongPress={1800}');
    expect(legen).toContain('onPress={() => undefined} onLongPress={togglePause} onAccessibilityTap={togglePause} delayLongPress={1800}');
    expect(run).toContain('onPress={() => undefined} onLongPress={handleFinish} onAccessibilityTap={handleFinish} delayLongPress={1800}');
    expect(legen).toContain('Fährtenaufnahme wirklich beenden?');
    expect(run).toContain('track.finishTitle');
  });

  it('keeps recorder behavior and guards navigation while recording', () => {
    expect(legen).toContain('usePreventRemove(phase === \'recording\'');
    expect(run).toContain('usePreventRemove(!arming && s.recording');
    expect(legen).toContain('rec.pause()');
    expect(legen).toContain('rec.resume()');
    expect(run).toContain('s.stop()');
    expect(run).toContain('setSessionStatus(\'completed\')');
    expect(legen).toContain('onUnlock={unlockPocket}');
    expect(run).toContain('onUnlock={unlockPocket}');
  });

  it('does not turn automatic end detection into finalization', () => {
    expect(run).toContain('Fährtenende erreicht');
    expect(run).toContain('KEIN Auto-Beenden');
    expect(run).toContain('onLongPress={handleFinish}');
  });
});
