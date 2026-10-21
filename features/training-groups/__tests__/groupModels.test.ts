import backendExamples from './fixtures/core-rpc-synthetic-v1.json';
import { parseLivePosition, parseSession, parseGroup } from '../groupModels';
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
const user = '11111111-1111-4000-8000-000000000001', sid = '11111111-1111-4000-8000-000000000104';
const dog = '11111111-1111-4000-8000-000000000011', gid = '11111111-1111-4000-8000-000000000103';
const session = { sessionId: sid, groupId: gid, ownerUserId: user, title: 'Session', status: 'active', expiresAtMs: 200000,
  participants: [{ participationId: sid, userId: user, displayName: 'Owner A', dogId: dog, dogName: 'Synthetic 1', colorKey: '#123ABC' }] };
const point = { shareId: gid, userId: user, sessionId: sid, dogId: dog, latitude: 0, longitude: 0, accuracyM: 5,
  sequence: 1, observedAtMs: 100000, receivedAtMs: 100000, expiresAtMs: 200000 };
it('retains the contract participation epoch and explicit HEX color but strips unrelated payload', () => {
  const parsed = parseSession({ ...session, privateNotes: 'do not expose' });
  expect(parsed).toEqual(session); expect(parsed).not.toHaveProperty('privateNotes');
});
it('does not invent an epoch for old or malformed participant responses', () => {
  expect(() => parseSession({ ...session, participants: [{ ...session.participants[0], participationId: undefined }] })).toThrow('INVALID_RESPONSE');
});
it.each([
  { latitude: NaN }, { longitude: 181 }, { accuracyM: -1 }, { sequence: 1.5 },
  { observedAtMs: 89999 }, { observedAtMs: 102001 }, { expiresAtMs: 100000 }, { receivedAtMs: 100001 },
])('refuses invalid or stale live evidence %p', changes => {
  expect(() => parseLivePosition({ ...point, ...changes }, sid, 100000)).toThrow('INVALID_RESPONSE');
});
it('accepts equator and prime meridian coordinates without treating zero as missing', () => {
  expect(parseLivePosition(point, sid, 100000)).toEqual(point);
});
it('rejects unbounded membership payloads rather than truncating permission context', () => {
  const member = { membershipId: gid, userId: user, displayName: 'A', role: 'owner', joinedAtMs: 100000 };
  expect(() => parseGroup({ groupId: gid, ownerUserId: user, title: 'Group', status: 'active', createdAtMs: 100000,
    members: Array(51).fill(member) })).toThrow('INVALID_RESPONSE');
});

// Captured from05's PostgreSQL17 tests; synthetic, not real-account HTTP acceptance.
it('parses independently generated backend revision3 examples without dropping epochs', () => {
  const samples = backendExamples as Record<string, Record<string, unknown>>;
  for (const key of ['training_group_v1:create', 'training_group_v1:accept']) {
    const group = parseGroup(samples[key].group);
    expect(group.members.every(m => m.membershipId)).toBe(true);
  }
  for (const key of ['training_group_session_v1:open', 'training_group_session_v1:join', 'training_group_session_v1:get']) {
    expect(parseSession(samples[key].session).participants.every(p => p.participationId)).toBe(true);
  }
  const live = samples['training_group_live_v1:snapshot'];
  for (const position of live.positions as { sessionId: string }[]) {
    expect(parseLivePosition(position, position.sessionId, live.serverNowMs as number)).toBeDefined();
  }
});
