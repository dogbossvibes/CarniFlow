import { buildLocalTrackDetail, runSupplementFromPayload } from '@/features/tracking/utils/localTrackDetail';
import type { LocalTrainingSession, LocalTrackPoint, LocalTrackMarker } from '@/features/sync/types/sync';

const local: LocalTrainingSession = {
  local_id: 'uuid-1', remote_id: null, user_id: 'owner-1', dog_id: 'dog-1', category: 'IGP',
  type: 'track', status: 'completed', title: 'Fährte', notes: 'Notiz', score: null, visibility: null,
  started_at: '2026-08-12T10:00:00.000Z', ended_at: '2026-08-12T10:20:00.000Z', duration_seconds: 1200,
  location_name: null, latitude: null, longitude: null, temperature: 12, weather_condition: 'sonnig',
  wind_speed: 4, humidity: 70, surface_types: '["Wiese"]', terrain_conditions: '["Nass"]',
  created_at: '2026-08-12T10:00:00.000Z', updated_at: '2026-08-12T10:20:00.000Z', deleted_at: null,
  sync_status: 'pending', sync_attempts: 0, last_sync_error: null, last_synced_at: null, dirty_fields: null,
  payload_json: JSON.stringify({
    distanceMeters: 250, cornersTotal: 3, articlesTotal: 2, segments: [{ id: 's1', status: 'completed' }],
    score: 83, legs: [{ name: 'Ausarbeitung Abschnitt 1', score: 8.3, max: 10 }], evaluated_at: '2026-08-12T10:30:00.000Z',
    run: { run_id: 'run-1', score: 91, articles_found: 2, total_objects: 3, average_deviation_meters: 1.2, run_points: [{ lat: 47, lng: 8 }] },
  }),
};
const points: LocalTrackPoint[] = [
  { local_id: 'p1', remote_id: null, session_local_id: 'uuid-1', session_remote_id: null, latitude: 47, longitude: 8, accuracy: 5, altitude: null, speed: null, heading: null, timestamp: '2026-08-12T10:00:01.000Z', point_type: 'lay', created_at: '', sync_status: 'pending', payload_json: null },
  { local_id: 'p2', remote_id: null, session_local_id: 'uuid-1', session_remote_id: null, latitude: 47.1, longitude: 8.1, accuracy: 5, altitude: null, speed: null, heading: null, timestamp: '2026-08-12T10:05:00.000Z', point_type: 'search', created_at: '', sync_status: 'pending', payload_json: null },
];
const markers: LocalTrackMarker[] = [
  { local_id: 'm1', remote_id: null, session_local_id: 'uuid-1', session_remote_id: null, marker_type: 'winkel', material: null, angle_kind: 'gw', latitude: 47, longitude: 8, accuracy: 5, distance_from_start: 10, note: null, audio_local_uri: null, audio_remote_url: null, created_at: '2026-08-12T10:02:00.000Z', sync_status: 'pending', payload_json: null },
];

describe('buildLocalTrackDetail — Detail-Fallback aus SQLite (getTrackSessionById-Shape)', () => {
  const d = buildLocalTrackDetail(local, points, markers);

  it('Kern-Metadaten + Bedingungen', () => {
    expect(d.id).toBe('uuid-1');
    expect(d.dog_id).toBe('dog-1');
    expect(d.notes).toBe('Notiz');
    expect(d.surface_types).toEqual(['Wiese']);
    expect(d.terrain_conditions).toEqual(['Nass']);
    expect(d.weather_condition).toBe('sonnig');
    expect(d.distance_meters).toBe(250);
    expect(d.corners_total).toBe(3);
    expect(d.articles_total).toBe(2);
    expect(d.articles_found).toBe(2);
    expect(d._localOnly).toBe(true);
  });

  it('points (lay+search durchgereicht) + markers im Remote-Shape', () => {
    expect(d.points).toHaveLength(2);
    expect(d.points[0].point_type).toBe('lay');
    expect(d.markers[0].marker_type).toBe('winkel');
    expect(d.markers[0].id).toBe('m1');
    expect(d.markers[0].angle_kind).toBe('gw');
  });

  it('runs aus payload.run.run_points (kanonisch), track_data.run + segments', () => {
    expect(d.runs).toEqual([{ run_points: [{ lat: 47, lng: 8 }] }]);
    expect(d.track_data.run.score).toBe(91);
    expect(d.track_data.segments).toEqual([{ id: 's1', status: 'completed' }]);
    expect(d.track_data.legs).toEqual([{ name: 'Ausarbeitung Abschnitt 1', score: 8.3, max: 10 }]);
    expect(d.score).toBe(83);
    expect(d.rating).toBe(83);
  });

  it('ohne run → leere runs, kein Crash', () => {
    const noRun = { ...local, payload_json: JSON.stringify({ distanceMeters: 100 }) };
    const d2 = buildLocalTrackDetail(noRun, [], []);
    expect(d2.runs).toEqual([]);
    expect(d2.distance_meters).toBe(100);
  });

  it('kaputtes payload_json → kein Crash, leere runs', () => {
    const broken = { ...local, payload_json: '{not json' };
    const d3 = buildLocalTrackDetail(broken, [], []);
    expect(d3.runs).toEqual([]);
    expect(d3.track_data).toEqual({});
  });
});

describe('runSupplementFromPayload — Run-Ergänzung für remote-Session ohne gesyncten Run', () => {
  it('liefert runs + track_data.run + Summary aus payload.run', () => {
    const s = runSupplementFromPayload(JSON.stringify({ run: { score: 91, articles_found: 2, average_deviation_meters: 1.2, run_points: [{ lat: 47, lng: 8 }] } }));
    expect(s?.runs).toEqual([{ run_points: [{ lat: 47, lng: 8 }] }]);
    expect(s?.track_data.run.score).toBe(91);
    expect(s?.articles_found).toBe(2);
    expect(s?.average_deviation_meters).toBe(1.2);
    expect(s?.score).toBe(91);
  });

  it('ohne run → null; kaputtes JSON → null', () => {
    expect(runSupplementFromPayload(JSON.stringify({ distanceMeters: 100 }))).toBeNull();
    expect(runSupplementFromPayload('{not json')).toBeNull();
    expect(runSupplementFromPayload(null)).toBeNull();
  });
});
