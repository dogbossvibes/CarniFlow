/** Synthetic hook/queue regressions; timers do not supply GPS evidence. */
import React from 'react';
import { Platform } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import * as Speech from 'expo-speech';
import { useTrackEndGuidance } from '../useTrackEndGuidance';
import { hapticSuccess } from '../../utils/haptics';
import { resetVoiceEvents, voiceDiagnostics } from '../../utils/voiceEvents';
import { FINAL_OBJECT_END_GRACE_MS } from '../../utils/finalObjectEndGrace';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('@/i18n/config', () => ({ __esModule: true, default: { t: () => 'end', language: 'de-CH' } }));
jest.mock('../useTrackVoiceGuidance', () => ({ speechLanguage: () => 'de-DE' }));
jest.mock('../../utils/haptics', () => ({ hapticSuccess: jest.fn() }));

type Input = Parameters<typeof useTrackEndGuidance>[0] & {
  paused?: boolean; sessionId?: string | null; runId?: string | null;
};
const END = { latitude: 0, longitude: 0 };
const fired = jest.fn();
const graceChanged = jest.fn();
const BASE: Input = {
  recording: true, dogProgressM: 100, handlerProgressM: 96, lastSegmentReached: true,
  trackLengthM: 100, estimatedDogPosition: END, endPoint: END, openMandatoryObjects: 1,
  voiceOn: true, finalObjectPendingNearEnd: true, activeObjectWait: false,
  onFired: fired, onFinalObjectGraceChange: graceChanged,
  sessionId: 'dog-a-session', runId: 'run-a',
};
let renderer: ReactTestRenderer | null = null;
let current: Input;
function Harness({ input }: { input: Input }) { useTrackEndGuidance(input); return null; }
function update(patch: Partial<Input>) {
  current = { ...current, ...patch };
  act(() => { (renderer as unknown as { update: (element: React.ReactElement) => void }).update(<Harness input={current} />); });
}
function fix(tMs: number, distanceM: number) {
  jest.setSystemTime(tMs);
  update({ endHandlerFix: { position: { latitude: distanceM / 111320, longitude: 0 }, accuracyM: 4, tMs } });
}
function arrive(patch: Partial<Input> = {}) {
  current = { ...BASE, ...patch };
  act(() => { renderer = TestRenderer.create(<Harness input={current} />); });
  fix(1000, 5); fix(2000, 0.5); fix(3000, 0.5);
}

describe.each(['ios', 'android'] as const)('End hook lifecycle (%s platform mock)', platform => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 1000 });
    jest.replaceProperty(Platform, 'OS', platform);
    resetVoiceEvents(); jest.clearAllMocks();
  });
  afterEach(() => {
    act(() => { renderer?.unmount(); }); renderer = null;
    jest.restoreAllMocks(); jest.useRealTimers();
  });

  it('expires the existing bounded grace with unchanged props and no new fix', () => {
    arrive(); expect(fired).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(FINAL_OBJECT_END_GRACE_MS - 1); });
    expect(fired).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(fired).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(graceChanged).toHaveBeenLastCalledWith(expect.objectContaining({ endedAtMs: 4200, reason: 'grace_elapsed' }));
    act(() => { jest.advanceTimersByTime(5000); });
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('elapsed time cannot create a second accepted fix', () => {
    arrive({ endHandlerFix: null });
    // Start a fresh mounted run with only one inside fix.
    act(() => { renderer!.unmount(); });
    current = { ...BASE };
    act(() => { renderer = TestRenderer.create(<Harness input={current} />); });
    fix(1000, 5); fix(2000, 0.5);
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(fired).not.toHaveBeenCalled();
  });

  it('active final-object dwell remains a blocker beyond grace; found or removed releases it', () => {
    arrive({ activeObjectWait: true });
    act(() => { jest.advanceTimersByTime(6000); });
    expect(fired).not.toHaveBeenCalled();
    update({ finalObjectPendingNearEnd: false, activeObjectWait: false });
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('rechecks current endpoint eligibility when grace expires', () => {
    arrive(); fix(3500, 6);
    act(() => { jest.advanceTimersByTime(5000); });
    expect(fired).not.toHaveBeenCalled();
  });

  it('stop and unmount leave no late end callback', () => {
    arrive(); update({ recording: false });
    act(() => { jest.advanceTimersByTime(5000); });
    expect(fired).not.toHaveBeenCalled();
    update({ recording: true }); fix(9000, 5); fix(10_000, 0.5); fix(11_000, 0.5);
    act(() => { renderer!.unmount(); }); renderer = null;
    act(() => { jest.advanceTimersByTime(5000); });
    expect(fired).not.toHaveBeenCalled();
  });

  it('a queued end voice is invalidated on unmount', () => {
    arrive({ finalObjectPendingNearEnd: false });
    expect(fired).toHaveBeenCalledTimes(1);
    const callbacks = (Speech.speak as jest.Mock).mock.calls[0][1];
    act(() => { renderer!.unmount(); }); renderer = null;
    callbacks.onStart();
    expect(voiceDiagnostics().events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'end', suppressedReason: 'state_changed' }),
    ]));
  });

  it('a new run and dog cannot inherit history, once state or a queued voice', () => {
    arrive({ finalObjectPendingNearEnd: false });
    const oldCallbacks = (Speech.speak as jest.Mock).mock.calls[0][1];
    update({ sessionId: 'dog-b-session', runId: 'run-b', endHandlerFix: null });
    fix(4000, 0.5); fix(5000, 0.5); // No approach history for this run.
    oldCallbacks.onStart();
    expect(voiceDiagnostics().events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'end', suppressedReason: 'state_changed' }),
    ]));
    expect(fired).toHaveBeenCalledTimes(1);
    fix(6000, 5); fix(7000, 0.5); fix(8000, 0.5);
    expect(fired).toHaveBeenCalledTimes(2);
    expect(Speech.speak).toHaveBeenCalledTimes(2);
    expect(hapticSuccess).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['pause', { paused: true }],
    ['active dwell', { activeObjectWait: true }],
    ['movement away', { endHandlerFix: { position: { latitude: 6 / 111320, longitude: 0 }, accuracyM: 4, tMs: 3500 } }],
  ] as const)('queued voice revalidates %s', (_reason, patch) => {
    arrive({ finalObjectPendingNearEnd: false });
    update(patch);
    (Speech.speak as jest.Mock).mock.calls[0][1].onStart();
    expect(voiceDiagnostics().events).toEqual(expect.arrayContaining([
      expect.objectContaining({ suppressedReason: 'state_changed' }),
    ]));
    update({ paused: false, activeObjectWait: true });
    expect(fired).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it('pause expires unconfirmed evidence; new evidence confirms once only', () => {
    arrive(); update({ paused: true });
    act(() => { jest.advanceTimersByTime(FINAL_OBJECT_END_GRACE_MS); });
    expect(fired).not.toHaveBeenCalled();
    update({ paused: false }); fix(5000, 0.5);
    expect(fired).not.toHaveBeenCalled();
    fix(6000, 5); fix(7000, 0.5); fix(8000, 0.5);
    act(() => { jest.advanceTimersByTime(FINAL_OBJECT_END_GRACE_MS); });
    expect(fired).toHaveBeenCalledTimes(1);
    update({ paused: true }); update({ paused: false }); fix(10_000, 0.5);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('a delayed timer after an unknown delivery gap cannot announce from a now-stale fix', () => {
    arrive(); jest.setSystemTime(30_000);
    act(() => { jest.runOnlyPendingTimers(); });
    expect(fired).not.toHaveBeenCalled();
    update({ handlerPosition: END }); // The screen/recorder can also re-render during the gap.
    expect(fired).not.toHaveBeenCalled();
  });
});
