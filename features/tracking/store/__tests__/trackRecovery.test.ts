// Recovery einer gelegten Fährte (reine Entscheidungslogik): Pending → Registry,
// gespeicherte Lege-Session → Pending → Registry, Eindeutigkeit vor Komfort.
import {
  decideTrackRecovery, reconstructPendingFromSession, selfHealPatches, registryPatchFromPending,
  hasFinalSearchRun, canCompleteWithoutApp, decideSearchDiscard, searchDiscardPending,
  type LocalSessionSnapshot,
} from '@/features/tracking/store/trackRecovery';
import { upsertEntry, type ActiveFaehrtenMap } from '@/features/tracking/store/activeFaehrtenModel';
import { trackAnalysisAvailability } from '@/features/tracking/utils/trackAnalysisState';
import type { PendingTrack } from '@/features/tracking/store/trackPersist';
import type { LocalTrackMarker, LocalTrackPoint, LocalTrainingSession } from '@/features/sync/types/sync';

const NOW = 1_800_000_000_000;
const LAY_END_ISO = '2026-10-04T08:30:00.000Z';
const LAY_END = Date.parse(LAY_END_ISO);

const pt = (i: number) => ({ lat: 47 + i * 1e-4, lng: 8 + i * 1e-4, accuracy: 4, t: LAY_END - (10 - i) * 1000 });
const pending = (over: Partial<PendingTrack> = {}): PendingTrack => ({
  sessionId: 'sess-A', dogId: 'dog-A',
  trackPoints: [pt(0), pt(1), pt(2)],
  markers: [
    { id: 'm1', type: 'winkel', material: null, angleKind: null, lat: 47, lng: 8, accuracy: 4, distance_from_start: 30, note: null, audio_url: null, found: false, t: 1 },
    { id: 'm2', type: 'gegenstand', material: 'holz', angleKind: null, lat: 47, lng: 8, accuracy: 4, distance_from_start: 60, note: null, audio_url: null, found: false, t: 2 },
  ],
  runPoints: [], distanceMeters: 123, durationSeconds: 300,
  layFinishedAt: LAY_END, layStartedAt: LAY_END, startAnchor: null, savedAt: LAY_END, status: 'resting',
  ...over,
});

const session = (over: Partial<LocalTrainingSession> = {}): LocalTrainingSession => ({
  local_id: 'sess-A', remote_id: null, user_id: 'user-1', dog_id: 'dog-A', category: 'IGP', type: 'track',
  status: 'completed', title: 'Fährte', notes: null, score: null, visibility: null,
  started_at: '2026-10-04T08:25:00.000Z', ended_at: LAY_END_ISO, duration_seconds: 300,
  location_name: null, latitude: null, longitude: null, temperature: null, weather_condition: null,
  wind_speed: null, humidity: null, surface_types: null, terrain_conditions: null,
  created_at: '2026-10-04T08:25:00.000Z', updated_at: LAY_END_ISO, deleted_at: null,
  sync_status: 'synced', sync_attempts: 0, last_sync_error: null, last_synced_at: null, dirty_fields: null,
  payload_json: JSON.stringify({ distanceMeters: 123, articlesTotal: 1, cornersTotal: 1, segments: null }),
  ...over,
} as LocalTrainingSession);

const layRow = (i: number): LocalTrackPoint => ({
  local_id: `pt-${i}`, remote_id: null, session_local_id: 'sess-A', session_remote_id: null,
  latitude: 47 + i * 1e-4, longitude: 8 + i * 1e-4, accuracy: 4, altitude: null, speed: null, heading: null,
  timestamp: new Date(LAY_END - (10 - i) * 1000).toISOString(), point_type: 'lay',
  created_at: LAY_END_ISO, sync_status: 'synced', payload_json: null,
});
const markerRow = (id: string, type: string): LocalTrackMarker => ({
  local_id: id, remote_id: null, session_local_id: 'sess-A', session_remote_id: null, marker_type: type,
  material: type === 'gegenstand' ? 'holz' : null, angle_kind: null, latitude: 47, longitude: 8, accuracy: 4,
  distance_from_start: 40, note: null, audio_local_uri: null, audio_remote_url: null,
  created_at: LAY_END_ISO, sync_status: 'synced', payload_json: null,
});
const local = (over: Partial<LocalSessionSnapshot> = {}): LocalSessionSnapshot => ({
  session: session(), layPoints: [layRow(0), layRow(1), layRow(2)],
  markers: [markerRow('mk-1', 'winkel'), markerRow('mk-2', 'gegenstand')], searchPointCount: 0, ...over,
});

const decide = (over: Partial<Parameters<typeof decideTrackRecovery>[0]> = {}) => decideTrackRecovery({
  registry: {}, dogId: 'dog-A', sessionId: 'sess-A', pending: null, local: null, now: NOW, ...over,
});
const regWith = (patch: Parameters<typeof upsertEntry>[2], dogId = 'dog-A'): ActiveFaehrtenMap => upsertEntry({}, dogId, patch);

describe('Recovery A — Pending vorhanden', () => {
  it('1: Pending + Registry vorhanden → unverändert (idempotent, keine Writes)', () => {
    const registry = regWith({ status: 'resting', sessionId: 'sess-A', layStartedAt: LAY_END });
    const d = decide({ registry, pending: pending() });
    expect(d).toMatchObject({ ok: true, source: 'registry', registryPatch: null, pendingToWrite: null });
  });

  it('2: Pending vorhanden, Registry fehlt → Registry wird mit derselben Session repariert', () => {
    const d = decide({ pending: pending() });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.source).toBe('pending');
    expect(d.pendingToWrite).toBeNull();
    expect(d.registryPatch).toMatchObject({
      status: 'resting', sessionId: 'sess-A', distanceMeters: 123, winkelCount: 1, objektCount: 1, layStartedAt: LAY_END,
    });
  });

  it('3: Pending resting → reopenTarget = /track/liegen?dogId=…&id=…', () => {
    const d = decide({ pending: pending() });
    expect(d.ok && d.target).toBe('/track/liegen?dogId=dog-A&id=sess-A');
  });

  it('Legacy-Pending ohne Status gilt als resting; laid wird als resting registriert', () => {
    expect(registryPatchFromPending(pending({ status: undefined }), NOW).status).toBe('resting');
    expect(registryPatchFromPending(pending({ status: 'laid' }), NOW).status).toBe('resting');
  });

  it('4: Pending gehört Hund A, Journal-Session ist Hund B → KEIN Recovery für B', () => {
    const d = decide({ dogId: 'dog-B', pending: pending({ dogId: 'dog-A' }), local: local({ session: session({ dog_id: 'dog-A' }) }) });
    expect(d.ok).toBe(false);
  });

  it('5: Pending Session A, Journal Session B → KEIN Recovery (fremde offene Fährte bleibt)', () => {
    const d = decide({ sessionId: 'sess-B', pending: pending({ sessionId: 'sess-A' }), local: local({ session: session({ local_id: 'sess-B' }) }) });
    expect(d).toEqual({ ok: false, reason: 'other_pending' });
  });

  it('Registry hält für den Hund eine ANDERE offene Fährte → kein Recovery, nichts überschreiben', () => {
    const registry = regWith({ status: 'resting', sessionId: 'sess-OTHER' });
    expect(decide({ registry, pending: pending(), local: local() })).toEqual({ ok: false, reason: 'other_active' });
  });

  it('9a: Pending derselben Session ist cancelled → kein Recovery (bewusster Abbruch belegt)', () => {
    expect(decide({ pending: pending({ status: 'cancelled' }), local: local() })).toEqual({ ok: false, reason: 'pending_closed' });
  });

  it('abgebrochener Puffer einer ANDEREN Session blockiert die Rekonstruktion nicht', () => {
    const d = decide({ pending: pending({ sessionId: 'sess-OLD', status: 'cancelled' }), local: local() });
    expect(d).toMatchObject({ ok: true, source: 'session' });
  });
});

describe('Recovery B — Pending fehlt, Rekonstruktion aus der gespeicherten Session', () => {
  it('6: eindeutige gelegte Session + Punkte + Marker → Pending rekonstruiert, Registry resting, gleiche Session-ID', () => {
    const d = decide({ local: local() });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.source).toBe('session');
    expect(d.target).toBe('/track/liegen?dogId=dog-A&id=sess-A');
    expect(d.registryPatch).toMatchObject({ status: 'resting', sessionId: 'sess-A', distanceMeters: 123, winkelCount: 1, objektCount: 1, layStartedAt: LAY_END });
    const p = d.pendingToWrite!;
    expect(p.sessionId).toBe('sess-A');
    expect(p.dogId).toBe('dog-A');
    expect(p.status).toBe('resting');
    expect(p.layFinishedAt).toBe(LAY_END);
    expect(p.layStartedAt).toBe(LAY_END);
    expect(p.runPoints).toEqual([]);
    expect(p.searchPoints).toEqual([]);
  });

  it('übernimmt Punkte und Marker 1:1 (keine neue Geometrie, keine Duplikate)', () => {
    const r = reconstructPendingFromSession(local(), 'dog-A', { now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pending.trackPoints).toEqual([layRow(0), layRow(1), layRow(2)].map(p => ({
      lat: p.latitude, lng: p.longitude, accuracy: p.accuracy, altitude: null, speed: null, heading: null, t: Date.parse(p.timestamp),
    })));
    expect(r.pending.markers.map(m => [m.id, m.type, m.material])).toEqual([['mk-1', 'winkel', null], ['mk-2', 'gegenstand', 'holz']]);
    expect(r.pending.distanceMeters).toBe(123);
    expect(r.pending.durationSeconds).toBe(300);
  });

  it('status=completed der Lege-Session ist KEIN Beweis für einen abgeschlossenen Fährtenprozess', () => {
    expect(decide({ local: local({ session: session({ status: 'completed' }) }) }).ok).toBe(true);
  });

  it('7: keine/zu wenige Punkte bzw. ungültige Geometrie → kein Recovery', () => {
    expect(decide({ local: local({ layPoints: [] }) })).toEqual({ ok: false, reason: 'no_geometry' });
    expect(decide({ local: local({ layPoints: [layRow(0)] }) })).toEqual({ ok: false, reason: 'no_geometry' });
    expect(decide({ local: local({ layPoints: [layRow(0), { ...layRow(1), latitude: NaN }] }) })).toEqual({ ok: false, reason: 'no_geometry' });
  });

  it('8: final abgeschlossener Suchlauf (lokal payload.run oder remote track_runs) → kein Recovery', () => {
    const withRun = session({ payload_json: JSON.stringify({ distanceMeters: 123, run: { distance_meters: 100 } }) });
    expect(decide({ local: local({ session: withRun }) })).toEqual({ ok: false, reason: 'search_completed' });
    expect(decide({ local: local(), hasRemoteSearchRun: true })).toEqual({ ok: false, reason: 'search_completed' });
  });

  it('begonnene Absuche ohne Lauf (Suchpunkte vorhanden) → nicht eindeutig → kein Recovery', () => {
    expect(decide({ local: local({ searchPointCount: 3 }) })).toEqual({ ok: false, reason: 'search_started' });
  });

  it('9b: cancelled/gelöschte Session → kein Recovery', () => {
    expect(decide({ local: local({ session: session({ status: 'cancelled' }) }) })).toEqual({ ok: false, reason: 'cancelled' });
    expect(decide({ local: local({ session: session({ deleted_at: LAY_END_ISO }) }) })).toEqual({ ok: false, reason: 'deleted' });
  });

  it('Lege-Ende nicht belegt (ended_at fehlt) → keine erfundene Liegezeit, kein Recovery', () => {
    expect(decide({ local: local({ session: session({ ended_at: null }) }) })).toEqual({ ok: false, reason: 'lay_not_finished' });
  });

  it('falscher Hund / falscher Nutzer / keine Fährte → kein Recovery', () => {
    expect(decide({ local: local({ session: session({ dog_id: 'dog-B' }) }) })).toEqual({ ok: false, reason: 'wrong_dog' });
    expect(decide({ local: local(), userId: 'user-2' })).toEqual({ ok: false, reason: 'wrong_user' });
    expect(decide({ local: local({ session: session({ type: 'obedience' }) }) })).toEqual({ ok: false, reason: 'not_track' });
  });

  it('lokal unbekannte Session ohne Puffer → kein Recovery', () => {
    expect(decide({ local: null })).toEqual({ ok: false, reason: 'unknown_session' });
  });

  it('Registry korrekt, Puffer fehlt → Puffer nachschreiben, Registry unverändert', () => {
    const registry = regWith({ status: 'resting', sessionId: 'sess-A', layStartedAt: LAY_END });
    const d = decide({ registry, local: local() });
    expect(d).toMatchObject({ ok: true, source: 'registry', registryPatch: null });
    expect(d.ok && d.pendingToWrite?.sessionId).toBe('sess-A');
  });

  it('Registry searching, Puffer fehlt → laufende Absuche wird NICHT mit resting überdeckt', () => {
    const registry = regWith({ status: 'searching', sessionId: 'sess-A' });
    const d = decide({ registry, local: local() });
    expect(d).toMatchObject({ ok: true, source: 'registry', pendingToWrite: null });
    expect(d.ok && d.target).toBe('/track/run?dogId=dog-A&id=sess-A');
  });
});

describe('11: Idempotenz', () => {
  it('zweiter Aufruf nach angewandtem Recovery liefert keine weiteren Writes', () => {
    const first = decide({ local: local() });
    if (!first.ok) throw new Error('expected ok');
    const registry = upsertEntry({}, 'dog-A', first.registryPatch!);
    const second = decide({ registry, pending: first.pendingToWrite, local: local() });
    expect(second).toMatchObject({ ok: true, source: 'registry', registryPatch: null, pendingToWrite: null, target: first.target });
  });
});

describe('10: App-Start-Selbstheilung', () => {
  it('Registry leer + offener liegender Puffer → Registry-Eintrag', () => {
    const patches = selfHealPatches({}, [pending()], NOW, ['dog-A']);
    expect(patches).toEqual([{ dogId: 'dog-A', patch: expect.objectContaining({ status: 'resting', sessionId: 'sess-A' }) }]);
  });

  it('heilt NICHT: vorhandener Registry-Eintrag, cancelled, laying, searching, ohne Session/Hund, ohne Geometrie', () => {
    const registry = regWith({ status: 'resting', sessionId: 'sess-X' });
    expect(selfHealPatches(registry, [pending()], NOW, ['dog-A'])).toEqual([]);
    expect(selfHealPatches({}, [
      pending({ status: 'cancelled' }), pending({ status: 'laying' }), pending({ status: 'searching' }),
      pending({ sessionId: null }), pending({ dogId: null }), pending({ trackPoints: [pt(0)] }),
    ], NOW, ['dog-A'])).toEqual([]);
  });

  it('mehrere Hunde werden je einmal geheilt', () => {
    const patches = selfHealPatches({}, [pending(), pending({ dogId: 'dog-B', sessionId: 'sess-B' }), pending()], NOW, ['dog-A', 'dog-B']);
    expect(patches.map(p => p.dogId)).toEqual(['dog-A', 'dog-B']);
  });
});

describe('Nutzer-Isolation der Selbstheilung (Account-Wechsel)', () => {
  it('Account B (nur dog-B) bekommt den Puffer von Account A (dog-A) NICHT', () => {
    expect(selfHealPatches({}, [pending({ dogId: 'dog-A', sessionId: 'sess-A' })], NOW, ['dog-B'])).toEqual([]);
  });

  it('Account B: eigener Puffer dog-B wird geheilt, fremder dog-A nicht', () => {
    const patches = selfHealPatches({}, [
      pending({ dogId: 'dog-A', sessionId: 'sess-A' }), pending({ dogId: 'dog-B', sessionId: 'sess-B' }),
    ], NOW, ['dog-B']);
    expect(patches).toEqual([{ dogId: 'dog-B', patch: expect.objectContaining({ sessionId: 'sess-B', status: 'resting' }) }]);
  });

  it('ohne bekannte Hunde (leere Liste) wird nichts geheilt', () => {
    expect(selfHealPatches({}, [pending()], NOW, [])).toEqual([]);
  });
});

describe('Dauerhafter Abbruch-Marker', () => {
  const cancelledPayload = JSON.stringify({ distanceMeters: 123, trackLifecycleStatus: 'cancelled' });

  it('Pending gelöscht + SQLite-Session mit Abbruch-Marker → KEIN Recovery B (trotz Punkten, ended_at, ohne Lauf)', () => {
    expect(decide({ local: local({ session: session({ payload_json: cancelledPayload }) }) })).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('Abbruch-Marker sperrt JEDE Quelle — auch einen veralteten offenen Registry-Eintrag oder Puffer', () => {
    const cancelled = local({ session: session({ payload_json: cancelledPayload }) });
    expect(decide({ registry: regWith({ status: 'resting', sessionId: 'sess-A' }), local: cancelled })).toEqual({ ok: false, reason: 'cancelled' });
    expect(decide({ pending: pending(), local: cancelled })).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('Altbestand ohne Marker: unveränderte Regeln, normale liegende Fährte bleibt recoverable', () => {
    expect(decide({ local: local() }).ok).toBe(true);
  });
});

describe('Allgemeine Lifecycle-Matrix', () => {
  const withoutApp = (over: Record<string, unknown> = {}) =>
    local({ session: session({ payload_json: JSON.stringify({ distanceMeters: 123, trackLifecycleStatus: 'completed_without_app', ...over }) }) });

  it('A: resting, Registry verloren, Puffer da → Liegezeit, mode resting', () => {
    expect(decide({ pending: pending(), local: local() })).toMatchObject({ ok: true, source: 'pending', mode: 'resting', target: '/track/liegen?dogId=dog-A&id=sess-A' });
  });

  it('B: resting, Registry + Puffer verloren, SQLite da → Liegezeit, mode resting', () => {
    expect(decide({ local: local() })).toMatchObject({ ok: true, source: 'session', mode: 'resting' });
  });

  it('F: „Ohne App abgeschlossen" → kein Resume aus Registry, Puffer oder SQLite', () => {
    expect(decide({ local: withoutApp() })).toEqual({ ok: false, reason: 'completed_without_app' });
    expect(decide({ pending: pending(), local: withoutApp() })).toEqual({ ok: false, reason: 'completed_without_app' });
    expect(decide({ registry: regWith({ status: 'resting', sessionId: 'sess-A' }), local: withoutApp() }))
      .toEqual({ ok: false, reason: 'completed_without_app' });
  });

  it('searching: laufende Absuche aus dem Puffer → bestehende Search-Recovery (run.tsx), mode searching', () => {
    const d = decide({ pending: pending({ status: 'searching', runId: 'run-1', searchStartedAt: LAY_END + 60_000 }), local: local({ searchPointCount: 12 }) });
    expect(d).toMatchObject({ ok: true, source: 'pending', mode: 'searching', target: '/track/run?dogId=dog-A&id=sess-A' });
    expect(d.ok && d.registryPatch).toMatchObject({ status: 'searching', runId: 'run-1', searchStartedAt: LAY_END + 60_000 });
  });

  it('K: finaler Suchlauf sperrt auch eine scheinbar laufende Absuche (Puffer searching)', () => {
    const withRun = local({ session: session({ payload_json: JSON.stringify({ run: { distance_meters: 80 } }) }) });
    expect(decide({ pending: pending({ status: 'searching' }), local: withRun })).toEqual({ ok: false, reason: 'search_completed' });
    expect(decide({ pending: pending({ status: 'searching' }), local: local(), hasRemoteSearchRun: true })).toEqual({ ok: false, reason: 'search_completed' });
  });

  it('L: Suchpunkte ohne Puffer → keine Absuche aus SQLite rekonstruieren', () => {
    expect(decide({ local: local({ searchPointCount: 5 }) })).toEqual({ ok: false, reason: 'search_started' });
  });

  it('laying: unterbrochenes Legen ist NICHT freigegeben (Puffer oder Registry)', () => {
    expect(decide({ pending: pending({ status: 'laying' }), local: local() })).toEqual({ ok: false, reason: 'laying_not_supported' });
    expect(decide({ registry: regWith({ status: 'laying', sessionId: 'sess-A' }), local: local() })).toEqual({ ok: false, reason: 'laying_not_supported' });
  });

  it('Zugehörigkeit gilt für jede Quelle: falscher Hund / Nutzer / gelöscht sperren auch Puffer-Recovery', () => {
    expect(decide({ pending: pending(), local: local({ session: session({ dog_id: 'dog-B' }) }) })).toEqual({ ok: false, reason: 'wrong_dog' });
    expect(decide({ pending: pending(), local: local(), userId: 'user-2' })).toEqual({ ok: false, reason: 'wrong_user' });
    expect(decide({ pending: pending(), local: local({ session: session({ deleted_at: LAY_END_ISO }) }) })).toEqual({ ok: false, reason: 'deleted' });
  });

  it('Puffer-Recovery bleibt offline ohne lokale Session-Zeile möglich (z. B. SQLite nicht lesbar)', () => {
    expect(decide({ pending: pending(), local: null })).toMatchObject({ ok: true, source: 'pending' });
  });

  it('Selbstheilung überspringt Sessions mit dauerhaftem Lifecycle-Abschluss', () => {
    expect(selfHealPatches({}, [pending()], NOW, ['dog-A'], new Set(['sess-A']))).toEqual([]);
  });
});

describe('Feldfall „OFFEN." ohne CTA — nur ein FINALER Suchlauf blockiert', () => {
  // Realer Feldfall: Detail zeigt „OFFEN." (= manuelle Bewertung 0, KEIN Lifecycle-Signal),
  // gelegte Punkte + ended_at, keine verwertbare Suchspur, kein Marker.
  const detailWith = (over: Record<string, unknown> = {}) => ({ track_data: { segments: [] }, runs: [], ...over });

  it('kein Run → kein finaler Suchlauf → Resume möglich (SQLite)', () => {
    expect(hasFinalSearchRun(detailWith())).toBe(false);
    expect(decide({ local: local(), hasRemoteSearchRun: hasFinalSearchRun(detailWith()) })).toMatchObject({ ok: true, mode: 'resting' });
  });

  it('unvollständiger Remote-Run (track_runs ohne ended_at, alter Startpfad) blockiert NICHT', () => {
    const d = detailWith({ runs: [{ id: 'r1', started_at: LAY_END_ISO, ended_at: null, distance_meters: null, run_points: [] }] });
    expect(hasFinalSearchRun(d)).toBe(false);
    expect(decide({ local: local(), hasRemoteSearchRun: hasFinalSearchRun(d) })).toMatchObject({ ok: true });
  });

  it('echter finaler Run blockiert — auch mit 0 m Suchspur (Nutzer hat die Absuche beendet)', () => {
    const remoteFinal = detailWith({ runs: [{ id: 'r1', started_at: LAY_END_ISO, ended_at: LAY_END_ISO, distance_meters: 0 }] });
    const trackDataRun = detailWith({ track_data: { run: { run_id: 'r1', ended_at: LAY_END_ISO, distance_meters: 0 } } });
    expect(hasFinalSearchRun(remoteFinal)).toBe(true);
    expect(hasFinalSearchRun(trackDataRun)).toBe(true);
    expect(decide({ local: local(), hasRemoteSearchRun: true })).toEqual({ ok: false, reason: 'search_completed' });
    const localFinal = local({ session: session({ payload_json: JSON.stringify({ distanceMeters: 123, run: { run_id: 'r1', ended_at: LAY_END_ISO, distance_meters: 0, run_points: [] } }) }) });
    expect(decide({ local: localFinal })).toEqual({ ok: false, reason: 'search_completed' });
  });

  it('completed_without_app / cancelled → kein Resume', () => {
    expect(decide({ local: local({ session: session({ payload_json: JSON.stringify({ trackLifecycleStatus: 'completed_without_app' }) }) }) }))
      .toEqual({ ok: false, reason: 'completed_without_app' });
    expect(decide({ local: local({ session: session({ payload_json: JSON.stringify({ trackLifecycleStatus: 'cancelled' }) }) }) }))
      .toEqual({ ok: false, reason: 'cancelled' });
  });

  it('„Ohne App abgeschlossen" angeboten: wenn fortsetzbar ODER bei begonnener, nicht beendeter Absuche', () => {
    expect(canCompleteWithoutApp(decide({ local: local() }))).toBe(true);
    expect(canCompleteWithoutApp(decide({ local: local({ searchPointCount: 4 }) }))).toBe(true);   // search_started
    for (const reason of ['search_completed', 'cancelled', 'completed_without_app', 'other_active', 'other_pending', 'no_geometry', 'laying_not_supported', 'unknown_session'] as const) {
      expect(canCompleteWithoutApp({ ok: false, reason })).toBe(false);
    }
  });
});

describe('Absuche verwerfen = NUR den Suchversuch, Fährte wieder resting', () => {
  const discard = (over: Partial<Parameters<typeof decideSearchDiscard>[0]> = {}) => decideSearchDiscard({
    registry: {}, dogId: 'dog-A', sessionId: 'sess-A', pending: null, local: null, now: NOW, ...over,
  });
  const searchingPending = () => pending({
    status: 'searching', runId: 'run-1', searchStartedAt: LAY_END + 60_000, searchUpdatedAt: LAY_END + 90_000,
    searchPoints: [pt(5), pt(6)], paused: true,
  });

  it('Puffer searching → resting; Such-Felder leer; Lay-Punkte/Marker/Session/Hund/Liegezeit unverändert', () => {
    const d = discard({ pending: searchingPending(), registry: regWith({ status: 'searching', sessionId: 'sess-A' }) });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const before = searchingPending();
    expect(d.pending).toMatchObject({ status: 'resting', runId: null, searchPoints: [], searchStartedAt: null, searchUpdatedAt: null, paused: false, sessionId: 'sess-A', dogId: 'dog-A' });
    expect(d.pending.searchRun).toBeUndefined();
    expect(d.pending.trackPoints).toEqual(before.trackPoints);
    expect(d.pending.markers).toEqual(before.markers);
    expect(d.pending.layStartedAt).toBe(before.layStartedAt);
    expect(d.registryPatch).toMatchObject({ status: 'resting', sessionId: 'sess-A', layStartedAt: LAY_END });
    expect(d.target).toBe('/track/liegen?dogId=dog-A&id=sess-A');
  });

  it('Puffer verloren, Suchpunkte in SQLite (search_started) → aus der Lege-Session freigeben', () => {
    const d = discard({ local: local({ searchPointCount: 7 }) });
    expect(d).toMatchObject({ ok: true, target: '/track/liegen?dogId=dog-A&id=sess-A' });
    expect(d.ok && d.pending.status).toBe('resting');
  });

  it('sperrt wie die Recovery: finaler Lauf, Marker, fremde offene Fährte, abgebrochener Puffer', () => {
    expect(discard({ local: local({ session: session({ payload_json: JSON.stringify({ run: { ended_at: LAY_END_ISO } }) }) }) })).toEqual({ ok: false, reason: 'search_completed' });
    expect(discard({ local: local(), hasRemoteSearchRun: true })).toEqual({ ok: false, reason: 'search_completed' });
    expect(discard({ local: local({ session: session({ payload_json: JSON.stringify({ trackLifecycleStatus: 'cancelled' }) }) }) })).toEqual({ ok: false, reason: 'cancelled' });
    expect(discard({ registry: regWith({ status: 'resting', sessionId: 'sess-OTHER' }), local: local() })).toEqual({ ok: false, reason: 'other_active' });
    expect(discard({ pending: pending({ sessionId: 'sess-OTHER' }), local: local() })).toEqual({ ok: false, reason: 'other_pending' });
    expect(discard({ pending: pending({ status: 'cancelled' }), local: local() })).toEqual({ ok: false, reason: 'pending_closed' });
  });

  it('searchDiscardPending ist rein (Eingabe unverändert)', () => {
    const p = searchingPending();
    const copy = JSON.parse(JSON.stringify(p));
    searchDiscardPending(p, NOW);
    expect(p).toEqual(copy);
  });
});

describe('Recovery-Modus bestimmt die Aktion (unabhängig vom Analyse-Zustand)', () => {
  it('Suchpunkte + wiederherstellbarer Such-Puffer → mode searching („Absuche fortsetzen")', () => {
    expect(decide({ pending: pending({ status: 'searching', runId: 'r' }), local: local({ searchPointCount: 9 }) }))
      .toMatchObject({ ok: true, mode: 'searching', target: '/track/run?dogId=dog-A&id=sess-A' });
  });
  it('Suchpunkte ohne Puffer/Registry → search_started (kein blindes resting-Resume)', () => {
    expect(decide({ local: local({ searchPointCount: 9 }) })).toEqual({ ok: false, reason: 'search_started' });
  });
});

describe('Analyse-Zustand und Recovery sind entkoppelt', () => {
  const cases = [
    { name: 'kein Run', d: { track_data: {}, runs: [] } },
    { name: 'Legacy-Run ohne ended_at', d: { track_data: {}, runs: [{ ended_at: null, distance_meters: null }] } },
    { name: 'finaler Remote-Run 0 m', d: { track_data: {}, runs: [{ ended_at: LAY_END_ISO, distance_meters: 0 }] } },
    { name: 'finaler track_data.run', d: { track_data: { run: { ended_at: LAY_END_ISO, distance_meters: 0 } }, runs: [] } },
  ];

  it('analysisState „unavailable" (Legacy-Run ohne ended_at) + Recovery resting → Fortsetzen möglich', () => {
    const d = cases[1].d;
    expect(trackAnalysisAvailability(d).state).toBe('unavailable');
    expect(hasFinalSearchRun(d)).toBe(false);
    expect(decide({ local: local(), hasRemoteSearchRun: hasFinalSearchRun(d) })).toMatchObject({ ok: true, mode: 'resting' });
  });

  it('ein finaler Suchlauf blockiert unabhängig vom Analyse-Zustand; „pending_search" kann nie einen finalen Lauf haben', () => {
    for (const c of cases) {
      const a = trackAnalysisAvailability(c.d).state;
      if (hasFinalSearchRun(c.d)) {
        expect(a).not.toBe('pending_search');
        expect(decide({ local: local(), hasRemoteSearchRun: true })).toEqual({ ok: false, reason: 'search_completed' });
      }
    }
  });
});
