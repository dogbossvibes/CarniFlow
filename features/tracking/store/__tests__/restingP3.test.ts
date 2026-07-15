jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { useTrackingStore, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import { loadPending, type PendingTrack } from '@/features/tracking/store/trackPersist';

const pt = (lat: number, lng: number, t: number): TrackPointSample => ({ lat, lng, t, accuracy: 5 });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('P3 — Liegezeit-Übergang & Recovery (Store)', () => {
  beforeEach(() => { useTrackingStore.getState().reset(); });
  afterEach(() => { useTrackingStore.getState().reset(); });

  it('1. setLayFinishedAt setzt status=resting', () => {
    useTrackingStore.getState().setLayFinishedAt(1000);
    expect(useTrackingStore.getState().sessionStatus).toBe('resting');
    expect(useTrackingStore.getState().layStartedAt).toBe(1000);
    expect(useTrackingStore.getState().layUpdatedAt).toBe(1000);
  });

  it('2./4. layStartedAt wird SOFORT (ohne Debounce) persistiert', async () => {
    useTrackingStore.getState().addTrackPoint(pt(47.1, 8.1, 500));   // gelegte Fährte
    useTrackingStore.getState().setLayFinishedAt(2000);
    await flush();   // nur ein Microtask — kein 4-s-Debounce
    const p = await loadPending();
    expect(p).not.toBeNull();
    expect(p!.status).toBe('resting');
    expect(p!.layStartedAt).toBe(2000);
    expect(p!.trackPoints).toHaveLength(1);   // gelegte Fährte mitgesichert
  });

  it('8./10. App-Neustart stellt resting wieder her — KEINE neue sessionId', async () => {
    const st = useTrackingStore.getState();
    st.startRecording('sess-xyz');           // setzt currentSessionId
    st.addTrackPoint(pt(47.2, 8.2, 100));
    st.setLayFinishedAt(3000);
    await flush();
    const p = await loadPending();

    // Prozess-Neustart simulieren: In-Memory-Store leeren (ohne clearPending).
    useTrackingStore.setState({ trackPoints: [], layStartedAt: null, sessionStatus: 'laid', currentSessionId: null });
    useTrackingStore.getState().restorePending(p as PendingTrack);

    const after = useTrackingStore.getState();
    expect(after.sessionStatus).toBe('resting');       // resting wiederhergestellt
    expect(after.layStartedAt).toBe(3000);             // Startzeit geladen
    expect(after.currentSessionId).toBe('sess-xyz');   // KEINE neue sessionId
    expect(after.trackPoints).toHaveLength(1);
  });

  it('18. Abbruch (cancelled) löscht die gelegte Spur NICHT aus dem Store', () => {
    const st = useTrackingStore.getState();
    st.addTrackPoint(pt(47.3, 8.3, 10));
    st.setLayFinishedAt(500);
    st.setSessionStatus('cancelled');
    expect(useTrackingStore.getState().sessionStatus).toBe('cancelled');
    expect(useTrackingStore.getState().trackPoints).toHaveLength(1);   // gelegte Spur bleibt
  });

  it('resting-Snapshot bleibt bei erneutem Öffnen resting (kein completed/laid)', async () => {
    useTrackingStore.getState().setLayFinishedAt(1234);
    await flush();
    expect((await loadPending())!.status).toBe('resting');
  });
});
