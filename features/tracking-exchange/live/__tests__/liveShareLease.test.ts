import { LiveShareLease, LiveShareViewLease, LIVE_SHARE_MAX_DURATION_MS,
  type ShareGrant } from '../liveShareLease';

const scope = { userId: 'owner', sessionId: 'session', dogId: 'dog' };
const position = { latitude: 47, longitude: 8, accuracyM: 4 };
const grant: ShareGrant = { ...scope, shareId: 'share', serverNowMs: 1_000_000,
  expiresAtMs: 1_060_000 };
let now = 100;
beforeEach(() => { now = 100; });

function active() {
  const lease = new LiveShareLease(() => now);
  const request = lease.requestActivation(scope)!;
  expect(lease.acceptActivation(request, grant)).toBe(true);
  return lease;
}

it('never sends before explicit confirmation and server acceptance', () => {
  const lease = new LiveShareLease(() => now);
  expect(lease.takePosition(scope, position, now)).toBeNull();
  const request = lease.requestActivation(scope)!;
  expect(lease.isActive()).toBe(false); // UI polling must not cancel the pending request.
  expect(lease.takePosition(scope, position, now)).toBeNull();
  expect(lease.acceptActivation(request, grant)).toBe(true);
  expect(lease.takePosition(scope, position, now)).toEqual({ ...position,
    shareId: 'share', sessionId: 'session', sequence: 1, observedAtMonotonicMs: now });
});

it('deducts round-trip latency and expires at the boundary without wall-clock dependence', () => {
  const lease = new LiveShareLease(() => now);
  const request = lease.requestActivation(scope)!;
  now += 20_000;
  expect(lease.acceptActivation(request, grant)).toBe(true);
  now = 60_099;
  expect(lease.isActive()).toBe(true);
  now++;
  expect(lease.takePosition(scope, position, now)).toBeNull();
});

it.each([
  { expiresAtMs: grant.serverNowMs }, { expiresAtMs: Infinity }, { serverNowMs: NaN },
  { expiresAtMs: grant.serverNowMs + LIVE_SHARE_MAX_DURATION_MS + 1 },
  { userId: 'other' }, { sessionId: 'other' }, { dogId: 'other' }, { shareId: '' },
])('rejects invalid, expired or cross-scope server grants: %s', patch => {
  const lease = new LiveShareLease(() => now);
  expect(lease.acceptActivation(lease.requestActivation(scope)!, { ...grant, ...patch })).toBe(false);
  expect(lease.isActive()).toBe(false);
});

it('ignores old activation responses after stop and after a newer request', () => {
  const lease = new LiveShareLease(() => now);
  const old = lease.requestActivation(scope)!;
  lease.stop();
  expect(lease.acceptActivation(old, grant)).toBe(false);
  const current = lease.requestActivation(scope)!;
  expect(lease.acceptActivation(old, grant)).toBe(false);
  expect(lease.acceptActivation(current, grant)).toBe(true);
  expect(lease.acceptActivation(current, grant)).toBe(false);
  expect(lease.isActive()).toBe(true);
});

it('stops immediately when the lifecycle adapter calls stop; never auto-resumes', () => {
  const lease = active();
  expect(lease.stop()).toBe('share');
  now += 10_000;
  expect(lease.takePosition(scope, position, now)).toBeNull();
  expect(lease.stop()).toBeNull();
});

it('never shares a cached position observed before the consent grant was accepted', () => {
  const lease = active();
  expect(lease.takePosition(scope, position, now - 1)).toBeNull();
  expect(lease.takePosition(scope, position, now)).not.toBeNull();
});

it('does not silently replace a pending or active grant, preserving explicit revoke ownership', () => {
  const lease = new LiveShareLease(() => now);
  const first = lease.requestActivation(scope)!;
  expect(lease.requestActivation({ ...scope, sessionId: 'next' })).toBeNull();
  expect(lease.acceptActivation(first, grant)).toBe(true);
  expect(lease.requestActivation(scope)).toBeNull();
  expect(lease.stop()).toBe('share');
  expect(lease.requestActivation({ ...scope, sessionId: 'next' })).not.toBeNull();
});

it('rejects stale, future and invalid fixes without using up the send interval', () => {
  const lease = active();
  for (const observedAt of [now - 10_001, now + 1, NaN]) {
    expect(lease.takePosition(scope, position, observedAt)).toBeNull();
  }
  for (const invalid of [{ latitude: 91 }, { longitude: -181 }, { accuracyM: -1 }, { latitude: NaN }]) {
    expect(lease.takePosition(scope, { ...position, ...invalid }, now)).toBeNull();
  }
  expect(lease.takePosition(scope, position, now)?.sequence).toBe(1);
  now += 4_999;
  expect(lease.takePosition(scope, position, now)).toBeNull();
  now++;
  expect(lease.takePosition(scope, position, now)?.sequence).toBe(2);
});

it.each(['userId', 'dogId', 'sessionId'] as const)('stops when %s changes', key => {
  const lease = active();
  expect(lease.takePosition({ ...scope, [key]: 'other' }, position, now)).toBeNull();
  expect(lease.takePosition(scope, position, now)).toBeNull();
});

it('does not trust a caller mutating the original grant/scope', () => {
  const lease = new LiveShareLease(() => now);
  const originalScope = { ...scope };
  const request = lease.requestActivation(originalScope)!;
  originalScope.userId = 'other';
  const originalGrant = { ...grant };
  expect(lease.acceptActivation(request, originalGrant)).toBe(true);
  originalGrant.expiresAtMs += 1_000_000;
  now += 60_000;
  expect(lease.isActive()).toBe(false);
});

it.each([99, NaN, Infinity])('fails closed on invalid/backward monotonic clock %s', clock => {
  const lease = active();
  now = clock;
  expect(lease.isActive()).toBe(false);
  now = 200;
  expect(lease.isActive()).toBe(false);
});

it('receiver clears the map after its short lease, without a successful refresh', () => {
  const view = new LiveShareViewLease(() => now);
  const request = view.beginRefresh();
  now += 2_000;
  expect(view.acceptRefresh(request, [position], grant.serverNowMs, grant.expiresAtMs)).toBe(true);
  expect(view.read()).toEqual([position]);
  now = 5_100;
  expect(view.read()).toEqual([]);
});

it('receiver discards late and duplicate responses after revoke, logout or session switch', () => {
  const view = new LiveShareViewLease(() => now);
  const old = view.beginRefresh();
  view.clear();
  expect(view.acceptRefresh(old, [position], grant.serverNowMs, grant.expiresAtMs)).toBe(false);
  const current = view.beginRefresh();
  expect(view.acceptRefresh(current, [position], grant.serverNowMs, grant.expiresAtMs)).toBe(true);
  expect(view.acceptRefresh(current, [], grant.serverNowMs, grant.expiresAtMs)).toBe(false);
  expect(view.read()).toEqual([position]);
});

it('receiver snapshots are immutable and cannot keep future location copies live', () => {
  const view = new LiveShareViewLease(() => now);
  const p = { ...position };
  view.acceptRefresh(view.beginRefresh(), [p], grant.serverNowMs, grant.expiresAtMs);
  p.latitude = 0;
  expect(view.read()[0].latitude).toBe(47);
  expect(Object.isFrozen(view.read())).toBe(true);
  expect(Object.isFrozen(view.read()[0])).toBe(true);
});

it.each([NaN, Infinity, 99, 5_100])('receiver rejects invalid or too-late clock %s', clock => {
  const view = new LiveShareViewLease(() => now);
  const request = view.beginRefresh();
  now = clock;
  expect(view.acceptRefresh(request, [position], grant.serverNowMs, grant.expiresAtMs)).toBe(false);
  expect(view.read()).toEqual([]);
});

it('receiver respects access expiry before its five-second display limit', () => {
  const view = new LiveShareViewLease(() => now);
  view.acceptRefresh(view.beginRefresh(), [position], grant.serverNowMs, grant.serverNowMs + 500);
  now += 500;
  expect(view.read()).toEqual([]);
});

it('clearing expired pixels does not starve an in-flight initial or renewed snapshot', () => {
  const view = new LiveShareViewLease(() => now);
  const first = view.beginRefresh();
  now += 1000; expect(view.read()).toEqual([]);
  expect(view.acceptRefresh(first, [position], grant.serverNowMs, grant.expiresAtMs)).toBe(true);
  now = 4100; const renewal = view.beginRefresh();
  now = 5100; expect(view.read()).toEqual([]);
  expect(view.acceptRefresh(renewal, [position], grant.serverNowMs, grant.expiresAtMs)).toBe(true);
  expect(view.read()).toEqual([position]);
});
