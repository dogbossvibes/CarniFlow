import { decideRecovery, dedupeSearchPoints, pathDistanceM } from '@/features/tracking/store/searchRecovery';
import type { PendingTrack } from '@/features/tracking/store/trackPersist';
import type { TrackPointSample } from '@/features/tracking/store/trackingStore';

const base: PendingTrack = {
  sessionId: 'sess1', trackPoints: [], markers: [], runPoints: [],
  distanceMeters: 0, durationSeconds: 0, layFinishedAt: null, startAnchor: null, savedAt: 0,
};
const pt = (lat: number, lng: number, t: number): TrackPointSample => ({ lat, lng, t, accuracy: 5 });

describe('decideRecovery (P2)', () => {
  it('null → fresh', () => expect(decideRecovery(null).kind).toBe('fresh'));

  it('status=searching → recovery', () => {
    const d = decideRecovery({ ...base, status: 'searching' });
    expect(d.kind).toBe('recovery');
    if (d.kind === 'recovery') expect(d.pending.sessionId).toBe('sess1');
  });

  it('12. completed → NICHT als laufend wiederhergestellt (fresh)', () => {
    expect(decideRecovery({ ...base, status: 'completed' }).kind).toBe('fresh');
  });

  it('13. cancelled → wird NICHT fortgesetzt (fresh)', () => {
    expect(decideRecovery({ ...base, status: 'cancelled' }).kind).toBe('fresh');
  });

  it('Legacy-Snapshot ohne status → fresh (sicher lesbar)', () => {
    expect(decideRecovery(base).kind).toBe('fresh');
  });
});

describe('dedupeSearchPoints (P2 Duplikatsschutz)', () => {
  it('8. entfernt doppelte Punkte (Timestamp+Koordinaten)', () => {
    const pts = [pt(47.0, 8.0, 1000), pt(47.0, 8.0, 1000), pt(47.001, 8.001, 2000)];
    expect(dedupeSearchPoints(pts)).toHaveLength(2);
  });
  it('behält Reihenfolge, unterscheidet verschiedene Timestamps', () => {
    const pts = [pt(47.0, 8.0, 1000), pt(47.0, 8.0, 1001)];
    expect(dedupeSearchPoints(pts)).toHaveLength(2);
  });
});

describe('pathDistanceM', () => {
  it('0 bei < 2 Punkten', () => expect(pathDistanceM([{ lat: 47, lng: 8 }])).toBe(0));
  it('~111 m für 0.001° Breitenschritt', () => {
    const d = pathDistanceM([{ lat: 47.0, lng: 8.0 }, { lat: 47.001, lng: 8.0 }]);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });
});
