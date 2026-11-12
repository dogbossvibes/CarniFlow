// Absuche-Kartenansicht (GitHub-Issue #33) am echten Kamera-Hook: die Karte folgt
// der Richtung der GELEGTEN Fährte (auch im Stand), fällt bei fehlender
// Fährtenrichtung auf die Positionsfolge mit grösserem Mindestschritt zurück und
// sendet die Zoomstufe nur bei Ausschnittwechsel. Reine Darstellung.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSmartTrackCamera, type SmartTrackCameraApi, type SmartTrackCameraInput } from '@/features/tracking/hooks/useSmartTrackCamera';
import { resolveTravelHeading } from '@/features/tracking/utils/smartCamera';

const M_PER_DEG = 111320;
const at = (xEastM: number, yNorthM: number) => ({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG });

interface CameraCall { center: { latitude: number; longitude: number }; heading: number; pitch: number; altitude?: number; zoom?: number }
function makeFakeMap() {
  const calls: CameraCall[] = [];
  return { calls, animateCamera: (cam: CameraCall) => { calls.push(cam); } };
}
function Harness({ onReady, ...input }: SmartTrackCameraInput & { onReady: (api: SmartTrackCameraApi) => void }) {
  onReady(useSmartTrackCamera(input));
  return null;
}
type Renderer = ReactTestRenderer & { update: (el: React.ReactElement) => void };
let renderer: Renderer | null = null;
function mount(initial: SmartTrackCameraInput) {
  let api!: SmartTrackCameraApi;
  act(() => { renderer = TestRenderer.create(<Harness onReady={a => { api = a; }} {...initial} />) as Renderer; });
  return {
    get api() { return api; },
    update(next: SmartTrackCameraInput) { act(() => { renderer!.update(<Harness onReady={a => { api = a; }} {...next} />); }); },
  };
}
let now = 1000;
beforeEach(() => { now = 1000; jest.spyOn(Date, 'now').mockImplementation(() => now); });
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; jest.restoreAllMocks(); });

describe('useSmartTrackCamera — Absuche-Kartenansicht', () => {
  it('folgt der Fährtenrichtung statt dem GPS-Kurs und dreht im Stand weich nach', () => {
    const h = mount({ position: at(0, 0), courseDeg: 200, speedMps: 1.5, trackHeadingDeg: 0, reportTravelHeading: true });
    const map = makeFakeMap();
    act(() => h.api.attachMap(map));
    expect(map.calls.at(-1)!.heading).toBe(0);            // Fährte führt, nicht der GPS-Kurs 200°
    expect(h.api.travelHeadingDeg).toBe(0);

    // Winkel passiert: die Fährtenrichtung springt auf 90°, die POSITION bleibt gleich (Stand).
    const position = at(0, 0);
    now += 1000; h.update({ position, courseDeg: 200, speedMps: 1.5, trackHeadingDeg: 90, reportTravelHeading: true });
    const first = map.calls.at(-1)!.heading;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(90);                        // weich, kein Sprung
    for (let i = 0; i < 12; i++) { now += 1000; h.update({ position: { ...position }, courseDeg: 200, speedMps: 1.5, trackHeadingDeg: 90, reportTravelHeading: true }); }
    expect(Math.abs(map.calls.at(-1)!.heading - 90)).toBeLessThanOrEqual(3);
    expect(h.api.travelHeadingDeg).toBe(90);               // Positionspfeil zeigt die Laufrichtung
  });

  it('ohne Fährtenrichtung (Off-Track) gilt die Positionsfolge mit grösserem Mindestschritt', () => {
    const h = mount({ position: at(0, 0), trackHeadingDeg: 0, courseMinStepM: 9 });
    const map = makeFakeMap();
    act(() => h.api.attachMap(map));
    // 5 m nach Osten: unter dem Mindestschritt → Richtung wird gehalten (kein GPS-Rauschen).
    now += 1000; h.update({ position: at(5, 0), trackHeadingDeg: null, courseMinStepM: 9 });
    expect(map.calls.at(-1)!.heading).toBe(0);
    // 12 m nach Osten: belastbar → Kamera dreht Richtung Osten.
    now += 1000; h.update({ position: at(12, 0), trackHeadingDeg: null, courseMinStepM: 9 });
    expect(map.calls.at(-1)!.heading).toBeGreaterThan(20);
  });

  it('Mindestschritt ist parametrierbar, der Standard bleibt unverändert', () => {
    const base = { position: at(5, 0), lastAnchor: at(0, 0), lastCourseDeg: 10 };
    expect(resolveTravelHeading(base).source).toBe('position_delta');
    expect(resolveTravelHeading({ ...base, minStepM: 9 }).source).toBe('hold');
    expect(resolveTravelHeading({ ...base, minStepM: 9 }).headingDeg).toBe(10);
  });

  it('sendet die Zoomstufe beim Einschalten und nur bei Ausschnittwechsel', () => {
    const wide = { altitude: 130.6, zoom: 19.6 }, close = { altitude: 93.3, zoom: 20.1 };
    const h = mount({ position: at(0, 0), trackHeadingDeg: 0, viewportSpanM: 70, cameraZoom: wide });
    const map = makeFakeMap();
    act(() => h.api.attachMap(map));
    expect(map.calls.at(-1)).toMatchObject({ altitude: 130.6, zoom: 19.6 });

    // Normale Fixe: KEIN Zoom im Kamera-Update → eigenes Zoomen des Nutzers bleibt erhalten.
    now += 1000; h.update({ position: at(0, 5), trackHeadingDeg: 0, viewportSpanM: 70, cameraZoom: wide });
    expect(map.calls.at(-1)!.altitude).toBeUndefined();
    expect(map.calls.at(-1)!.zoom).toBeUndefined();

    // Nah am Winkel: Ausschnitt wechselt → einmalig neue Zoomstufe, auch ohne Bewegung.
    const count = map.calls.length;
    h.update({ position: at(0, 5), trackHeadingDeg: 0, viewportSpanM: 50, cameraZoom: close });
    expect(map.calls.length).toBe(count + 1);
    expect(map.calls.at(-1)).toMatchObject({ altitude: 93.3, zoom: 20.1 });
  });

  it('koppelt den Look-ahead an den Ausschnitt: kleinerer Ausschnitt = kleinerer Versatz', () => {
    const aheadM = (span: number) => {
      const h = mount({ position: at(0, 0), trackHeadingDeg: 0, viewportSpanM: span, lookAheadFraction: 0.2, cameraZoom: { altitude: 1, zoom: 1 } });
      const map = makeFakeMap();
      act(() => h.api.attachMap(map));
      const northM = map.calls.at(-1)!.center.latitude * M_PER_DEG;
      act(() => { renderer?.unmount(); }); renderer = null;
      return northM;
    };
    expect(aheadM(70)).toBeCloseTo(14, 0);
    expect(aheadM(50)).toBeCloseTo(10, 0);
  });

  it('ohne Absuche-Eingaben bleibt das Verhalten unverändert (kein Zoom, kein gemeldeter Kurs)', () => {
    const h = mount({ position: at(0, 0), courseDeg: 90, speedMps: 1 });
    const map = makeFakeMap();
    act(() => h.api.attachMap(map));
    expect(map.calls.at(-1)!.heading).toBe(90);
    expect(map.calls.at(-1)!.altitude).toBeUndefined();
    expect(map.calls.at(-1)!.zoom).toBeUndefined();
    expect(h.api.travelHeadingDeg).toBeNull();
  });
});
