import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useTrackVoiceGuidance, type GuidanceAngle } from '../useTrackVoiceGuidance';
import { useTrackHapticGuidance, type GuidanceObject } from '../useTrackHapticGuidance';
import { requestVoice } from '@/features/tracking/utils/voiceEvents';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Heavy: 'heavy' } }));
jest.mock('@/features/tracking/utils/voiceEvents', () => ({ requestVoice: jest.fn(), cancelVoiceEvents: jest.fn(), noteSuppressedVoice: jest.fn() }));
const impact = jest.requireMock('expo-haptics').impactAsync as jest.Mock;
let renderer: ReactTestRenderer | null = null;
beforeEach(() => { jest.useFakeTimers({ now: 1_000_000 }); jest.clearAllMocks(); });
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; jest.useRealTimers(); });

const cases = (['voice', 'haptic'] as const).flatMap(mode =>
  ['duebel', 'ball'].flatMap(material => ['regular', 'angle', 'none'].map(target => ({ mode, material, target }))));

it.each(cases)('$mode: nearby $material does not displace $target or consume feedback', ({ mode, material, target }) => {
  // Joker is closer than both genuine targets and inside both guidance windows.
  const objects: GuidanceObject[] = [{ id: 'joker', arcM: 1, material }];
  const angles: GuidanceAngle[] = [];
  if (target === 'regular') objects.push({ id: 'regular', arcM: 3, material: 'gummi' });
  if (target === 'angle') angles.push({ id: 'angle', arcM: 3, angleKind: 'links' });
  const before = JSON.stringify({ objects, angles });
  const fired = jest.fn();
  function Harness({ enabled }: { enabled: boolean }) {
    useTrackVoiceGuidance(0, angles, mode === 'voice', 0.75, objects, { enabled, onAnnounced: fired });
    useTrackHapticGuidance(0, angles, objects, enabled && mode === 'haptic', { onFired: fired });
    return null;
  }
  act(() => { renderer = TestRenderer.create(<Harness enabled={false} />); });
  expect(fired).not.toHaveBeenCalled();
  act(() => { (renderer as unknown as { update: (element: React.ReactElement) => void }).update(<Harness enabled />); });
  if (target === 'none') {
    expect(fired).not.toHaveBeenCalled();
    expect(requestVoice).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
  } else {
    expect(fired.mock.calls).toEqual([[target]]);
    if (mode === 'voice') expect(requestVoice).toHaveBeenCalledWith(expect.objectContaining({ onceKey: `feature:${target}` }));
    else expect(impact).toHaveBeenCalledTimes(1); // First pulse; angle retains its existing second pulse.
  }
  expect(JSON.stringify({ objects, angles })).toBe(before);
});
