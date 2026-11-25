import { applyRunResult, decideMantrailLayResume, resultOptions, trailerLineVisible, windCompass, windFromConditions } from '../session';
import { emptyMantrailData } from '../model';
import type { PendingTrack } from '@/features/tracking/store/trackPersist';

describe('Doppelblind', () => {
  it('Trailer-Spur nur ohne Doppelblind, nach «Ende» oder nach «Spur zeigen»', () => {
    expect(trailerLineVisible({ doubleBlind: false, revealedEarly: false, finished: false })).toBe(true);
    expect(trailerLineVisible({ doubleBlind: true, revealedEarly: false, finished: false })).toBe(false);
    expect(trailerLineVisible({ doubleBlind: true, revealedEarly: true, finished: false })).toBe(true);
    expect(trailerLineVisible({ doubleBlind: true, revealedEarly: false, finished: true })).toBe(true);
  });
});

describe('Ergebnis', () => {
  it('Negativtrail kennt nur korrekt negativ / falsch positiv / abgebrochen', () => {
    expect(resultOptions(true)).toEqual(['negative_correct', 'negative_false', 'aborted']);
    expect(resultOptions(false)).toEqual(['found', 'not_found', 'aborted']);
  });
  it('übernimmt Ergebnis und Anzeige; von Hand gesetztes Trail-Alter bleibt', () => {
    const base = { ...emptyMantrailData(), trailAgeMinutes: 90, trailAgeManual: true };
    expect(applyRunResult(base, { result: 'found', indication: '  Hinsetzen ', autoTrailAgeMinutes: 30, windRun: null }))
      .toMatchObject({ result: 'found', indication: 'Hinsetzen', trailAgeMinutes: 90 });
    expect(applyRunResult({ ...base, trailAgeManual: false }, { result: 'aborted', indication: '', autoTrailAgeMinutes: 30, windRun: null }))
      .toMatchObject({ result: 'aborted', indication: null, trailAgeMinutes: 30 });
  });
});

describe('Wind', () => {
  it('aus dem Wetterdienst, ohne Werte → null (Eingabe von Hand)', () => {
    expect(windFromConditions({ windSpeed: 12.34, windDir: 225 })).toEqual({ fromDeg: 225, speedKmh: 12.3, source: 'weather' });
    expect(windFromConditions({ windSpeed: null, windDir: null })).toBeNull();
    expect(windFromConditions(null)).toBeNull();
    expect(windCompass(225)).toBe('SW');
    expect(windCompass(359)).toBe('N');
    expect(windCompass(null)).toBeNull();
  });
});

describe('Trailer-Aufnahme fortsetzen', () => {
  const session = { type: 'mantrail', user_id: 'u1', dog_id: 'd1', status: 'active', ended_at: null, deleted_at: null, started_at: '2026-11-25T10:00:00.000Z' };
  const pending = (over: Partial<PendingTrack> = {}): PendingTrack => ({
    sessionId: 'm1', dogId: 'd1', status: 'laying', layFinishedAt: null, startAnchor: null, savedAt: 1, markers: [], runPoints: [],
    trackPoints: [{ lat: 47, lng: 8, t: 1000 }, { lat: 47.001, lng: 8.001, t: 2000 }] as PendingTrack['trackPoints'],
    distanceMeters: 130, durationSeconds: 60, ...over,
  });
  const decide = (over: Partial<Parameters<typeof decideMantrailLayResume>[0]> = {}) => decideMantrailLayResume({
    sessionId: 'm1', dogId: 'd1', userId: 'u1', session, pending: pending(), registrySessionId: 'm1', ...over,
  });

  it('eigene offene Mantrail-Aufnahme → Puffer mit Sitzungs-ID, pausiert', () => {
    expect(decide()).toMatchObject({ sessionId: 'm1', dogId: 'd1', paused: true, distanceMeters: 130 });
    expect(decide({ pending: pending({ sessionId: null }) })).toMatchObject({ sessionId: 'm1' });   // frischer Puffer über Registry
  });
  it('nie eine IGP-Fährte, fremde Person, anderer Hund, beendete oder gelöschte Sitzung', () => {
    expect(decide({ session: { ...session, type: 'track' } })).toBeNull();
    expect(decide({ userId: 'u2' })).toBeNull();
    expect(decide({ dogId: 'd2' })).toBeNull();
    expect(decide({ session: { ...session, status: 'completed' } })).toBeNull();
    expect(decide({ session: { ...session, ended_at: '2026-11-25T11:00:00.000Z' } })).toBeNull();
    expect(decide({ session: { ...session, deleted_at: 'x' } })).toBeNull();
  });
  it('nur Puffer im Zustand «laying» mit gültiger Spur', () => {
    expect(decide({ pending: pending({ status: 'resting' }) })).toBeNull();
    expect(decide({ pending: pending({ layFinishedAt: 5 }) })).toBeNull();
    expect(decide({ pending: pending({ trackPoints: [] }) })).toBeNull();
    expect(decide({ pending: pending({ sessionId: 'other' }) })).toBeNull();
    expect(decide({ pending: pending({ sessionId: null }), registrySessionId: 'other' })).toBeNull();
    expect(decide({ pending: null })).toBeNull();
  });
});
