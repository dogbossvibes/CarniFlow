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

  it('RUN-SAVE3: Score der ausgearbeiteten Absuche (payload.run.score) wird gezeigt', () => {
    const withRun = localSession({
      payload_json: JSON.stringify({ distanceMeters: 250, run: { score: 91, articles_found: 2 } }),
    });
    const out = mergeTrackHistory([], [withRun]);
    expect(out[0].score).toBe(91);
    expect(out[0].articles_found).toBe(2);
    expect(out[0].track_data.run.score).toBe(91);
  });

  it('lokal pending mit Run → Badge (pending) + echter Score', () => {
    const out = mergeTrackHistory([], [localSession({
      sync_status: 'pending', payload_json: JSON.stringify({ run: { score: 88 } }),
    })]);
    expect(out[0].syncState).toBe('pending');
    expect(out[0].score).toBe(88);
  });

  it('lokal failed mit Run → Badge (failed) + echter Score', () => {
    const out = mergeTrackHistory([], [localSession({
      sync_status: 'failed', payload_json: JSON.stringify({ run: { score: 73 } }),
    })]);
    expect(out[0].syncState).toBe('failed');
    expect(out[0].score).toBe(73);
  });

  it('gleiche Session lokal(synced) + remote → nur EIN Eintrag (remote, synced)', () => {
    const out = mergeTrackHistory([remote({ id: 'uuid-1' })], [localSession({ sync_status: 'synced' })]);
    expect(out).toHaveLength(1);
    expect(out[0].syncState).toBe('synced');
    expect(out[0].isLocalOnly).toBe(false);
  });

  it('Remote-Session ohne Run + lokaler pending Run → ein Eintrag, Run ergänzt + Badge', () => {
    const localWithRun = localSession({
      local_id: 'r1', sync_status: 'pending',
      payload_json: JSON.stringify({ distanceMeters: 250, run: { score: 91, articles_found: 2 } }),
    });
    const out = mergeTrackHistory([remote({ id: 'r1', score: null })], [localWithRun]);
    expect(out).toHaveLength(1);                 // kein Duplikat
    expect(out[0].syncState).toBe('pending');    // Badge
    expect(out[0].score).toBe(91);               // Run ergänzt
    expect(out[0].track_data.run.score).toBe(91);
    expect(out[0].isLocalOnly).toBe(false);      // Remote bleibt autoritativ
  });

  it('gelöschte lokale Session taucht NICHT im Merge auf', () => {
    const out = mergeTrackHistory([], [localSession({ deleted_at: '2026-08-12T00:00:00.000Z' })]);
    expect(out).toHaveLength(0);
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
