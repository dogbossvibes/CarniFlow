import { GroupApiError } from '../groups/groupRpc';
import { createGroupPlanService, parseEntry, parsePlan, parsePlanDetail } from '../groups/planService';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `60000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}` }));

const ME = 'a1111111-1111-4111-8111-111111111111';
const BEA = 'b2222222-2222-4222-8222-222222222222';
const GROUP = '10000000-0000-4000-8000-000000000001';
const PLAN = '70000000-0000-4000-8000-000000000001';
const ENTRY = '80000000-0000-4000-8000-000000000001';
const DOG = 'b0000000-0000-4000-8000-0000000000b1';
const plan = (over: Record<string, unknown> = {}) => ({ planId: PLAN, groupId: GROUP, createdByUserId: ME, title: 'Fährtentag', startsAtMs: 1_800_000_000_000,
  meetingPoint: 'Parkplatz Wald', meetingLat: null, meetingLng: null, notes: null, status: 'published', sessionId: null, createdAtMs: 1, updatedAtMs: 2, ...over });
const entry = (over: Record<string, unknown> = {}) => ({ entryId: ENTRY, position: 1, handlerUserId: BEA, handlerName: 'Bea', layerUserId: ME, layerName: 'Anna',
  dog: null, plannedLyingMinutes: 60, trackKind: 'igp1', fieldNote: null, blind: false, handlerResponse: 'open', layerResponse: 'open', trackId: null, updatedAtMs: 3, ...over });
const ok = (body: Record<string, unknown>) => ({ version: 1, serverNowMs: 5, ...body });

function client(respond: (action: string, request: Record<string, unknown>) => Record<string, unknown>) {
  const calls: { endpoint: string; action: string; request: Record<string, unknown> }[] = [];
  return { calls, client: { call: jest.fn(async (_u: string, endpoint: string, action: string, request: Record<string, unknown>) => {
    calls.push({ endpoint, action, request }); return respond(action, request); }), dispose: jest.fn() } as never };
}

describe('Vereinsmodus: Antworten prüfen', () => {
  it('liest Plan und Startliste; ehemaliges Mitglied ohne Namen', () => {
    const d = parsePlanDetail({ ...plan(), entries: [entry({ handlerName: null })] });
    expect(d).toMatchObject({ planId: PLAN, status: 'published', meetingPoint: 'Parkplatz Wald' });
    expect(d.entries[0]).toMatchObject({ handlerName: null, trackKind: 'igp1', dog: null });
  });
  it('lehnt Unstimmiges ab: Hund ohne Zusage, eigene Fährte blind, unbekannter Status, halbe Koordinate, doppelte Zeile', () => {
    expect(() => parseEntry(entry({ dog: { dogId: DOG, name: 'Luna', breed: null } }))).toThrow('GROUP_INVALID_RESPONSE');
    expect(parseEntry(entry({ handlerResponse: 'yes', dog: { dogId: DOG, name: 'Luna', breed: 'Malinois' } })).dog).toEqual({ dogId: DOG, name: 'Luna', breed: 'Malinois' });
    expect(() => parseEntry(entry({ layerUserId: BEA, blind: true }))).toThrow('GROUP_INVALID_RESPONSE');
    expect(() => parseEntry(entry({ trackKind: 'agility' }))).toThrow('GROUP_INVALID_RESPONSE');
    expect(() => parsePlan(plan({ status: 'archived' }))).toThrow('GROUP_INVALID_RESPONSE');
    expect(() => parsePlan(plan({ meetingLat: 47 }))).toThrow('GROUP_INVALID_RESPONSE');
    expect(() => parsePlanDetail({ ...plan(), entries: [entry(), entry()] })).toThrow('GROUP_INVALID_RESPONSE');
  });
});

describe('Vereinsmodus: Anfragen', () => {
  beforeEach(() => { mockUuid = 0; });

  it('Liste nur der eigenen Gruppe; canPlan vom Server', async () => {
    const c = client(() => ok({ groupId: GROUP, canPlan: true, plans: [plan()] }));
    const r = await createGroupPlanService(c.client, ME).list(GROUP);
    expect(c.calls[0]).toEqual({ endpoint: 'training_group_plan_v1', action: 'list', request: { groupId: GROUP } });
    expect(r).toMatchObject({ canPlan: true, plans: [{ planId: PLAN }] });
    const wrong = client(() => ok({ groupId: GROUP, plans: [plan({ groupId: '10000000-0000-4000-8000-000000000009' })] }));
    await expect(createGroupPlanService(wrong.client, ME).list(GROUP)).rejects.toThrow('GROUP_INVALID_RESPONSE');
  });

  it('Anlegen: dieselbe Eingabe nach Verbindungsabbruch = dieselbe planId (kein doppelter Plan)', async () => {
    let fail = true;
    const c = client((_a, r) => { if (fail) { fail = false; throw new GroupApiError('GROUP_CONNECTION'); } return ok({ plan: { ...plan({ planId: r.planId, status: 'draft' }), entries: [] } }); });
    const service = createGroupPlanService(c.client, ME);
    const input = { title: ' Fährtentag ', startsAtMs: 1_800_000_000_000.4, meetingPoint: '  ', notes: null };
    await expect(service.create(GROUP, input)).rejects.toThrow('GROUP_CONNECTION');
    await service.create(GROUP, input);
    expect(c.calls[0].request.planId).toBe(c.calls[1].request.planId);
    expect(c.calls[1].request).toEqual({ groupId: GROUP, planId: c.calls[1].request.planId, title: 'Fährtentag', startsAtMs: 1_800_000_000_000 });
  });

  it('Zeile setzen: leere Felder fehlen, Ganzzahl für Liegezeit', async () => {
    const c = client(() => ok({ plan: { ...plan(), entries: [entry()] } }));
    await createGroupPlanService(c.client, ME).setEntry(PLAN, { position: 1, handlerUserId: BEA, trackKind: 'igp1', blind: false, plannedLyingMinutes: 59.6, fieldNote: ' ' });
    expect(c.calls[0].request).toEqual({ planId: PLAN, entryId: expect.any(String), position: 1, handlerUserId: BEA, trackKind: 'igp1', blind: false, plannedLyingMinutes: 60 });
  });

  it('Zusage mit eigenem Hund; Absage schickt nie einen Hund', async () => {
    const c = client(() => ok({ plan: { ...plan(), entries: [entry({ handlerResponse: 'yes' })] } }));
    const service = createGroupPlanService(c.client, BEA);
    await service.respond(PLAN, ENTRY, 'yes', DOG);
    await service.respond(PLAN, ENTRY, 'no', DOG);
    expect(c.calls.map(x => x.request)).toEqual([
      { planId: PLAN, entryId: ENTRY, response: 'yes', dogId: DOG },
      { planId: PLAN, entryId: ENTRY, response: 'no' },
    ]);
  });

  it('Antwort zu einem anderen Plan wird abgelehnt', async () => {
    const c = client(() => ok({ plan: { ...plan({ planId: '70000000-0000-4000-8000-000000000002' }), entries: [] } }));
    await expect(createGroupPlanService(c.client, ME).publish(PLAN)).rejects.toThrow('GROUP_INVALID_RESPONSE');
  });
});
