import { createTransferRunScope } from '../runScope';
import { parseTransferReceipt } from '../importPlan';
import fixture from './fixtures/backend-cloud-v1.json';
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { isFreshStartTimestamp } from '@/features/tracking/utils/startFixFreshness';
import { DEFAULT_APPROACH_CONFIG } from '@/features/tracking/engine/startApproach';
const receipt = parseTransferReceipt(fixture.accept.receipt);
const pending = { transferReceipt: receipt, sessionId: receipt.ownSessionId, dogId: receipt.recipientDogId, runId: receipt.ownRunId };
// Execute the actual native Alert callback bodies, not a duplicate implementation.
const source = readFileSync(join(__dirname, '../../../app/track/run.tsx'), 'utf8');
const part = (a: string, b: string) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const callbacks = [part('  const hasFreshApproachFix =', '  const approachDistanceRef'),
  part('  const showRecoveryDialog =', '  useEffect(() => { if (recovery)'),
  part('  const resumeSearch =', '  // Hundespur / Abriss'),
  part('  const confirmRecoveryEnd =', '  const handleFinish ='),
  part('  const beginSearchNow =', '  // Nach bestätigtem Ansatz')].join('\n');
function harness(identity = pending) {
  const scope = createTransferRunScope(receipt.recipientUserId), token = scope.token();
  const write = jest.fn(), start = jest.fn(), pointLoad = jest.fn(async () => []), flush = jest.fn(async () => true), discard = jest.fn(async () => ({ ok: true }));
  const alerts: any[][] = [], assertTransfer = (p: any) => scope.assert(token, p, pending.sessionId, pending.dogId);
  const allowedTransfer = (p: any) => { try { assertTransfer(p); return true; } catch { return false; } };
  const ref = (current: any = null) => ({ current });
  const context = { Alert: { alert: (...args: any[]) => alerts.push(args) }, assertTransfer, allowedTransfer,
    currentTransfer: () => identity, renderTransferIdentity: identity, dogId: pending.dogId, effectiveId: pending.sessionId,
    loadSavedSearchPoints: pointLoad, flushSearchPoints: flush, discardSearchAttempt: discard,
    finalizeLocalTrackRun: write, enqueueSyncOperation: write, syncNow: write, clearRegistry: write,
    useTrackingStore: { getState: () => new Proxy({}, { get: () => write }) },
    useActiveFaehrten: { getState: () => new Proxy({}, { get: () => write }) },
    s: { start, stop: write }, setRecovery: write, setPendingExit: write, setSnap: write,
    startedRef: ref(false), runIdRef: ref(), searchStartMsRef: ref(), prevOffTrackRef: ref(), segmentAnnouncementRef: ref(),
    approachFixTimeRef: ref(Date.now()), isFreshStartTimestamp, DEFAULT_APPROACH_CONFIG,
    useCallback: (f: unknown) => f, voiceOn: false, searchHandlerDistanceM: 10, t: (s: string) => s };
  const js = ts.transpileModule(`${callbacks}\nreturn { showRecoveryDialog, resumeSearch, endSearch, discardSearch, beginSearchNow };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const actions = new Function(...Object.keys(context), js)(...Object.values(context));
  return { scope, actions, alerts, write, start, pointLoad, flush, discard };
}
it.each(['end','discard','resume','begin'])('old %s callback does nothing after A→B, A→B→A or unmount', async action => {
  for (const change of ['B','ABA','unmount']) {
    const h = harness(); h.actions.showRecoveryDialog(pending);
    if (change === 'unmount') h.scope.dispose(); else { h.scope.setUser('B', true); if (change === 'ABA') h.scope.setUser(receipt.recipientUserId, true); }
    if (action === 'begin') h.actions.beginSearchNow();
    else { const index = action === 'resume' ? 0 : action === 'end' ? 1 : 2; await h.alerts[0][2][index].onPress(); }
    expect(h.pointLoad).not.toHaveBeenCalled(); expect(h.flush).not.toHaveBeenCalled(); expect(h.discard).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled(); expect(h.start).not.toHaveBeenCalled();
  }
});
it.each(['resumeSearch','endSearch'])('%s rejects an account change while awaiting saved points', async action => {
  const h = harness(); let resolve!: (value: never[]) => void;
  h.pointLoad.mockImplementation(() => new Promise(r => { resolve = r; }));
  const result = h.actions[action](pending); await Promise.resolve(); await Promise.resolve();
  expect(h.pointLoad).toHaveBeenCalled(); h.scope.setUser('B', true); h.scope.setUser(receipt.recipientUserId, true); resolve([]); await result;
  expect(h.write).not.toHaveBeenCalled(); expect(h.start).not.toHaveBeenCalled(); expect(h.discard).not.toHaveBeenCalled();
});
it('a second destructive Alert keeps the old token and cannot discard after switching accounts', async () => {
  const h = harness(); h.actions.discardSearch(pending); h.scope.setUser('B', true);
  await h.alerts[0][2][1].onPress(); expect(h.discard).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
});
it.each(['sessionId','dogId','runId'])('rejects mismatched pending %s even in the correct account', field => {
  const scope = createTransferRunScope(receipt.recipientUserId);
  expect(() => scope.assert(scope.token(), { ...pending, [field]: 'different' })).toThrow();
});
it('leaves ordinary recovery identity rules unchanged', () => {
  const scope = createTransferRunScope(null); scope.dispose(); expect(scope.assert(-1, { sessionId: 'legacy' })).toBeNull();
});

it('Android rejects gap-bearing transferred recovery before a run can be started or finalised', () => {
  const scope = createTransferRunScope(receipt.recipientUserId);
  for (const field of ['trackPoints', 'searchPoints']) {
    expect(() => scope.assert(scope.token(), { ...pending, [field]: [{ lat: 47, lng: 8, breakBefore: true }] })).toThrow('TRANSFER_GAPS_UNSUPPORTED');
  }
  expect(scope.assert(scope.token(), { ...pending, trackPoints: [{ lat: 47, lng: 8, breakBefore: false }] })).toBe(receipt.ownRunId);
  expect(scope.assert(scope.token(), { sessionId: 'ordinary', trackPoints: [{ breakBefore: true }] })).toBeNull();
});

it.each(['begin', 'resume', 'end', 'discard'])('actual Android %s callback refuses a transferred gap before side effects', async action => {
  const gap = { ...pending, trackPoints: [{ lat: 47, lng: 8, breakBefore: true }] };
  const h = harness(gap);
  if (action === 'begin') h.actions.beginSearchNow();
  else if (action === 'resume') await h.actions.resumeSearch(gap);
  else if (action === 'end') await h.actions.endSearch(gap);
  else h.actions.discardSearch(gap);
  expect(h.pointLoad).not.toHaveBeenCalled(); expect(h.flush).not.toHaveBeenCalled();
  expect(h.discard).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled(); expect(h.start).not.toHaveBeenCalled();
});
