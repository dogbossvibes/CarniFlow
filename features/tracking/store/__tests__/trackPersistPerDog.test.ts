jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  writePendingNow, loadPending, clearPending, listPendingDogIds,
  loadMostRecentPending, type PendingTrack,
} from '@/features/tracking/store/trackPersist';

const LEGACY_KEY = 'anyvo_track_pending_v1';

const base = (over: Partial<PendingTrack> = {}): PendingTrack => ({
  sessionId: null, trackPoints: [], markers: [], runPoints: [],
  distanceMeters: 0, durationSeconds: 0, layFinishedAt: null, startAnchor: null,
  savedAt: 1000, status: 'resting', ...over,
});

beforeEach(async () => { await AsyncStorage.clear(); });

describe('Hundebasierter Puffer: getrennte Slots pro dog_id', () => {
  it('zwei Hunde überschreiben sich NICHT (eigene GPS-Route/Marker)', async () => {
    await writePendingNow('max',  base({ distanceMeters: 420, layStartedAt: 100, savedAt: 10 }));
    await writePendingNow('luna', base({ distanceMeters: 88,  layStartedAt: 200, savedAt: 20 }));

    const max  = await loadPending('max');
    const luna = await loadPending('luna');
    expect(max!.distanceMeters).toBe(420);
    expect(max!.dogId).toBe('max');
    expect(luna!.distanceMeters).toBe(88);
    expect(luna!.dogId).toBe('luna');
  });

  it('clearPending(dogId) entfernt NUR diesen Hund', async () => {
    await writePendingNow('max',  base());
    await writePendingNow('luna', base());
    await clearPending('max');
    expect(await loadPending('max')).toBeNull();
    expect(await loadPending('luna')).not.toBeNull();
  });

  it('listPendingDogIds listet alle offenen Hunde', async () => {
    await writePendingNow('max',  base());
    await writePendingNow('luna', base());
    expect((await listPendingDogIds()).sort()).toEqual(['luna', 'max']);
  });

  it('loadMostRecentPending liefert den jüngsten Slot', async () => {
    await writePendingNow('max',  base({ savedAt: 10, distanceMeters: 1 }));
    await writePendingNow('luna', base({ savedAt: 99, distanceMeters: 2 }));
    expect((await loadMostRecentPending())!.distanceMeters).toBe(2);
  });
});

describe('Legacy-Migration (alter Einzel-Slot → hundebasiert)', () => {
  it('adoptiert den Legacy-Slot für den angefragten Hund und leert ihn', async () => {
    await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(base({ distanceMeters: 333 })));   // altes Format, ohne dogId

    const p = await loadPending('max');
    expect(p!.distanceMeters).toBe(333);
    expect(p!.dogId).toBe('max');

    // Legacy-Slot ist jetzt migriert (leer), Hunde-Slot vorhanden.
    expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(await loadPending('max')).not.toBeNull();
  });

  it('adoptiert Legacy NICHT, wenn er bereits einem ANDEREN Hund gehört', async () => {
    await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(base({ dogId: 'luna', distanceMeters: 5 })));
    expect(await loadPending('max')).toBeNull();          // gehört Luna, nicht Max
    expect(await AsyncStorage.getItem(LEGACY_KEY)).not.toBeNull();   // bleibt erhalten
  });

  it('loadPending() ohne dogId liest weiterhin den Legacy-Slot (Rückwärtskompat)', async () => {
    await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(base({ distanceMeters: 7 })));
    const p = await loadPending();
    expect(p!.distanceMeters).toBe(7);
  });

  it('loadPending() ohne dogId fällt auf den jüngsten Hunde-Slot zurück, wenn kein Legacy', async () => {
    await writePendingNow('max', base({ savedAt: 50, distanceMeters: 9 }));
    const p = await loadPending();
    expect(p!.distanceMeters).toBe(9);
  });
});
