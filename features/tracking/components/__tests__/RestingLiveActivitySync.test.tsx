// RestingLiveActivitySync: Abgleich erst nach Registry-Hydration, erneut bei Rückkehr in den
// Vordergrund; neue Activities nur mit geladenen Hunden des angemeldeten Nutzers.
import React from 'react';
import { AppState } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let mockSession: { user: { id: string } } | null = { user: { id: 'u1' } };
let mockDogs = { dogs: [{ id: 'dog-A', name: 'Skadi' }], loading: false, error: null as string | null };
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: mockSession }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => mockDogs }));
const mockReconcile = jest.fn(async (..._a: unknown[]) => null);
jest.mock('@/features/tracking/native/restingActivityReconcile', () => ({
  reconcileRestingActivities: (...a: unknown[]) => mockReconcile(...a),
}));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import { RestingLiveActivitySync } from '@/features/tracking/components/RestingLiveActivitySync';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import i18n from '@/i18n/config';
/* eslint-enable import/first */

let handlers: ((s: string) => void)[] = [];
beforeAll(async () => { await i18n.changeLanguage('de'); });
beforeEach(() => {
  mockReconcile.mockClear(); handlers = [];
  mockSession = { user: { id: 'u1' } };
  mockDogs = { dogs: [{ id: 'dog-A', name: 'Skadi' }], loading: false, error: null };
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, fn: (s: string) => void) => {
    handlers.push(fn); return { remove: () => {} };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

it('wartet auf die Registry-Hydration, gleicht dann mit eigenen Hunden + lokalisierten Labels ab', () => {
  useActiveFaehrten.setState({ byDog: {}, hydrated: false });
  let r: any;
  act(() => { r = TestRenderer.create(<RestingLiveActivitySync />); });
  expect(mockReconcile).not.toHaveBeenCalled();
  act(() => { useActiveFaehrten.setState({ hydrated: true }); });
  expect(mockReconcile).toHaveBeenCalledTimes(1);
  expect(mockReconcile.mock.calls[0][0]).toEqual({
    ownDogs: [{ id: 'dog-A', name: 'Skadi' }],
    labels: { lying: 'Liegezeit', since: 'seit', fallbackTitle: 'Fährte' },
  });
  act(() => handlers.forEach(h => h('background')));
  expect(mockReconcile).toHaveBeenCalledTimes(1);
  act(() => handlers.forEach(h => h('active')));
  expect(mockReconcile).toHaveBeenCalledTimes(2);
  act(() => r.unmount());
});

it('Hunde nicht geladen (offline/Fehler/ohne Session) → ownDogs null (nur beenden, nichts neu anlegen)', () => {
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
  mockDogs = { dogs: [], loading: false, error: 'offline' };
  let r: any;
  act(() => { r = TestRenderer.create(<RestingLiveActivitySync />); });
  expect((mockReconcile.mock.calls[0][0] as any).ownDogs).toBeNull();
  act(() => r.unmount());
  mockReconcile.mockClear();
  mockSession = null; mockDogs = { dogs: [{ id: 'dog-A', name: 'Skadi' }], loading: false, error: null };
  act(() => { r = TestRenderer.create(<RestingLiveActivitySync />); });
  expect((mockReconcile.mock.calls[0][0] as any).ownDogs).toBeNull();
  act(() => r.unmount());
});
