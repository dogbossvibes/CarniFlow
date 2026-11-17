// T-211: Store-Hochstufung normal → spitz betrifft genau einen Auto-Winkel.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { useTrackingStore, type MarkerSample } from '@/features/tracking/store/trackingStore';

const mk = (over: Partial<MarkerSample>): MarkerSample => ({
  id: 'm', type: 'winkel', material: null, angleKind: null, lat: 47.1, lng: 8.1, accuracy: 4, distance_from_start: 10,
  note: null, audio_url: null, found: false, t: 1000, ...over,
});

beforeEach(() => { useTrackingStore.getState().reset(); });

it('stuft genau den genannten normalen Winkel hoch und lässt alles andere unverändert', () => {
  const s = useTrackingStore.getState();
  s.addMarker(mk({ id: 'a', angleKind: 'links', note: 'x' }));
  s.addMarker(mk({ id: 'b', angleKind: 'links' }));
  s.addMarker(mk({ id: 'g', type: 'gegenstand', material: 'holz' }));
  const before = useTrackingStore.getState().markers;
  expect(s.upgradeAngleKind('a', 'spitz_links')).toBe(true);
  const after = useTrackingStore.getState().markers;
  expect(after).toHaveLength(3);
  expect(after[0]).toEqual({ ...before[0], angleKind: 'spitz_links' });
  expect(after[1]).toBe(before[1]);
  expect(after[2]).toBe(before[2]);
});

it('ändert nichts bei anderer Richtung, manuellen Winkeln, Nicht-Winkeln oder unbekannter ID', () => {
  const s = useTrackingStore.getState();
  s.addMarker(mk({ id: 'r', angleKind: 'rechts' }));
  s.addMarker(mk({ id: 'ow', angleKind: 'ow' }));
  s.addMarker(mk({ id: 'sp', angleKind: 'spitz_links' }));
  const before = useTrackingStore.getState().markers;
  expect(s.upgradeAngleKind('r', 'spitz_links')).toBe(false);
  expect(s.upgradeAngleKind('ow', 'spitz_links')).toBe(false);
  expect(s.upgradeAngleKind('sp', 'spitz_links')).toBe(false);
  expect(s.upgradeAngleKind('nix', 'spitz_rechts')).toBe(false);
  expect(s.upgradeAngleKind('r', 'links')).toBe(false);
  expect(useTrackingStore.getState().markers).toBe(before);
});
