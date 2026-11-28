jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { useTrackingStore, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import { loadPending, type PendingTrack } from '@/features/tracking/store/trackPersist';
import { resolveSearchStartedAt } from '@/features/tracking/store/searchRecovery';

// Regression: Nach einem App-Neustart während der Absuche begann die Suchdauer
// wieder bei 00:00, weil die Startzeit beim Wiederherstellen verloren ging.

const pt = (lat: number, lng: number, t: number): TrackPointSample => ({ lat, lng, t, accuracy: 5 });
const flush = () => new Promise((r) => setTimeout(r, 0));
const DOG = 'dog-1';

describe('Absuche: Startzeit überlebt Neustart/Rehydrierung', () => {
  beforeEach(() => { useTrackingStore.getState().reset(); });
  afterEach(() => { useTrackingStore.getState().reset(); });

  it('restorePending (Puffer status=searching) behält Startzeit, Suchpunkte und runId — auch nach weiterem Snapshot', async () => {
    const st = useTrackingStore.getState();
    st.setDogId(DOG);
    st.addTrackPoint(pt(47.1, 8.1, 500));
    st.startSearchSession('run-1', 10_000);
    st.addSearchPoint(pt(47.0, 8.0, 12_000));
    st.setSearchRunId('run-1');
    await flush();
    const pending = await loadPending(DOG);
    expect(pending!.searchStartedAt).toBe(10_000);

    // Prozess-Neustart: leerer In-Memory-Store, Puffer bleibt.
    useTrackingStore.setState({ trackPoints: [], searchTrackPoints: [], searchRunId: null, searchStartedAt: null, sessionStatus: 'laid' });
    useTrackingStore.getState().restorePending(pending!);
    const after = useTrackingStore.getState();
    expect(after.sessionStatus).toBe('searching');
    expect(after.searchStartedAt).toBe(10_000);
    expect(after.searchRunId).toBe('run-1');
    expect(after.searchTrackPoints).toHaveLength(1);

    // Ein weiterer Snapshot darf den Puffer nicht mit null/leer überschreiben.
    useTrackingStore.getState().setSessionStatus('searching');
    await flush();
    const again = await loadPending(DOG);
    expect(again!.searchStartedAt).toBe(10_000);
    expect(again!.runId).toBe('run-1');
    expect(again!.searchPoints).toHaveLength(1);
    expect(again!.trackPoints).toHaveLength(1);
  });

  it('restorePending mit Altformat (ohne Such-Felder) bleibt lesbar und setzt leere Such-Metadaten', () => {
    const legacy: PendingTrack = {
      sessionId: 's-old', dogId: DOG, trackPoints: [pt(47.1, 8.1, 1), pt(47.1, 8.2, 2)], markers: [], runPoints: [],
      distanceMeters: 10, durationSeconds: 60, layFinishedAt: 3, startAnchor: null, savedAt: 4,
    };
    useTrackingStore.getState().restorePending(legacy);
    const st = useTrackingStore.getState();
    expect(st.trackPoints).toHaveLength(2);
    expect(st.sessionStatus).toBe('resting');
    expect(st.searchStartedAt).toBeNull();
    expect(st.searchRunId).toBeNull();
    expect(st.searchTrackPoints).toEqual([]);
  });

  it('setSearchStartedAt sichert eine abgeleitete Startzeit sofort im Puffer, ohne Punkte zu ändern', async () => {
    const st = useTrackingStore.getState();
    st.setDogId(DOG);
    st.startSearchSession('run-2', 20_000);
    st.addSearchPoint(pt(47.0, 8.0, 21_000));
    useTrackingStore.setState({ searchStartedAt: null });   // Altformat-Zustand
    useTrackingStore.getState().setSearchStartedAt(19_500);
    await flush();
    const p = await loadPending(DOG);
    expect(p!.searchStartedAt).toBe(19_500);
    expect(p!.searchPoints).toHaveLength(1);
  });
});

describe('resolveSearchStartedAt', () => {
  const now = 1_000_000;

  it('nimmt die gespeicherte Startzeit des Puffers', () => {
    expect(resolveSearchStartedAt({ pendingStartedAt: 900_000, registryStartedAt: 800_000, pointTimesMs: [950_000], now })).toBe(900_000);
  });

  it('Altformat ohne Startzeit: Registry desselben Laufs', () => {
    expect(resolveSearchStartedAt({ pendingStartedAt: null, registryStartedAt: 800_000, pointTimesMs: [950_000], now })).toBe(800_000);
  });

  it('Altformat ohne Startzeit und Registry: frühester Suchpunkt', () => {
    expect(resolveSearchStartedAt({ pointTimesMs: [960_000, 940_000, 990_000], now })).toBe(940_000);
  });

  it('ohne verwertbare Daten: jetzt (wie bisher)', () => {
    expect(resolveSearchStartedAt({ now })).toBe(now);
    expect(resolveSearchStartedAt({ pendingStartedAt: undefined, pointTimesMs: [], now })).toBe(now);
  });

  it('ungültige Werte (NaN, 0, Zukunft) werden übersprungen', () => {
    expect(resolveSearchStartedAt({ pendingStartedAt: NaN, registryStartedAt: now + 5_000, pointTimesMs: [0, 970_000], now })).toBe(970_000);
  });
});
