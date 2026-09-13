/**
 * Search-Guidance Activation Guard — Hooks: disabled → kein Voice/Haptik/Ende
 * UND kein „Verbrauchen" von Events; enabled → bestehende Logik unverändert;
 * Recovery-Seeds (4eeb361) bleiben über die enabled-Transition erhalten.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useTrackVoiceGuidance, type GuidanceAngle } from '@/features/tracking/hooks/useTrackVoiceGuidance';
import { useTrackHapticGuidance, type GuidanceObject } from '@/features/tracking/hooks/useTrackHapticGuidance';
import { useTrackEndGuidance } from '@/features/tracking/hooks/useTrackEndGuidance';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Heavy: 'heavy' } }));
jest.mock('@/features/tracking/utils/haptics', () => ({ hapticSuccess: jest.fn() }));
const speak = jest.requireMock('expo-speech').speak as jest.Mock;
const impact = jest.requireMock('expo-haptics').impactAsync as jest.Mock;
const hapticSuccess = jest.requireMock('@/features/tracking/utils/haptics').hapticSuccess as jest.Mock;

// Winkel 5 m nach dem Start (in der 10-m-Voice-/6-m-Haptik-Zone bei Hund 0 m), Dübel bei 4 m.
const ANGLES: GuidanceAngle[] = [{ id: 'angle-5-rechts', arcM: 5, angleKind: 'rechts' }];
const OBJECTS: GuidanceObject[] = [{ id: 'gegenstand-4', arcM: 4, material: 'duebel' }];
const NONE: GuidanceObject[] = [];

let renderer: ReactTestRenderer | null = null;
const rerender = (el: React.ReactElement) => { (renderer as unknown as { update: (e: React.ReactElement) => void }).update(el); };
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; speak.mockClear(); impact.mockClear(); hapticSuccess.mockClear(); jest.useRealTimers(); });

function Voice({ dog, enabled, seed, onAnnounced, objects = NONE }: { dog: number; enabled: boolean; seed?: readonly string[]; onAnnounced: (id: string) => void; objects?: GuidanceObject[] }) {
  useTrackVoiceGuidance(dog, ANGLES, true, 0.75, objects, { initialAnnouncedIds: seed, onAnnounced, enabled });
  return null;
}
function Haptic({ dog, enabled, seed, onFired }: { dog: number; enabled: boolean; seed?: readonly string[]; onFired: (id: string) => void }) {
  useTrackHapticGuidance(dog, ANGLES, OBJECTS, enabled, { initialFiredIds: seed, onFired });
  return null;
}
const END = { latitude: 0, longitude: 0 };
function End({ recording, initialFired, onFired }: { recording: boolean; initialFired: boolean; onFired: () => void }) {
  useTrackEndGuidance({ recording, dogProgressM: 100, trackLengthM: 100, estimatedDogPosition: END, endPoint: END, openMandatoryObjects: 0, voiceOn: true, initialFired, onFired });
  return null;
}

describe('Voice — Activation Guard', () => {
  it('1./2./3. Winkel 5 m vor dem Hund: disabled → kein Voice, NICHT verbraucht; enabled → normale Ansage genau einmal', () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const fired: string[] = [];
    const cb = (id: string) => fired.push(id);
    act(() => { renderer = TestRenderer.create(<Voice dog={0} enabled={false} onAnnounced={cb} />); });
    act(() => { rerender(<Voice dog={1} enabled={false} onAnnounced={cb} />); });   // Fortschritt ändert sich — trotzdem still
    expect(speak).not.toHaveBeenCalled();
    expect(fired).toEqual([]);                    // nicht in voiceFiredIds gelandet
    act(() => { rerender(<Voice dog={1} enabled onAnnounced={cb} />); });          // Search wird recording
    expect(speak).toHaveBeenCalledTimes(1);
    expect(fired).toEqual(['angle-5-rechts']);
    jest.setSystemTime(1_010_000);
    act(() => { rerender(<Voice dog={2} enabled onAnnounced={cb} />); });
    expect(speak).toHaveBeenCalledTimes(1);       // once-only unverändert
  });

  it('disabled verbraucht auch „passed" nicht: Hund läuft während disabled am Winkel vorbei → nach enable ist er hinter dem Hund → keine Ansage (bestehende Logik), aber nie als fired gemeldet', () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const fired: string[] = [];
    const cb = (id: string) => fired.push(id);
    act(() => { renderer = TestRenderer.create(<Voice dog={0} enabled={false} onAnnounced={cb} />); });
    act(() => { rerender(<Voice dog={8} enabled={false} onAnnounced={cb} />); });
    act(() => { rerender(<Voice dog={8} enabled onAnnounced={cb} />); });
    expect(speak).not.toHaveBeenCalled();
    expect(fired).toEqual([]);
  });

  it('11./12. Recovery: geseedeter Winkel bleibt über die enabled-Transition stumm; ungeseedeter Dübel wird nach enable normal angesagt', () => {
    jest.useFakeTimers({ now: 2_000_000 });
    const fired: string[] = [];
    const cb = (id: string) => fired.push(id);
    const seed = ['angle-5-rechts'];
    act(() => { renderer = TestRenderer.create(<Voice dog={0} enabled={false} seed={seed} onAnnounced={cb} objects={OBJECTS} />); });
    expect(speak).not.toHaveBeenCalled();
    act(() => { rerender(<Voice dog={0} enabled seed={seed} onAnnounced={cb} objects={OBJECTS} />); });
    expect(speak).toHaveBeenCalledTimes(1);
    expect(fired).toEqual(['gegenstand-4']);      // Winkel (Seed) nicht erneut, Dübel (nie fired) normal
  });
});

describe('Haptik — Activation Guard (eigene Menge)', () => {
  it('4./5. Dübel 4 m vor dem Hund: disabled → keine Haptik, nicht verbraucht; enabled → 1 Impuls', () => {
    jest.useFakeTimers({ now: 3_000_000 });
    const fired: string[] = [];
    const cb = (id: string) => fired.push(id);
    act(() => { renderer = TestRenderer.create(<Haptic dog={0} enabled={false} onFired={cb} />); });
    act(() => { rerender(<Haptic dog={1} enabled={false} onFired={cb} />); });
    expect(impact).not.toHaveBeenCalled();
    expect(fired).toEqual([]);
    act(() => { rerender(<Haptic dog={1} enabled onFired={cb} />); });
    expect(fired).toEqual(['gegenstand-4']);      // 3 m ≤ OBJECT_AHEAD 4 m → Objekt (1×) vor Winkel (4 m ≤ 6, aber weiter)
    expect(impact).toHaveBeenCalledTimes(1);
  });

  it('13. Recovery: Haptik bereits fired (Seed), Voice nicht → Haptik bleibt stumm, Voice kann nach enable auslösen', () => {
    jest.useFakeTimers({ now: 4_000_000 });
    const hap: string[] = []; const voice: string[] = [];
    function Both({ enabled }: { enabled: boolean }) {
      useTrackHapticGuidance(0, ANGLES, NONE, enabled, { initialFiredIds: ['angle-5-rechts'], onFired: id => hap.push(id) });
      useTrackVoiceGuidance(0, ANGLES, true, 0.75, NONE, { initialAnnouncedIds: [], onAnnounced: id => voice.push(id), enabled });
      return null;
    }
    act(() => { renderer = TestRenderer.create(<Both enabled={false} />); });
    expect(hap).toEqual([]); expect(voice).toEqual([]);
    act(() => { rerender(<Both enabled />); });
    expect(hap).toEqual([]);
    expect(impact).not.toHaveBeenCalled();
    expect(voice).toEqual(['angle-5-rechts']);
  });
});

describe('Ende — Activation Guard', () => {
  it('8. Endbedingungen erfüllt, aber nicht recording → kein Ende-Voice/-Haptik, nicht verbraucht; nach recording genau einmal', () => {
    const fired = jest.fn();
    act(() => { renderer = TestRenderer.create(<End recording={false} initialFired={false} onFired={fired} />); });
    expect(speak).not.toHaveBeenCalled();
    expect(hapticSuccess).not.toHaveBeenCalled();
    expect(fired).not.toHaveBeenCalled();
    act(() => { rerender(<End recording initialFired={false} onFired={fired} />); });
    expect(speak).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(fired).toHaveBeenCalledTimes(1);
  });
  it('14. Recovery endFired=true: nach recording keine Wiederholung', () => {
    const fired = jest.fn();
    act(() => { renderer = TestRenderer.create(<End recording={false} initialFired onFired={fired} />); });
    act(() => { rerender(<End recording initialFired onFired={fired} />); });
    expect(speak).not.toHaveBeenCalled();
    expect(fired).not.toHaveBeenCalled();
  });
});
