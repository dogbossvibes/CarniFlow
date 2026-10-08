// TrackingMap + Fährten-Maßstab: opt-in (ohne Prop identisches Verhalten), Ticks
// nach Zoom aus der gemeldeten Region, Lay-/Such-Linie und Multi-Dog-Overlays
// (inkl. Hundefarben) unverändert; run.tsx misst auf der Search-Referenz.
import React from 'react';
import { readFileSync } from 'fs';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockMapApi = { animateToRegion: jest.fn(), fitToCoordinates: jest.fn(), animateCamera: jest.fn(), setCamera: jest.fn(), getCamera: jest.fn(async () => ({})) };
jest.mock('@/components/tracking/TrackMap', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const R = require('react');
  const { View: V } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const MapView = R.forwardRef((p: any, ref: any) => {
    R.useImperativeHandle(ref, () => mockMapApi);
    R.useEffect(() => { p.onMapReady?.(); }, []);
    return R.createElement(V, { testID: 'map' }, p.children);
  });
  const Polyline = (_p: any) => null;
  const Marker = (p: any) => R.createElement(V, { testID: 'marker' }, p.children);
  return { MAPS_AVAILABLE: true, RNMaps: { default: MapView, Polyline, Marker, PROVIDER_DEFAULT: 'default' } };
});
jest.mock('@/features/tracking/hooks/useSmartTrackCamera', () => ({
  useSmartTrackCamera: () => ({ attachMap: jest.fn(), onUserGesture: jest.fn(), setMode: jest.fn(), recenter: jest.fn(), togglePitch: jest.fn(), mode: 'heading', paused: false, pitched: false }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn(), toast: null }) }));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import { TrackingMap } from '@/features/tracking/components/TrackingMap';
import { DISTANCE_TICK_STROKE, DISTANCE_TICK_Z } from '@/features/tracking/components/DistanceScaleLayer';
import { referenceTrackStroke, REFERENCE_TRACK_HALO } from '@/features/tracking/components/TrackReferenceOverlayLayer';
import type { TrackReferenceOverlay } from '@/features/tracking/store/trackReferenceOverlays';
import { C } from '@/constants/colors';
import { RNMaps } from '@/components/tracking/TrackMap';
/* eslint-enable import/first */

const M_PER_DEG = (6371000 * Math.PI) / 180;
// 40 m gerade nach Norden, 1-m-Raster (reine Testgeometrie)
const LAY = Array.from({ length: 41 }, (_, i) => ({ lat: 47 + i / M_PER_DEG, lng: 8 }));
const REF_LINE = LAY.map(p => ({ latitude: p.lat, longitude: p.lng }));
const RUN = LAY.slice(0, 12);
const REFS: TrackReferenceOverlay[] = [
  { dogId: 'amoun', dogName: 'AMOUN', sessionId: 's-a', colorKey: 'orange', status: 'resting', points: LAY.map(p => ({ lat: p.lat, lng: p.lng + 1e-4 })) },
];
const TICK_COLORS = new Set(Object.values(DISTANCE_TICK_STROKE).map(s => s.strokeColor));

type PolyProps = { coordinates: { latitude: number; longitude: number }[]; strokeColor: string; strokeWidth: number; zIndex?: number };
const polys = (n: ReactTestRenderer): PolyProps[] => (n.root as any).findAllByType(RNMaps!.Polyline).map((x: any) => x.props);
const ticks = (n: ReactTestRenderer) => polys(n).filter(p => TICK_COLORS.has(p.strokeColor));
const nonTicks = (n: ReactTestRenderer) => polys(n).filter(p => !TICK_COLORS.has(p.strokeColor));
const labels = (n: ReactTestRenderer) => (n.root as any).findAll((x: any) => x.props?.testID === 'distance-scale-label' && typeof x.type === 'string');
const mapView = (n: ReactTestRenderer) => (n.root as any).findByType(RNMaps!.default);
const outer = (n: ReactTestRenderer) => (n.root as any).findAll((x: any) => typeof x.props?.onLayout === 'function')[0];

const mounted: ReactTestRenderer[] = [];
function renderMap(extra: Record<string, unknown> = {}) {
  let node!: ReactTestRenderer;
  act(() => {
    node = TestRenderer.create(
      <TrackingMap layPoints={LAY} runPoints={RUN} currentPosition={LAY[11]} smartFollow follow {...extra} />,
    );
  });
  mounted.push(node);
  return node;
}
/** Kartenhöhe 500 pt + Region mit `visibleM` Metern Höhe um die Fährtenmitte. */
function zoomTo(node: ReactTestRenderer, visibleM: number) {
  act(() => { outer(node)?.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 500 } } }); });
  const d = visibleM / M_PER_DEG;
  act(() => { mapView(node).props.onRegionChangeComplete({ latitude: LAY[20].lat, longitude: 8, latitudeDelta: d, longitudeDelta: d }); });
}

afterEach(() => { act(() => { mounted.splice(0).forEach(n => n.unmount()); }); });

describe('TrackingMap — Fährten-Maßstab', () => {
  it('ohne distanceScaleLine: keine Ticks, kein Region-Tracking, kein onLayout (unverändert)', () => {
    const n = renderMap();
    expect(ticks(n)).toHaveLength(0);
    expect(labels(n)).toHaveLength(0);
    expect(mapView(n).props.onRegionChangeComplete).toBeUndefined();
    expect(outer(n)).toBeUndefined();
  });
  it('nah (≈ 40 m sichtbar, 12.5 pt/m) → 1-m-Ticks inkl. 5/10 m, Zahlen 10/20/30/40', () => {
    const n = renderMap({ distanceScaleLine: REF_LINE });
    zoomTo(n, 40);
    const t = ticks(n);
    expect(t).toHaveLength(40);
    expect(t.filter(p => p.strokeColor === DISTANCE_TICK_STROKE.one.strokeColor)).toHaveLength(32);
    expect(t.filter(p => p.strokeColor === DISTANCE_TICK_STROKE.five.strokeColor)).toHaveLength(4);
    expect(t.filter(p => p.strokeColor === DISTANCE_TICK_STROKE.ten.strokeColor)).toHaveLength(4);
    expect(t.every(p => p.zIndex === DISTANCE_TICK_Z && p.coordinates.length === 2)).toBe(true);
    expect(labels(n).map((l: any) => l.props.children.props.children)).toEqual([10, 20, 30, 40]);
  });
  it('mittel (≈ 180 m sichtbar, Standard-Delta) → nur 5/10-m-Ticks', () => {
    const n = renderMap({ distanceScaleLine: REF_LINE });
    zoomTo(n, 180);
    const cls = new Set(ticks(n).map(p => p.strokeColor));
    expect(cls).toEqual(new Set([DISTANCE_TICK_STROKE.five.strokeColor, DISTANCE_TICK_STROKE.ten.strokeColor]));
    expect(ticks(n)).toHaveLength(8);
  });
  it('weit (≈ 300 m sichtbar) → nur 10-m-Ticks; Übersicht (≈ 1500 m) → nichts', () => {
    const n = renderMap({ distanceScaleLine: REF_LINE });
    zoomTo(n, 300);
    expect(ticks(n).map(p => p.strokeColor)).toEqual(Array(4).fill(DISTANCE_TICK_STROKE.ten.strokeColor));
    zoomTo(n, 1500);
    expect(ticks(n)).toHaveLength(0);
    expect(labels(n)).toHaveLength(0);
  });
  it('Regression: Lay-Linie, Suchlinie und Referenz-Overlays (Hundefarbe, Halo) unverändert', () => {
    const base = nonTicks(renderMap({ referenceOverlays: REFS }));
    const n = renderMap({ referenceOverlays: REFS, distanceScaleLine: REF_LINE });
    zoomTo(n, 40);
    expect(nonTicks(n)).toEqual(base);
    const lay = base.find(p => p.strokeColor === C.trackPrimary)!;
    expect(lay.strokeWidth).toBe(4);
    const run = base.find(p => p.strokeColor === C.trackBlue)!;
    expect(run.coordinates).toHaveLength(RUN.length);
    expect(base.some(p => p.strokeColor === referenceTrackStroke('orange').strokeColor)).toBe(true);
    expect(base.some(p => p.strokeColor === REFERENCE_TRACK_HALO.strokeColor)).toBe(true);
    // Ticks bleiben dünner als Lay-/Suchlinie
    expect(Math.max(...ticks(n).map(p => p.strokeWidth))).toBeLessThan(lay.strokeWidth);
  });
  it('keine Zahl auf einem Gegenstand (Marker bleibt lesbar)', () => {
    const n = renderMap({ distanceScaleLine: REF_LINE, markers: [{ id: 'g1', type: 'gegenstand', lat: LAY[20].lat, lng: 8 }] });
    zoomTo(n, 40);
    expect(labels(n).map((l: any) => l.props.children.props.children)).toEqual([10, 30, 40]);
  });
  it('Ticks werden nicht pro GPS-Fix neu gebaut (gleiche Referenz, neue Position)', () => {
    const n = renderMap({ distanceScaleLine: REF_LINE });
    zoomTo(n, 40);
    const before = ticks(n).map(p => p.coordinates);
    act(() => { (n as unknown as { update: (el: React.ReactElement) => void }).update(<TrackingMap layPoints={LAY} runPoints={RUN} currentPosition={LAY[15]} smartFollow follow distanceScaleLine={REF_LINE} />); });
    const after = ticks(n).map(p => p.coordinates);
    after.forEach((c, i) => expect(c).toBe(before[i]));   // identische Objekte → memoisiert
  });
});

describe('TrackingMap — Maßstab, wenn die Referenz erst nach dem Mount kommt (run.tsx)', () => {
  const layout = (n: ReactTestRenderer) =>
    act(() => { outer(n)?.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 500 } } }); });
  const update = (n: ReactTestRenderer, line: { latitude: number; longitude: number }[]) =>
    act(() => { (n as unknown as { update: (el: React.ReactElement) => void }).update(<TrackingMap layPoints={LAY} runPoints={RUN} currentPosition={LAY[11]} smartFollow follow distanceScaleLine={line} />); });

  it('Regression: einziges Layout-Event bei leerer Linie → Höhe gemessen, Ticks erscheinen nach dem Laden', () => {
    const n = renderMap({ distanceScaleLine: [] });          // Snapshot noch nicht geladen
    expect(outer(n)).toBeDefined();                          // Höhe wird ab Mount gemessen
    expect(mapView(n).props.onRegionChangeComplete).toEqual(expect.any(Function));
    layout(n);                                               // RN feuert onLayout nur einmal
    expect(ticks(n)).toHaveLength(0);                        // ohne Linie kein Layer
    update(n, REF_LINE);                                     // Snapshot geladen, KEIN neues Layout-Event
    expect(ticks(n).length).toBeGreaterThan(0);              // Standard-Delta → 5/10-m-Ticks
    expect(new Set(ticks(n).map(p => p.strokeColor))).toEqual(new Set([DISTANCE_TICK_STROKE.five.strokeColor, DISTANCE_TICK_STROKE.ten.strokeColor]));
  });
  it('Region-Event vor dem Laden der Linie wird für den Zoom genutzt', () => {
    const n = renderMap({ distanceScaleLine: [] });
    layout(n);
    const d = 40 / M_PER_DEG;
    act(() => { mapView(n).props.onRegionChangeComplete({ latitude: LAY[20].lat, longitude: 8, latitudeDelta: d, longitudeDelta: d }); });
    update(n, REF_LINE);
    expect(ticks(n)).toHaveLength(40);                       // nah → 1-m-Ticks
  });
  it('typische Fährtenlängen 15/20/50/100 m beim Standard-Zoom: sichtbare Ticks', () => {
    for (const len of [15, 20, 50, 100]) {
      const line = Array.from({ length: len + 1 }, (_, i) => ({ latitude: 47 + i / M_PER_DEG, longitude: 8 }));
      const n = renderMap({ distanceScaleLine: [] });
      layout(n);
      update(n, line);
      expect(ticks(n)).toHaveLength(Math.floor(len / 5));
    }
  });
});

describe('run.tsx — Maßstab misst auf der Search-Referenz', () => {
  const src = readFileSync('app/track/run.tsx', 'utf8');
  it('Ticks entlang snapData.laidPoints (dieselbe Linie wie useSearchRecorder)', () => {
    expect(src).toContain('distanceScaleLine={snapData.laidPoints}');
    expect(src).toMatch(/useSearchRecorder\(\{ laidPoints: snapData\.laidPoints/);
  });
  it('Live-Distanz = dogProgressM / trackLengthM; nächster Gegenstand über kanonische atM', () => {
    expect(src).toContain('searchDistanceReadout(s.dogProgressM, s.trackLengthM)');
    expect(src).toMatch(/nextObjectDistance\(snapData\.laidObjects\.map\(\(o, i\) => \(\{ atM: o\.atM, status: s\.objectStatuses\[i\] \}\)\), s\.dogProgressM\)/);
    expect(src).toContain("atM: eventArcs[m.id]?.arcM ?? null");
  });
  it('kein nächster Winkel im MVP', () => {
    expect(src).not.toMatch(/nextAngle|nextCorner|nächster Winkel/i);
  });
});
