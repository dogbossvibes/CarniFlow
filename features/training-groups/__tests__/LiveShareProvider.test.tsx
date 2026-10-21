import React from 'react';
import Renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { KeyboardAvoidingView, StyleSheet, TextInput } from 'react-native';
import { LiveShareProvider, useGroupLiveShare } from '../LiveShareProvider';
import type { ShareState, StartShare } from '../liveShareController';
let mockReleaseReady = true;
jest.mock('../releaseGate', () => ({ isLiveShareReleaseReady: () => mockReleaseReady }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: mockUser ? { user: { id: mockUser } } : null }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 48, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../groupRpc', () => ({ createSupabaseGroupClient: () => ({ call: jest.fn(), dispose: jest.fn() }) }));
jest.mock('../liveShareTransport', () => ({ createLiveShareTransport: () => ({}) }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../useLiveShare', () => ({ useLiveShare: () => ({
  state: { phase: mockPhase, preparing: false }, start: mockStart, stop: mockStop, retryPending: mockRetry,
}) }));
let mockUser: string | null = 'A', mockPhase: ShareState['phase'] = 'idle';
const mockStart = jest.fn(), mockStop = jest.fn(), mockRetry = jest.fn();
let api: ReturnType<typeof useGroupLiveShare>, tree: ReactTestRenderer;
function Capture() { api = useGroupLiveShare(); return <TextInput testID="outside-groups-input" />; }
const input: StartShare = { userId: 'A', sessionId: 'session', shareId: 'share', dogId: 'dog', durationMs: 60000, recipientIds: ['B'] };
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(r => { resolve = r; }), resolve: (v: T) => resolve(v) }; }
function mount() { act(() => { tree = Renderer.create(<LiveShareProvider><Capture /></LiveShareProvider>); }); }
function rerender() { act(() => tree.update(<LiveShareProvider><Capture /></LiveShareProvider>)); }
beforeEach(() => { mockReleaseReady = true; jest.clearAllMocks(); mockUser = 'A'; mockPhase = 'idle'; mockStop.mockResolvedValue(undefined); mockRetry.mockResolvedValue(true); });
afterEach(() => act(() => tree?.unmount()));
it('blocks a duplicate start synchronously without erasing the first recipients', async () => {
  const d = deferred<boolean>(); mockStart.mockReturnValueOnce(d.promise).mockResolvedValue(false);
  mount(); const closure = api; let first!: Promise<boolean>;
  act(() => { first = closure.startNamed(input, ['Bea']); });
  await act(async () => { expect(await closure.startNamed(input, ['Other'])).toBe(false); });
  await act(async () => { d.resolve(true); await first; }); mockPhase = 'sharing'; rerender();
  expect(mockStart).toHaveBeenCalledTimes(1); expect(api.recipientNames).toEqual(['Bea']);
});
it('a stopped old attempt cannot clear names from the following successful start', async () => {
  const old = deferred<boolean>(); mockStart.mockReturnValueOnce(old.promise).mockResolvedValueOnce(true);
  mount(); let first!: Promise<boolean>;
  act(() => { first = api.startNamed(input, ['Old']); });
  await act(async () => { await api.stop(); });
  await act(async () => { await api.startNamed({ ...input, shareId: 'new' }, ['New']); });
  await act(async () => { old.resolve(false); await first; }); mockPhase = 'sharing'; rerender();
  expect(api.recipientNames).toEqual(['New']);
});
it('does not expose old-account names after a key change', async () => {
  mockStart.mockResolvedValue(true); mount();
  await act(async () => { await api.startNamed(input, ['Bea']); }); mockPhase = 'sharing'; rerender();
  expect(api.recipientNames).toEqual(['Bea']); mockUser = 'B'; mockPhase = 'idle'; rerender();
  expect(api.recipientNames).toEqual([]);
});
it('provides keyboard avoidance for the global bar without wrapping another screen’s input', () => {
  mockPhase = 'sharing'; mount();
  const guard = tree.root.findByType(KeyboardAvoidingView);
  expect(guard.props.behavior).toBe('position');
  expect(guard.findAll(n => n.props.testID === 'outside-groups-input')).toHaveLength(0);
  const bar = tree.root.findAll(n => n.props.testID === 'live-share-status-bar')[0];
  expect(StyleSheet.flatten(bar.props.style).paddingBottom).toBe(48);
});
it('makes retry available without a selected group or active sender', async () => {
  mockPhase = 'revoke_pending'; mount();
  const buttons = tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
  await act(async () => { buttons.at(-1)!.props.onPress(); }); expect(mockRetry).toHaveBeenCalledTimes(1);
});

it('blocks starts before permissions, transport and recipients when release gates are pending', async () => {
 mockReleaseReady = false; mount(); await act(async () => { expect(await api.startNamed(input, ['Bea'])).toBe(false); }); expect(mockStart).not.toHaveBeenCalled(); expect(api.recipientNames).toEqual([]);
});
