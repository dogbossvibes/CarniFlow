jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { useTrackingStore, type MarkerSample } from '@/features/tracking/store/trackingStore';

const mk = (over: Partial<MarkerSample>): MarkerSample => ({
  id: `m-${Math.random().toString(36).slice(2)}`,
  type: 'winkel', material: null, angleKind: null,
  lat: 47.1, lng: 8.1, accuracy: 4, distance_from_start: 10,
  note: null, audio_url: null, found: false, t: Date.now(), ...over,
});

beforeEach(() => { useTrackingStore.getState().reset(); });

describe('GW/OW/BW — Persistenz & Recovery über den Store', () => {
  it('3+8) GW/OW/BW werden als winkel-Marker mit korrektem angleKind gespeichert', () => {
    const s = useTrackingStore.getState();
    s.addMarker(mk({ id: 'gw1', angleKind: 'gw' }));
    s.addMarker(mk({ id: 'ow1', angleKind: 'ow' }));
    s.addMarker(mk({ id: 'bw1', angleKind: 'bw' }));
    const byId = Object.fromEntries(useTrackingStore.getState().markers.map(m => [m.id, m]));
    expect(byId.gw1).toMatchObject({ type: 'winkel', angleKind: 'gw' });
    expect(byId.ow1.angleKind).toBe('ow');
    expect(byId.bw1.angleKind).toBe('bw');
  });

  it('12) mehrere unterschiedliche Winkel in einer Fährte bleiben erhalten (inkl. Abriss)', () => {
    const s = useTrackingStore.getState();
    ['gw', 'ow', 'bw', 'abriss', 'links'].forEach((ak, i) => s.addMarker(mk({ id: `a${i}`, angleKind: ak as MarkerSample['angleKind'] })));
    const kinds = useTrackingStore.getState().markers.map(m => m.angleKind).sort();
    expect(kinds).toEqual(['abriss', 'bw', 'gw', 'links', 'ow']);
  });

  it('13) Recovery (restorePending) erhält GW/OW/BW-Marker', () => {
    const markers = [mk({ id: 'gw', angleKind: 'gw' }), mk({ id: 'bw', angleKind: 'bw' })];
    useTrackingStore.getState().restorePending({
      sessionId: 's', dogId: 'd', trackPoints: [], markers, runPoints: [],
      distanceMeters: 0, durationSeconds: 0, layFinishedAt: 0, startAnchor: null, savedAt: 0, status: 'resting',
    });
    const kinds = useTrackingStore.getState().markers.map(m => m.angleKind).sort();
    expect(kinds).toEqual(['bw', 'gw']);
  });
});
