// Absuche-Kartenansicht (GitHub-Issue #33) an der echten TrackingMap:
// ein Button «Kartenansicht» statt der FAB-Spalte, Kürzel neben der Linie mit
// Verbindungsstrich, blasse passierte Kürzel, Kürzeltext «90 R» im unveränderten
// Badge. Ohne `searchView` bleibt die Karte wie bisher.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TrackingMap, type MapMarker, type SearchMapView } from '../TrackingMap';

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
  const Polyline = (p: any) => R.createElement(V, { testID: 'polyline', ...p });
  const Circle = (p: any) => R.createElement(V, { testID: 'circle', ...p });
  const Marker = (p: any) => R.createElement(V, { testID: 'marker', coordinate: p.coordinate, markerLabel: p.accessibilityLabel }, p.children);
  return { MAPS_AVAILABLE: true, RNMaps: { default: MapView, Polyline, Circle, Marker, PROVIDER_DEFAULT: 'default' } };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn(), toast: null }) }));

const M = 111320, LAT0 = 47, COS = Math.cos(LAT0 * Math.PI / 180);
const at = (x: number, y: number) => ({ lat: LAT0 + y / M, lng: 8 + x / (M * COS) });
const meters = (c: { latitude: number; longitude: number }) => ({ x: (c.longitude - 8) * M * COS, y: (c.latitude - LAT0) * M });
// 40 m Nord, Rechtswinkel, 40 m Ost — in 1-m-Punkten.
const line = [...Array.from({ length: 41 }, (_, i) => at(0, i)), ...Array.from({ length: 40 }, (_, i) => at(i + 1, 40))];
const markers: MapMarker[] = [
  { id: 'g1', type: 'gegenstand', ...at(0, 20), arcM: 20 },
  { id: 'w1', type: 'winkel', angleKind: 'rechts', ...at(0, 40), arcM: 40 },
  { id: 'g2', type: 'gegenstand', ...at(3, 40), arcM: 43 },
];
const view = (over: Partial<SearchMapView> = {}): SearchMapView => ({ handlerProgressM: 0, dogProgressM: 5, offTrack: false, topInsetPt: 132, bottomInsetPt: 130, ...over });

let tree: ReturnType<typeof TestRenderer.create>;
function Harness({ searchView }: { searchView: SearchMapView | null }) {
  const [follow, setFollow] = React.useState(true);
  return <TrackingMap layPoints={line} markers={markers} currentPosition={at(0, 0)} smartFollow searchView={searchView}
    follow={follow} onToggleFollow={() => setFollow(v => !v)} onUserPan={() => setFollow(false)} />;
}
function render(searchView: SearchMapView | null) {
  act(() => { tree = TestRenderer.create(<Harness searchView={searchView} />); });
  // Kartenhöhe melden (onLayout) → Zoom/Platzierung werden aktiv.
  act(() => { tree.root.findAll(n => typeof n.props.onLayout === 'function')[0].props.onLayout({ nativeEvent: { layout: { height: 520, width: 360 } } }); });
}
const buttons = () => tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && typeof n.type !== 'string');
const labels = () => [...new Set(buttons().map(b => b.props.accessibilityLabel))];
const press = (label: string) => act(() => buttons().find(b => b.props.accessibilityLabel === label)!.props.onPress());
const host = (testID: string) => tree.root.findAll(n => n.props.testID === testID && typeof n.type === 'string');
const markerWithLabel = (label: string) => host('marker').find(m => m.props.markerLabel === label)!;
afterEach(() => { act(() => tree?.unmount()); jest.clearAllMocks(); });

describe('TrackingMap — Absuche-Kartenansicht', () => {
  it('zeigt «Kartenansicht» und den Zoom-Knopf statt der Spalte; die Auswahl schaltet die Modi', () => {
    render(view());
    expect(labels()).toEqual(['track.mapView.title', 'track.mapZoom.a11y']);
    expect(host('track-map-view-menu')).toHaveLength(0);

    press('track.mapView.title');
    expect(host('track-map-view-menu')).toHaveLength(1);
    expect(labels()).toEqual(expect.arrayContaining(['track.mapMode.heading', 'track.mapMode.north', 'track.mapMode.free', 'track.mapView.perspective']));

    press('track.mapMode.north');
    expect(host('track-map-view-menu')).toHaveLength(0);                      // Auswahl schliesst
    expect(mockMapApi.animateCamera.mock.calls.at(-1)![0].heading).toBe(0);
    press('track.mapView.title'); press('track.mapView.perspective');
    expect(mockMapApi.animateCamera.mock.calls.at(-1)![0].pitch).toBeGreaterThan(0);
  });

  it('Recenter erscheint nur, wenn Follow pausiert ist', () => {
    render(view());
    expect(labels()).not.toContain('track.mapMode.resumeFollow');
    act(() => tree.root.findAll(n => typeof n.props.onPanDrag === 'function')[0].props.onPanDrag());
    expect(labels()).toContain('track.mapMode.resumeFollow');
    press('track.mapMode.resumeFollow');
    expect(labels()).not.toContain('track.mapMode.resumeFollow');
  });

  it('Kamera: Blickrichtung der Fährte, Fährten-Zoom und Position oberhalb der unteren Karten', () => {
    render(view());
    const zoomCall = mockMapApi.animateCamera.mock.calls.map(c => c[0]).find(c => c.altitude != null);
    expect(zoomCall.heading).toBe(0);                                         // Schenkel nach Norden
    expect(zoomCall.altitude).toBeCloseTo(70 / (2 * Math.tan(15 * Math.PI / 180)), 3);
    expect(zoomCall.zoom).toBeGreaterThan(19);
    const ahead = meters(zoomCall.center).y;                             // Kartenmitte liegt VOR der Position
    expect(ahead).toBeGreaterThan(5);
    expect(ahead).toBeLessThan(70 * 0.35 + 0.5);
  });

  it('näher als 20 m am nächsten Ereignis wird deutlich näher gezoomt (T-218: 30 m)', () => {
    render(view({ handlerProgressM: 30, dogProgressM: 35 }));                 // 10 m vor dem Winkel
    const zoomCall = mockMapApi.animateCamera.mock.calls.map(c => c[0]).find(c => c.altitude != null);
    expect(zoomCall.altitude).toBeCloseTo(30 / (2 * Math.tan(15 * Math.PI / 180)), 3);
  });

  it('Zoom-Knopf schaltet normal → nah → weit und merkt sich die Stufe (T-218)', () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    render(view());
    const altitudes = () => mockMapApi.animateCamera.mock.calls.map(c => c[0]).filter(c => c.altitude != null).map(c => c.altitude);
    const altitudeFor = (spanM: number) => spanM / (2 * Math.tan(15 * Math.PI / 180));
    press('track.mapZoom.a11y');
    expect(altitudes().at(-1)).toBeCloseTo(altitudeFor(30), 3);                // nah
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('track_search_zoom_level', 'near');
    press('track.mapZoom.a11y');
    expect(altitudes().at(-1)).toBeCloseTo(altitudeFor(120), 3);               // weit
    press('track.mapZoom.a11y');
    expect(altitudes().at(-1)).toBeCloseTo(altitudeFor(70), 3);                // normal
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('track_search_zoom_level', 'normal');
  });

  it('Kürzel stehen NEBEN der Linie mit Punkt und Verbindungsstrich; Text «90 R»', () => {
    render(view());
    const angle = markerWithLabel('90 R');
    const offset = meters(angle.props.coordinate);
    expect(Math.hypot(offset.x - 0, offset.y - 40)).toBeGreaterThan(2);       // nicht auf dem Knick
    expect(offset.x).toBeLessThan(0);                                         // Aussenseite (Nordwest)
    expect(offset.y).toBeGreaterThan(40);
    // G2 liegt 3 m hinter dem Winkel → steht daneben, nicht darüber, und wird nicht zum Sammelmarker.
    const g2 = meters(markerWithLabel('G2').props.coordinate);
    expect(Math.hypot(g2.x - offset.x, g2.y - offset.y)).toBeGreaterThan(3.5);
    expect(host('marker').filter(m => m.props.markerLabel === '2')).toHaveLength(0);
    // je Kürzel ein Punkt am Knick und ein Verbindungsstrich dorthin
    expect(host('circle')).toHaveLength(3);
    const knick = host('circle').map(c => meters(c.props.center)).find(c => Math.hypot(c.x, c.y - 40) < 0.1);
    expect(knick).toBeDefined();
    expect(host('polyline').filter(p => p.props.coordinates.length === 2 && p.props.strokeWidth === 2)).toHaveLength(3);
  });

  it('passierte Kürzel sind blasser, kommende nicht; die Linie ist breiter mit Kontur', () => {
    render(view({ handlerProgressM: 25, dogProgressM: 30 }));
    const faded = (label: string) => markerWithLabel(label).findAll(n => typeof n.type === 'string' && n.props.style?.opacity === 0.45).length > 0;
    expect(faded('G1')).toBe(true);
    expect(faded('90 R')).toBe(false);
    expect(faded('G2')).toBe(false);
    const widths = host('polyline').filter(p => p.props.coordinates.length > 2).map(p => p.props.strokeWidth);
    expect(widths).toEqual(expect.arrayContaining([6, 9]));
  });

  it('ohne searchView: Marker exakt auf ihrem Punkt, bisherige Bedienelemente, keine Zoomvorgabe', () => {
    render(null);
    const object = meters(markerWithLabel('G1').props.coordinate);
    expect(Math.hypot(object.x, object.y - 20)).toBeLessThan(0.01);
    expect(host('circle')).toHaveLength(0);
    expect(labels()).toEqual(expect.arrayContaining(['track.mapMode.heading', 'track.mapMode.north', 'track.mapMode.free', 'track.mapFollow.disableLabel']));
    expect(labels()).not.toContain('track.mapView.title');
    expect(mockMapApi.animateCamera.mock.calls.every(c => c[0].altitude == null && c[0].zoom == null)).toBe(true);
    expect(host('polyline').filter(p => p.props.coordinates.length > 2).map(p => p.props.strokeWidth)).toEqual([4]);
  });
});
