import { GroupApiError } from '../groups/groupRpc';
import { createGroupTrackService, formatDuration, lyingMs, parseGroupTrack, GROUP_TRACK_HANDOVER_READY } from '../groups/trackService';

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
const reference = { version: 1, points: [{ lat: 47.37, lng: 8.54, breakBefore: false }, { lat: 47.371, lng: 8.541, breakBefore: false }],
  markers: [], distanceM: 120, date: null };

function client(respond: (action: string, request: Record<string, unknown>) => Record<string, unknown>) {
  const calls: { endpoint: string; action: string; request: Record<string, unknown> }[] = [];
  return { calls, client: { call: jest.fn(async (_u: string, endpoint: string, action: string, request: Record<string, unknown>) => {
    calls.push({ endpoint, action, request }); return respond(action, request); }), dispose: jest.fn() } as never };
}

describe('Fährten im Gruppentraining', () => {
  beforeEach(() => { mockUuid = 0; });

  it('Übergabe bleibt bis Stufe 2b abgeschaltet', () => { expect(GROUP_TRACK_HANDOVER_READY).toBe(false); });

  it('liest Status und Fläche; liegend ohne Fläche ist ungültig', () => {
    expect(parseGroupTrack(raw({ ...lying })).area).toEqual({ centerLat: 47.37, centerLng: 8.54, radiusM: 75 });
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
    const broken = client(() => ok({ track: raw({ ...lying }), package: { version: 1, points: [] } }));
    await expect(createGroupTrackService(broken.client, HANDLER).fetch('50000000-0000-4000-8000-000000000001')).rejects.toThrow('GROUP_INVALID_RESPONSE');
  });

  it('speichern schickt das geprüfte Paket', async () => {
    const c = client((_a, r) => ok({ track: raw({ trackId: r.trackId, ...lying }) }));
    await createGroupTrackService(c.client, LAYER).submit('50000000-0000-4000-8000-000000000001', reference as never);
    expect(c.calls[0]).toMatchObject({ action: 'submit', request: { trackId: '50000000-0000-4000-8000-000000000001', package: reference } });
  });
});
