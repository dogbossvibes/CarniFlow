import { restingElapsedSeconds, isRestingRecovery, restingStartMs } from '@/features/tracking/store/restingTime';
import type { PendingTrack } from '@/features/tracking/store/trackPersist';

const base: PendingTrack = {
  sessionId: 'sess1', trackPoints: [], markers: [], runPoints: [],
  distanceMeters: 0, durationSeconds: 0, layFinishedAt: 5000, startAnchor: null, savedAt: 0,
};

describe('restingElapsedSeconds (P3 — zeitstempelbasiert)', () => {
  it('5./7. Restzeit aus Zeitstempeln (now − start)', () => {
    expect(restingElapsedSeconds(1000, 1000 + 65_000)).toBe(65);   // 65 s
  });
  it('6. Hintergrund verändert die Berechnung nicht (fester Start, neues now)', () => {
    const start = 10_000;
    expect(restingElapsedSeconds(start, 10_000 + 30_000)).toBe(30);
    expect(restingElapsedSeconds(start, 10_000 + 120_000)).toBe(120);   // nach 2 Min Rückkehr korrekt
  });
  it('9. nie negativ (Start in der Zukunft / Uhr-Rücksprung → 0)', () => {
    expect(restingElapsedSeconds(2000, 1000)).toBe(0);
  });
  it('kein Start → 0', () => expect(restingElapsedSeconds(null, 9999)).toBe(0));
});

describe('isRestingRecovery / restingStartMs (P3)', () => {
  it('8. status=resting → Recovery', () => expect(isRestingRecovery({ ...base, status: 'resting' })).toBe(true));
  it('completed → keine Recovery', () => expect(isRestingRecovery({ ...base, status: 'completed' })).toBe(false));
  it('null / Legacy ohne status → keine Recovery', () => {
    expect(isRestingRecovery(null)).toBe(false);
    expect(isRestingRecovery(base)).toBe(false);
  });
  it('restingStartMs bevorzugt layStartedAt, Fallback layFinishedAt', () => {
    expect(restingStartMs({ ...base, layStartedAt: 7000 })).toBe(7000);
    expect(restingStartMs(base)).toBe(5000);   // Fallback
    expect(restingStartMs(null)).toBeNull();
  });
});
