// Feldtest BUILD40 + EXPO: die Absuche lief sichtbar korrekt (Suchspur da,
// 40 m Suchdistanz vor Stop, Abweichung laufend 0,2–0,7 m) — die unmittelbar
// folgende Auswertung meldete trotzdem "Automatische Auswertung nicht
// verfügbar — die Absuche hat keine verwertbare Suchspur aufgezeichnet".
//
// Dieser Test bildet exakt die Übergabekette nach, OHNE Screen-Mocking:
//   useSearchRecorder.stop() → buildRunResultPayload → payload_json.run
//   → buildLocalTrackDetail / runSupplementFromPayload → runs[0]
//   → [id].tsx: hasValidGeometry = (runs[0]?.distance_meters ?? 0) > 0
//
// Erwartung: die 40 m müssen bis in runs[0].distance_meters durchkommen.
import { buildRunResultPayload } from '@/features/tracking/utils/localTrackRun';
import { buildLocalTrackDetail, runSupplementFromPayload } from '@/features/tracking/utils/localTrackDetail';
import type { LocalTrainingSession } from '@/features/sync/types/sync';

const SESSION_ID = 'session-golden-reference';

// Genau das, was useSearchRecorder.stop() im Feldtest zurückgab.
function runPayloadFromField() {
  return buildRunResultPayload({
    runId: 'run-uuid-1',
    sessionId: SESSION_ID,
    startedAtMs: 1_700_000_000_000,
    endedAtMs: 1_700_000_600_000,
    result: {
      durationS: 600,
      score: 92,
      deviationAvgM: 0.4,          // laufend 0,2–0,7 m im Video
      foundObjects: 0,
      totalObjects: 0,
      distanceM: 40,               // 40 m Suchdistanz vor Stop
      breaks: [],
      points: [                    // ≥ 2 echte Suchpunkte
        { latitude: 47.0, longitude: 8.0 },
        { latitude: 47.00036, longitude: 8.0 },
      ],
    },
    pointsTimeSec: [0, 30],
  });
}

function localSessionWith(run: Record<string, unknown>): LocalTrainingSession {
  return {
    local_id: SESSION_ID, dog_id: 'dog-1', owner_id: 'owner-1',
    started_at: '2026-09-08T10:00:00.000Z', created_at: '2026-09-08T10:00:00.000Z',
    notes: null, surface_types: null, terrain_conditions: null,
    temperature: null, weather_condition: null, wind_speed: null, humidity: null,
    score: null, sync_status: 'pending', updated_at: '2026-09-08T10:10:00.000Z',
    payload_json: JSON.stringify({ run }),
  } as unknown as LocalTrainingSession;
}

// Exakt die Prüfung aus app/track/[id].tsx.
function hasValidGeometry(detail: { runs?: { distance_meters?: number | null }[] }): boolean {
  return ((detail.runs?.[0] as { distance_meters?: number | null } | undefined)?.distance_meters ?? 0) > 0;
}

describe('Übergabe der Absuche-Geometrie an die Auswertung (lokal/nicht-synchronisiert)', () => {
  it('das persistierte Run-Payload enthält die 40 m und beide Suchpunkte', () => {
    const run = runPayloadFromField();
    expect(run.distance_meters).toBe(40);
    expect((run.run_points as unknown[]).length).toBe(2);
    expect(run.average_deviation_meters).toBe(0.4);
  });

  it('buildLocalTrackDetail: runs[0] muss distance_meters führen → hasValidGeometry=true', () => {
    const detail = buildLocalTrackDetail(localSessionWith(runPayloadFromField()), [], []);
    expect(detail.runs).toHaveLength(1);
    expect(detail.runs[0].run_points).toHaveLength(2);
    // ← Kernaussage: hier gehen die 40 m heute verloren.
    expect(detail.runs[0].distance_meters).toBe(40);
    expect(hasValidGeometry(detail)).toBe(true);
  });

  it('runSupplementFromPayload (remote-Session ohne gesyncten Run): runs[0] muss distance_meters führen', () => {
    const sup = runSupplementFromPayload(JSON.stringify({ run: runPayloadFromField() }));
    expect(sup).not.toBeNull();
    expect(sup!.runs).toHaveLength(1);
    expect((sup!.runs[0] as { distance_meters?: number }).distance_meters).toBe(40);
    expect(hasValidGeometry(sup as unknown as { runs: { distance_meters?: number | null }[] })).toBe(true);
  });

  it('run_points bleiben vollständig erhalten (inkl. Replay-Zeitstempeln)', () => {
    const detail = buildLocalTrackDetail(localSessionWith(runPayloadFromField()), [], []);
    const pts = detail.runs[0].run_points;
    expect(pts).toHaveLength(2);
    expect(pts[0]).toEqual({ lat: 47.0, lng: 8.0, t: 0 });
    expect(pts[1]).toEqual({ lat: 47.00036, lng: 8.0, t: 30 });
    // Auch der Supplement-Pfad reicht dieselben Punkte unverändert durch.
    const sup = runSupplementFromPayload(JSON.stringify({ run: runPayloadFromField() }));
    expect(sup!.runs[0].run_points).toEqual(pts);
  });

  it('0-m-Guard bleibt bestehen: eine Absuche ohne Geometrie ergibt weiterhin hasValidGeometry=false', () => {
    // Exakt derselbe Pfad, nur ohne verwertbare Suchspur (0 m, ein Punkt).
    const emptyRun = buildRunResultPayload({
      runId: 'run-uuid-2', sessionId: SESSION_ID,
      startedAtMs: 1_700_000_000_000, endedAtMs: 1_700_000_060_000,
      result: {
        durationS: 60, score: 0, deviationAvgM: 0, foundObjects: 0, totalObjects: 0,
        distanceM: 0, breaks: [], points: [{ latitude: 47.0, longitude: 8.0 }],
      },
    });
    const detail = buildLocalTrackDetail(localSessionWith(emptyRun), [], []);
    expect(detail.runs[0].distance_meters).toBe(0);
    expect(hasValidGeometry(detail)).toBe(false);   // Guard NICHT abgeschwächt

    const sup = runSupplementFromPayload(JSON.stringify({ run: emptyRun }));
    expect(hasValidGeometry(sup as unknown as { runs: { distance_meters?: number | null }[] })).toBe(false);
  });

  it('lokaler und Remote-Shape sind für die von der Auswertung genutzten Felder kompatibel', () => {
    const run = runPayloadFromField();
    const local = buildLocalTrackDetail(localSessionWith(run), [], []).runs[0];
    // So schreibt upsertRemoteTrackRun die Zeile nach track_runs (select('*')
    // liefert sie später genau so an den Detail-Screen zurück).
    const remote: Record<string, any> = {
      id: run.run_id, session_id: 'remote-session-id',
      started_at: run.started_at ?? null, ended_at: run.ended_at ?? null,
      duration_seconds: run.duration_seconds ?? null,
      distance_meters: run.distance_meters ?? null,
      average_deviation_meters: run.average_deviation_meters ?? null,
      articles_found: run.articles_found ?? null,
      run_points: run.run_points ?? [],
    };
    // Gleiche Feldnamen …
    expect(Object.keys(local).sort()).toEqual(Object.keys(remote).sort());
    // … und gleiche Werte in allen Feldern, die die Auswertung liest.
    expect(local.distance_meters).toBe(remote.distance_meters);
    expect(local.run_points).toEqual(remote.run_points);
    expect(local.average_deviation_meters).toBe(remote.average_deviation_meters);
    expect(local.duration_seconds).toBe(remote.duration_seconds);
    expect(hasValidGeometry({ runs: [local] })).toBe(hasValidGeometry({ runs: [remote] }));
  });
});
