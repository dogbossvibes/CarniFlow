import { GroupApiError } from '../groups/groupRpc';
import { canManageGroup, parseGroup } from '../groups/groupModels';
import { createGroupJoinService, formatGroupCode, groupJoinLink, parseGroupCode } from '../groups/joinService';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}` }));

const USER = 'a1111111-1111-4111-8111-111111111111';
const GROUP = '10000000-0000-4000-8000-000000000001';
const ok = (body: Record<string, unknown>) => ({ version: 1, serverNowMs: 1, ...body });

function client(responses: ((action: string, request: Record<string, unknown>) => Record<string, unknown>)) {
  const calls: { endpoint: string; action: string; request: Record<string, unknown> }[] = [];
  return {
    calls,
    client: {
      call: jest.fn(async (_user: string, endpoint: string, action: string, request: Record<string, unknown>) => {
        calls.push({ endpoint, action, request });
        return responses(action, request);
      }),
      dispose: jest.fn(),
    } as never,
  };
}

describe('Codes', () => {
  it('liest Code aus Eingabe, Link und Kleinschreibung', () => {
    expect(parseGroupCode(' abcd-ef01-2345 ')).toBe('ABCDEF012345');
    expect(parseGroupCode('anyvo://groups/join?code=abcdef012345')).toBe('ABCDEF012345');
    expect(parseGroupCode('https://x.test/?a=1&code=AB%20CD')).toBe('ABCD');
    expect(parseGroupCode('ABCDEF0123456789')).toHaveLength(12);
  });
  it('formatiert und verlinkt', () => {
    expect(formatGroupCode('ABCDEF012345')).toBe('ABCD-EF01-2345');
    expect(groupJoinLink('ABCDEF012345')).toBe('anyvo://groups/join?code=ABCDEF012345');
  });
});

describe('createGroupJoinService', () => {
  beforeEach(() => { mockUuid = 0; });

  it('nutzt ausschliesslich training_group_join_v1', async () => {
    const c = client(() => ok({ requests: [] }));
    await createGroupJoinService(c.client, USER).mine();
    expect(c.calls).toEqual([{ endpoint: 'training_group_join_v1', action: 'mine', request: {} }]);
  });

  it('ungültiger Code ergibt null statt Fehler', async () => {
    const c = client(() => ok({ invalidCode: true }));
    const service = createGroupJoinService(c.client, USER);
    await expect(service.preview('abcd-ef01-2345')).resolves.toBeNull();
    expect(c.calls[0].request).toEqual({ code: 'ABCDEF012345' });
    await expect(service.request('ABCDEF012345', 'Neu')).resolves.toBeNull();
  });

  it('Vorschau zeigt nur Gruppenname, einladende Person und Status', async () => {
    const c = client(() => ok({ preview: { groupTitle: 'Samstag', inviterName: 'Sandra', status: 'none' } }));
    await expect(createGroupJoinService(c.client, USER).preview('ABCDEF012345'))
      .resolves.toEqual({ groupTitle: 'Samstag', inviterName: 'Sandra', status: 'none' });
  });

  it('behält die Anfrage-ID nur bei unklarem Ausgang', async () => {
    let fail: GroupApiError | null = new GroupApiError('GROUP_CONNECTION');
    const c = client((_action, request) => {
      if (fail) { const e = fail; fail = null; throw e; }
      return ok({ request: { requestId: request.requestId, groupId: GROUP, groupTitle: 'G', displayName: 'Neu', status: 'pending', createdAtMs: 1 } });
    });
    const service = createGroupJoinService(c.client, USER);
    await expect(service.request('ABCDEF012345', 'Neu')).rejects.toThrow('GROUP_CONNECTION');
    await service.request('ABCDEF012345', ' Neu ');
    expect(c.calls[0].request.requestId).toBe(c.calls[1].request.requestId);
    expect(c.calls[1].request.displayName).toBe('Neu');

    fail = new GroupApiError('GROUP_CONFLICT');
    await expect(service.request('ABCDEF012345', 'Neu')).rejects.toThrow('GROUP_CONFLICT');
    await service.request('ABCDEF012345', 'Neu');
    expect(c.calls[3].request.requestId).not.toBe(c.calls[2].request.requestId);
  });

  it('weist Antworten zurück, die nicht zur Anfrage passen', async () => {
    const c = client(action => action === 'code_create'
      ? ok({ groupId: '20000000-0000-4000-8000-000000000002', code: 'ABCDEF012345', expiresAtMs: 5, maxUses: 8 })
      : ok({ groupId: GROUP, requestId: 'x', approved: true }));
    const service = createGroupJoinService(c.client, USER);
    await expect(service.createCode(GROUP)).rejects.toThrow('GROUP_INVALID_RESPONSE');
    await expect(service.decide(GROUP, '30000000-0000-4000-8000-000000000003', true)).rejects.toThrow('GROUP_INVALID_RESPONSE');
  });

  it('setzt Rollen mit Mitgliedschaft und prüft die Bestätigung', async () => {
    const c = client((_a, r) => ok({ groupId: r.groupId, memberUserId: r.memberUserId, membershipId: r.membershipId, role: r.role }));
    await createGroupJoinService(c.client, USER).setRole(GROUP, 'b2222222-2222-4222-8222-222222222222', 'm', 'organizer');
    expect(c.calls[0]).toEqual({ endpoint: 'training_group_join_v1', action: 'set_role',
      request: { groupId: GROUP, memberUserId: 'b2222222-2222-4222-8222-222222222222', membershipId: 'm', role: 'organizer' } });
  });
});

describe('Rollen im Gruppenmodell', () => {
  const raw = (members: Record<string, unknown>[], status = 'active') => ({ groupId: GROUP, title: 'G', ownerUserId: USER, status, createdAtMs: 1, members });
  const owner = { membershipId: GROUP, userId: USER, displayName: 'O', role: 'owner', joinedAtMs: 1 };
  const orga = { membershipId: '40000000-0000-4000-8000-000000000004', userId: 'b2222222-2222-4222-8222-222222222222', displayName: 'B', role: 'member', isOrganizer: true, joinedAtMs: 2 };
  const plain = { membershipId: '50000000-0000-4000-8000-000000000005', userId: 'c3333333-3333-4333-8333-333333333333', displayName: 'C', role: 'member', joinedAtMs: 3 };

  it('liest isOrganizer, ältere Antworten ohne Feld bleiben Mitglieder', () => {
    const group = parseGroup(raw([owner, orga, plain]));
    expect(group.members.map(m => m.isOrganizer)).toEqual([false, true, false]);
  });
  it('Inhaber:in kann nicht zusätzlich Organisator:in sein', () => {
    expect(parseGroup(raw([{ ...owner, isOrganizer: true }])).members[0].isOrganizer).toBe(false);
  });
  it('verwalten dürfen Inhaber:in und Organisator:in einer aktiven Gruppe', () => {
    const group = parseGroup(raw([owner, orga, plain]));
    expect(canManageGroup(group, USER)).toBe(true);
    expect(canManageGroup(group, orga.userId)).toBe(true);
    expect(canManageGroup(group, plain.userId)).toBe(false);
    expect(canManageGroup(group, null)).toBe(false);
    expect(canManageGroup(parseGroup(raw([owner, orga], 'ended')), USER)).toBe(false);
  });
});
