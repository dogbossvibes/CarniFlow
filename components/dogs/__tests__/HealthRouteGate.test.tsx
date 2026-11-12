import React, { useEffect as mockUseEffect, useState } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, Text, TextInput, Text as MockText, TouchableOpacity as MockTouchableOpacity } from 'react-native';
import { readFileSync } from 'fs';
import { HealthRouteGate } from '../HealthRouteGate';
let mockAccount = 'a'; let mockDogId = 'd';
let mockNetwork: (state: { isConnected: boolean; isInternetReachable: boolean }) => void;
let mockAuth: (event: string, session: { user: { id: string } } | null) => void;
let mockApp: (state: import('react-native').AppStateStatus) => void;
const mockResolve = jest.fn(); const mockReplace = jest.fn(); const mockBack = jest.fn();
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: mockAccount } }) }));
jest.mock('@/services/legacyHealthRouteAccess', () => ({ resolveLegacyHealthRouteAccess: (...args: unknown[]) => mockResolve(...args) }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: (callback: typeof mockNetwork) => { mockNetwork = callback; callback({ isConnected: true, isInternetReachable: true }); return jest.fn(); } } }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { onAuthStateChange: (callback: typeof mockAuth) => { mockAuth = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; } } } }));
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => mockUseEffect(callback, [callback]), useRouter: () => ({ replace: mockReplace, back: mockBack }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/ui/AnyvoButton', () => ({ AnyvoButton: ({ label, onPress }: { label: string; onPress: () => void }) => <MockTouchableOpacity onPress={onPress}><MockText>{label}</MockText></MockTouchableOpacity> }));
const grant = { grant_id: 'g', dog_id: 'd', dog_name: 'Shared', owner_display_name: null, starts_at: '2020-01-01', expires_at: null, permissions: ['can_view_weight'] };
let mounts = 0; let node: ReactTestRenderer;
function Draft() { const [value, setValue] = useState(''); mockUseEffect(() => { ++mounts; }, []); return <><Text>OWNER_PRIVATE</Text><TextInput value={value} onChangeText={setValue} /></>; }
function Screen() { return <HealthRouteGate dogId={mockDogId}><Draft /></HealthRouteGate>; }
const content = () => node.root.findAll(n => (n as unknown as { type: unknown }).type === Text).map(n => n.props.children).join(' ');
async function render() { await act(async () => { node = TestRenderer.create(<Screen />); }); }
beforeEach(() => {
  mockAccount = 'a'; mockDogId = 'd'; mounts = 0; mockReplace.mockReset(); mockBack.mockReset(); mockResolve.mockReset().mockResolvedValue({ kind: 'owner' });
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, fn) => { mockApp = fn; return { remove: jest.fn() }; });
});
afterEach(() => { if (node) act(() => node.unmount()); jest.restoreAllMocks(); });
it('never mounts owner loaders or editors before a positive owner decision', async () => {
  let resolve!: (value: unknown) => void; mockResolve.mockReturnValue(new Promise(done => { resolve = done; })); await render();
  expect(mounts).toBe(0); expect(content()).not.toContain('OWNER_PRIVATE');
  await act(async () => { resolve({ kind: 'owner' }); }); expect(mounts).toBe(1); expect(content()).toContain('OWNER_PRIVATE');
});
it('replaces a confirmed recipient route without mounting owner children', async () => {
  mockResolve.mockResolvedValue({ kind: 'recipient', grants: [grant] }); await render();
  expect(mounts).toBe(0); expect(mockReplace).toHaveBeenCalledWith({ pathname: '/shared-dog/[id]', params: { id: 'd' } });
});
it.each([{ kind: 'denied' }, { kind: 'recipient', grants: [{ ...grant, expires_at: '2020-01-02' }] }])('does not navigate for unavailable or expired access %p', async result => {
  mockResolve.mockResolvedValue(result); await render(); expect(mockReplace).not.toHaveBeenCalled(); expect(mounts).toBe(0); expect(content()).toContain('sharing.accessUnavailable');
});
it('shows retry after an ambiguous error without mounting either old owner content or navigating', async () => {
  mockResolve.mockRejectedValue(new Error('offline')); await render(); expect(mounts).toBe(0); expect(mockReplace).not.toHaveBeenCalled(); expect(content()).toContain('sharing.loadFailed');
});
it.each(['auth', 'account', 'dog', 'offline', 'background', 'unmount'])('blocks a late recipient result after %s changes', async change => {
  let resolve!: (value: unknown) => void; mockResolve.mockReturnValueOnce(new Promise(done => { resolve = done; })); await render();
  if (change === 'unmount') act(() => node.unmount());
  else await act(async () => {
    if (change === 'auth') mockAuth('SIGNED_OUT', null);
    if (change === 'account') { mockAccount = 'b'; mockResolve.mockResolvedValue({ kind: 'denied' }); node.update(<Screen />); }
    if (change === 'dog') { mockDogId = 'other'; mockResolve.mockResolvedValue({ kind: 'denied' }); node.update(<Screen />); }
    if (change === 'offline') mockNetwork({ isConnected: false, isInternetReachable: false });
    if (change === 'background') mockApp('background');
  });
  await act(async () => { resolve({ kind: 'recipient', grants: [grant] }); });
  expect(mockReplace).not.toHaveBeenCalled(); expect(mounts).toBe(0);
});
it('keeps the same owner draft mounted but inaccessible through a transient offline/recheck failure', async () => {
  await render(); act(() => node.root.findByType(TextInput).props.onChangeText('UNSAVED_OWNER_DRAFT'));
  act(() => mockNetwork({ isConnected: false, isInternetReachable: false }));
  expect(node.root.findByType(TextInput).props.value).toBe('UNSAVED_OWNER_DRAFT');
  const hidden = node.root.findAll(n => n.props.importantForAccessibility === 'no-hide-descendants'); expect(hidden.length).toBeGreaterThan(0);
  mockResolve.mockRejectedValueOnce(new Error('transient'));
  await act(async () => mockNetwork({ isConnected: true, isInternetReachable: true }));
  expect(node.root.findByType(TextInput).props.value).toBe('UNSAVED_OWNER_DRAFT'); expect(mounts).toBe(1); expect(mockReplace).not.toHaveBeenCalled();
  mockResolve.mockResolvedValue({ kind: 'owner' });
  await act(async () => { mockApp('background'); mockApp('active'); });
  expect(node.root.findByType(TextInput).props.value).toBe('UNSAVED_OWNER_DRAFT'); expect(mounts).toBe(1);
});
it('discards the old owner child after definitive access loss', async () => {
  await render(); mockResolve.mockResolvedValue({ kind: 'denied' });
  await act(async () => { mockApp('background'); mockApp('active'); });
  expect(node.root.findAll(n => (n as unknown as { type: unknown }).type === TextInput)).toHaveLength(0); expect(content()).not.toContain('OWNER_PRIVATE');
});
it('old health and editor exports wrap the unchanged contents; weight wrapper inherits the same gate', () => {
  const record = readFileSync('app/dog-health-record/[id].tsx', 'utf8');
  const editor = readFileSync('app/dog-health/[id].tsx', 'utf8');
  const weight = readFileSync('app/dog-weight/[id].tsx', 'utf8');
  expect(record).toContain('<HealthRouteGate dogId={typeof id'); expect(record).toContain('<DogHealthRecordContent weightJournalOnly={weightJournalOnly} />');
  expect(editor).toContain('<DogHealthEditorContent />'); expect(weight).toContain('<DogHealthRecordRoute weightJournalOnly />');
});

it('blocks a late redirect immediately when Back is pressed, before focus cleanup', async () => {
  let resolve!: (value: unknown) => void; mockResolve.mockReturnValueOnce(new Promise(done => { resolve = done; })); await render();
  act(() => { node.root.findAll(n => n.props.label === 'common.back')[0].props.onPress(); });
  expect(mockBack).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ kind: 'recipient', grants: [grant] }); });
  expect(mockReplace).not.toHaveBeenCalled(); expect(mounts).toBe(0);
});
