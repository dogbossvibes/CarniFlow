import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { useSharingInbox } from '../useSharingInbox';
const mockSummaries = jest.fn(), mockList = jest.fn(), mockContacts = jest.fn(), mockDispose = jest.fn();
const mockOffer = jest.fn(), mockAccept = jest.fn(); let mockEpoch = 0;
let mockAppChange: (state: string) => void;
jest.mock('expo-router', () => ({ useFocusEffect: (fn: () => void) => { const React = jest.requireActual('react'); React.useEffect(fn, [fn]); } }));
jest.mock('@/features/tracking-exchange/repository', () => ({ exchangeRepository: () => ({ summaries: mockSummaries }) }));
jest.mock('@/features/training-groups/connectedInviteTargets', () => ({ listConnectedInviteTargets: (...args: unknown[]) => mockContacts(...args) }));
jest.mock('@/features/tracking-transfer/uiContext', () => ({ createTransferUiContext: () => ({ client: { epoch: () => mockEpoch, dispose: mockDispose }, service: { list: mockList, offer: mockOffer, accept: mockAccept } }) }));
let latest: ReturnType<typeof useSharingInbox>, screen: ReturnType<typeof TestRenderer.create>;
function Probe({ userId }: { userId: string }) { latest = useSharingInbox(userId); return null; }
const offer = { transferId: 'actual-offer', senderUserId: 'sender', recipientUserId: 'A', sourceTrainingId: 'source', referenceDigest: 'digest', createdAtMs: 500, expiresAtMs: 1100, status: 'pending' };
beforeEach(() => {
  jest.clearAllMocks(); mockEpoch = 0;
  Object.defineProperty(AppState, 'currentState', { value: 'active', writable: true, configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => { mockAppChange = state => fn(state as AppStateStatus); return { remove: jest.fn() }; });
  mockSummaries.mockResolvedValue({ rows: [], limited: false }); mockContacts.mockResolvedValue([]);
  mockList.mockResolvedValue({ incoming: [offer], outgoing: [], serverNowMs: 1000 });
});
afterEach(() => { if (screen) act(() => screen.unmount()); jest.useRealTimers(); jest.restoreAllMocks(); });
async function render() { await act(async () => { screen = TestRenderer.create(<Probe userId="A" />); }); }
it('loads real account-scoped entries using read-only operations', async () => {
  await render(); expect(latest.complete).toBe(true); expect(latest.incoming[0].route.params.transferId).toBe('actual-offer');
  expect(mockContacts).toHaveBeenCalledWith('A', true, expect.anything()); expect(mockOffer).not.toHaveBeenCalled(); expect(mockAccept).not.toHaveBeenCalled();
});
it('retains known entries on a failed refresh and suppresses a complete count', async () => {
  await render(); mockList.mockRejectedValue(new Error('offline'));
  await act(async () => { await latest.refresh(); });
  expect(latest.failed).toBe(true); expect(latest.complete).toBe(false); expect(latest.incoming).toHaveLength(1);
});
it('keeps a partial source failure distinct from a real successful empty result', async () => {
  mockList.mockRejectedValue(new Error('offline')); await render();
  expect(latest.incoming).toEqual([]); expect(latest.complete).toBe(false); expect(latest.failed).toBe(true);
  mockList.mockResolvedValue({ incoming: [], outgoing: [], serverNowMs: 1000 });
  await act(async () => { await latest.refresh(); }); expect(latest.complete).toBe(true); expect(latest.failed).toBe(false);
});
it('does not expose delayed account A entries after a keyed account B mount', async () => {
  let resolve!: (value: unknown) => void;
  mockList.mockImplementationOnce(() => new Promise(r => { resolve = r; })); await render();
  mockList.mockResolvedValue({ incoming: [], outgoing: [], serverNowMs: 1000 });
  await act(async () => { screen.update(<Probe key="B" userId="B" />); });
  await act(async () => { resolve({ incoming: [offer], outgoing: [], serverNowMs: 1000 }); });
  expect(latest.userId).toBe('B'); expect(latest.incoming).toEqual([]); expect(mockDispose).toHaveBeenCalled();
});
it('rejects a delayed response after an auth ABA epoch change', async () => {
  let resolve!: (value: unknown) => void; mockList.mockReturnValue(new Promise(r => { resolve = r; })); await render();
  mockEpoch += 2; await act(async () => { resolve({ incoming: [offer], outgoing: [], serverNowMs: 1000 }); });
  expect(latest.incoming).toEqual([]); expect(latest.complete).toBe(false);
});
it('invalidates background reads and refreshes on resume', async () => {
  await render(); act(() => mockAppChange('background')); expect(latest.complete).toBe(false);
  await act(async () => { mockAppChange('active'); }); expect(mockList).toHaveBeenCalledTimes(2); expect(latest.complete).toBe(true);
});
it('expires known pending offers against elapsed server time without a user refresh', async () => {
  jest.useFakeTimers(); await render(); expect(latest.actionable).toBe(1);
  act(() => { jest.advanceTimersByTime(1000); }); expect(latest.actionable).toBe(0); expect(latest.incoming[0].statusKey).toBe('expired');
});
