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
    expect(overlay).toContain('useHoldAction(complete, POCKET_UNLOCK_HOLD_MS)');
    expect(overlay).toContain('onPressIn={onPressIn}');
    expect(overlay).toContain('onPressOut={onPressOut}');
    expect(overlay).not.toContain('onLongPress={');
    expect(overlay).not.toContain('delayLongPress={');
    expect(overlay).not.toContain('onRequestStop');
    expect(overlay).not.toContain('stopLabel');
    expect(legen).not.toContain('onRequestStop={requestStop}');
    expect(run).not.toContain('onRequestStop={handleFinish}');
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
    expect(legen).toContain('onPress={finishTrack} disabled={phase !== \'recording\'}');
    expect(legen).toContain('onPress={() => undefined} onLongPress={togglePause} onAccessibilityTap={togglePause} delayLongPress={1800}');
    expect(run).toContain('onPress={handleFinish} disabled={finishing || arming}');
    expect(legen).not.toContain('requestStop');
    expect(run).not.toContain('track.finishTitle');
    expect(run).not.toContain('Gedrückt halten');
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

  it('keeps the lock as a separate unlock-only overlay', () => {
    expect(overlay).not.toContain('onRequestStop');
    expect(overlay).not.toContain('stopLabel');
    expect(overlay).toContain('style={{ zIndex: 1 }}');
    // Exactly one interactive Pressable-family element in the overlay — no second,
    // competing stop-escape surface.
    expect(overlay.match(/<(Pressable|AnimatedPressable)\b/g)).toHaveLength(1);
    expect(legen).not.toContain('onRequestStop={requestStop}');
    expect(run).not.toContain('onRequestStop={handleFinish}');
  });

  it('keeps finalization independent of GPS and trajectory state', () => {
    expect(legen).toContain('const finishTrack = () =>');
    expect(legen).toContain('rec.finish();');
    expect(run).toContain('const handleFinish = async () =>');
    expect(run).toContain('const res = s.stop();');
    expect(legen).not.toContain('if (gpsAccuracy');
    expect(run).not.toContain('if (s.accuracy');
    expect(run).not.toContain('if (trajectory');
  });

  it('uses direct stop finalization with once-only guards', () => {
    expect(legen).toContain('if (stoppingRef.current) return;');
    expect(legen).not.toContain('Fährte beenden');
    expect(run).toContain('if (finishing || finishRequestedRef.current) return;');
    expect(run).toContain('finishRequestedRef.current = true;');
    expect(run).not.toContain('track.keepSearching');
    expect(run).not.toContain('track.finishTitle');
    expect(legen).toContain('setPendingExit');
    expect(run).toContain('setPendingExit');
  });
});
