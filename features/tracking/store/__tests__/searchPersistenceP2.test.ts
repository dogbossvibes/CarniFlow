jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { useTrackingStore, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import { loadPending } from '@/features/tracking/store/trackPersist';

const pt = (lat: number, lng: number, t: number): TrackPointSample => ({ lat, lng, t, accuracy: 5 });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('P2 — Absuche-Persistenz & Recovery (Store)', () => {
  beforeEach(() => { useTrackingStore.getState().reset(); });
  afterEach(() => { useTrackingStore.getState().reset(); });

  it('1./3./4. searchPoints, status=searching, searchStartedAt & runId werden persistiert', async () => {
    const st = useTrackingStore.getState();
    st.startSearchSession(null, 1000);      // status 'searching' + searchStartedAt (persistNow)
    st.addSearchPoint(pt(47.0, 8.0, 1500));
    st.setSearchRunId('run1');              // persistNow → Snapshot inkl. Punkt
    await flush();

    const p = await loadPending();
    expect(p).not.toBeNull();
    expect(p!.status).toBe('searching');
    expect(p!.searchStartedAt).toBe(1000);
    expect(p!.runId).toBe('run1');
    expect(p!.searchPoints).toHaveLength(1);
    expect(p!.searchPoints![0]).toMatchObject({ lat: 47.0, lng: 8.0 });
  });

  it('5./2./7. App-Neustart lädt Suchpunkte; runId bleibt nach Recovery identisch', async () => {
    const st = useTrackingStore.getState();
    st.addTrackPoint(pt(47.1, 8.1, 500));   // gelegte Spur
    st.startSearchSession('runX', 2000);
    st.addSearchPoint(pt(47.0, 8.0, 2500));
    st.setSearchRunId('runX');
    await flush();

    const p = await loadPending();           // das liest die App beim Neustart
    // Prozess-Neustart simulieren: In-Memory-Store leeren (OHNE clearPending).
    useTrackingStore.setState({ trackPoints: [], searchTrackPoints: [], searchRunId: null, sessionStatus: 'laid', searchStartedAt: null });

    useTrackingStore.getState().restoreSearchSession(p!);
    const after = useTrackingStore.getState();
    expect(after.searchTrackPoints).toHaveLength(1);       // Suchpunkte geladen
    expect(after.trackPoints).toHaveLength(1);             // gelegte Spur ebenfalls
    expect(after.searchRunId).toBe('runX');                // KEINE neue runId
    expect(after.sessionStatus).toBe('searching');
    expect(after.searchStartedAt).toBe(2000);
  });

  it('10./11. resetSearchPoints (Verwerfen) löscht NUR die Suchspur; gelegte bleibt', () => {
    const st = useTrackingStore.getState();
    st.addTrackPoint(pt(47.1, 8.1, 100));
    st.startSearchSession(null, 300);
    st.addSearchPoint(pt(47.0, 8.0, 400));
    expect(useTrackingStore.getState().searchTrackPoints).toHaveLength(1);

    useTrackingStore.getState().resetSearchPoints();
    expect(useTrackingStore.getState().searchTrackPoints).toHaveLength(0);
    expect(useTrackingStore.getState().trackPoints).toHaveLength(1);   // gelegt unberührt
  });

  it('setSearchPoints (Recovery-Seed) setzt Suchspur exakt, gelegte bleibt', () => {
    const st = useTrackingStore.getState();
    st.addTrackPoint(pt(47.1, 8.1, 100));
    st.setSearchPoints([pt(47.0, 8.0, 200), pt(47.0, 8.001, 300)]);
    expect(useTrackingStore.getState().searchTrackPoints).toHaveLength(2);
    expect(useTrackingStore.getState().trackPoints).toHaveLength(1);
  });

  it('completed/cancelled Status wird gespeichert (kein Recovery-Trigger)', async () => {
    const st = useTrackingStore.getState();
    st.startSearchSession('r', 1);
    st.setSessionStatus('completed');
    await flush();
    expect((await loadPending())!.status).toBe('completed');
  });
});
