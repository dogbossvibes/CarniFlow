jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { useTrackingStore, type MarkerSample } from '@/features/tracking/store/trackingStore';

// Baustein für einen Marker (wie commitMarker im Recorder ihn erzeugt).
const mk = (over: Partial<MarkerSample>): MarkerSample => ({
  id: `m-${Math.random().toString(36).slice(2)}`,
  type: 'winkel', material: null, angleKind: null,
  lat: 47.1, lng: 8.1, accuracy: 4, distance_from_start: 10,
  note: null, audio_url: null, found: false, t: Date.now(), ...over,
});

// Datenfilter, den der Kartenrenderer (TrackingMap) auf die Marker anwendet.
const forMap = (ms: MarkerSample[]) => ms.filter(m => m.lat != null && m.lng != null);

beforeEach(() => { useTrackingStore.getState().reset(); });

describe('Abriss-Marker — Datenfluss in den bestehenden Tracking-Store', () => {
  it('1+2+3) Abriss erzeugt einen Winkel-Marker mit gültigen Koordinaten im Store', () => {
    useTrackingStore.getState().addMarker(mk({ type: 'winkel', angleKind: 'abriss', lat: 47.5, lng: 8.7 }));
    const { markers } = useTrackingStore.getState();
    expect(markers).toHaveLength(1);
    expect(markers[0].type).toBe('winkel');
    expect(markers[0].angleKind).toBe('abriss');
    expect(markers[0].lat).toBe(47.5);
    expect(markers[0].lng).toBe(8.7);
  });

  it('4) Abriss ist in den Daten für den Kartenrenderer enthalten', () => {
    useTrackingStore.getState().addMarker(mk({ angleKind: 'abriss' }));
    const mapData = forMap(useTrackingStore.getState().markers);
    expect(mapData.some(m => m.type === 'winkel' && m.angleKind === 'abriss')).toBe(true);
  });

  it('5) zwei Abrisse bleiben gleichzeitig erhalten (Abriss 1 verschwindet nicht)', () => {
    const s = useTrackingStore.getState();
    s.addMarker(mk({ id: 'a1', angleKind: 'abriss', lat: 47.10, lng: 8.10 }));
    s.addMarker(mk({ id: 'a2', angleKind: 'abriss', lat: 47.11, lng: 8.11 }));
    const abrisse = useTrackingStore.getState().markers.filter(m => m.angleKind === 'abriss');
    expect(abrisse.map(m => m.id).sort()).toEqual(['a1', 'a2']);
  });

  it('6+10) fremde Marker (Gegenstand, Winkel links, Spitzwinkel) bleiben unverändert', () => {
    const s = useTrackingStore.getState();
    s.addMarker(mk({ id: 'g1', type: 'gegenstand', material: 'holz' }));
    s.addMarker(mk({ id: 'w1', type: 'winkel', angleKind: 'links' }));
    s.addMarker(mk({ id: 'ab', type: 'winkel', angleKind: 'abriss' }));
    s.addMarker(mk({ id: 'sp', type: 'winkel', angleKind: 'spitz_rechts' }));
    const byId = Object.fromEntries(useTrackingStore.getState().markers.map(m => [m.id, m]));
    expect(byId.g1.type).toBe('gegenstand');
    expect(byId.g1.material).toBe('holz');
    expect(byId.w1.angleKind).toBe('links');
    expect(byId.sp.angleKind).toBe('spitz_rechts');
    expect(byId.ab.angleKind).toBe('abriss');
    expect(useTrackingStore.getState().markers).toHaveLength(4);
  });

  it('8) koordinatenloser Abriss (keine valide GPS-Position) erscheint NICHT im Renderer-Datensatz', () => {
    useTrackingStore.getState().addMarker(mk({ id: 'bad', angleKind: 'abriss', lat: null, lng: null }));
    const mapData = forMap(useTrackingStore.getState().markers);
    expect(mapData.find(m => m.id === 'bad')).toBeUndefined();
  });
});
