// Selbstheilung läuft erst mit Session + geladenen Hunden und nur mit deren dogIds.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ActiveFaehrtenSelfHeal } from '@/features/tracking/components/ActiveFaehrtenSelfHeal';

let mockSession: { user: { id: string } } | null = null;
let mockDogs: { dogs: { id: string }[]; loading: boolean; error: string | null } = { dogs: [], loading: true, error: null };
const mockHeal = jest.fn(async (..._a: unknown[]) => 0);
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: mockSession }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => mockDogs }));
jest.mock('@/features/tracking/services/trackRecoveryService', () => ({
  healActiveFaehrtenFromPending: (...a: unknown[]) => mockHeal(...a),
}));

// Typings von react-test-renderer sind im Projekt unvollständig → bewusst lose typisiert.
type Rendered = any;
let renderer: Rendered = null;
const render = async () => { await act(async () => { renderer = TestRenderer.create(<ActiveFaehrtenSelfHeal />); }); };
const rerender = async () => { await act(async () => { renderer.update(<ActiveFaehrtenSelfHeal />); }); };

beforeEach(() => { mockHeal.mockClear(); mockSession = null; mockDogs = { dogs: [], loading: true, error: null }; });
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; });

describe('ActiveFaehrtenSelfHeal', () => {
  it('ohne Session: keine Heilung', async () => {
    mockDogs = { dogs: [{ id: 'dog-A' }], loading: false, error: null };
    await render();
    expect(mockHeal).not.toHaveBeenCalled();
  });

  it('Session da, Hunde laden noch / Ladefehler (offline): keine Heilung', async () => {
    mockSession = { user: { id: 'user-1' } };
    await render();
    mockDogs = { dogs: [], loading: false, error: 'offline' };
    await rerender();
    expect(mockHeal).not.toHaveBeenCalled();
  });

  it('Session + Hunde geladen: genau einmal, ausschliesslich mit den dogIds dieses Nutzers', async () => {
    mockSession = { user: { id: 'user-1' } };
    mockDogs = { dogs: [{ id: 'dog-A' }, { id: 'dog-C' }], loading: false, error: null };
    await render();
    await rerender();
    expect(mockHeal).toHaveBeenCalledTimes(1);
    expect(mockHeal).toHaveBeenCalledWith(['dog-A', 'dog-C']);
  });

  it('Account-Wechsel: neuer Nutzer heilt nur mit seinen eigenen Hunden', async () => {
    mockSession = { user: { id: 'user-A' } };
    mockDogs = { dogs: [{ id: 'dog-A' }], loading: false, error: null };
    await render();
    mockSession = { user: { id: 'user-B' } };
    mockDogs = { dogs: [{ id: 'dog-B' }], loading: false, error: null };
    await rerender();
    expect(mockHeal).toHaveBeenNthCalledWith(1, ['dog-A']);
    expect(mockHeal).toHaveBeenNthCalledWith(2, ['dog-B']);
  });
});
