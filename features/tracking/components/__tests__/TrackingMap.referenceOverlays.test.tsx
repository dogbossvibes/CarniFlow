// TrackingMap + Referenz-Ebene: mehrere Referenz-Polylines (transparent, dünner,
// unter der aktuellen Lay-Linie), aktuelle Linie unverändert, keine Marker anderer
// Fährten, runPoints unberührt, keine automatische Kameraänderung.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockMapApi = { animateToRegion: jest.fn(), fitToCoordinates: jest.fn(), animateCamera: jest.fn(), setCamera: jest.fn(), getCamera: jest.fn(async () => ({})) };
// Map-Dummies IN der Factory (wird beim ersten Import ausgeführt); Zugriff im Test über RNMaps.
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
const mockCamera = jest.fn();
jest.mock('@/features/tracking/hooks/useSmartTrackCamera', () => ({
  useSmartTrackCamera: (a: unknown) => { mockCamera(a); return { attachMap: jest.fn(), onUserGesture: jest.fn(), setMode: jest.fn(), recenter: jest.fn(), togglePitch: jest.fn(), mode: 'heading', paused: false, pitched: false }; },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn(), toast: null }) }));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import { TrackingMap } from '@/features/tracking/components/TrackingMap';
import { REFERENCE_TRACK_STROKE } from '@/features/tracking/components/TrackReferenceOverlayLayer';
import type { TrackReferenceOverlay } from '@/features/tracking/store/trackReferenceOverlays';
import { C } from '@/constants/colors';
import { RNMaps } from '@/components/tracking/TrackMap';
/* eslint-enable import/first */

const line = (lat0: number, n = 5) => Array.from({ length: n }, (_, i) => ({ lat: lat0 + i * 1e-4, lng: 8 }));
const LAY = line(47.0);
const RUN = line(47.0, 3);
const ov = (dogId: string, lat0: number): TrackReferenceOverlay =>
  ({ dogId, dogName: dogId.toUpperCase(), sessionId: `sess-${dogId}`, status: 'resting', points: line(lat0, 7) });
const REFS = [ov('amoun', 47.01), ov('doran', 47.02), ov('clay', 47.03)];

type PolyProps = { coordinates: { latitude: number; longitude: number }[]; strokeColor: string; strokeWidth: number; zIndex?: number };
const polys = (n: ReactTestRenderer): PolyProps[] => (n.root as any).findAllByType(RNMaps!.Polyline).map((x: any) => x.props);
const markers = (n: ReactTestRenderer) => (n.root as any).findAllByType(RNMaps!.Marker);

const mounted: ReactTestRenderer[] = [];
function renderMap(extra: Record<string, unknown> = {}) {
  let node!: ReactTestRenderer;
  act(() => {
    node = TestRenderer.create(
      <TrackingMap layPoints={LAY} runPoints={RUN} currentPosition={LAY[4]} smartFollow follow {...extra} />,
    );
  });
  mounted.push(node);
  return node;
}

afterEach(() => { act(() => { mounted.splice(0).forEach(n => n.unmount()); }); });
beforeEach(() => { Object.values(mockMapApi).forEach(f => (f as jest.Mock).mockClear()); mockCamera.mockClear(); });

describe('TrackingMap — Referenz-Fährten', () => {
  it('rendert mehrere Referenz-Polylines; aktuelle Lay-Linie weiterhin solide Mint und darüber', () => {
    const p = polys(renderMap({ referenceOverlays: REFS }));
    const refs = p.filter(x => x.strokeColor === REFERENCE_TRACK_STROKE.strokeColor);
    expect(refs).toHaveLength(3);
    expect(refs.map(r => r.coordinates[0].latitude)).toEqual([47.01, 47.02, 47.03]);
    const current = p.filter(x => x.strokeColor === C.trackPrimary);
    expect(current).toHaveLength(1);
    expect(current[0].strokeWidth).toBe(4);
    expect(current[0].coordinates).toHaveLength(LAY.length);
    for (const r of refs) {
      expect(r.strokeWidth).toBeLessThan(current[0].strokeWidth);
      expect(r.zIndex!).toBeLessThan(current[0].zIndex!);
    }
    // Transparenz ~25–35 %, Token-basiert (C.trackWarning + Alpha).
    expect(REFERENCE_TRACK_STROKE.strokeColor.startsWith(C.trackWarning)).toBe(true);
    const alpha = parseInt(REFERENCE_TRACK_STROKE.strokeColor.slice(-2), 16) / 255;
    expect(alpha).toBeGreaterThanOrEqual(0.25);
    expect(alpha).toBeLessThanOrEqual(0.35);
  });

  it('runPoints/Lay unverändert gegenüber einer Karte ohne Referenzen', () => {
    const without = polys(renderMap()).filter(x => x.strokeColor !== REFERENCE_TRACK_STROKE.strokeColor);
    const withRefs = polys(renderMap({ referenceOverlays: REFS })).filter(x => x.strokeColor !== REFERENCE_TRACK_STROKE.strokeColor);
    expect(withRefs).toEqual(without);
    expect(withRefs.find(x => x.strokeColor === C.trackBlue)?.coordinates).toHaveLength(RUN.length);
  });

  it('nur ein Start-Label je Referenz — keine Winkel/Gegenstände anderer Fährten', () => {
    const base = markers(renderMap()).length;
    expect(markers(renderMap({ referenceOverlays: REFS })).length).toBe(base + REFS.length);
  });

  it('keine automatische Kameraänderung durch Referenz-Fährten', () => {
    renderMap();
    const callsWithout = Object.fromEntries(Object.entries(mockMapApi).map(([k, f]) => [k, (f as jest.Mock).mock.calls.length]));
    const camArgs = mockCamera.mock.calls[mockCamera.mock.calls.length - 1][0];
    Object.values(mockMapApi).forEach(f => (f as jest.Mock).mockClear()); mockCamera.mockClear();
    renderMap({ referenceOverlays: REFS });
    const callsWith = Object.fromEntries(Object.entries(mockMapApi).map(([k, f]) => [k, (f as jest.Mock).mock.calls.length]));
    expect(callsWith).toEqual(callsWithout);
    expect(mockMapApi.fitToCoordinates).not.toHaveBeenCalled();
    expect(mockCamera.mock.calls[mockCamera.mock.calls.length - 1][0]).toEqual(camArgs);
  });

  it('leere/abgeschaltete Referenzen → keine Referenz-Polylines', () => {
    expect(polys(renderMap({ referenceOverlays: [] })).filter(x => x.strokeColor === REFERENCE_TRACK_STROKE.strokeColor)).toHaveLength(0);
  });

  it('Recenter (ohne Smart Follow) und initiale Region ignorieren Referenz-Fährten', () => {
    const recenterCall = (extra: Record<string, unknown>) => {
      let node!: ReactTestRenderer;
      act(() => { node = TestRenderer.create(<TrackingMap layPoints={LAY} currentPosition={null} follow={false} {...extra} />); });
      mounted.push(node);
      const initialRegion = (node.root as any).findByType(RNMaps!.default).props.initialRegion;
      mockMapApi.animateToRegion.mockClear();
      const locate = (node.root as any).findAll((n: any) => n.props.icon === 'locate' && typeof n.props.onPress === 'function')[0];
      act(() => { locate.props.onPress(); });
      return { initialRegion, calls: mockMapApi.animateToRegion.mock.calls };
    };
    const without = recenterCall({});
    const withRefs = recenterCall({ referenceOverlays: REFS });
    expect(withRefs).toEqual(without);
    expect(withRefs.calls[0][0]).toMatchObject({ latitude: LAY[4].lat, longitude: LAY[4].lng });
  });
});
