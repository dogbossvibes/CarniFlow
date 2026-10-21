import { WearableController } from '../controller';
import { parseWearableRequest } from '../protocol';
import type { WearableAck, WearableCommand, WearableSnapshot, WearableState } from '../protocol';
import fixtures from './wire-fixtures-v1.json';
const deferred = () => { let resolve!: (value: boolean) => void; const promise = new Promise<boolean>(r => { resolve = r; }); return { resolve, promise }; };
function setup() {
  let now = 1_800_000_000_000; let id = 0;
  const controller = new WearableController({ now: () => now, id: () => `local-${++id}` });
  controller.setOwner('owner-a');
  const state: WearableState = { sessionId: 'run-a', dogId: 'dog-a', dogName: 'Beispielhund', phase: 'lay_recording', distanceM: 10, elapsedSeconds: 12, capabilities: ['mark_object', 'pause', 'end_phase'] };
  const execute = jest.fn(async () => true);
  const dispose = controller.register('owner-a', { getState: () => ({ ...state }), execute });
  let commandIndex = 0;
  const command = (patch: Partial<WearableCommand> = {}): WearableCommand => {
    const snapshot = controller.snapshot();
    return { protocolVersion: 1, kind: 'command', commandId: `00000000-0000-4000-8000-${String(++commandIndex).padStart(12, '0')}`,
      contextId: snapshot.contextId!, revision: snapshot.revision, leaseId: snapshot.leaseId!,
      sessionId: snapshot.sessionId, dogId: snapshot.dogId!, action: 'mark_object', confirmed: false, ...patch };
  };
  const receive = (value: unknown, deadline = now + 5_000) => controller.receive(JSON.stringify(value), deadline) as Promise<WearableAck>;
  return { controller, state, execute, dispose, command, receive, advance: (ms: number) => { now += ms; }, now: () => now };
}
describe('strict wearable wire protocol', () => {
  it('accepts synthetic v1 requests and rejects unknown keys', () => {
    expect(parseWearableRequest(JSON.stringify(fixtures.command))).toEqual(fixtures.command);
    expect(parseWearableRequest(JSON.stringify(fixtures.snapshotRequest))).toEqual(fixtures.snapshotRequest);
    expect(parseWearableRequest(JSON.stringify({ ...fixtures.command, peerId: 'spoofed' }))).toBeNull();
    expect(parseWearableRequest(JSON.stringify({ ...fixtures.snapshotRequest, action: 'pause' }))).toBeNull();
  });
  it.each([null, [], {}, 42, 'x', { ...fixtures.command, action: 'delete' }, { ...fixtures.command, revision: 1.5 }, { ...fixtures.command, confirmed: 'yes' }, { ...fixtures.command, commandId: 'not-uuid' }, { ...fixtures.command, dogId: '' }])('fails closed for malformed request %j', value => {
    expect(parseWearableRequest(JSON.stringify(value))).toBeNull();
  });
  it('rejects oversized and truncated JSON', () => {
    expect(parseWearableRequest('{')).toBeNull(); expect(parseWearableRequest(' '.repeat(8193))).toBeNull();
  });
});
describe('phone-owned wearable control', () => {
  it('executes only current capabilities and acknowledges actual handler success', async () => {
    const s = setup(); const result = await s.receive(s.command());
    expect(result.status).toBe('accepted'); expect(s.execute).toHaveBeenCalledTimes(1);
    s.execute.mockResolvedValueOnce(false); expect((await s.receive(s.command())).reason).toBe('failed');
    s.execute.mockRejectedValueOnce(new Error('disk')); expect((await s.receive(s.command())).status).toBe('rejected');
  });
  it('does not expose or recover a recorder from a cached snapshot', async () => {
    const s = setup(); const command = s.command(); s.dispose();
    expect((await s.receive(command)).reason).toBe('unavailable');
    expect(s.controller.snapshot().capabilities).toEqual([]); expect(s.execute).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation before ending', async () => {
    const s = setup(); expect((await s.receive(s.command({ action: 'end_phase' }))).reason).toBe('confirmation_required');
    expect(s.execute).not.toHaveBeenCalled();
    expect((await s.receive(s.command({ action: 'end_phase', confirmed: true }))).status).toBe('accepted');
  });
  it.each([['contextId', 'other', 'stale_context'], ['revision', 99, 'stale_revision'], ['leaseId', 'absent', 'expired'], ['sessionId', 'another-run', 'wrong_target'], ['dogId', 'another-dog', 'wrong_target'], ['action', 'resume', 'not_allowed']] as const)('rejects altered %s', async (key, value, reason) => {
    const s = setup(); expect((await s.receive(s.command({ [key]: value }))).reason).toBe(reason); expect(s.execute).not.toHaveBeenCalled();
  });
  it('does not invalidate commands for distance/timer ticks', async () => {
    const s = setup(); const command = s.command(); s.state.distanceM = 12; s.state.elapsedSeconds = 13;
    expect((await s.receive(command)).status).toBe('accepted');
  });
  it('invalidates commands when pause/capabilities change', async () => {
    const s = setup(); const command = s.command(); s.state.phase = 'lay_paused'; s.state.capabilities = ['resume', 'end_phase'];
    expect((await s.receive(command)).reason).toBe('stale_revision'); expect(s.execute).not.toHaveBeenCalled();
  });
  it('keeps a still-valid previous lease during refresh and expires it exactly', async () => {
    const s = setup(); const command = s.command(); s.advance(21_000); expect(s.controller.snapshot().leaseId).not.toBe(command.leaseId);
    expect((await s.receive(command)).status).toBe('accepted');
    const second = s.command(); s.advance(30_000); expect((await s.receive(second)).reason).toBe('expired');
  });
  it('rejects delayed native events even if the phone lease is valid', async () => {
    const s = setup(); const command = s.command(); const deadline = s.now() + 5_000; s.advance(5_000);
    expect((await s.receive(command, deadline)).reason).toBe('expired'); expect(s.execute).not.toHaveBeenCalled();
  });
  it('rejects forged native deadlines and wall-clock rollback', async () => {
    const s = setup(); const command = s.command(); expect((await s.receive(command, s.now() + 30_000)).reason).toBe('expired');
    s.advance(-1_000); expect((await s.receive(command)).reason).toBe('expired');
  });
  it('deduplicates pending commands, rejects changed ID reuse and never queues a second command', async () => {
    const s = setup(); const pending = deferred(); s.execute.mockImplementationOnce(() => pending.promise);
    const command = s.command(); const first = s.receive(command); await Promise.resolve();
    const duplicate = s.receive(command);
    expect((await s.receive({ ...command, confirmed: true })).reason).toBe('invalid_command');
    expect((await s.receive(s.command())).reason).toBe('busy');
    pending.resolve(true); expect((await first).status).toBe('accepted'); expect(await duplicate).toEqual(await first);
    expect((await s.receive(command)).status).toBe('accepted'); expect(s.execute).toHaveBeenCalledTimes(1);
  });
  it('does not evict unexpired dedup entries to admit another mutation', async () => {
    const s = setup(); for (let i = 0; i < 128; i++) await s.receive(s.command());
    expect((await s.receive(s.command())).reason).toBe('busy'); expect(s.execute).toHaveBeenCalledTimes(128);
    s.advance(300_001); expect((await s.receive(s.command())).status).toBe('accepted');
  });
  it('cancels before invoking a handler if the owner changes in the microtask boundary', async () => {
    const s = setup(); const result = s.receive(s.command()); s.controller.setOwner('owner-b');
    expect((await result).status).toBe('rejected'); expect(s.execute).not.toHaveBeenCalled();
  });
  it('allows source preflight to detect expiration and prevents a late mutation', async () => {
    const s = setup(); const pending = deferred(); let mutation = false;
    s.execute.mockImplementationOnce(async (_action?: unknown, guard?: () => boolean) => { await pending.promise; if (!guard?.()) return false; mutation = true; return true; });
    const result = s.receive(s.command()); await Promise.resolve(); s.advance(5_001); pending.resolve(true);
    expect((await result).status).toBe('rejected'); expect(mutation).toBe(false);
  });
  it('redacts a late response after logout and does not let old cleanup unbind a new owner', async () => {
    const s = setup(); const pending = deferred(); s.execute.mockImplementationOnce(() => pending.promise);
    const result = s.receive(s.command()); await Promise.resolve(); s.controller.setOwner('owner-b');
    s.controller.register('owner-b', { getState: () => ({ ...s.state, dogId: 'dog-b' }), execute: () => true }); s.dispose();
    pending.resolve(true); const ack = await result; expect(ack.reason).toBe('stale_context'); expect(ack.snapshot.dogId).toBeNull();
    expect(s.controller.snapshot().dogId).toBe('dog-b');
  });
  it('answers read-only refresh without mutating', async () => {
    const s = setup(); const snapshot = await s.receive(fixtures.snapshotRequest) as unknown as WearableSnapshot;
    expect(snapshot.kind).toBe('snapshot'); expect(s.execute).not.toHaveBeenCalled();
  });
});
