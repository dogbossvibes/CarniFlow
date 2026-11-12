/** Models an overlay host that accepts native polylines only after onMapReady. */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TrackingMap } from '../TrackingMap';
import { RNMaps } from '@/components/tracking/TrackMap';

const mockMapApi = { animateToRegion: jest.fn(), fitToCoordinates: jest.fn(), animateCamera: jest.fn(), setCamera: jest.fn(), getCamera: jest.fn(async () => ({})) };
let mockReady = false;
let mockInstalled = 0;
jest.mock('@/components/tracking/TrackMap', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const MapView = R.forwardRef((props: any, ref: any) => { R.useImperativeHandle(ref, () => mockMapApi); return R.createElement(View, { testID: 'fake-map' }, props.children); });
  const Polyline = () => { R.useEffect(() => { if (mockReady) mockInstalled++; }, []); return null; };
  const Marker = () => null;
  return { MAPS_AVAILABLE: true, RNMaps: { default: MapView, Polyline, Marker, PROVIDER_DEFAULT: 'default' } };
});
jest.mock('@/features/tracking/hooks/useSmartTrackCamera', () => ({ useSmartTrackCamera: () => ({ attachMap: jest.fn(), onUserGesture: jest.fn(), setMode: jest.fn(), recenter: jest.fn(), togglePitch: jest.fn(), mode: 'heading', paused: false, pitched: false }) }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn(), toast: null }) }));

const lay = Array.from({ length: 25 }, (_, i) => ({ lat: 47 + i * 0.00001, lng: 8 }));
let node: ReactTestRenderer;
beforeEach(() => { mockReady = false; mockInstalled = 0; });
afterEach(() => { act(() => node?.unmount()); });
it('installs the saved laid line when the full screen map becomes ready even without a search route', () => {
  act(() => { node = TestRenderer.create(<TrackingMap comparison layPoints={lay} runPoints={[]} currentPosition={null} follow={false} />); });
  expect(mockInstalled).toBe(0);
  act(() => { mockReady = true; node.root.findByType(RNMaps!.default).props.onMapReady(); });
  expect(mockInstalled).toBeGreaterThan(0);
  const rendered = (node.root as any).findAllByType(RNMaps!.Polyline);
  expect(rendered.some((x: any) => x.props.testID === 'track-comparison-lay' && x.props.coordinates.length === 25)).toBe(true);
});

it('installs both independent lines after readiness without bridging a real gap', () => {
  const broken = lay.map((p, i) => ({ ...p, ...(i === 12 ? { breakBefore: true } : {}) }));
  const run = lay.slice(0, 5).map(p => ({ ...p, lng: p.lng + 0.00001 }));
  act(() => { node = TestRenderer.create(<TrackingMap comparison layPoints={broken} runPoints={run} currentPosition={null} follow={false} />); });
  act(() => { mockReady = true; node.root.findByType(RNMaps!.default).props.onMapReady(); });
  const rendered = (node.root as any).findAllByType(RNMaps!.Polyline);
  const lines = rendered.filter((x: any) => x.props.testID === 'track-comparison-lay');
  const search = rendered.filter((x: any) => x.props.testID === 'track-comparison-run');
  expect(lines.map((x: any) => x.props.coordinates.length)).toEqual([12, 13]);
  expect(search[0].props.coordinates.length).toBe(5);
  expect(JSON.stringify(broken)).toContain('breakBefore');
});
