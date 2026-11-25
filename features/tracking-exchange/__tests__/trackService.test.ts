import { GroupApiError } from '../groups/groupRpc';
import { areaCorners, createGroupTrackService, formatDuration, isOwnGroupTrack, lyingMs, parseGroupTrack, GROUP_TRACK_HANDOVER_READY, OWN_TRACKS_RETRY_MS } from '../groups/trackService';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `50000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}` }));

const LAYER = 'a1111111-1111-4111-8111-111111111111';
const HANDLER = 'b2222222-2222-4222-8222-222222222222';
const SESSION = '30000000-0000-4000-8000-000000000001';
const PART = '40000000-0000-4000-8000-0000000000b1';
const DOG = 'b0000000-0000-4000-8000-0000000000b1';
const raw = (over: Record<string, unknown> = {}) => ({ trackId: '50000000-0000-4000-8000-000000000001', sessionId: SESSION, layerUserId: LAYER,
  handlerUserId: HANDLER, handlerParticipationId: PART, dogId: DOG, blind: true, status: 'laying', createdAtMs: 1000,
  laidAtMs: null, searchStartedAtMs: null, searchedAtMs: null, area: null, distanceM: null, ...over });
const lying = { status: 'lying', laidAtMs: 10_000, area: { centerLat: 47.37, centerLng: 8.54, radiusM: 75 } };
const ok = (body: Record<string, unknown>) => ({ version: 1, serverNowMs: 1, ...body });
// Format der Fährten-Übergabe (TrackTransferReference): Zeitstempel bleiben für die Absuche erhalten.
const pt = (lat: number, lng: number, t: number) => ({ lat, lng, t, accuracy: 3, altitude: null, speed: null, heading: null, breakBefore: false, measuredDistanceM: null });
const reference = { version: 1, startedAtMs: 1_763_000_000_000, finishedAtMs: 1_763_000_600_000, distanceM: 120, durationSeconds: 600,
  points: [pt(47.37, 8.54, 1_763_000_000_000), pt(47.371, 8.541, 1_763_000_600_000)], markers: [], segments: [], manualAngleGeometry: null };

function client(respond: (action: string, request: Record<string, unknown>) => Record<string, unknown>) {
  const calls: { endpoint: string; action: string; request: Record<string, unknown> }[] = [];
  return { calls, client: { call: jest.fn(async (_u: string, endpoint: string, action: string, request: Record<string, unknown>) => {
    calls.push({ endpoint, action, request }); return respond(action, request); }), dispose: jest.fn() } as never };
}

describe('Fährten im Gruppentraining', () => {
  beforeEach(() => { mockUuid = 0; });

  it('Übergabe ist mit Stufe 2b eingeschaltet', () => { expect(GROUP_TRACK_HANDOVER_READY).toBe(true); });

  it('liest Status und Fläche; liegend ohne Fläche ist ungültig', () => {
    expect(parseGroupTrack(raw({ ...lying })).area).toEqual({ centerLat: 47.37, centerLng: 8.54, radiusM: 75, polygon: null });
    expect(() => parseGroupTrack(raw({ status: 'lying', laidAtMs: 1 }))).toThrow('GROUP_INVALID_RESPONSE');
    expect(() => parseGroupTrack(raw({ handlerUserId: LAYER }))).toThrow('GROUP_INVALID_RESPONSE');
    expect(() => parseGroupTrack(raw({ status: 'lost' }))).toThrow('GROUP_INVALID_RESPONSE');
  });

  it('Liegezeit läuft ohne Ziel und bleibt beim Start der Absuche stehen', () => {
    const t = parseGroupTrack(raw({ ...lying }));
    expect(lyingMs(t, 70_000)).toBe(60_000);
    expect(lyingMs(parseGroupTrack(raw({ ...lying, status: 'searching', searchStartedAtMs: 40_000 })), 999_999)).toBe(30_000);
    expect(lyingMs(parseGroupTrack(raw()), 999_999)).toBeNull();
    expect(formatDuration(61_000)).toBe('1:01');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });

  it('zuteilen: gleiche trackId nach unklarer Antwort, neue nach eindeutigem Fehler', async () => {
    let fail: GroupApiError | null = new GroupApiError('GROUP_CONNECTION');
    const c = client((_a, r) => { if (fail) { const e = fail; fail = null; throw e; } return ok({ track: raw({ trackId: r.trackId }) }); });
    const service = createGroupTrackService(c.client, LAYER);
    await expect(service.assign(SESSION, PART, true)).rejects.toThrow('GROUP_CONNECTION');
    await service.assign(SESSION, PART, true);
    expect(c.calls[0].request.trackId).toBe(c.calls[1].request.trackId);
    expect(c.calls[0]).toMatchObject({ endpoint: 'training_group_tracks_v1', action: 'assign', request: { sessionId: SESSION, handlerParticipationId: PART, blind: true } });
    fail = new GroupApiError('GROUP_LIMIT');
    await expect(service.assign(SESSION, PART, true)).rejects.toThrow('GROUP_LIMIT');
    await service.assign(SESSION, PART, true);
    expect(c.calls[3].request.trackId).not.toBe(c.calls[2].request.trackId);
  });

  it('Liste darf nur Fährten dieses Gruppentrainings enthalten', async () => {
    const c = client(() => ok({ sessionId: SESSION, tracks: [raw({ sessionId: '30000000-0000-4000-8000-000000000002' })] }));
    await expect(createGroupTrackService(c.client, LAYER).list(SESSION)).rejects.toThrow('GROUP_INVALID_RESPONSE');
  });

  it('Verlauf laden nur als Leger:in oder Hundeführer:in, Paket wird geprüft', async () => {
    const good = client(() => ok({ track: raw({ ...lying }), package: reference }));
    await expect(createGroupTrackService(good.client, HANDLER).fetch('50000000-0000-4000-8000-000000000001')).resolves.toMatchObject({ reference: { distanceM: 120 } });
    await expect(createGroupTrackService(good.client, 'c3333333-3333-4333-8333-333333333333').fetch('50000000-0000-4000-8000-000000000001')).rejects.toThrow('GROUP_INVALID_RESPONSE');
    const broken = client(() => ok({ track: raw({ ...lying }), package: { version: 1, points: [{ lat: 1, lng: 1, breakBefore: false }], markers: [], distanceM: null, date: null } }));
    await expect(createGroupTrackService(broken.client, HANDLER).fetch('50000000-0000-4000-8000-000000000001')).rejects.toThrow('GROUP_INVALID_RESPONSE');
  });

  it('speichern schickt das geprüfte Paket', async () => {
    const c = client((_a, r) => ok({ track: raw({ trackId: r.trackId, ...lying }) }));
    await createGroupTrackService(c.client, LAYER).submit('50000000-0000-4000-8000-000000000001', reference as never);
    expect(c.calls[0]).toMatchObject({ action: 'submit', request: { trackId: '50000000-0000-4000-8000-000000000001', package: reference } });
  });
});

describe('Stufe 3: kantige Fläche', () => {
  const square = [{ lat: 47.369, lng: 8.539 }, { lat: 47.369, lng: 8.541 }, { lat: 47.371, lng: 8.541 }, { lat: 47.371, lng: 8.539 }];
  it('übernimmt das Rechteck vom Server', () => {
    const area = parseGroupTrack(raw({ ...lying, area: { ...lying.area, polygon: square } })).area;
    expect(area?.polygon).toEqual(square);
    expect(areaCorners(area!)).toEqual(square);
  });
  it('lehnt ungültige Ecken ab', () => {
    expect(() => parseGroupTrack(raw({ ...lying, area: { ...lying.area, polygon: square.slice(0, 2) } }))).toThrow(GroupApiError);
    expect(() => parseGroupTrack(raw({ ...lying, area: { ...lying.area, polygon: [...square.slice(0, 3), { lat: 'x', lng: 1 }] } }))).toThrow(GroupApiError);
  });
  it('ohne Server-Rechteck (alter Server) trotzdem eckig, nie rund', () => {
    const corners = areaCorners({ centerLat: 47.37, centerLng: 8.54, radiusM: 75, polygon: null });
    expect(corners).toHaveLength(4);
    const lats = new Set(corners.map(c => c.lat)), lngs = new Set(corners.map(c => c.lng));
    expect(lats.size).toBe(2); expect(lngs.size).toBe(2);
    expect(Math.max(...lats) - Math.min(...lats)).toBeCloseTo(150 / 111320, 6);
  });
});

describe('Eigene Fährte im Gruppentraining (Issue #150)', () => {
  const own = (over: Record<string, unknown> = {}) => raw({ handlerUserId: LAYER, blind: false, ...over });
  afterEach(() => { jest.restoreAllMocks(); });

  it('Leger:in = Hundeführer:in ist gültig, aber nie blind', () => {
    const track = parseGroupTrack(own({ ...lying }));
    expect(isOwnGroupTrack(track)).toBe(true);
    expect(isOwnGroupTrack(parseGroupTrack(raw()))).toBe(false);
    expect(() => parseGroupTrack(own({ blind: true }))).toThrow('GROUP_INVALID_RESPONSE');
  });

  it('Liste verlangt eigene Fährten ausdrücklich und liefert sie', async () => {
    const c = client(() => ok({ sessionId: SESSION, tracks: [raw(), own({ trackId: '50000000-0000-4000-8000-000000000002', ...lying })] }));
    const result = await createGroupTrackService(c.client, LAYER).list(SESSION);
    expect(c.calls).toEqual([{ endpoint: 'training_group_tracks_v1', action: 'list', request: { sessionId: SESSION, includeOwn: true, includeMantrail: true } }]);
    expect(result.ownTracks).toBe(true);
    expect(result.mantrailTracks).toBe(true);
    expect(result.tracks.map(isOwnGroupTrack)).toEqual([false, true]);
  });

  it('Server ohne die Migration: fragt ohne includeOwn nach, Liste bleibt nutzbar, kein Dauer-Doppelaufruf', async () => {
    const c = client((_a, r) => { if ('includeOwn' in r) throw new GroupApiError('GROUP_INVALID_REQUEST'); return ok({ sessionId: SESSION, tracks: [raw()] }); });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const service = createGroupTrackService(c.client, LAYER);
    const first = await service.list(SESSION);
    expect(first).toMatchObject({ ownTracks: false, tracks: [expect.objectContaining({ layerUserId: LAYER, handlerUserId: HANDLER })] });
    expect(c.calls.map(x => x.request)).toEqual([{ sessionId: SESSION, includeOwn: true, includeMantrail: true }, { sessionId: SESSION, includeOwn: true }, { sessionId: SESSION }]);
    expect((await service.list(SESSION)).ownTracks).toBe(false);
    expect(c.calls).toHaveLength(4);
    // Nach der Wartezeit erneut versuchen: der Server kann inzwischen aktualisiert sein.
    now.mockReturnValue(1_000_000 + OWN_TRACKS_RETRY_MS);
    await service.list(SESSION);
    expect(c.calls.slice(4).map(x => 'includeOwn' in x.request)).toEqual([true, true, false]);
  });

  it('Mantrailing (Spec 02): Server ohne Trail-Migration → einmal ohne includeMantrail, eigene Fährten bleiben', async () => {
    const c = client((_a, r) => { if ('includeMantrail' in r) throw new GroupApiError('GROUP_INVALID_REQUEST'); return ok({ sessionId: SESSION, tracks: [raw()] }); });
    const service = createGroupTrackService(c.client, LAYER);
    expect(await service.list(SESSION)).toMatchObject({ ownTracks: true, mantrailTracks: false });
    expect(c.calls.map(x => x.request)).toEqual([{ sessionId: SESSION, includeOwn: true, includeMantrail: true }, { sessionId: SESSION, includeOwn: true }]);
    await service.list(SESSION);
    expect(c.calls).toHaveLength(3);   // kein Dauer-Doppelaufruf
  });

  it('Mantrailing: kind wird gelesen; fehlt es (alter Server), ist es eine Fährte', async () => {
    const c = client(() => ok({ sessionId: SESSION, tracks: [raw(), raw({ trackId: '50000000-0000-4000-8000-000000000003', kind: 'mantrail' }), raw({ trackId: '50000000-0000-4000-8000-000000000004', kind: 'other' })] }));
    const { tracks } = await createGroupTrackService(c.client, LAYER).list(SESSION);
    expect(tracks.map(t => t.kind)).toEqual(['track', 'mantrail', 'track']);
  });

  it('Mantrailing: zuteilen mit kind; ohne kind bleibt die Anfrage wie bisher', async () => {
    const c = client((_a, r) => ok({ track: raw({ trackId: r.trackId, ...(r.kind ? { kind: r.kind } : {}) }) }));
    const service = createGroupTrackService(c.client, LAYER);
    await service.assign(SESSION, PART, true);
    expect(Object.keys(c.calls[0].request).sort()).toEqual(['blind', 'handlerParticipationId', 'sessionId', 'trackId']);
    const trail = await service.assign(SESSION, PART, true, 'mantrail');
    expect(c.calls[1].request).toMatchObject({ kind: 'mantrail', blind: true });
    expect(trail.kind).toBe('mantrail');
    // Server ohne Migration antwortet ohne kind → nicht still als Fährte weiterlegen.
    const old = client((_a, r) => ok({ track: raw({ trackId: r.trackId }) }));
    await expect(createGroupTrackService(old.client, LAYER).assign(SESSION, PART, false, 'mantrail')).rejects.toThrow('GROUP_INVALID_RESPONSE');
  });

  it('andere Fehler der Liste werden nicht als «alter Server» gedeutet', async () => {
    const c = client(() => { throw new GroupApiError('GROUP_UNAVAILABLE'); });
    await expect(createGroupTrackService(c.client, LAYER).list(SESSION)).rejects.toThrow('GROUP_UNAVAILABLE');
    expect(c.calls).toHaveLength(1);
  });

  it('zuteilen an die eigene Teilnahme: nie blind, gleiche Prüfung der Antwort', async () => {
    const c = client((_a, r) => ok({ track: own({ trackId: r.trackId }) }));
    const track = await createGroupTrackService(c.client, LAYER).assign(SESSION, PART, false);
    expect(c.calls[0]).toMatchObject({ action: 'assign', request: { sessionId: SESSION, handlerParticipationId: PART, blind: false } });
    expect(isOwnGroupTrack(track)).toBe(true);
  });
});
