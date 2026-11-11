jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { readFileSync } from 'fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_ONBOARDING_STATE,
  __resetOnboardingForTests,
  completeOnboarding,
  onboardingKeyForUser,
  resolveOnboardingGate,
  sanitizeOnboardingState,
} from '@/stores/onboarding';

const base = { hydrated: true, done: false, helpHydrated: true, homeHelpSeen: false, dogs: 0 as const };

describe('Einführung — Entscheidung, ob sie gezeigt wird', () => {
  it('zeigt sie nur bei sicher null Hunden auf einer frischen Installation', () => {
    expect(resolveOnboardingGate(base)).toBe('show');
  });

  it('bestehende Kundinnen mit Hund sehen sie nie', () => {
    expect(resolveOnboardingGate({ ...base, dogs: 1 })).toBe('skip');
    expect(resolveOnboardingGate({ ...base, dogs: 7 })).toBe('skip');
  });

  it('bestehende Installation (Hilfe „home" gesehen) überspringt ohne Hunde-Abfrage', () => {
    expect(resolveOnboardingGate({ ...base, homeHelpSeen: true, dogs: 'unknown' })).toBe('skip');
  });

  it('erledigt bleibt erledigt — auch ohne Hund und ohne Netz', () => {
    expect(resolveOnboardingGate({ ...base, done: true, helpHydrated: false, dogs: 'unknown' })).toBe('skip');
  });

  it('Ladefehler/Offline blockiert den Start nicht und zeigt nichts', () => {
    expect(resolveOnboardingGate({ ...base, dogs: 'error' })).toBe('skip');
  });

  it('wartet, solange Status, Hilfe oder Hunde noch unbekannt sind', () => {
    expect(resolveOnboardingGate({ ...base, hydrated: false })).toBe('pending');
    expect(resolveOnboardingGate({ ...base, helpHydrated: false })).toBe('pending');
    expect(resolveOnboardingGate({ ...base, dogs: 'unknown' })).toBe('pending');
  });
});

describe('Einführung — Status', () => {
  beforeEach(async () => {
    __resetOnboardingForTests();
    await AsyncStorage.clear();
  });

  it('Key ist pro Nutzer getrennt', () => {
    expect(onboardingKeyForUser('u1')).toBe('onboarding_state:u1');
    expect(onboardingKeyForUser(null)).toBe('onboarding_state:anon');
  });

  it('beschädigter/fehlender State fällt sicher auf „nicht erledigt" zurück', () => {
    for (const raw of [null, undefined, 'x', 3, [], { done: 'yes' }]) {
      expect(sanitizeOnboardingState(raw)).toEqual(EMPTY_ONBOARDING_STATE);
    }
    expect(sanitizeOnboardingState({ done: true, pushDeclined: true, extra: 1 }))
      .toEqual({ done: true, pushDeclined: true });
  });

  it('completeOnboarding speichert und nimmt „Nicht jetzt" nie stillschweigend zurück', async () => {
    completeOnboarding({ pushDeclined: true });
    completeOnboarding();
    await Promise.resolve();
    const raw = await AsyncStorage.getItem(onboardingKeyForUser(null));
    expect(JSON.parse(raw as string)).toEqual({ done: true, pushDeclined: true });
  });
});

describe('Einführung — Verdrahtung', () => {
  const src = (p: string) => readFileSync(p, 'utf8');

  it('Tab-Layout fragt Mitteilungen erst nach geklärter Einführung an', () => {
    const file = src('app/(tabs)/_layout.tsx');
    expect(file).toContain("if (uid && onboardingGate === 'skip') registerForPush(uid, { prompt: !pushDeclined });");
    expect(file).toContain('if (onboardingGate === \'show\') return <Redirect href="/onboarding" />;');
    expect(file).not.toMatch(/registerForPush\(uid\);/);
  });

  it('registerForPush fragt mit prompt:false keine Berechtigung an', () => {
    expect(src('lib/push.ts')).toContain("if (status !== 'granted' && opts?.prompt !== false) {");
  });

  it('Einführung löscht/überschreibt keine Kundendaten und bleibt über der Tastatur bedienbar', () => {
    const file = src('app/onboarding.tsx');
    expect(file).not.toMatch(/\.delete\(|deleteDog|updateDog|AsyncStorage\.(clear|removeItem)/);
    expect(file).toContain("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}");
    expect(file).toContain('keyboardShouldPersistTaps="handled"');
    expect(file).toContain("completeOnboarding({ pushDeclined: push !== 'allowed' });");
  });
});
