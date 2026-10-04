// Lifecycle/Performance: Overlay-Geometrie wird nur bei relevanter Registry-Änderung
// geladen — NICHT pro GPS-Fix und NICHT bei den 4-s-Kennzahl-Updates der Aufnahme.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { useActiveTrackOverlays, type UseActiveTrackOverlaysArgs } from '@/features/tracking/hooks/useActiveTrackOverlays';
import type { TrackReferenceCandidate, TrackReferenceOverlay } from '@/features/tracking/store/trackReferenceOverlays';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockLoad = jest.fn();
jest.mock('@/features/tracking/services/trackReferenceOverlayService', () => ({
  loadActiveTrackOverlays: (...a: unknown[]) => mockLoad(...a),
}));

const DOGS = [{ id: 'amoun', name: 'Amoun', owner_id: 'user-1' }, { id: 'baily', name: 'Baily', owner_id: 'user-1' }, { id: 'doran', name: 'Doran', owner_id: 'user-1' }];
const toOverlay = (c: TrackReferenceCandidate): TrackReferenceOverlay =>
  ({ dogId: c.dogId, sessionId: c.sessionId, dogName: c.dogName, status: c.status, points: [{ lat: 47, lng: 8 }, { lat: 47.001, lng: 8 }] });

let latest: TrackReferenceOverlay[] = [];
function Probe(props: UseActiveTrackOverlaysArgs) {
  // Simuliert legen.tsx: Komponente re-rendert bei jedem Tracking-Store-Update (GPS-Fix).
  useTrackingStore();
  latest = useActiveTrackOverlays(props);
  return null;
}
type Rendered = any;
let renderer: Rendered = null;
const args: UseActiveTrackOverlaysArgs = { userId: 'user-1', currentUserDogs: DOGS, currentDogId: 'baily', currentSessionId: null };
const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  mockLoad.mockReset();
  mockLoad.mockImplementation(async (cands: TrackReferenceCandidate[]) => cands.map(toOverlay));
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
  useTrackingStore.setState({ currentPosition: null });
  latest = [];
});
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; });

describe('useActiveTrackOverlays', () => {
  it('keine aktiven Fährten → [] ohne Ladevorgang', async () => {
    await act(async () => { renderer = TestRenderer.create(<Probe {...args} />); });
    await flush();
    expect(latest).toEqual([]);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('lädt einmal; GPS-Fixes und Kennzahl-Updates lösen KEIN Neuladen aus', async () => {
    useActiveFaehrten.getState().upsert('amoun', { status: 'resting', sessionId: 'sess-amoun', startedAt: 1 });
    useActiveFaehrten.getState().upsert('baily', { status: 'laying', sessionId: 'sess-baily', startedAt: 2 });
    await act(async () => { renderer = TestRenderer.create(<Probe {...args} />); });
    await flush();
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(latest.map(o => o.dogName)).toEqual(['Amoun']);

    for (let i = 0; i < 25; i++) {
      await act(async () => {
        useTrackingStore.setState({ currentPosition: { lat: 47 + i * 1e-5, lng: 8 } as never, distanceMeters: i });
        useActiveFaehrten.getState().upsert('baily', { distanceMeters: i, gpsAccuracy: 3 });   // 4-s-Spiegelung
      });
    }
    // Neues, inhaltsgleiches Hunde-Array (z. B. Re-Render) → ebenfalls kein Neuladen.
    await act(async () => { renderer.update(<Probe {...args} currentUserDogs={[...DOGS]} />); });
    await flush();
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('lädt neu bei relevanter Registry-Änderung (weitere Fährte gelegt / Status)', async () => {
    useActiveFaehrten.getState().upsert('amoun', { status: 'resting', sessionId: 'sess-amoun', startedAt: 1 });
    await act(async () => { renderer = TestRenderer.create(<Probe {...args} />); });
    await flush();
    await act(async () => { useActiveFaehrten.getState().upsert('doran', { status: 'resting', sessionId: 'sess-doran', startedAt: 3 }); });
    await flush();
    expect(mockLoad).toHaveBeenCalledTimes(2);
    expect(latest.map(o => o.dogName)).toEqual(['Amoun', 'Doran']);
    await act(async () => { useActiveFaehrten.getState().remove('amoun'); });
    await flush();
    expect(latest.map(o => o.dogName)).toEqual(['Doran']);
  });

  it('Hundewechsel lädt neu und schliesst den neuen aktuellen Hund aus', async () => {
    useActiveFaehrten.getState().upsert('amoun', { status: 'resting', sessionId: 'sess-amoun', startedAt: 1 });
    useActiveFaehrten.getState().upsert('doran', { status: 'resting', sessionId: 'sess-doran', startedAt: 2 });
    await act(async () => { renderer = TestRenderer.create(<Probe {...args} />); });
    await flush();
    await act(async () => { renderer.update(<Probe {...args} currentDogId="doran" />); });
    await flush();
    expect(latest.map(o => o.dogName)).toEqual(['Amoun']);
  });

  it('Ladefehler → [] ohne Crash; Hook schreibt nie in die Registry', async () => {
    mockLoad.mockRejectedValue(new Error('boom'));
    useActiveFaehrten.getState().upsert('amoun', { status: 'resting', sessionId: 'sess-amoun', startedAt: 1 });
    const before = useActiveFaehrten.getState().byDog;
    await act(async () => { renderer = TestRenderer.create(<Probe {...args} />); });
    await flush();
    expect(latest).toEqual([]);
    expect(useActiveFaehrten.getState().byDog).toBe(before);
  });

  it('Race: älterer, später fertiger Ladevorgang überschreibt nicht das neuere Ergebnis', async () => {
    const resolvers: ((v: TrackReferenceOverlay[]) => void)[] = [];
    mockLoad.mockImplementation((cands: TrackReferenceCandidate[]) => new Promise(res => {
      resolvers.push(() => res(cands.map(toOverlay)));
    }));
    useActiveFaehrten.getState().upsert('amoun', { status: 'resting', sessionId: 'sess-amoun', startedAt: 1 });
    await act(async () => { renderer = TestRenderer.create(<Probe {...args} />); });   // Load A: [Amoun]
    await act(async () => { useActiveFaehrten.getState().upsert('doran', { status: 'resting', sessionId: 'sess-doran', startedAt: 3 }); });   // Load B: [Amoun, Doran]
    expect(resolvers).toHaveLength(2);
    await act(async () => { resolvers[1]([]); });   // B fertig
    expect(latest.map(o => o.dogName)).toEqual(['Amoun', 'Doran']);
    await act(async () => { resolvers[0]([]); });   // A fertig — danach, veraltet
    expect(latest.map(o => o.dogName)).toEqual(['Amoun', 'Doran']);
  });

  it('Hundewechsel: aktueller Hund erscheint auch vor Abschluss des Neuladens nie als Overlay', async () => {
    useActiveFaehrten.getState().upsert('amoun', { status: 'resting', sessionId: 'sess-amoun', startedAt: 1 });
    useActiveFaehrten.getState().upsert('doran', { status: 'resting', sessionId: 'sess-doran', startedAt: 2 });
    await act(async () => { renderer = TestRenderer.create(<Probe {...args} />); });
    await flush();
    expect(latest.map(o => o.dogName)).toEqual(['Amoun', 'Doran']);
    mockLoad.mockImplementation(() => new Promise(() => {}));   // Neuladen hängt
    await act(async () => { renderer.update(<Probe {...args} currentDogId="doran" />); });
    expect(latest.map(o => o.dogName)).toEqual(['Amoun']);
  });

  it('nur eigene Hunde: geteilter Hund (fremde owner_id) wird nicht geladen; ohne Nutzer nichts', async () => {
    const dogs = [...DOGS, { id: 'shared', name: 'Trainerhund', owner_id: 'trainer-9' }];
    useActiveFaehrten.getState().upsert('shared', { status: 'resting', sessionId: 'sess-shared', startedAt: 1 });
    useActiveFaehrten.getState().upsert('amoun', { status: 'resting', sessionId: 'sess-amoun', startedAt: 2 });
    await act(async () => { renderer = TestRenderer.create(<Probe {...args} currentUserDogs={dogs} />); });
    await flush();
    expect(mockLoad.mock.calls[0][0].map((c: TrackReferenceCandidate) => c.dogId)).toEqual(['amoun']);
    await act(async () => { renderer.update(<Probe {...args} currentUserDogs={dogs} userId={null} />); });
    await flush();
    expect(latest).toEqual([]);
  });
});
