import {
  effectiveConnectEntitlements,
  connectEntitlements,
  CONNECT_NEWBIE_MAX_FRIENDS,
} from '@/features/connect/services/connect-entitlements';

const newbie = { isPro: false, isTrainerModule: false };   // auch: Read-Fehler/keine Session → caps=false
const pro = { isPro: true, isTrainerModule: false };
const trainer = { isPro: true, isTrainerModule: true };

// enforce=true entspricht Production (fail-closed): Tier-Logik statt ALL_ACCESS.
describe('effectiveConnectEntitlements — fail-closed (Production, enforce=true)', () => {
  it('Premium vorhanden → Beiträge/Events/Suche erlaubt, unbegrenzt Freunde', () => {
    const e = effectiveConnectEntitlements(pro, true);
    expect(e.canCreatePost).toBe(true);
    expect(e.canCreateEvent).toBe(true);
    expect(e.canSearchTrainingPartners).toBe(true);
    expect(e.maxFriends).toBeNull();
  });

  it('kein Premium → Premium-Aktionen VERWEIGERT (kein ALL_ACCESS), Feed lesen bleibt', () => {
    const e = effectiveConnectEntitlements(newbie, true);
    expect(e.canCreatePost).toBe(false);
    expect(e.canCreateEvent).toBe(false);
    expect(e.canSearchTrainingPartners).toBe(false);
    expect(e.canCreateGroup).toBe(false);
    expect(e.canManageTrainerProfile).toBe(false);
    expect(e.maxFriends).toBe(CONNECT_NEWBIE_MAX_FRIENDS);
    expect(e.canViewFeed).toBe(true);
  });

  it('unbekannter/fehlgeschlagener Status (caps=false, wie bei Read-Fehler/keiner Session) → verweigert', () => {
    expect(effectiveConnectEntitlements({ isPro: false, isTrainerModule: false }, true))
      .toEqual(connectEntitlements(newbie));
    expect(effectiveConnectEntitlements(newbie, true).canManageTrainerProfile).toBe(false);
  });

  it('Trainer → Gruppen + Trainerprofil erlaubt', () => {
    const e = effectiveConnectEntitlements(trainer, true);
    expect(e.canCreateGroup).toBe(true);
    expect(e.canManageTrainerProfile).toBe(true);
  });
});

describe('effectiveConnectEntitlements — Development (enforce=false)', () => {
  it('weicher Voll-Zugriff (ALL_ACCESS) wie vorgesehen', () => {
    const e = effectiveConnectEntitlements(newbie, false);
    expect(e.canCreatePost).toBe(true);
    expect(e.canCreateGroup).toBe(true);
    expect(e.canManageTrainerProfile).toBe(true);
    expect(e.maxFriends).toBeNull();
  });
});

// Der eigentliche Fix: die Modulkonstante wird aus __DEV__ abgeleitet (fail-closed
// in Production), NICHT mehr allein aus dem Env-Flag.
describe('CONNECT_ENFORCE_ENTITLEMENTS — Ableitung', () => {
  const OLD_DEV = (globalThis as { __DEV__?: boolean }).__DEV__;
  const OLD_ENV = process.env.EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS;

  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = OLD_DEV;
    if (OLD_ENV === undefined) delete process.env.EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS;
    else process.env.EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS = OLD_ENV;
    jest.resetModules();
  });

  function loadConst(): boolean {
    let value = false;
    jest.isolateModules(() => {
      value = require('@/features/connect/services/connect-entitlements').CONNECT_ENFORCE_ENTITLEMENTS;
    });
    return value;
  }

  it('Production (__DEV__=false) erzwingt auch OHNE Env-Flag', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS;
    expect(loadConst()).toBe(true);
  });

  it('Development (__DEV__=true) ohne Flag → NICHT erzwungen (weicher Zugriff)', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    delete process.env.EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS;
    expect(loadConst()).toBe(false);
  });

  it('Development (__DEV__=true) + Flag=true → erzwungen', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    process.env.EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS = 'true';
    expect(loadConst()).toBe(true);
  });
});
