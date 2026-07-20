// ANYVO CONNECT — Schritt-1-Tests (reine Funktionen, jest-expo).
import { pickConnectSender } from '@/features/connect/utils/sender';
import type { Dog } from '@/types';

const dog = (id: string, extra: Partial<Dog> = {}): Dog => ({
  id, owner_id: 'u1', name: `Dog ${id}`, breed: null, birth_date: null,
  weight_kg: null, gender: null, photo_url: null, titles: null,
  sire: null, dam: null, kennel: null, is_favorite: null,
  color: null, microchip_number: null, tasso_registered: null,
  discipline: null, level: null, best_score: null, vet: null,
  vaccination: null, food: null, created_at: '2026-01-01',
  ...extra,
} as unknown as Dog);

describe('pickConnectSender – Standard-Absender', () => {
  it('ohne Hund → persönliches Halter-Profil', () => {
    expect(pickConnectSender([], null)).toEqual({ kind: 'personal' });
    expect(pickConnectSender([], 'x')).toEqual({ kind: 'personal' });
  });

  it('bevorzugt den zuletzt aktiven Hund', () => {
    const dogs = [dog('a'), dog('b'), dog('c')];
    const r = pickConnectSender(dogs, 'b');
    expect(r).toEqual({ kind: 'dog', dog: dogs[1] });
  });

  it('ohne aktiven Hund → Favorit', () => {
    const dogs = [dog('a'), dog('b', { is_favorite: true }), dog('c')];
    const r = pickConnectSender(dogs, null);
    expect(r).toEqual({ kind: 'dog', dog: dogs[1] });
  });

  it('sonst → erster Hund', () => {
    const dogs = [dog('a'), dog('b')];
    const r = pickConnectSender(dogs, null);
    expect(r).toEqual({ kind: 'dog', dog: dogs[0] });
  });

  it('aktiver Hund schlägt Favorit', () => {
    const dogs = [dog('a', { is_favorite: true }), dog('b')];
    const r = pickConnectSender(dogs, 'b');
    expect(r).toEqual({ kind: 'dog', dog: dogs[1] });
  });
});

describe('Feature-Flag – standardmäßig AUS', () => {
  const OLD = process.env.EXPO_PUBLIC_FEATURE_CONNECT_ENABLED;
  afterEach(() => { process.env.EXPO_PUBLIC_FEATURE_CONNECT_ENABLED = OLD; jest.resetModules(); });

  it('ist AUS, wenn die Variable nicht "true" ist', () => {
    for (const v of [undefined, '', 'false', '1', 'yes']) {
      jest.resetModules();
      if (v === undefined) delete process.env.EXPO_PUBLIC_FEATURE_CONNECT_ENABLED;
      else process.env.EXPO_PUBLIC_FEATURE_CONNECT_ENABLED = v;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CONNECT_ENABLED } = require('@/features/connect/constants/featureFlag');
      expect(CONNECT_ENABLED).toBe(false);
    }
  });

  it('ist AN nur bei exakt "true"', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FEATURE_CONNECT_ENABLED = 'true';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CONNECT_ENABLED } = require('@/features/connect/constants/featureFlag');
    expect(CONNECT_ENABLED).toBe(true);
  });
});
