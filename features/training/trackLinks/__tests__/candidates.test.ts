import type { TrackHistoryRow } from '@/features/tracking/utils/trackHistoryMerge';
import { localDay, preselectedTracks, trackCandidates, trackDay } from '../candidates';

const row = (over: Partial<TrackHistoryRow>): TrackHistoryRow => ({
  id: 'x', dog_id: 'luna', status: 'completed', session_date: '2026-11-16', created_at: '2026-11-16T08:00:00.000Z',
  started_at: '2026-11-16T08:12:00.000Z', surface_types: null, distance_meters: 420, corners_total: 4, articles_total: 3,
  lying_time_minutes: 35, score: null, rating: null, track_data: { points: [{ lat: 47.1, lng: 8.5 }] },
  syncState: 'synced', isLocalOnly: false, ...over,
});

describe('Fährten des Tages', () => {
  const rows = [
    row({ id: 'late', started_at: '2026-11-16T14:40:00.000Z', distance_meters: 610, corners_total: 6, lying_time_minutes: 60 }),
    row({ id: 'early' }),
    row({ id: 'balu', dog_id: 'balu' }),
    row({ id: 'yesterday', session_date: '2026-11-15', started_at: '2026-11-15T09:00:00.000Z' }),
  ];

  it('zeigt nur Fährten dieses Hundes an diesem Tag, nach Uhrzeit sortiert', () => {
    const list = trackCandidates(rows, { dogId: 'luna', day: '2026-11-16' });
    expect(list.map(c => c.sessionId)).toEqual(['early', 'late']);
    expect(list[0]).toMatchObject({ distanceMeters: 420, corners: 4, lyingMinutes: 35, otherDay: false, pendingSync: false });
  });

  it('gibt keine Koordinaten weiter', () => {
    expect(JSON.stringify(trackCandidates(rows, { dogId: 'luna', day: '2026-11-16' }))).not.toMatch(/"lat"|"lng"|47\.1|track_data|points/);
  });

  it('behält bereits verknüpfte Fährten eines anderen Tages oder Hundes sichtbar', () => {
    const list = trackCandidates(rows, { dogId: 'luna', day: '2026-11-16', linkedSessionIds: ['yesterday', 'balu'] });
    expect(list.filter(c => c.otherDay).map(c => c.sessionId).sort()).toEqual(['balu', 'yesterday']);
    expect(list).toHaveLength(4);
  });

  it('kennzeichnet noch nicht synchronisierte Fährten und doppelte Zeilen nur einmal', () => {
    const list = trackCandidates([row({ id: 'a', syncState: 'pending', isLocalOnly: true }), row({ id: 'a' })], { dogId: 'luna', day: '2026-11-16' });
    expect(list).toHaveLength(1);
    expect(list[0].pendingSync).toBe(true);
  });

  it('leitet den Tag bei fehlendem session_date aus der Startzeit ab', () => {
    const started = '2026-11-16T08:12:00.000Z';
    expect(trackDay({ session_date: null, started_at: started, created_at: null })).toBe(localDay(started));
    expect(trackDay({ session_date: '2026-11-16T00:00:00', started_at: null, created_at: null })).toBe('2026-11-16');
    expect(trackDay({ session_date: null, started_at: 'kaputt', created_at: null })).toBeNull();
  });
});

describe('Vorwahl', () => {
  const one = trackCandidates([row({ id: 'only' })], { dogId: 'luna', day: '2026-11-16' });
  const two = trackCandidates([row({ id: 'a' }), row({ id: 'b' })], { dogId: 'luna', day: '2026-11-16' });

  it('wählt genau eine passende Fährte bei einem neuen Training vor', () => {
    expect(preselectedTracks(one, { editing: false, linkedSessionIds: [] })).toEqual(['only']);
  });
  it('wählt bei mehreren Fährten nichts vor', () => {
    expect(preselectedTracks(two, { editing: false, linkedSessionIds: [] })).toEqual([]);
  });
  it('wählt beim Bearbeiten nichts vor und behält bestehende Verknüpfungen', () => {
    expect(preselectedTracks(one, { editing: true, linkedSessionIds: [] })).toEqual([]);
    expect(preselectedTracks(two, { editing: true, linkedSessionIds: ['b'] })).toEqual(['b']);
  });
});
