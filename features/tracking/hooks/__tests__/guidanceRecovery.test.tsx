/**
 * Search-Recovery-State — Guidance-Hooks (Voice / Haptik / Ende):
 * Seeds aus dem Run-State verhindern doppelte Ansagen, neue Auslösungen werden
 * nach aussen gespiegelt. Schwellen/Texte/Locale unverändert.
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

// Stabile Listen (wie snapData in run.tsx): Winkel bei 10 m und 45 m, Dübel bei 30 m.
const ANGLES: GuidanceAngle[] = [
  { id: 'angle-10-rechts', arcM: 10, angleKind: 'rechts' },
  { id: 'angle-45-links', arcM: 45, angleKind: 'links' },
];
const OBJECTS: GuidanceObject[] = [{ id: 'gegenstand-30', arcM: 30, material: 'duebel' }];

let renderer: ReactTestRenderer | null = null;
// Typdefinition des Projekts kennt update() nicht (gleicher Workaround wie HoldToStopButton.test.tsx).
const rerender = (el: React.ReactElement) => { (renderer as unknown as { update: (e: React.ReactElement) => void }).update(el); };
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; speak.mockClear(); impact.mockClear(); jest.useRealTimers(); });

function VoiceHarness({ dog, seed, onAnnounced }: { dog: number; seed?: readonly string[]; onAnnounced: (id: string) => void }) {
  useTrackVoiceGuidance(dog, ANGLES, true, 0.75, OBJECTS, { initialAnnouncedIds: seed, onAnnounced });
  return null;
}
function HapticHarness({ dog, seed, onFired }: { dog: number; seed?: readonly string[]; onFired: (id: string) => void }) {
  useTrackHapticGuidance(dog, ANGLES, OBJECTS, true, { initialFiredIds: seed, onFired });
  return null;
}
const END = { latitude: 0, longitude: 0 };
function EndHarness({ recording, dog, initialFired, onFired, geomAtEnd, fix = 0 }: { recording: boolean; dog: number; initialFired: boolean; onFired: () => void; geomAtEnd: boolean; fix?: number }) {
  useTrackEndGuidance({
    recording, dogProgressM: dog, trackLengthM: 100,
    estimatedDogPosition: geomAtEnd ? END : { latitude: 0.001, longitude: 0 },
    endPoint: END, openMandatoryObjects: 0, voiceOn: true, initialFired, onFired,
    handlerProgressM: dog, lastSegmentReached: dog >= 90,
    endHandlerFix: dog >= 90 ? { position: fix === 0 ? { latitude: 0.000045, longitude: 0 } : END,
      accuracyM: 4, tMs: 1000 + fix * 900 } : null,
  });
  return null;
}

describe('useTrackVoiceGuidance — Recovery', () => {
  it('5./6. Seed „angle-10 bereits angesagt": Resume bei 35 m → Winkel 10 m NICHT erneut, Winkel 45 m später normal', () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const fired: string[] = [];
    const seed = ['angle-10-rechts'];
    act(() => { renderer = TestRenderer.create(<VoiceHarness dog={31} seed={seed} onAnnounced={id => fired.push(id)} />); });
    expect(speak).not.toHaveBeenCalled();          // 10 m und Dübel 30 m liegen hinter dem Hund, 45 m noch 14 m voraus (> 10)
    jest.setSystemTime(1_010_000);
    act(() => { rerender(<VoiceHarness dog={33} seed={seed} onAnnounced={id => fired.push(id)} />); });   // 12 m → noch nicht
    expect(speak).not.toHaveBeenCalled();
    act(() => { rerender(<VoiceHarness dog={38} seed={seed} onAnnounced={id => fired.push(id)} />); });   // 45−38 = 7 m ≤ 10 → Ansage
    expect(speak).toHaveBeenCalledTimes(1);
    act(() => { rerender(<VoiceHarness dog={40} seed={seed} onAnnounced={id => fired.push(id)} />); });
    expect(speak).toHaveBeenCalledTimes(1);   // once-only
    expect(fired).toEqual(['angle-45-links']);
  });

  it('Gegenbeweis ohne Seed (Legacy): Resume bei 5 m sagt Winkel 10 m (erneut) an — die Degradation, die der Seed verhindert', () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const fired: string[] = [];
    act(() => { renderer = TestRenderer.create(<VoiceHarness dog={5} onAnnounced={id => fired.push(id)} />); });
    expect(fired).toEqual(['angle-10-rechts']);
    // Mit Seed → still.
    speak.mockClear();
    act(() => { renderer!.unmount(); });
    const fired2: string[] = [];
    act(() => { renderer = TestRenderer.create(<VoiceHarness dog={5} seed={['angle-10-rechts']} onAnnounced={id => fired2.push(id)} />); });
    expect(fired2).toEqual([]);
    expect(speak).not.toHaveBeenCalled();
  });
});

describe('useTrackHapticGuidance — Recovery (eigene Menge, eigene Distanzen)', () => {
  it('7. Haptik für Winkel 10 bereits fired, Voice nicht: Haptik still, Voice sagt an', () => {
    jest.useFakeTimers({ now: 2_000_000 });
    const hap: string[] = []; const voice: string[] = [];
    function Both({ dog }: { dog: number }) {
      useTrackHapticGuidance(dog, ANGLES, OBJECTS, true, { initialFiredIds: ['angle-10-rechts'], onFired: id => hap.push(id) });
      useTrackVoiceGuidance(dog, ANGLES, true, 0.75, OBJECTS, { initialAnnouncedIds: [], onAnnounced: id => voice.push(id) });
      return null;
    }
    act(() => { renderer = TestRenderer.create(<Both dog={5} />); });   // Winkel 10: Voice-Distanz 5 ≤ 10 ✓, Haptik 5 ≤ 6 ✓ (aber geseedet)
    expect(voice).toEqual(['angle-10-rechts']);
    expect(hap).toEqual([]);
    expect(impact).not.toHaveBeenCalled();
  });

  it('neue Auslösung wird gespiegelt (Seed leer): Dübel 30 m bei Hund 27 m → 1 Impuls + onFired', () => {
    jest.useFakeTimers({ now: 3_000_000 });
    const hap: string[] = [];
    act(() => { renderer = TestRenderer.create(<HapticHarness dog={27} seed={[]} onFired={id => hap.push(id)} />); });
    expect(hap).toEqual(['gegenstand-30']);
  });
});

describe('useTrackEndGuidance — Recovery', () => {
  it('10. Ende bereits angesagt (initialFired): Resume am Ende → keine zweite Ansage, Status completed', () => {
    const fired = jest.fn();
    act(() => { renderer = TestRenderer.create(<EndHarness recording dog={100} initialFired onFired={fired} geomAtEnd />); });
    expect(speak).not.toHaveBeenCalled();
    expect(fired).not.toHaveBeenCalled();
  });
  it('11. Ende noch nicht erreicht (initialFired=false): Erkennung arbeitet normal → genau eine Ansage + onFired', () => {
    const fired = jest.fn();
    act(() => { renderer = TestRenderer.create(<EndHarness recording dog={50} initialFired={false} onFired={fired} geomAtEnd={false} />); });
    expect(speak).not.toHaveBeenCalled();
    act(() => { rerender(<EndHarness recording dog={92} initialFired={false} onFired={fired} geomAtEnd={false} fix={0} />); });
    act(() => { rerender(<EndHarness recording dog={99} initialFired={false} onFired={fired} geomAtEnd fix={1} />); });
    expect(fired).not.toHaveBeenCalled();
    act(() => { rerender(<EndHarness recording dog={99} initialFired={false} onFired={fired} geomAtEnd fix={2} />); });
    expect(speak).toHaveBeenCalledTimes(1);
    expect(fired).toHaveBeenCalledTimes(1);
    act(() => { rerender(<EndHarness recording dog={100} initialFired={false} onFired={fired} geomAtEnd fix={3} />); });
    expect(speak).toHaveBeenCalledTimes(1);   // once-only unverändert
  });
});
