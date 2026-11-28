// TrackingMap + Offline-Karten: ohne gespeicherte Gebiete keine neue Ebene (Karte wie bisher);
// mit Gebiet liegt die Offline-Ebene als ERSTES Kind unter allen Linien, online unsichtbar,
// lädt nie selbst aus dem Netz, offline sichtbar mit Namensnennung.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///doc/' }));

let mockOnline = true;
const mockListeners: ((s: { online: boolean; type: null }) => void)[] = [];
jest.mock('@/features/sync/services/netinfo', () => ({
  fetchIsOnline: async () => mockOnline,
  addNetListener: (cb: (s: { online: boolean; type: null }) => void) => { mockListeners.push(cb); return () => undefined; },
}));
let mockRegions: unknown[] | null = null;
jest.mock('@/features/offline-maps/regions', () => ({
  cachedOfflineRegions: () => mockRegions,
  loadOfflineRegions: async () => mockRegions ?? [],
}));

const mockMapApi = { animateToRegion: jest.fn(), fitToCoordinates: jest.fn(), animateCamera: jest.fn(), setCamera: jest.fn(), getCamera: jest.fn(async () => ({})) };
jest.mock('@/components/tracking/TrackMap', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const R = require('react');
  const { View: V } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const MapView = R.forwardRef((p: any, ref: any) => {
    R.useImperativeHandle(ref, () => mockMapApi);
    return R.createElement(V, { testID: 'map' }, p.children);
  });
  const Polyline = (_p: any) => null;
  const Marker = (p: any) => R.createElement(V, { testID: 'marker' }, p.children);
  const UrlTile = (_p: any) => null;
  return { MAPS_AVAILABLE: true, RNMaps: { default: MapView, Polyline, Marker, UrlTile, PROVIDER_DEFAULT: 'default' } };
});
jest.mock('@/features/tracking/hooks/useSmartTrackCamera', () => ({
  useSmartTrackCamera: () => ({ attachMap: jest.fn(), onUserGesture: jest.fn(), setMode: jest.fn(), recenter: jest.fn(), togglePitch: jest.fn(), mode: 'heading', paused: false, pitched: false }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn(), toast: null }) }));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import { TrackingMap } from '@/features/tracking/components/TrackingMap';
import { RNMaps } from '@/components/tracking/TrackMap';
import { OfflineTileLayers } from '@/features/offline-maps/OfflineTileLayer';
/* eslint-enable import/first */

const LAY = Array.from({ length: 5 }, (_, i) => ({ lat: 50.1 + i * 1e-4, lng: 8.68 }));
const REGION = {
  id: 'r1', name: 'Gebiet 1', sourceId: 'basemap-de', bounds: { north: 50.11, south: 50.09, east: 8.7, west: 8.66 },
  minZoom: 12, maxZoom: 17, tileCount: 100, downloadedTiles: 100, bytes: 1000, status: 'complete',
  createdAt: '2026-11-28T10:00:00.000Z', updatedAt: '2026-11-28T10:00:00.000Z',
};

const mounted: ReactTestRenderer[] = [];
async function renderMap() {
  let node!: ReactTestRenderer;
  await act(async () => { node = TestRenderer.create(<TrackingMap layPoints={LAY} currentPosition={LAY[4]} follow />); });
  mounted.push(node);
  return node;
}
const tiles = (n: ReactTestRenderer) => (n.root as any).findAllByType((RNMaps as any).UrlTile);
const text = (n: ReactTestRenderer) => JSON.stringify(n.toJSON());

afterEach(() => { act(() => { mounted.splice(0).forEach(n => n.unmount()); }); mockListeners.length = 0; mockOnline = true; mockRegions = null; });

describe('TrackingMap — Offline-Karten', () => {
  it('ohne Offline-Gebiet: keine zusätzliche Ebene', async () => {
    mockRegions = [];
    expect(tiles(await renderMap())).toHaveLength(0);
  });

  it('mit Gebiet: erste Ebene, nie Netzabruf, online unsichtbar', async () => {
    mockRegions = [REGION];
    const n = await renderMap();
    const [tile] = tiles(n);
    expect(tile.props).toMatchObject({ offlineMode: true, opacity: 0, tileCachePath: 'file:///doc/offline-tiles/basemap-de' });
    const map = (n.root as any).findByProps({ testID: 'map' });
    const firstChild = React.Children.toArray(map.props.children).find(Boolean) as React.ReactElement;
    expect(firstChild.type).toBe(OfflineTileLayers);
    expect(text(n)).not.toContain('GeoBasis-DE');
  });

  it('ohne Netz: sichtbar und mit Namensnennung', async () => {
    mockRegions = [REGION];
    mockOnline = false;
    const n = await renderMap();
    expect(tiles(n)[0].props.opacity).toBe(1);
    expect(text(n)).toContain('© GeoBasis-DE / BKG (2026) CC BY 4.0');
    await act(async () => { mockListeners.forEach(l => l({ online: true, type: null })); });
    expect(tiles(n)[0].props.opacity).toBe(0);
  });
});
