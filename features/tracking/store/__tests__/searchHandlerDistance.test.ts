jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import type { PendingTrack } from '@/features/tracking/store/trackPersist';

const basePending = (over: Partial<PendingTrack> = {}): PendingTrack => ({
  sessionId: 's1', dogId: 'd1', trackPoints: [], markers: [], runPoints: [],
  distanceMeters: 0, durationSeconds: 0, layFinishedAt: 0, startAnchor: null, savedAt: 0, ...over,
});

beforeEach(() => { useTrackingStore.getState().reset(); });

describe('searchHandlerDistanceM — State & Recovery', () => {
  it('Default nach reset = 5 m', () => {
    expect(useTrackingStore.getState().searchHandlerDistanceM).toBe(5);
  });

  it('setSearchHandlerDistanceM setzt den Wert', () => {
    useTrackingStore.getState().setSearchHandlerDistanceM(10);
    expect(useTrackingStore.getState().searchHandlerDistanceM).toBe(10);
  });

  it('setSearchHandlerDistanceM akzeptiert 1 m (vollwertig)', () => {
    useTrackingStore.getState().setSearchHandlerDistanceM(1);
    expect(useTrackingStore.getState().searchHandlerDistanceM).toBe(1);
  });

  it('Recovery (restorePending) mit 1 m → 1 m wiederhergestellt', () => {
    useTrackingStore.getState().restorePending(basePending({ searchHandlerDistanceM: 1, status: 'resting' }));
    expect(useTrackingStore.getState().searchHandlerDistanceM).toBe(1);
  });

  it('15) Recovery (restorePending) mit 10 m → 10 m wiederhergestellt', () => {
    useTrackingStore.getState().restorePending(basePending({ searchHandlerDistanceM: 10, status: 'resting' }));
    expect(useTrackingStore.getState().searchHandlerDistanceM).toBe(10);
  });

  it('16) ältere Session ohne Feld → 5 m Fallback', () => {
    useTrackingStore.getState().restorePending(basePending({ status: 'resting' }));
    expect(useTrackingStore.getState().searchHandlerDistanceM).toBe(5);
  });

  it('restoreSearchSession übernimmt/fällt auf 5 zurück', () => {
    useTrackingStore.getState().restoreSearchSession(basePending({ searchHandlerDistanceM: 10, status: 'searching' }));
    expect(useTrackingStore.getState().searchHandlerDistanceM).toBe(10);
    useTrackingStore.getState().reset();
    useTrackingStore.getState().restoreSearchSession(basePending({ status: 'searching' }));
    expect(useTrackingStore.getState().searchHandlerDistanceM).toBe(5);
  });
});
