// ANYVO CONNECT — Schritt-3-Tests (reine Funktionen).
import {
  PRODUCT_IDS, PLAN_META, planOfProduct, planToCapabilities, normalizeSubscriptionPlan,
  type SubscriptionPlan,
} from '@/features/subscription/plans';
import {
  buildPostingIdentities, resolvePostingIdentity, identityKey, isEligibleDog,
} from '@/features/connect/utils/postingIdentity';
import { shouldShowConnectOnboarding } from '@/features/connect/utils/onboarding';
import { DEFAULT_CONNECT_PRIVACY } from '@/features/connect/services/connect-privacy';
import type { Dog } from '@/types';

const dog = (id: string, owner = 'U1', extra: Record<string, unknown> = {}) => ({
  id, owner_id: owner, name: `Dog ${id}`, breed: null, birth_date: null,
  weight_kg: null, gender: null, photo_url: null, titles: null, sire: null, dam: null,
  kennel: null, is_favorite: null, color: null, microchip_number: null, tasso_registered: null,
  discipline: null, level: null, best_score: null, vet: null, vaccination: null, food: null,
  created_at: '2026-01-01', ...extra,
} as unknown as Dog);

const user = { userId: 'U1', displayName: 'Sandra', avatarUrl: null };

describe('Abo-Korrektur: NEWBIE statt Beginner', () => {
  it('NEWBIE-Produkt-ID ist anyvo_newbie_monthly_0', () => {
    expect(PRODUCT_IDS.newbieMonthly).toBe('anyvo_newbie_monthly_0');
    expect(PLAN_META.newbie.name).toBe('Newbie');
    expect(planOfProduct('anyvo_newbie_monthly_0')).toBe('newbie');
  });
  it('Beginner ist keine gültige Abo-Stufe mehr', () => {
    const plans: SubscriptionPlan[] = ['newbie', 'active', 'founder_active', 'trainer'];
    expect(plans).not.toContain('beginner_trial' as never);
    // @ts-expect-error 'beginner_trial' ist kein SubscriptionPlan mehr
    const invalid: SubscriptionPlan = 'beginner_trial';
    expect(invalid).toBeDefined();
  });
  it('ACTIVE, FOUNDER_ACTIVE, TRAINER werden korrekt erkannt', () => {
    expect(planToCapabilities('active')).toEqual({ pro_member: true, trainer_module: false });
    expect(planToCapabilities('founder_active')).toEqual({ pro_member: true, trainer_module: false });
    expect(planToCapabilities('trainer')).toEqual({ pro_member: true, trainer_module: true });
    expect(planToCapabilities('newbie')).toEqual({ pro_member: true, trainer_module: false });
  });
});

describe('normalizeSubscriptionPlan (Abwärtskompatibilität DB-Werte)', () => {
  it('ALTER DB-Wert beginner_trial → newbie', () => {
    expect(normalizeSubscriptionPlan('beginner_trial')).toBe('newbie');
  });
  it('NEUER DB-Wert newbie → newbie (nach Migration)', () => {
    expect(normalizeSubscriptionPlan('newbie')).toBe('newbie');
  });
  it('übrige gültige Werte bleiben erhalten', () => {
    expect(normalizeSubscriptionPlan('active')).toBe('active');
    expect(normalizeSubscriptionPlan('founder_active')).toBe('founder_active');
    expect(normalizeSubscriptionPlan('trainer')).toBe('trainer');
  });
  it('null/undefined → null (kein Absturz)', () => {
    expect(normalizeSubscriptionPlan(null)).toBeNull();
    expect(normalizeSubscriptionPlan(undefined)).toBeNull();
  });
  it('unbekannter Wert → null (defensiv, kein Absturz)', () => {
    expect(normalizeSubscriptionPlan('bogus')).toBeNull();
    expect(normalizeSubscriptionPlan('')).toBeNull();
  });
  it('Produkt-IDs bleiben separat korrekt zugeordnet', () => {
    expect(planOfProduct(PRODUCT_IDS.newbieMonthly)).toBe('newbie');
    expect(planOfProduct(PRODUCT_IDS.trainerMonthly)).toBe('trainer');
  });
});

describe('Posting-Identität (Absender)', () => {
  it('Halter zuerst, dann nur berechtigte (eigene) Hunde', () => {
    const dogs = [dog('a', 'U1'), dog('b', 'OTHER'), dog('c', 'U1')];
    const ids = buildPostingIdentities(user, dogs);
    expect(ids[0]).toMatchObject({ type: 'user', dogId: null });
    const dogIds = ids.filter(i => i.type === 'dog').map(i => i.dogId);
    expect(dogIds).toEqual(['a', 'c']);           // 'b' (fremd) ausgeschlossen
  });
  it('isEligibleDog nur für eigene Hunde', () => {
    expect(isEligibleDog(dog('x', 'U1'), 'U1')).toBe(true);
    expect(isEligibleDog(dog('x', 'OTHER'), 'U1')).toBe(false);
  });
  it('resolve: gespeicherter Hund wird gewählt, wenn noch berechtigt', () => {
    const ids = buildPostingIdentities(user, [dog('a', 'U1')]);
    expect(resolvePostingIdentity('dog:a', ids)).toMatchObject({ type: 'dog', dogId: 'a' });
  });
  it('resolve: gelöschter/nicht mehr berechtigter Hund → Fallback auf Halter', () => {
    const ids = buildPostingIdentities(user, [dog('a', 'U1')]);
    expect(resolvePostingIdentity('dog:GONE', ids)).toMatchObject({ type: 'user' });
  });
  it('ohne Hund → sauberer Fallback auf Halterprofil', () => {
    const ids = buildPostingIdentities(user, []);
    expect(ids).toHaveLength(1);
    expect(resolvePostingIdentity(null, ids)).toMatchObject({ type: 'user' });
    expect(identityKey(ids[0])).toBe('user');
  });
});

describe('Onboarding-Entscheidung', () => {
  it('nur eingeloggt UND ohne bestehendes CONNECT-Profil', () => {
    expect(shouldShowConnectOnboarding({ isLoggedIn: true, connectProfile: null })).toBe(true);
    expect(shouldShowConnectOnboarding({ isLoggedIn: false, connectProfile: null })).toBe(false);
    expect(shouldShowConnectOnboarding({ isLoggedIn: true, connectProfile: { id: 'p' } as never })).toBe(false);
  });
});

describe('Datenschutz-Standardwerte (datenschutzfreundlich)', () => {
  it('Profil nicht öffentlich, Trainings nur Freunde, Region/Online aus', () => {
    expect(DEFAULT_CONNECT_PRIVACY.profile_visibility).toBe('friends');
    expect(DEFAULT_CONNECT_PRIVACY.training_visibility_default).toBe('friends');
    expect(DEFAULT_CONNECT_PRIVACY.show_region).toBe(false);
    expect(DEFAULT_CONNECT_PRIVACY.show_online_status).toBe(false);
  });
});
