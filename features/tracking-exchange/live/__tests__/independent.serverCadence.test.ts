import { LiveShareController, type StartShare } from '../liveShareController';
import { createLiveShareTransport } from '../liveShareTransport';
import { RevocationJournal } from '../revocationJournal';

it('keeps sharing across shrinking network latency while respecting the installed server receive-time limit', async () => {
  let now = 100;
  const userId = '10000000-0000-4000-8000-000000000001';
  const input: StartShare = { userId, sessionId: '20000000-0000-4000-8000-000000000001',
    dogId: '30000000-0000-4000-8000-000000000001', shareId: '40000000-0000-4000-8000-000000000001',
    recipientIds: ['10000000-0000-4000-8000-000000000002'], durationMs: 60_000 };
  const stored = new Map<string, string>();
  const journal = new RevocationJournal({ getItem: async k => stored.get(k) ?? null,
    setItem: async (k, v) => { stored.set(k, v); } });
  let previousReceived = -Infinity;
  const arrivals: number[] = [];
  const rejected: number[] = [];
  const rpc = jest.fn(async (_user: string, _endpoint: string, action: string, request: Record<string, unknown>) => {
    if (action === 'start') return { version: 1, serverNowMs: 1_000_100, expiresAtMs: 1_060_100,
      ...input, recipientUserIds: input.recipientIds };
    if (action === 'revoke') return { version: 1, serverNowMs: 1_000_000 + now, shareId: input.shareId, revoked: true };
    // Exact installed SQL rule: at_time - last_received_at must be >= 5 seconds.
    // First request takes 1s upstream, second only 100ms; both are successful connections.
    const receiveAt = now + (arrivals.length === 0 ? 1000 : 100);
    arrivals.push(receiveAt);
    if (receiveAt - previousReceived < 5000) { rejected.push(receiveAt); throw new Error('GROUP_CONFLICT'); }
    previousReceived = receiveAt;
    now = receiveAt + 100;
    return { version: 1, serverNowMs: 1_000_000 + receiveAt, shareId: input.shareId,
      sequence: request.sequence, accepted: true };
  });
  const controller = new LiveShareController(createLiveShareTransport(rpc, () => now), journal,
    () => userId, () => now, () => undefined);
  expect(await controller.start(input)).toBe(true);
  await controller.position({ latitude: 47, longitude: 8, accuracyM: 4 }, now);
  expect(controller.snapshot.phase).toBe('sharing');
  now = 5100; // foreground observations 5s apart, as requested from expo-location
  await controller.position({ latitude: 47.0001, longitude: 8, accuracyM: 4 }, now);
  expect({ phase: controller.snapshot.phase, rejected }).toEqual({ phase: 'sharing', rejected: [] });
});
