// Feldfehler 26.11.: Während der Anfahrt zeigt die Absuche-Karte den letzten bekannten
// Standort blass (kein Positionspfeil) und einen Ausschnitt mit Ansatz und Punkt.
// Die Erstzentrierung gilt nur in der Absuche und nie nach einer eigenen Kartengeste.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TrackingMap, approximateFitRegion } from '../TrackingMap';
import { RNMaps } from '@/components/tracking/TrackMap';

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
  const Circle = (_p: any) => null;
  const Marker = (p: any) => R.createElement(V, { testID: p.testID ?? 'marker' }, p.children);
  return { MAPS_AVAILABLE: true, RNMaps: { default: MapView, Polyline, Marker, Circle, PROVIDER_DEFAULT: 'default' } };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: (p: any) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react'); return R.createElement('Icon', { name: p.name });
} }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn(), toast: null }) }));

const START = { lat: 47.0, lng: 8.0 };
const APPROX = { lat: 47.01, lng: 8.005, accuracy: 40 };   // ~1.1 km vom Ansatz
let tree: ReturnType<typeof TestRenderer.create>;
afterEach(() => { act(() => tree?.unmount()); jest.clearAllMocks(); });

const containsBoth = (r: any) => [START, APPROX].every(p =>
  Math.abs(p.lat - r.latitude) <= r.latitudeDelta / 2 && Math.abs(p.lng - r.longitude) <= r.longitudeDelta / 2);

describe('approximateFitRegion', () => {
  it('umfasst Ansatz und ungefähren Punkt mit Rand', () => {
    const r = approximateFitRegion(START, APPROX);
    expect(containsBoth(r)).toBe(true);
    expect(r.latitudeDelta).toBeGreaterThan(Math.abs(START.lat - APPROX.lat));
  });
  it('zoomt bei nahen Punkten nicht weiter hinein als üblich', () => {
    const r = approximateFitRegion(START, { lat: 47.00001, lng: 8.00001 });
    expect(r.latitudeDelta).toBe(0.0016);
    expect(r.longitudeDelta).toBe(0.0016);
  });
});

describe('TrackingMap — ungefährer Standort in der Anfahrt', () => {
  it('zeigt den Punkt blass (eigener Marker, kein Pfeil) und einen Ausschnitt mit Ansatz und Punkt', () => {
    act(() => { tree = TestRenderer.create(<TrackingMap layPoints={[]} startAnchor={START} currentPosition={null}
      approximatePosition={APPROX} centerOnTrackWithoutFix follow />); });
    expect(tree.root.findAll(n => n.props.testID === 'approximate-position' && typeof n.type !== 'string').length).toBeGreaterThan(0);
    expect(tree.root.findAll(n => n.type === 'Icon' && n.props.name === 'navigate')).toHaveLength(0);
    const circle = tree.root.findByType(RNMaps!.Circle as any);
    expect(circle.props.radius).toBe(40);
    const regions = mockMapApi.animateToRegion.mock.calls.map(c => c[0]);
    expect(regions.length).toBeGreaterThan(0);
    expect(containsBoth(regions.at(-1))).toBe(true);
  });

  it('mit echtem Fix: Pfeil statt blassem Punkt, keine Erstzentrierung', () => {
    act(() => { tree = TestRenderer.create(<TrackingMap layPoints={[]} startAnchor={START} currentPosition={START}
      approximatePosition={APPROX} centerOnTrackWithoutFix follow={false} />); });
    expect(tree.root.findAll(n => n.props.testID === 'approximate-position')).toHaveLength(0);
    expect(tree.root.findAll(n => n.type === 'Icon' && n.props.name === 'navigate').length).toBeGreaterThan(0);
    expect(mockMapApi.animateToRegion).not.toHaveBeenCalled();
  });

  it('ohne Prop (Legen, Verleitungen): keine automatische Zentrierung', () => {
    act(() => { tree = TestRenderer.create(<TrackingMap layPoints={[]} startAnchor={START} currentPosition={null} follow />); });
    act(() => { tree.update(<TrackingMap layPoints={[START, { lat: 47.001, lng: 8 }]} startAnchor={START} currentPosition={null} follow />); });
    expect(mockMapApi.animateToRegion).not.toHaveBeenCalled();
  });

  it('Absuche ohne Fix und ohne ungefähren Punkt: einmal auf den Ansatz', () => {
    act(() => { tree = TestRenderer.create(<TrackingMap layPoints={[]} currentPosition={null} centerOnTrackWithoutFix follow />); });
    expect(mockMapApi.animateToRegion).not.toHaveBeenCalled();
    act(() => { tree.update(<TrackingMap layPoints={[START, { lat: 47.001, lng: 8 }]} currentPosition={null} centerOnTrackWithoutFix follow />); });
    expect(mockMapApi.animateToRegion).toHaveBeenCalledTimes(1);
    expect(mockMapApi.animateToRegion.mock.calls[0][0]).toMatchObject({ latitude: START.lat, longitude: START.lng });
  });

  it('nach eigener Kartengeste springt die Karte nicht mehr', () => {
    act(() => { tree = TestRenderer.create(<TrackingMap layPoints={[]} startAnchor={START} currentPosition={null} centerOnTrackWithoutFix follow />); });
    act(() => tree.root.findByType(RNMaps!.default).props.onPanDrag());
    mockMapApi.animateToRegion.mockClear();
    act(() => { tree.update(<TrackingMap layPoints={[]} startAnchor={START} currentPosition={null}
      approximatePosition={APPROX} centerOnTrackWithoutFix follow />); });
    expect(mockMapApi.animateToRegion).not.toHaveBeenCalled();
  });
});
