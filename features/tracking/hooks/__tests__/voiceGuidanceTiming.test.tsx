/**
 * T-203 — Zeitpunkt der Sprachansage auf einer Geraden. Vorher unterdrückte die feste
 * Luftlinien-Grenze (max. 8 m) die Ansage, bis der Hund 0–2,5 m vor dem Punkt war; bei 10 m
 * Hundeabstand kam sie gar nicht. Belegt in den Feldaufnahmen vom 08.10.2026 (Ansage 0,6–2,3 m vorher).
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { maxVoiceDistanceM, SPEECH_TRAVEL_M, useTrackVoiceGuidance, type GuidanceAngle } from '@/features/tracking/hooks/useTrackVoiceGuidance';
import { resetVoiceEvents } from '@/features/tracking/utils/voiceEvents';
import { metersToSteps } from '@/features/tracking/utils/steps';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
const speak = jest.requireMock('expo-speech').speak as jest.Mock;

const M_PER_DEG = 111_320;
// Gerade Fährte nach Osten auf dem Äquator: Bogenlänge = Ostversatz.
const lngAt = (m: number) => m / M_PER_DEG;
const ANGLE: GuidanceAngle[] = [{ id: 'winkel-60', arcM: 60, angleKind: 'rechts', lat: 0, lng: lngAt(60) }];

let renderer: ReactTestRenderer | null = null;
const rerender = (el: React.ReactElement) => { (renderer as unknown as { update: (e: React.ReactElement) => void }).update(el); };
beforeEach(() => { resetVoiceEvents(); speak.mockClear(); });
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; jest.useRealTimers(); });

function Walk({ handlerM, leadM, waiting = false }: { handlerM: number; leadM: number; waiting?: boolean }) {
  useTrackVoiceGuidance(handlerM + leadM, ANGLE, true, 0.75, [], undefined,
    { handlerPosition: { latitude: 0, longitude: lngAt(handlerM) }, configuredDogLeadM: leadM, activeObjectWait: waiting });
  return null;
}

/** Geht die Gerade in 0,5-m-Schritten ab und liefert, wie weit der Hund bei der Ansage vor dem Winkel war. */
function announcedAheadM(leadM: number): number | null {
  jest.useFakeTimers({ now: 9_000_000 });
  act(() => { renderer = TestRenderer.create(<Walk handlerM={20} leadM={leadM} />); });
  for (let handlerM = 20; handlerM <= 62; handlerM += 0.5) {
    act(() => { rerender(<Walk handlerM={handlerM} leadM={leadM} />); });
    if (speak.mock.calls.length) return 60 - (handlerM + leadM);
  }
  return null;
}

describe('Sprachansage — rechtzeitig auf der Geraden (T-203)', () => {
  it.each([1, 5, 10])('Hundeabstand %i m: Ansage rund 10 m vor dem Winkel, genau einmal', leadM => {
    const aheadM = announcedAheadM(leadM);
    expect(aheadM).not.toBeNull();
    expect(aheadM as number).toBeGreaterThanOrEqual(9);
    expect(aheadM as number).toBeLessThanOrEqual(10);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('die gesprochene Schrittzahl zieht den Weg während des Sprechens ab', () => {
    announcedAheadM(5);
    const text = speak.mock.calls[0][0] as string;
    expect(text).toContain(String(metersToSteps(10 - SPEECH_TRAVEL_M, 0.75)));
  });

  it('Plausibilitätsgrenze bleibt: passt die Luftlinie nicht zum Fortschritt, wird nicht angesagt', () => {
    expect(maxVoiceDistanceM(5, 10)).toBe(17.5);
    jest.useFakeTimers({ now: 9_000_000 });
    function Wrong() {
      // Fortschritt behauptet «Hund 8 m vor dem Winkel», das Handy ist aber 40 m entfernt.
      useTrackVoiceGuidance(52, ANGLE, true, 0.75, [], undefined,
        { handlerPosition: { latitude: 0, longitude: lngAt(20) }, configuredDogLeadM: 5, activeObjectWait: false });
      return null;
    }
    act(() => { renderer = TestRenderer.create(<Wrong />); });
    expect(speak).not.toHaveBeenCalled();
  });

  it('während der Hund am Gegenstand liegt, wird nichts dahinter angesagt', () => {
    jest.useFakeTimers({ now: 9_000_000 });
    act(() => { renderer = TestRenderer.create(<Walk handlerM={47} leadM={5} waiting />); });
    act(() => { rerender(<Walk handlerM={48} leadM={5} waiting />); });
    expect(speak).not.toHaveBeenCalled();
    act(() => { rerender(<Walk handlerM={48} leadM={5} />); });
    expect(speak).toHaveBeenCalledTimes(1);
  });
});
