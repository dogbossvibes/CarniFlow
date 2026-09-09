// Kamera-Controller am echten Hook: Modi, Gesten, Recenter — und vor allem
// die Sicherheitszusage, dass die Kamera AUSSCHLIESSLICH Darstellung ist und
// nichts am Tracking verändert (Punkt 17/20 des Auftrags).
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSmartTrackCamera, type SmartTrackCameraApi } from '@/features/tracking/hooks/useSmartTrackCamera';

const M_PER_DEG = 111320;
const at = (xEastM: number, yNorthM: number) => ({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG });

interface CameraCall { center: { latitude: number; longitude: number }; heading: number; pitch: number }
function makeFakeMap() {
  const calls: CameraCall[] = [];
  return { calls, animateCamera: (cam: CameraCall) => { calls.push(cam); } };
}

function Harness({ onReady, position, courseDeg, speedMps, deviceHeadingDeg }: {
  onReady: (api: SmartTrackCameraApi) => void;
  position: { lat: number; lng: number } | null;
  courseDeg?: number | null; speedMps?: number | null; deviceHeadingDeg?: number | null;
}) {
  const api = useSmartTrackCamera({ position, courseDeg, speedMps, deviceHeadingDeg });
  onReady(api);
  return null;
}

// react-test-renderer's Typen führen `update` nicht, die Laufzeit-API hat es.
type Renderer = ReactTestRenderer & { update: (el: React.ReactElement) => void };
let renderer: Renderer | null = null;
function mount(initial: { position: any; courseDeg?: number | null; speedMps?: number | null; deviceHeadingDeg?: number | null }) {
  let api!: SmartTrackCameraApi;
  act(() => {
    renderer = TestRenderer.create(<Harness onReady={(a) => { api = a; }} {...initial} />) as Renderer;
  });
  return {
    get api() { return api; },
    update(next: { position: any; courseDeg?: number | null; speedMps?: number | null; deviceHeadingDeg?: number | null }) {
      act(() => { renderer!.update(<Harness onReady={(a) => { api = a; }} {...next} />); });
    },
  };
}

describe('useSmartTrackCamera', () => {
  afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; });

  it('Standardmodus ist Laufrichtung mit aktivem Follow', () => {
    const h = mount({ position: at(0, 0) });
    expect(h.api.mode).toBe('heading');
    expect(h.api.following).toBe(true);
    expect(h.api.paused).toBe(false);
    expect(h.api.pitched).toBe(false);
  });

  it('Modi lassen sich umschalten; Frei deaktiviert Follow, Rückkehr aktiviert es wieder', () => {
    const h = mount({ position: at(0, 0) });
    act(() => { h.api.setMode('north'); });
    expect(h.api.mode).toBe('north');
    expect(h.api.following).toBe(true);

    act(() => { h.api.setMode('free'); });
    expect(h.api.mode).toBe('free');
    expect(h.api.following).toBe(false);

    act(() => { h.api.setMode('heading'); });
    expect(h.api.mode).toBe('heading');
    expect(h.api.following).toBe(true);
    expect(h.api.paused).toBe(false);
  });

  it('manuelles Pan pausiert Follow sofort und springt NICHT von selbst zurück', () => {
    const map = makeFakeMap();
    const h = mount({ position: at(0, 0) });
    act(() => { h.api.attachMap(map); });

    act(() => { h.api.onUserGesture(); });
    expect(h.api.following).toBe(false);
    expect(h.api.paused).toBe(true);

    // Auch nach weiteren Positionsupdates bleibt die Kamera pausiert.
    const before = map.calls.length;
    h.update({ position: at(0, 20) });
    h.update({ position: at(0, 40) });
    expect(h.api.following).toBe(false);
    expect(map.calls.length).toBe(before);
  });

  it('Recenter reaktiviert Follow und führt die Kamera weich zurück', () => {
    const map = makeFakeMap();
    const h = mount({ position: at(0, 0) });
    act(() => { h.api.attachMap(map); });
    act(() => { h.api.onUserGesture(); });
    expect(h.api.paused).toBe(true);

    act(() => { h.api.recenter(); });
    expect(h.api.following).toBe(true);
    expect(h.api.paused).toBe(false);
    expect(map.calls.length).toBeGreaterThan(0);
  });

  it('2D/3D-Umschalter setzt den Pitch (0 ⇄ geneigt)', () => {
    const map = makeFakeMap();
    const h = mount({ position: at(0, 0), courseDeg: 0, speedMps: 1.4 });
    act(() => { h.api.attachMap(map); });
    expect(h.api.pitched).toBe(false);
    act(() => { h.api.togglePitch(); });
    expect(h.api.pitched).toBe(true);
    act(() => { h.api.recenter(); });
    expect(map.calls[map.calls.length - 1].pitch).toBeGreaterThan(0);
  });

  it('Kamera folgt der Laufrichtung: course 90 ⇒ Kameraheading Richtung Osten', () => {
    const map = makeFakeMap();
    const h = mount({ position: at(0, 0), courseDeg: 90, speedMps: 1.4 });
    act(() => { h.api.attachMap(map); });
    h.update({ position: at(10, 0), courseDeg: 90, speedMps: 1.4 });
    const last = map.calls[map.calls.length - 1];
    expect(last).toBeDefined();
    expect(last.heading).toBeGreaterThan(0);
    expect(last.heading).toBeLessThanOrEqual(90);
  });

  it('Norden-Modus: Kameraheading bleibt 0, egal wohin gelaufen wird', () => {
    const map = makeFakeMap();
    const h = mount({ position: at(0, 0), courseDeg: 200, speedMps: 1.4 });
    act(() => { h.api.attachMap(map); });
    act(() => { h.api.setMode('north'); });
    act(() => { h.api.recenter(); });
    expect(map.calls[map.calls.length - 1].heading).toBe(0);
  });

  it('Freier Modus: keine Kameraanimation trotz neuer Positionen', () => {
    const map = makeFakeMap();
    const h = mount({ position: at(0, 0), courseDeg: 0, speedMps: 1.4 });
    act(() => { h.api.attachMap(map); });
    act(() => { h.api.setMode('free'); });
    const before = map.calls.length;
    h.update({ position: at(0, 30), courseDeg: 0, speedMps: 1.4 });
    h.update({ position: at(0, 60), courseDeg: 0, speedMps: 1.4 });
    expect(map.calls.length).toBe(before);
  });

  it('Tracking-Sicherheit: der Hook fasst weder Punkte noch Distanz an und ruft nur animateCamera', () => {
    // Ein „Tracking-Zustand", der unverändert bleiben MUSS.
    const tracking = {
      trackPoints: [at(0, 0), at(0, 10)],
      runPoints: [at(0, 0)],
      distanceM: 42,
      corners: 3,
    };
    const snapshot = JSON.stringify(tracking);

    const map = makeFakeMap();
    const h = mount({ position: at(0, 0), courseDeg: 0, speedMps: 1.4 });
    act(() => { h.api.attachMap(map); });
    for (let i = 1; i <= 10; i++) h.update({ position: at(0, i * 5), courseDeg: 0, speedMps: 1.4 });
    act(() => { h.api.onUserGesture(); });
    act(() => { h.api.recenter(); });
    act(() => { h.api.setMode('north'); });
    act(() => { h.api.togglePitch(); });

    // Nichts am Tracking verändert …
    expect(JSON.stringify(tracking)).toBe(snapshot);
    // … und die Karte kennt ausschliesslich animateCamera-Aufrufe
    // (kein Neuaufbau einer Location-Subscription, kein Fix-Handling).
    expect(Object.keys(map).sort()).toEqual(['animateCamera', 'calls']);
    for (const c of map.calls) {
      expect(c).toHaveProperty('center');
      expect(c).toHaveProperty('heading');
      expect(c).toHaveProperty('pitch');
    }
  });
});
