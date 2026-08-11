import { mergeTrackHistory, localSessionToHistoryRow } from '@/features/tracking/utils/trackHistoryMerge';
import type { LocalTrainingSession } from '@/features/sync/types/sync';

function localSession(over: Partial<LocalTrainingSession>): LocalTrainingSession {
  return {
    local_id: 'uuid-1', remote_id: null, user_id: 'owner-1', dog_id: 'dog-1', category: 'IGP',
    type: 'track', status: 'completed', title: 'Fährte', notes: null, score: null, visibility: null,
    started_at: '2026-08-11T10:00:00.000Z', ended_at: '2026-08-11T10:20:00.000Z', duration_seconds: 1200,
    location_name: null, latitude: null, longitude: null, temperature: null, weather_condition: null,
    wind_speed: null, humidity: null, surface_types: '["Wiese"]', terrain_conditions: null,
    created_at: '2026-08-11T10:00:00.000Z', updated_at: '2026-08-11T10:20:00.000Z', deleted_at: null,
    sync_status: 'pending', sync_attempts: 0, last_sync_error: null, last_synced_at: null,
    dirty_fields: null,
    payload_json: JSON.stringify({ distanceMeters: 250, articlesTotal: 2, cornersTotal: 3, segments: [{ id: 's1' }] }),
    ...over,
  };
}
const remote = (over: Record<string, any>) => ({
  id: 'r1', dog_id: 'dog-1', status: 'completed', session_date: '2026-08-10',
  created_at: '2026-08-10T09:00:00.000Z', started_at: '2026-08-10T09:00:00.000Z',
  surface_types: ['Acker'], distance_meters: 300, ...over,
});

describe('mergeTrackHistory', () => {
  it('nur Remote → einmal sichtbar, synced', () => {
    const out = mergeTrackHistory([remote({})], []);
    expect(out).toHaveLength(1);
    expect(out[0].syncState).toBe('synced');
    expect(out[0].isLocalOnly).toBe(false);
  });

  it('nur lokale pending → sichtbar + pending', () => {
    const out = mergeTrackHistory([], [localSession({ sync_status: 'pending' })]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('uuid-1');
    expect(out[0].syncState).toBe('pending');
    expect(out[0].isLocalOnly).toBe(true);
    expect(out[0].distance_meters).toBe(250);   // aus payload_json
    expect(out[0].surface_types).toEqual(['Wiese']);
  });

  it('nur lokale failed → sichtbar + failed', () => {
    const out = mergeTrackHistory([], [localSession({ sync_status: 'failed' })]);
    expect(out[0].syncState).toBe('failed');
  });

  it('gleiche Session lokal + remote → nur EIN Eintrag (remote gewinnt, synced)', () => {
    const out = mergeTrackHistory([remote({ id: 'uuid-1' })], [localSession({ sync_status: 'pending' })]);
    expect(out).toHaveLength(1);
    expect(out[0].syncState).toBe('synced');
    expect(out[0].isLocalOnly).toBe(false);
  });

  it('lokale pending, die später synced ist (remote da) → kein zweiter Eintrag', () => {
    const out = mergeTrackHistory([remote({ id: 'uuid-1' })], [localSession({ sync_status: 'synced' })]);
    expect(out).toHaveLength(1);
  });

  it('Remote-Fehler (leer) + lokale Sessions → lokale bleiben sichtbar', () => {
    const out = mergeTrackHistory([], [localSession({ local_id: 'a' }), localSession({ local_id: 'b' })]);
    expect(out).toHaveLength(2);
  });

  it('Sortierung nach Session-Zeit, NICHT nach Sync/Retry-Zeit', () => {
    // lokale Fährte ist ÄLTER (Session gestern), wurde aber gerade erst gesynct.
    const older = remote({ id: 'r-old', started_at: '2026-08-09T08:00:00.000Z', session_date: '2026-08-09' });
    const newerLocal = localSession({ local_id: 'l-new', started_at: '2026-08-11T10:00:00.000Z' });
    const out = mergeTrackHistory([older], [newerLocal]);
    expect(out.map(r => r.id)).toEqual(['l-new', 'r-old']);   // neuere zuerst
  });

  it('nicht abgeschlossene lokale Sessions werden NICHT in den Verlauf gemischt', () => {
    const out = mergeTrackHistory([], [localSession({ status: 'active' })]);
    expect(out).toHaveLength(0);
  });

  it('bestehende Remote-Rows unverändert durchgereicht (Passthrough-Felder)', () => {
    const out = mergeTrackHistory([remote({ wetter: 'sonnig', temperature: 20 })], []);
    expect(out[0].wetter).toBe('sonnig');
    expect(out[0].temperature).toBe(20);
  });
});

describe('localSessionToHistoryRow', () => {
  it('conflict → failed; syncing → pending', () => {
    expect(localSessionToHistoryRow(localSession({ sync_status: 'conflict' })).syncState).toBe('failed');
    expect(localSessionToHistoryRow(localSession({ sync_status: 'syncing' })).syncState).toBe('pending');
  });
});
