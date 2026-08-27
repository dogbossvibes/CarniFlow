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
    expect(overlay).toContain('onLongPress={onRequestStop}');
    expect(overlay).toContain('onPress={() => undefined}');
    expect(legen).toContain('onRequestStop={requestStop}');
    expect(run).toContain('onRequestStop={handleFinish}');
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

  it('keeps the intentional stop escape path reachable while locked', () => {
    expect(overlay).toContain('stopLabel = \'Stoppen\'');
    expect(overlay).toContain('Gedrückt halten');
    expect(overlay).toContain('Danach muss das Beenden bestätigt werden.');
    expect(legen).toContain('onRequestStop={requestStop}');
    expect(run).toContain('onRequestStop={handleFinish}');
    expect(run).toContain('stopLabel="Absuche beenden"');
  });

  it('keeps finalization independent of GPS and trajectory state', () => {
    expect(legen).toContain('const finishTrack = () =>');
    expect(legen).toContain('rec.finish();');
    expect(run).toContain('const handleFinish = () =>');
    expect(run).toContain('const res = s.stop();');
    expect(legen).not.toContain('if (gpsAccuracy');
    expect(run).not.toContain('if (s.accuracy');
    expect(run).not.toContain('if (trajectory');
  });

  it('retains the existing confirmation and once-only guards', () => {
    expect(legen).toContain('if (stoppingRef.current) return;');
    expect(legen).toContain('Fährte beenden');
    expect(run).toContain('if (finishing || finishRequestedRef.current) return;');
    expect(run).toContain('if (finishRequestedRef.current) return;');
    expect(run).toContain('finishRequestedRef.current = true;');
    expect(run).toContain('track.keepSearching');
    expect(run).toContain('track.finishTitle');
  });
});
