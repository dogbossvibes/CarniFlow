// „Absuche verwerfen" im Store: nur der Suchversuch wird zurückgenommen, die gelegte Fährte bleibt.
// jest.mock wird von babel-jest über die Imports gehoben.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { loadPending } from '@/features/tracking/store/trackPersist';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

beforeEach(async () => { await AsyncStorage.clear(); useTrackingStore.setState(useTrackingStore.getInitialState(), true); });

describe('trackingStore.clearSearchSession', () => {
  it('Such-Felder zurück, Status resting; Lay-Punkte, Marker, Session, Hund und Liegezeit-Basis bleiben', async () => {
    const lay = [{ lat: 47, lng: 8, t: 1 }, { lat: 47.001, lng: 8.001, t: 2 }];
    const marker = { id: 'mk-1', type: 'winkel' as const, material: null, angleKind: null, lat: 47, lng: 8, accuracy: 4, distance_from_start: 30, note: null, audio_url: null, found: false, t: 3 };
    useTrackingStore.setState({
      currentSessionId: 'sess-A', dogId: 'dog-A', trackPoints: lay, markers: [marker], distanceMeters: 123,
      layStartedAt: 1000, layFinishedAt: 1000, sessionStatus: 'searching', isPaused: true,
      searchRunId: 'run-1', searchStartedAt: 5000, searchUpdatedAt: 6000, searchTrackPoints: [{ lat: 1, lng: 1, t: 9 }],
    });
    useTrackingStore.getState().clearSearchSession();
    const st = useTrackingStore.getState();
    expect(st).toMatchObject({
      sessionStatus: 'resting', isPaused: false, searchRunId: null, searchStartedAt: null, searchUpdatedAt: null, searchTrackPoints: [],
      currentSessionId: 'sess-A', dogId: 'dog-A', distanceMeters: 123, layStartedAt: 1000, layFinishedAt: 1000,
    });
    expect(st.trackPoints).toEqual(lay);
    expect(st.markers).toEqual([marker]);
    await new Promise(r => setTimeout(r, 0));
    expect(await loadPending('dog-A')).toMatchObject({ sessionId: 'sess-A', status: 'resting', runId: null, searchStartedAt: null });
  });
});
