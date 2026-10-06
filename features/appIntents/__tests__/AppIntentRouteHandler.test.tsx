// AppIntentRouteHandler: Kaltstart, App läuft (Settings-Event), Rückkehr aus dem Hintergrund;
// erst bei bereiter Navigation + Anmeldung; genau einmal; ungültige Ziele nie.
import React from 'react';
import { AppState, Settings } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

// Jest hat kein natives SettingsManager-TurboModule (im iOS-Build per React-RCTSettings vorhanden).
jest.mock('react-native/Libraries/Settings/NativeSettingsManager', () => ({
  __esModule: true,
  default: { getConstants: () => ({ settings: {} }), setValues: jest.fn(), deleteValues: jest.fn() },
}));
const mockNavigate = jest.fn();
let mockNavKey: string | undefined = 'root';
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: (...a: unknown[]) => mockNavigate(...a) }),
  useRootNavigationState: () => (mockNavKey ? { key: mockNavKey } : undefined),
}));
let mockSession: { session: unknown; loading: boolean } = { session: { user: { id: 'u' } }, loading: false };
jest.mock('@/hooks/useSession', () => ({ useSession: () => mockSession }));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import { AppIntentRouteHandler } from '@/features/appIntents/AppIntentRouteHandler';
import { PENDING_INTENT_ROUTE_KEY } from '@/features/appIntents/pendingIntentRoute';
/* eslint-enable import/first */

let defaults: Record<string, unknown> = {};
let watchers: (() => void)[] = [];
let appStateHandlers: ((s: string) => void)[] = [];
const pending = (route: string, id = 'id-1') => `${route}|${Date.now()}|${id}`;
/** Simuliert den nativen Intent (schreibt NSUserDefaults → settingsUpdated → Watcher). */
const intentWrites = (value: string) => { defaults[PENDING_INTENT_ROUTE_KEY] = value; act(() => watchers.forEach(w => w())); };

beforeEach(() => {
  defaults = {}; watchers = []; appStateHandlers = [];
  mockNavigate.mockClear(); mockNavKey = 'root'; mockSession = { session: { user: { id: 'u' } }, loading: false };
  jest.spyOn(Settings, 'get').mockImplementation((k: string) => defaults[k]);
  jest.spyOn(Settings, 'set').mockImplementation((v: object) => { for (const [k, x] of Object.entries(v as Record<string, unknown>)) { if (x == null) delete defaults[k]; else defaults[k] = x; } });
  jest.spyOn(Settings, 'watchKeys').mockImplementation((_k: unknown, cb: () => void) => { watchers.push(cb); return watchers.length - 1; });
  jest.spyOn(Settings, 'clearWatch').mockImplementation(() => {});
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, fn: (s: string) => void) => { appStateHandlers.push(fn); return { remove: () => {} }; }) as never);
});
afterEach(() => jest.restoreAllMocks());

const mount = () => { let r: any; act(() => { r = TestRenderer.create(<AppIntentRouteHandler />); }); return r; };

it('Kaltstart: Ziel lag schon vor dem JS-Start bereit → genau einmal navigiert, Eintrag gelöscht', () => {
  defaults[PENDING_INTENT_ROUTE_KEY] = pending('track/legen');
  const r = mount();
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith('/track/legen');
  expect(PENDING_INTENT_ROUTE_KEY in defaults).toBe(false);
  act(() => appStateHandlers.forEach(h => h('active')));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

it('Kaltstart vor Router-Bereitschaft: wartet (nicht verbraucht), navigiert sobald bereit', () => {
  mockNavKey = undefined;
  defaults[PENDING_INTENT_ROUTE_KEY] = pending('track');
  const r = mount();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(PENDING_INTENT_ROUTE_KEY in defaults).toBe(true);
  mockNavKey = 'root';
  act(() => r.update(<AppIntentRouteHandler />));
  expect(mockNavigate).toHaveBeenCalledWith('/track');
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

it('noch nicht angemeldet / Session lädt: Ziel bleibt liegen, nach Anmeldung genau einmal', () => {
  mockSession = { session: null, loading: true };
  defaults[PENDING_INTENT_ROUTE_KEY] = pending('track/historie');
  const r = mount();
  expect(mockNavigate).not.toHaveBeenCalled();
  mockSession = { session: { user: { id: 'u' } }, loading: false };
  act(() => r.update(<AppIntentRouteHandler />));
  expect(mockNavigate).toHaveBeenCalledWith('/track/historie');
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

it('App im Vordergrund: Intent schreibt → Settings-Event → navigiert', () => {
  const r = mount();
  expect(mockNavigate).not.toHaveBeenCalled();
  intentWrites(pending('track/legen', 'warm'));
  expect(mockNavigate).toHaveBeenCalledWith('/track/legen');
  expect(PENDING_INTENT_ROUTE_KEY in defaults).toBe(false);
  act(() => r.unmount());
});

it('App im Hintergrund: Rückkehr in den Vordergrund übernimmt das Ziel', () => {
  const r = mount();
  defaults[PENDING_INTENT_ROUTE_KEY] = pending('track', 'bg');   // ohne Event (z. B. pausierte JS-Engine)
  act(() => appStateHandlers.forEach(h => h('active')));
  expect(mockNavigate).toHaveBeenCalledWith('/track');
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

it('keine doppelte Navigation: Event + Foreground für denselben Eintrag, gleiche id erneut', () => {
  const r = mount();
  intentWrites(pending('track', 'same'));
  act(() => appStateHandlers.forEach(h => h('active')));
  defaults[PENDING_INTENT_ROUTE_KEY] = pending('track', 'same');   // erneut zugestellt, gleiche id
  act(() => watchers.forEach(w => w()));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

it('ungültiges Ziel → nie navigiert, Eintrag gelöscht', () => {
  defaults[PENDING_INTENT_ROUTE_KEY] = `track/run|${Date.now()}|x`;
  const r = mount();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(PENDING_INTENT_ROUTE_KEY in defaults).toBe(false);
  act(() => r.unmount());
});
