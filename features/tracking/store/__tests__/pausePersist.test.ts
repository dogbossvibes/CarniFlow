jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { upsertEntry, hasActiveFaehrte, type ActiveFaehrtenMap } from '@/features/tracking/store/activeFaehrtenModel';
import type { PendingTrack } from '@/features/tracking/store/trackPersist';

function pending(over: Partial<PendingTrack>): PendingTrack {
  return {
    sessionId: 's1', dogId: 'd1', trackPoints: [], markers: [], runPoints: [],
    distanceMeters: 0, durationSeconds: 0, layFinishedAt: null, startAnchor: null, savedAt: 0,
    ...over,
  };
}

describe('Pause-Persistenz über App-Neustart (Store-Restore)', () => {
  beforeEach(() => { useTrackingStore.getState().reset(); });

  it('paused → restart → restorePending → weiterhin paused (kein Auto-Recording)', () => {
    useTrackingStore.getState().restorePending(pending({
      status: 'laying', paused: true, distanceMeters: 42,
      trackPoints: [{ lat: 1, lng: 1, t: 1 } as any], markers: [{ id: 'm1', type: 'winkel' } as any],
    }));
    const st = useTrackingStore.getState();
    expect(st.isPaused).toBe(true);
    expect(st.isRecording).toBe(false);      // Restore setzt NICHT auf Aufnahme
    expect(st.distanceMeters).toBe(42);      // Daten erhalten
    expect(st.trackPoints).toHaveLength(1);  // Punkte erhalten
    expect(st.markers).toHaveLength(1);      // Winkel/Marker erhalten
    expect(st.currentSessionId).toBe('s1');  // Session-ID identisch
  });

  it('recording (nicht pausiert) → restorePending → isPaused=false', () => {
    useTrackingStore.getState().restorePending(pending({ status: 'laying', paused: false }));
    expect(useTrackingStore.getState().isPaused).toBe(false);
  });

  it('Legacy-Snapshot ohne paused-Feld → isPaused=false', () => {
    useTrackingStore.getState().restorePending(pending({ status: 'resting' }));
    expect(useTrackingStore.getState().isPaused).toBe(false);
  });

  it('restoreSearchSession mit paused=true → pausiert', () => {
    useTrackingStore.getState().restoreSearchSession(pending({ status: 'searching', paused: true }));
    expect(useTrackingStore.getState().isPaused).toBe(true);
  });

  it('explizites pause → resume schaltet isPaused korrekt', () => {
    useTrackingStore.getState().pauseRecording();
    expect(useTrackingStore.getState().isPaused).toBe(true);
    useTrackingStore.getState().resumeRecording();
    expect(useTrackingStore.getState().isPaused).toBe(false);
  });
});

describe('Registry: paused-Feld', () => {
  it('upsertEntry setzt paused; Status laying bleibt offen', () => {
    let map: ActiveFaehrtenMap = upsertEntry({}, 'd1', { status: 'laying', paused: true });
    expect(map.d1.paused).toBe(true);
    expect(hasActiveFaehrte(map, 'd1')).toBe(true);
  });

  it('Merge ohne paused → vorheriger Wert bleibt; explizit false überschreibt', () => {
    let map: ActiveFaehrtenMap = upsertEntry({}, 'd1', { status: 'laying', paused: true });
    map = upsertEntry(map, 'd1', { distanceMeters: 99 });
    expect(map.d1.paused).toBe(true);
    map = upsertEntry(map, 'd1', { paused: false });
    expect(map.d1.paused).toBe(false);
  });

  it('finalized (completed) entfernt den Eintrag', () => {
    let map: ActiveFaehrtenMap = upsertEntry({}, 'd1', { status: 'laying', paused: true });
    map = upsertEntry(map, 'd1', { status: 'completed' });
    expect(map.d1).toBeUndefined();
  });
});
