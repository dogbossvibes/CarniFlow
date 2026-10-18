import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert, StyleSheet } from 'react-native';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import TransferScreen from '../TransferScreen';
const mockPush = jest.fn(), mockOffer = jest.fn(), mockAccept = jest.fn(), mockRead = jest.fn();
const mockList = jest.fn();
let mockUser = 'owner';
let mockParams: Record<string, string> = {};
const mockSource = { local_id: 'source', dog_id: 'dog', title: 'Wiesenfährte', ended_at: '2026-10-11T12:00:00.000Z' };
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }), useLocalSearchParams: () => mockParams,
  useFocusEffect: (fn: () => void) => { const React = jest.requireActual('react'); React.useEffect(fn, [fn]); } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockTranslate }) }));
function mockTranslate(key: string) { return key; }
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockUser } } }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: [{ id: 'dog', name: 'Quiron', owner_id: mockUser }], refresh: jest.fn() }) }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }) } } }));
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({ getAllAsync: async () => [mockSource] }) }));
jest.mock('@/features/training-groups/useConnectedInviteTargets', () => ({ useConnectedInviteTargets: () => [{ userId: 'contact', displayName: 'Alex' }] }));
jest.mock('@/features/tracking/store/trackingStore', () => ({ useTrackingStore: { getState: () => ({}) } }));
jest.mock('@/features/sync/services/syncEngine', () => ({ syncPendingOperations: async () => {} }));
jest.mock('../rpc', () => ({ createSupabaseTransferClient: () => ({ epoch: () => 0, dispose: jest.fn() }) }));
jest.mock('../localStore', () => ({ createTransferLocalStore: () => ({}) }));
jest.mock('../operationJournal', () => ({ createTransferJournal: () => ({}) }));
jest.mock('../TransferContactSearch', () => ({ TransferContactSearch: () => null }));
jest.mock('../i18n', () => ({ transferErrorKey: () => 'failure' }));
jest.mock('../service', () => ({ transferCrypto: {}, createTrackTransferService: () => ({ listOwned: mockListOwned, restoreOwned: mockRestoreOwned, list: mockList, offer: mockOffer, read: mockRead, accept: mockAccept, recover: jest.fn(), revoke: jest.fn() }) }));
const mockListOwned = jest.fn(), mockRestoreOwned = jest.fn();
let renderer: ReturnType<typeof TestRenderer.create>;
async function render() { await act(async () => { renderer = TestRenderer.create(<TransferScreen />); }); }
function button(label: string) { return renderer.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button'
  && n.findAll(x => x.props.children === label).length > 0)[0]; }
async function press(label: string) { await act(async () => { button(label).props.onPress(); }); }
beforeEach(() => {
  mockUser = 'owner'; mockParams = {}; jest.clearAllMocks(); mockListOwned.mockResolvedValue({ owned: [], next: null }); mockRestoreOwned.mockResolvedValue({ sessionId: 'restored', dogId: 'dog' }); mockList.mockResolvedValue({ incoming: [], outgoing: [], serverNowMs: 1791720000000 });
  mockOffer.mockResolvedValue({}); mockAccept.mockResolvedValue({ sessionId: 'own-session', dogId: 'dog' });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); jest.restoreAllMocks(); });
it('requires selecting a track and accepted contact, then explicit send confirmation', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {}); await render(); await press('newOffer');
  expect(button('send').props.accessibilityState.disabled).toBe(true);
  const trackButton = renderer.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button'
    && n.findAll(x => typeof x.props.children === 'string' && x.props.children.startsWith('Wiesenfährte')).length > 0)[0];
  await act(async () => { trackButton.props.onPress(); }); await press('Alex');
  expect(button('send').props.accessibilityState.disabled).toBe(false);
  await press('send'); expect(mockOffer).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!; await act(async () => { buttons.find(b => b.text === 'send')!.onPress!(); });
  expect(mockOffer).toHaveBeenCalledWith('source', 'contact');
});
it('requires a chosen own dog before acceptance and opens the new own record afterwards', async () => {
  const transfer = { transferId: 'transfer', senderUserId: 'contact', recipientUserId: 'owner', status: 'pending', createdAtMs: 1791720000000, expiresAtMs: 1791806400000 };
  mockList.mockResolvedValue({ incoming: [transfer], outgoing: [], serverNowMs: 1791720000000 });
  mockRead.mockResolvedValue({ transfer, reference: { distanceM: 42, points: [], markers: [] }, serverNowMs: 1791720000000 });
  await render(); await press('details'); expect(mockAccept).not.toHaveBeenCalled();
  // The real SVG uses percentage height. Its scroll-content parent MUST supply a
  // bounded height or iOS expands the preview and pushes dog/accept controls away.
  const viewport = renderer.root.findAll(n => n.props.testID === 'transfer-preview-viewport')[0];
  expect(StyleSheet.flatten(viewport.props.style)).toMatchObject({ height: 160, width: '100%', flexShrink: 0 });
  expect(renderer.root.findByType(TrackSketch).props.h).toBe(160);
  await act(async () => viewport.props.onLayout({ nativeEvent: { layout: { width: 320, height: 160 } } }));
  expect(renderer.root.findByType(TrackSketch).props.w).toBe(320);
  expect(button('accept').props.accessibilityState.disabled).toBe(true); await press('Quiron');
  expect(button('accept').props.accessibilityState.disabled).toBe(false); await press('accept');
  expect(mockAccept).toHaveBeenCalledWith(transfer, expect.objectContaining({ distanceM: 42 }), 'dog');
  await press('open'); expect(mockPush).toHaveBeenCalledWith('/track/own-session');
});
it('does not present unavailable server data as an empty successful inbox', async () => {
  mockList.mockRejectedValue(new Error('offline')); await render();
  expect(renderer.root.findAll(n => n.props.children === 'failure').length).toBeGreaterThan(0);
  expect(renderer.root.findAll(n => n.props.children === 'emptyIncoming')).toHaveLength(0);
});
it('invalidates a delayed receive preview when the account changes', async () => {
  let resolve!: (v: unknown) => void;
  const transfer = { transferId: 'transfer', senderUserId: 'contact', recipientUserId: 'owner', status: 'pending', createdAtMs: 1791720000000, expiresAtMs: 1791806400000 };
  mockList.mockResolvedValue({ incoming: [transfer], outgoing: [], serverNowMs: 1791720000000 });
  mockRead.mockReturnValue(new Promise(r => { resolve = r; })); await render(); await press('details');
  mockUser = 'different'; await act(async () => { renderer.update(<TransferScreen />); });
  await act(async () => { resolve({ transfer, reference: { distanceM: 42, points: [], markers: [] }, serverNowMs: 1791720000000 }); });
  expect(renderer.root.findAll(n => n.props.children === 'chooseDog')).toHaveLength(0);
});

it('opens a current own copy when the original sender and offer are gone', async () => {
  mockListOwned.mockResolvedValue({ owned: [{ receipt: { receiptId: 'receipt', recipientDogId: 'dog', acceptedAtMs: 1791720000000 }, revision: 3, deleted: false }], next: null });
  await render(); await press('recover'); expect(mockRestoreOwned).toHaveBeenCalledWith('receipt');
  await press('open'); expect(mockPush).toHaveBeenCalledWith('/track/restored'); expect(mockRead).not.toHaveBeenCalled(); expect(mockAccept).not.toHaveBeenCalled();
});

it('keeps dog selection and acceptance after a narrow preview relayout without importing on view', async () => {
  const transfer = { transferId: 'transfer', senderUserId: 'contact', recipientUserId: 'owner', status: 'pending', createdAtMs: 1791720000000, expiresAtMs: 1791806400000 };
  mockList.mockResolvedValue({ incoming: [transfer], outgoing: [], serverNowMs: 1791720000000 });
  mockRead.mockResolvedValue({ transfer, reference: { distanceM: 287.275, points: [{ lat: 47, lng: 8 }, { lat: 47.001, lng: 8.001 }], markers: [] }, serverNowMs: 1791720000000 });
  await render(); await press('details');
  const viewport = renderer.root.findAll(n => n.props.testID === 'transfer-preview-viewport')[0];
  await act(async () => viewport.props.onLayout({ nativeEvent: { layout: { width: 220, height: 160 } } }));
  expect(renderer.root.findByType(TrackSketch).props.w).toBe(220);
  expect(StyleSheet.flatten(viewport.props.style).height).toBe(160);
  expect(button('Quiron')).toBeDefined(); expect(button('accept')).toBeDefined();
  expect(mockAccept).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled();
  await press('cancel'); expect(renderer.root.findAll(n => n.props.testID === 'track-sketch')).toHaveLength(0);
});
it('retains the preview and selected dog after an ambiguous accept failure, allowing an explicit retry', async () => {
  const transfer = { transferId: 'transfer', senderUserId: 'contact', recipientUserId: 'owner', status: 'pending', createdAtMs: 1791720000000, expiresAtMs: 1791806400000 };
  mockList.mockResolvedValue({ incoming: [transfer], outgoing: [], serverNowMs: 1791720000000 });
  mockRead.mockResolvedValue({ transfer, reference: { distanceM: 42, points: [], markers: [] }, serverNowMs: 1791720000000 });
  mockAccept.mockRejectedValueOnce(new Error('timeout'));
  await render(); await press('details'); await press('Quiron'); await press('accept');
  expect(mockPush).not.toHaveBeenCalled(); expect(button('accept').props.accessibilityState.disabled).toBe(false);
  await press('accept'); expect(mockAccept.mock.calls).toEqual([[transfer, expect.anything(), 'dog'], [transfer, expect.anything(), 'dog']]);
  await press('open'); expect(mockPush).toHaveBeenCalledWith('/track/own-session');
});

it('hub compose route opens only the existing explicit composer without offering or accepting', async () => {
  mockParams = { compose: '1', sourceId: 'source' }; await render();
  expect(button('send')).toBeDefined(); expect(renderer.root.findAll(n => n.props.children === 'incoming')).toHaveLength(0);
  expect(renderer.root.findAll(n => n.props.children === 'outgoing')).toHaveLength(0);
  expect(mockOffer).not.toHaveBeenCalled(); expect(mockAccept).not.toHaveBeenCalled();
});
it('hub incoming route reads exactly the listed transfer and still requires dog and acceptance', async () => {
  const transfer = { transferId: 'actual-transfer', senderUserId: 'contact', recipientUserId: 'owner', status: 'pending', createdAtMs: 1791720000000, expiresAtMs: 1791806400000 };
  mockParams = { view: 'incoming', transferId: transfer.transferId };
  mockList.mockResolvedValue({ incoming: [transfer], outgoing: [], serverNowMs: 1791720000000 });
  mockRead.mockResolvedValue({ transfer, reference: { distanceM: 42, points: [], markers: [] }, serverNowMs: 1791720000000 });
  await render(); expect(mockRead).toHaveBeenCalledWith('actual-transfer');
  expect(button('accept').props.accessibilityState.disabled).toBe(true); expect(mockAccept).not.toHaveBeenCalled();
  expect(renderer.root.findAll(n => n.props.children === 'chooseTrack')).toHaveLength(0);
});
it('does not read a deep-link transfer that is missing from this account’s current list', async () => {
  mockParams = { view: 'incoming', transferId: 'not-owned' }; await render();
  expect(mockRead).not.toHaveBeenCalled(); expect(mockAccept).not.toHaveBeenCalled();
  expect(renderer.root.findAll(n => n.props.children === 'unavailable')).not.toHaveLength(0);
});
