import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useTransferRunScope } from '../useRunScope';
import { parseTransferReceipt } from '../importPlan';
import fixture from './fixtures/backend-cloud-v1.json';
let mockAuth: (event: string, session: any) => void;
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { onAuthStateChange: (fn: typeof mockAuth) => { mockAuth = fn; return { data: { subscription: { unsubscribe: jest.fn() } } }; } } } }));
const receipt = parseTransferReceipt(fixture.accept.receipt), identity = { transferReceipt: receipt, sessionId: receipt.ownSessionId, dogId: receipt.recipientDogId, runId: receipt.ownRunId };
let scope: ReturnType<typeof useTransferRunScope>;
function Probe() { scope = useTransferRunScope(receipt.recipientUserId); return null; }
it('auth events invalidate old native dialog closures synchronously, including ABA without a useSession render', () => {
  let renderer!: ReturnType<typeof TestRenderer.create>;
  act(() => { renderer = TestRenderer.create(<Probe />); });
  const token = scope.token(); expect(scope.assert(token, identity)).toBe(receipt.ownRunId);
  act(() => { mockAuth('SIGNED_OUT', null); mockAuth('SIGNED_IN', { user: { id: receipt.recipientUserId } }); });
  expect(() => scope.assert(token, identity)).toThrow('ACCOUNT_CHANGED');
  const fresh = scope.token(); expect(scope.assert(fresh, identity)).toBe(receipt.ownRunId);
  act(() => renderer.unmount()); expect(() => scope.assert(fresh, identity)).toThrow('ACCOUNT_CHANGED');
});
