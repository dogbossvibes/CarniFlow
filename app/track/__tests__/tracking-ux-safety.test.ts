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
    expect(legen).toContain('top-[64px] right-[14px] z-30');
    expect(run).toContain('top-[64px] right-[14px] z-30');
    expect(legen).toContain('controlsTop={124}');
    expect(run).toContain('controlsTop={124}');
    expect(overlay).toContain('pointerEvents="auto"');
    expect(overlay).toContain('onPress={() => undefined}');
    expect(overlay).toContain('onLongPress={onUnlock}');
    expect(overlay).toContain('delayLongPress={1800}');
    expect(overlay).toContain('onPress={onRequestStop}');
    expect(overlay).not.toContain('onPressIn={stopHold.onPressIn}');
    expect(overlay).not.toContain('onPressOut={stopHold.onPressOut}');
    expect(overlay).not.toContain('onLongPress={onRequestStop}');
    expect(legen).toContain('onRequestStop={requestStop}');
    expect(run).toContain('onRequestStop={handleFinish}');
  });

  it('renders the visible lock entry in the active map/sketch control layer', () => {
    expect(legen).toContain("phase === 'recording' && (");
    expect(run).toContain("!arming && s.recording && (");
    expect(legen).toContain("setPocketLock(true)");
    expect(run).toContain("setPocketLock(true)");
    expect(legen).toContain("name={pocketLock ? 'lock-closed' : 'lock-open-outline'}");
    expect(run).toContain("name={pocketLock ? 'lock-closed' : 'lock-open-outline'}");
  });

  it('keeps map-follow control separate from the single pocket-lock control', () => {
    expect(legen.match(/name=\{pocketLock \? 'lock-closed' : 'lock-open-outline'\}/g)).toHaveLength(1);
    expect(run.match(/name=\{pocketLock \? 'lock-closed' : 'lock-open-outline'\}/g)).toHaveLength(1);
    expect(overlay).not.toContain('onToggleFollow');
    const map = readFileSync('features/tracking/components/TrackingMap.tsx', 'utf8');
    expect(map).toContain("follow ? 'eye' : 'eye-off'");
    expect(map).toContain('useToast');
    expect(map).toContain('showToast');
    expect(map).toContain("t('track.mapFollow.on')");
    expect(map).toContain("t('track.mapFollow.off')");
    expect(map).toContain('accessibilityLabel');
    expect(map).toContain('accessibilityHint');
    expect(map).not.toContain("icon=\"lock-open\"");
    expect(map).not.toContain("icon=\"lock-closed\"");
  });

  it('does not pause or finalize from a normal pocket touch', () => {
    expect(legen).toContain('onPress={requestStop} disabled={phase !== \'recording\'}');
    expect(legen).toContain('onPress={() => undefined} onLongPress={togglePause} onAccessibilityTap={togglePause} delayLongPress={1800}');
    expect(run).toContain('onPress={handleFinish} disabled={finishing || arming}');
    expect(legen).not.toContain('onLongPress={requestStop}');
    expect(run).not.toContain('onLongPress={handleFinish}');
    expect(legen).not.toContain('Gedrückt halten');
    expect(run).not.toContain('Gedrückt halten');
    expect(legen).toContain('Fährtenaufnahme wirklich beenden?');
    expect(run).toContain('track.finishTitle');
  });

  it('keeps recorder behavior and guards navigation while recording', () => {
    expect(legen).toContain('usePreventRemove(phase === \'recording\'');
    expect(run).toContain('usePreventRemove(!arming && s.recording');
    expect(legen).not.toContain('allowExitAfterConfirmedStopRef');
    expect(run).not.toContain('allowExitAfterConfirmedStopRef');
    expect(legen).not.toContain('navigation.dispatch(data.action)');
    expect(run).not.toContain('navigation.dispatch(data.action)');
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
    expect(run).toContain('onPress={handleFinish}');
  });

  it('keeps the intentional stop escape path reachable while locked', () => {
    expect(overlay).toContain('stopLabel = \'Stoppen\'');
    expect(overlay).toContain('onPress={onRequestStop}');
    expect(overlay).not.toContain('onPressIn={stopHold.onPressIn}');
    expect(overlay).not.toContain('onPressOut={stopHold.onPressOut}');
    expect(overlay).not.toContain('onLongPress={onRequestStop}');
    expect(overlay).toContain('Danach muss das Beenden bestätigt werden.');
    expect(overlay).not.toContain('Gedrückt halten');
    expect(overlay).toContain('style={{ zIndex: 2, elevation: 2 }}');
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
