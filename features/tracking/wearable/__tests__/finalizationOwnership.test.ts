import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { WearableController } from '../controller';
import { captureSearchFinalization } from '@/features/tracking/utils/searchFinalizationGate';
import { createTransferRunScope } from '@/features/tracking-transfer/runScope';
import { parseTransferReceipt } from '@/features/tracking-transfer/importPlan';
import type { TransferRunIdentity } from '@/features/tracking-transfer/runScope';
import fixture from '@/features/tracking-transfer/__tests__/fixtures/backend-cloud-v1.json';
const receipt = parseTransferReceipt(fixture.accept.receipt);
// Execute the actual screen callbacks; do not reproduce the save algorithm in the test.
const source = readFileSync(join(__dirname, '../../../../app/track/run.tsx'), 'utf8');
const ast = ts.createSourceFile('run.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let finish = '', execute = '';
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleFinish') finish = node.initializer!.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useWearableBinding') {
    const arg = node.arguments[3];
    if (arg && ts.isObjectLiteralExpression(arg)) {
      const prop = arg.properties.find(p => p.name?.getText(ast) === 'execute');
      if (prop && ts.isPropertyAssignment(prop)) execute = prop.initializer.getText(ast);
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
type Stage = 'flush' | 'finalize_read' | 'finalize_write' | 'enqueue';
function harness(transferred: boolean, stage: Stage) {
  const scope = createTransferRunScope(receipt.recipientUserId), token = scope.token();
  const held = deferred(), entered = deferred();
  const initial: TransferRunIdentity = { sessionId: receipt.ownSessionId, dogId: receipt.recipientDogId, runId: receipt.ownRunId, transferReceipt: transferred ? receipt : null };
  let state = { ...initial }, owner: string | null = receipt.recipientUserId, now = 1_800_000_000_000;
  const effects: { action: string; owner: string | null; session: string | null }[] = [];
  const effect = (action: string) => effects.push({ action, owner, session: state.sessionId });
  const wait = async (name: Stage) => { if (stage === name) { entered.resolve(); await held.promise; } };
  const currentTransfer = () => ({ ...state });
  const assertTransfer = (value: TransferRunIdentity) => scope.assert(token, value, initial.sessionId, initial.dogId);
  const route = { current: { id: initial.sessionId, dogId: initial.dogId } };
  const context = {
    transferScope: scope, transferToken: token, finishRouteRef: route, id: initial.sessionId, dogId: initial.dogId, storedColorDogId: initial.dogId,
    captureSearchFinalization, currentTransfer, renderTransferIdentity: initial, assertTransfer,
    allowedTransfer: (value: TransferRunIdentity) => { try { assertTransfer(value); return true; } catch { return false; } },
    finishing: false, finishRequestedRef: { current: false }, hapticSuccess() {}, setFinishing() {},
    flushSearchPoints: async () => { await wait('flush'); return true; },
    s: { getControlState: () => ({ recording: true, paused: false }), stop: () => ({ qa: null, analyticsSamples: [], foundObjectIndices: [], breaks: [], durationS: 1, score: 1, points: [], autoDwellObjectIds: [], objectStatuses: [] }) },
    runIdRef: { current: initial.runId }, effectiveId: initial.sessionId,
    snapData: { laidMarkers: [], eventArcs: {}, laidPoints: [], laidObjects: [] }, searchStartMsRef: { current: 1 }, searchHandlerDistanceM: 0,
    finalizeLocalTrackRun: async (_id: string, _payload: unknown, assertScope: () => void) => {
      await wait('finalize_read'); assertScope(); effect('durable_write_started'); await wait('finalize_write');
    }, buildRunResultPayload: (value: unknown) => value,
    useTrackingStore: { getState: () => ({ setSessionStatus: () => effect('set_status'), reset: () => { effect('reset'); state = { sessionId: null, dogId: null, runId: null }; } }) },
    clearRegistry: () => effect('clear_registry'), enqueueSyncOperation: async () => { await wait('enqueue'); effect('enqueue_own_session'); },
    syncNow: async () => {}, router: { replace: () => effect('navigate') },
    Alert: { alert: () => effect('alert') }, t: (key: string) => key, console: { warn: jest.fn() }, Date, Crypto: { randomUUID: () => 'unused' },
  };
  if (!finish || !execute) throw Error('Source callbacks missing');
  const js = ts.transpileModule(`const handleFinish = ${finish}; const execute = ${execute}; return { handleFinish, execute };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const callbacks = new Function(...Object.keys(context), js)(...Object.values(context));
  let serial = 0; const controller = new WearableController({ now: () => now, id: () => `local-${++serial}` }); controller.setOwner(owner);
  controller.register(owner!, { getState: () => ({ sessionId: initial.runId!, dogId: initial.dogId!, dogName: 'Synthetic', phase: 'search_recording', distanceM: 1, elapsedSeconds: 1, capabilities: ['end_phase'] }), execute: callbacks.execute });
  const snapshot = controller.snapshot();
  const begin = () => controller.receive(JSON.stringify({ protocolVersion: 1, kind: 'command', commandId: '00000000-0000-4000-8000-000000000001', contextId: snapshot.contextId, revision: snapshot.revision, leaseId: snapshot.leaseId, sessionId: initial.runId, dogId: initial.dogId, action: 'end_phase', confirmed: true }), now + 5_000);
  return { begin, entered: entered.promise, release: held.resolve, effects, advance: (ms: number) => { now += ms; }, switchOwner: (back = false) => {
    controller.setOwner(null); scope.setUser('owner-b', true); owner = 'owner-b'; state = { sessionId: 'session-b', dogId: 'dog-b', runId: 'run-b' };
    if (back) { scope.setUser(receipt.recipientUserId, true); owner = receipt.recipientUserId; state = { ...initial }; }
  }, switchTarget: () => { state = { sessionId: 'new-session', dogId: 'new-dog', runId: 'new-run' }; }, unmount: () => scope.dispose(), routeChange: () => { route.current = { id: 'other-route', dogId: initial.dogId }; } };
}
for (const transferred of [false, true]) {
  describe(transferred ? 'transferred search' : 'ordinary search', () => {
    it.each(['flush', 'finalize_read', 'finalize_write', 'enqueue'] as const)('does not reset or navigate another account after %s', async stage => {
      const h = harness(transferred, stage), result = h.begin(); await h.entered; h.switchOwner(); h.release();
      expect(await result).toMatchObject({ kind: 'ack', status: 'rejected' });
      expect(h.effects.filter(e => ['set_status', 'reset', 'clear_registry', 'navigate', 'alert'].includes(e.action))).toEqual([]);
      if (stage === 'flush' || stage === 'finalize_read') expect(h.effects.filter(e => e.action === 'durable_write_started')).toEqual([]);
      if (stage === 'finalize_write') expect(h.effects.find(e => e.action === 'durable_write_started')?.owner).toBe(receipt.recipientUserId);
    });
    it.each(['aba', 'target', 'unmount', 'route'] as const)('invalidates an old operation on %s while flushing', async change => {
      const h = harness(transferred, 'flush'), result = h.begin(); await h.entered;
      if (change === 'aba') h.switchOwner(true); else if (change === 'target') h.switchTarget(); else if (change === 'unmount') h.unmount(); else h.routeChange();
      h.release(); expect(await result).toMatchObject({ kind: 'ack', status: 'rejected' }); expect(h.effects).toEqual([]);
    });
    it('finishes legitimate already-begun durability after the native five-second response window', async () => {
      const h = harness(transferred, 'finalize_write'), result = h.begin(); await h.entered; h.advance(6000); h.release();
      await result; // Native may already have timed out: this is not a new action authorization.
      expect(h.effects.map(e => e.action)).toEqual(['durable_write_started', 'enqueue_own_session', 'set_status', 'reset', 'clear_registry', 'navigate']);
      expect(h.effects.every(e => e.owner === receipt.recipientUserId)).toBe(true);
    });
  });
}
