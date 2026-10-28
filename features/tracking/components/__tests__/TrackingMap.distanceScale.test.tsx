// TrackingMap + Fährten-Maßstab: opt-in (ohne Prop identisches Verhalten), Ticks
// nach Zoom aus der gemeldeten Region, Lay-/Such-Linie und Multi-Dog-Overlays
// (inkl. Hundefarben) unverändert; run.tsx misst auf der Search-Referenz.
import React from 'react';
import { StyleSheet } from 'react-native';
import { readFileSync } from 'fs';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('@/components/ui/AnyvoBottomSheet', () => {
  const { View, Text } = jest.requireActual('react-native');
  return { AnyvoBottomSheet: ({ title, children, onClose }: any) => <View testID="group-sheet" onTouchEnd={onClose}><Text>{title}</Text>{children}</View> };
});

const mockMapApi = { coordinateForPoint: jest.fn(async ({ x }: { x: number; y: number }) => ({ latitude: 47 + x / (6371000 * Math.PI / 180), longitude: 8 })), animateToRegion: jest.fn(), fitToCoordinates: jest.fn(), animateCamera: jest.fn(), setCamera: jest.fn(), getCamera: jest.fn(async () => ({})) };
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
import { MarkerDetailSheet } from '@/features/tracking/components/MarkerDetailSheet';
import { TrackingMap, PinMarker } from '@/features/tracking/components/TrackingMap';
import { DISTANCE_TICK_STROKE, DISTANCE_TICK_HALO } from '@/features/tracking/components/DistanceScaleLayer';
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
const nonTicks = (n: ReactTestRenderer) => polys(n).filter(p => !TICK_COLORS.has(p.strokeColor) && p.strokeColor !== DISTANCE_TICK_HALO);
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

describe('TrackingMap — no rulers or distance ticks', () => {
  it.each([40, 180, 300, 1500])('hides all scales at %s m even for legacy callers', visible => {
    const n = renderMap({ showMapScale: true, distanceScaleLine: REF_LINE, markers: [{ id: 'g1', type: 'gegenstand', lat: LAY[20].lat, lng: 8 }] });
    zoomTo(n, visible);
    expect(ticks(n)).toHaveLength(0);
    expect(labels(n)).toHaveLength(0);
    expect(mapView(n).props.showsScale).toBe(false);
    expect(mapView(n).props.onRegionChange).toBeUndefined();
    expect(n.root.findAll(x => x.props.testID === 'map-scale-bar')).toHaveLength(0);
  });
  it('preserves recorded lines and dog-colored reference overlays', () => {
    const base = nonTicks(renderMap({ referenceOverlays: REFS }));
    const after = nonTicks(renderMap({ referenceOverlays: REFS, showMapScale: true, distanceScaleLine: REF_LINE }));
    expect(after).toEqual(base);
    expect(base.some(p => p.strokeColor === C.trackPrimary)).toBe(true);
    expect(base.some(p => p.strokeColor === C.trackBlue)).toBe(true);
    expect(base.some(p => p.strokeColor === referenceTrackStroke('orange').strokeColor)).toBe(true);
    expect(base.some(p => p.strokeColor === REFERENCE_TRACK_HALO.strokeColor)).toBe(true);
  });
  it('disables native rulers in all map entry points', () => {
    for (const path of ['components/tracking/TrackMap.tsx', 'components/calendar/LocationPickerCard.tsx',
      'features/tracking/components/TrackReplayMap.tsx', 'features/tracking-planner/PlannerMap.tsx',
      'features/tracking-exchange/live/components/GroupPositionsMap.tsx']) {
      expect(readFileSync(path, 'utf8')).toContain('showsScale={false}');
    }
  });
  it('active screens reserve space only for metrics, not a hidden ruler', () => {
    for (const route of ['legen', 'run']) {
      const source = readFileSync(`app/track/${route}.tsx`, 'utf8');
      expect(source).not.toContain('showMapScale');
      expect(source).not.toContain('setMapScaleHeight');
      expect(source).toContain('mapBottomOverlayLayout(mapMetricsHeight, 0, false)');
    }
  });
});

it('refreshes the native marker snapshot after direction changes, then freezes it again', () => {
  jest.useFakeTimers();
  const Marker = RNMaps!.Marker;
  let node!: ReactTestRenderer;
  try {
    act(() => { node = TestRenderer.create(<PinMarker Marker={Marker} lat={47} lng={8} kind="bw" label="BW" />); });
    act(() => { jest.advanceTimersByTime(1200); });
    expect(node.root.findByType(Marker).props.tracksViewChanges).toBe(false);
    act(() => { node.update(<PinMarker Marker={Marker} lat={47} lng={8} kind="bw" label="BW SL" />); });
    expect(node.root.findByType(Marker).props.tracksViewChanges).toBe(true);
    act(() => { jest.advanceTimersByTime(1200); });
    expect(node.root.findByType(Marker).props.tracksViewChanges).toBe(false);
  } finally { act(() => node?.unmount()); jest.useRealTimers(); }
});

it.each(['bw', 'ow', 'gw', 'abriss'] as const)('actual parent map shows saved direction and preserves unresolved %s labels', angleKind => {
  const node = renderMap({markers:[{id:'special',type:'winkel',angleKind,lat:LAY[20].lat,lng:8,geometryDirection:'links',geometrySharpness:'sharp'}]});
  const texts = () => node.root.findAll(n => (n as unknown as { type: unknown }).type === 'Text').map(n => n.props.children);
  expect(texts().some(text => typeof text === 'string' && text.split(' · ')[0] === (angleKind === 'abriss' ? 'A L' : `${angleKind.toUpperCase()} SL`))).toBe(true);
  act(() => { node.update(<TrackingMap currentPosition={null} follow={false} layPoints={LAY} markers={[{id:'special',type:'winkel',angleKind,lat:LAY[20].lat,lng:8,geometryDirection:'unresolved'}]}/>); });
  expect(texts().some(text => typeof text === 'string' && text.split(' · ')[0] === (angleKind === 'abriss' ? '×' : angleKind.toUpperCase()))).toBe(true);
});

// User-visible overlap regression: field G5 + angle, and final object + end.
describe('TrackingMap overlapping feature access', () => {
  it('keeps both identities accessible from a compact group and opens all details without moving coordinates', () => {
    const markers = [
      { id: 'g5', type: 'gegenstand', lat: LAY[20].lat, lng: 8, objectIndex: 5, material: 'stoff', distanceFromStart: 20 },
      { id: 'left', type: 'winkel', lat: LAY[20].lat + 0.08 / M_PER_DEG, lng: 8, angleKind: 'links', distanceFromStart: 20.08 },
    ];
    const n = renderMap({ markers });
    zoomTo(n, 100);
    const badge = (n.root as any).findAllByType(RNMaps!.Marker).find((node: any) => node.props.accessibilityLabel?.includes('G5'));
    expect(badge.props.coordinate).toEqual({ latitude: markers[0].lat, longitude: 8 });
    act(() => { badge.props.onPress(); });
    const text = JSON.stringify(n.root.findAll(node => (node as unknown as { type: unknown }).type === 'Text').map(node => node.props.children));
    expect(text).toContain('track.markerGroup.title');
    expect(text).toContain('G5');
    expect(text).toContain('track.detailDistanceFromStart');
    // Every feature becomes separately available again when sufficiently zoomed in.
    zoomTo(n, 0.2);
    expect((n.root as any).findAllByType(RNMaps!.Marker).some((node: any) => node.props.accessibilityLabel?.includes('G5,'))).toBe(false);
  });
  it('includes the end and last object together with the authoritative saved total', () => {
    const n = renderMap({ endPoint: LAY[40], endTotalDistanceM: 39,
      markers: [{ id: 'g7', type: 'gegenstand', lat: LAY[40].lat, lng: 8, objectIndex: 7, material: 'holz' }] });
    const badge = (n.root as any).findAllByType(RNMaps!.Marker).find((node: any) => node.props.accessibilityLabel?.includes('G7'));
    act(() => { badge.props.onPress(); });
    expect(JSON.stringify(n.root.findAll(node => (node as unknown as { type: unknown }).type === 'Text').map(node => node.props.children))).toContain('39 m');
    expect(JSON.stringify(n.root.findAll(node => (node as unknown as { type: unknown }).type === 'Text').map(node => node.props.children))).toContain('track.detailTrackEnd');
  });
});


it('keeps the displayed object number in live grouped details before persistence', () => {
  const n = renderMap({ markers: [
    { id: 'live-object', type: 'gegenstand', lat: LAY[20].lat, lng: 8, material: 'stoff' },
    { id: 'live-angle', type: 'winkel', lat: LAY[20].lat, lng: 8, angleKind: 'links' },
  ] });
  const badge = (n.root as any).findAllByType(RNMaps!.Marker).find((node: any) => node.props.accessibilityLabel?.includes('G1'));
  act(() => { badge.props.onPress(); });
  const sheet = n.root.findAll(node => node.props.testID === 'group-sheet')[0];
  expect(sheet.findAll(node => (node as unknown as { type: unknown }).type === 'Text').map(node => node.props.children)).toContain('G1');
});


it('uses the initial layout when markers arrive after mount and zooms them apart', () => {
 const n = renderMap();
 act(() => { outer(n).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 500 } } }); });
 const markers = [
  { id: 'late-object', type: 'gegenstand' as const, lat: LAY[20].lat, lng: 8, objectIndex: 5 },
  { id: 'late-angle', type: 'winkel' as const, lat: LAY[20].lat + 0.08 / M_PER_DEG, lng: 8, angleKind: 'links' as const },
 ];
 act(() => { n.update(<TrackingMap layPoints={LAY} currentPosition={null} follow={false} markers={markers} />); });
 const grouped = () => (n.root as any).findAllByType(RNMaps!.Marker).some((node: any) => node.props.accessibilityLabel?.includes('G5,'));
 expect(grouped()).toBe(true);
 // No second layout event: native layout already happened before data arrived.
 act(() => { mapView(n).props.onRegionChangeComplete({ latitude: LAY[20].lat, longitude: 8, latitudeDelta: 0.2 / M_PER_DEG, longitudeDelta: 0.2 / M_PER_DEG }); });
 expect(grouped()).toBe(false);
});


// UI-only regression for iOS55: large L · R · SR +2 badge from the report.
describe('compact marker groups', () => {
  it('keeps all five entries, their coordinates and details through zooming and regrouping', () => {
    const markers = [
      { id: 'left', type: 'winkel' as const, lat: LAY[10].lat, lng: 8, angleKind: 'links' as const, distanceFromStart: 10 },
      { id: 'right', type: 'winkel' as const, lat: LAY[11].lat, lng: 8, angleKind: 'rechts' as const, distanceFromStart: 11 },
      { id: 'sharp-right', type: 'winkel' as const, lat: LAY[12].lat, lng: 8, angleKind: 'spitz_rechts' as const, distanceFromStart: 12 },
    ];
    const before = JSON.stringify(markers);
    const onMarkerPress = jest.fn(), onStartPress = jest.fn(), onEndPress = jest.fn();
    const n = renderMap({ markers, startAnchor: LAY[9], endPoint: LAY[13], endTotalDistanceM: 99,
      onMarkerPress, onStartPress, onEndPress, currentPosition: null, follow: false });
    const nativeMarkers = () => n.root.findAll(node => (node as unknown as { type: unknown }).type === RNMaps!.Marker);
    const textOf = (node: ReactTestRenderer['root']) => node.findAll(x => (x as unknown as { type: unknown }).type === 'Text').map(x => x.props.children);
    zoomTo(n, 100);
    expect(nativeMarkers()).toHaveLength(1);
    const group = nativeMarkers()[0];
    expect(group.props.coordinate).toEqual({ latitude: markers[0].lat, longitude: 8 });
    expect(textOf(group)).toEqual(['5']);
    expect(group.props.accessibilityRole).toBe('button');
    expect(group.props.accessibilityLabel).toContain('track.markerGroup.title: 5.');
    expect(group.props.accessibilityLabel).toContain('track.startFlag');
    expect(group.props.accessibilityLabel).toContain('track.detailTrackEnd');
    const frame = group.props.children;
    const dot = frame.props.children;
    expect(StyleSheet.flatten(frame.props.style)).toMatchObject({ width: 48, height: 48, backgroundColor: 'transparent' });
    expect(StyleSheet.flatten(dot.props.style)).toMatchObject({ width: 28, height: 28, borderRadius: 14 });
    expect(StyleSheet.flatten(dot.props.style).backgroundColor).not.toBe('#EDEDED');
    act(() => { group.props.onPress(); });
    expect(n.root.findByType(MarkerDetailSheet).props.selection).toEqual({ kind: 'group', items: [
      ...markers.map(marker => ({ kind: 'marker', marker })), { kind: 'start' }, { kind: 'end', totalDistanceM: 99 },
    ] });
    expect(textOf(n.root)).toContain('99 m');
    act(() => { n.root.findByType(MarkerDetailSheet).props.onClose(); });
    zoomTo(n, 3);
    expect(nativeMarkers()).toHaveLength(5);
    for (const marker of markers) {
      const item = nativeMarkers().find(x => x.props.coordinate.latitude === marker.lat)!;
      act(() => { item.props.onPress(); });
      expect(onMarkerPress).toHaveBeenLastCalledWith(marker);
    }
    expect(nativeMarkers().map(x => x.props.coordinate.latitude).sort()).toEqual([...markers.map(x => x.lat), LAY[9].lat, LAY[13].lat].sort());
    zoomTo(n, 100);
    expect(nativeMarkers()).toHaveLength(1);
    expect(textOf(nativeMarkers()[0])).toEqual(['5']);
    expect(JSON.stringify(markers)).toBe(before);
  });

  it('bounds the visible count while retaining all 100 objects and their exact numbers', () => {
    const markers = Array.from({ length: 100 }, (_, i) => ({ id: `object-${i}`, type: 'gegenstand' as const,
      lat: 47, lng: 8, objectIndex: i + 1, material: 'holz' as const, distanceFromStart: i }));
    const before = JSON.stringify(markers);
    const n = renderMap({ layPoints: [], runPoints: [], markers, currentPosition: null, follow: false });
    const group = n.root.findByType(RNMaps!.Marker);
    expect(group.findAll(x => (x as unknown as { type: unknown }).type === 'Text').map(x => x.props.children)).toEqual(['99+']);
    expect(group.props.accessibilityLabel).toContain('track.markerGroup.title: 100.');
    expect(group.props.accessibilityLabel).toContain('G100');
    act(() => { group.props.onPress(); });
    const items = n.root.findByType(MarkerDetailSheet).props.selection.items;
    expect(items.map((item: { marker: unknown }) => item.marker)).toEqual(markers);
    expect(JSON.stringify(markers)).toBe(before);
  });

  it('refreshes details when group membership changes but its displayed count stays the same', () => {
    const first = [{ id: 'g1', type: 'gegenstand' as const, lat: 47, lng: 8, objectIndex: 1 },
      { id: 'left', type: 'winkel' as const, lat: 47, lng: 8, angleKind: 'links' as const }];
    const next = [{ ...first[0], id: 'g2', objectIndex: 2 },
      { ...first[1], id: 'right', angleKind: 'rechts' as const }];
    const n = renderMap({ markers: first, layPoints: [], runPoints: [], currentPosition: null, follow: false });
    act(() => { n.update(<TrackingMap markers={next} layPoints={[]} currentPosition={null} follow={false} />); });
    const group = n.root.findByType(RNMaps!.Marker);
    expect(group.props.accessibilityLabel).toContain('G2');
    expect(group.props.accessibilityLabel).not.toContain('G1');
    act(() => { group.props.onPress(); });
    expect(n.root.findByType(MarkerDetailSheet).props.selection.items.map((item: { marker: unknown }) => item.marker)).toEqual(next);
  });
});

// Start/end are map features even when no angle or object was recorded.
it.each([false, true])('ungroups start/end when zooming without ordinary markers (legacy scale props: %s)', legacy => {
  const n = renderMap({ markers: [], startAnchor: LAY[0], endPoint: LAY[1], currentPosition: null,
    ...(legacy ? { distanceScaleLine: REF_LINE, showMapScale: true } : {}) });
  const count = () => n.root.findAll(node => (node as unknown as { type: unknown }).type === RNMaps!.Marker).length;
  zoomTo(n, 100);
  expect(count()).toBe(1);
  zoomTo(n, 3);
  expect(count()).toBe(2);
  expect(mapView(n).props.showsScale).toBe(false);
  expect(ticks(n)).toHaveLength(0);
});

it.each(['L', 'R', 'SR', 'SL'])('renders resolved %s as a simple mint badge without changing marker coordinates or taps', label => {
  const onPress = jest.fn(); let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<PinMarker Marker={RNMaps!.Marker} lat={47.2} lng={8.3} kind="angle" label={label} acute={label.length === 2} onPress={onPress} />); });
  const marker = node.root.findByType(RNMaps!.Marker);
  expect(marker.props.coordinate).toEqual({ latitude: 47.2, longitude: 8.3 });
  const text = node.root.findAll(n => (n as unknown as { type: unknown }).type === 'Text' && n.props.children === label)[0];
  expect(StyleSheet.flatten(text.props.style).color).toBe('#04110F');
  expect(node.root.findAll(n => typeof (n as unknown as { type: unknown }).type === 'string' && StyleSheet.flatten(n.props.style)?.backgroundColor === C.trackPrimary).length).toBeGreaterThan(0);
  act(() => marker.props.onPress()); expect(onPress).toHaveBeenCalledTimes(1);
  act(() => node.unmount());
});
