import { readFileSync } from 'fs';
import { MIN_PASSWORD_LENGTH } from '@/features/auth/accountSecurity';
import { deCH } from '@/i18n/de-CH';

// Registrierung, Passwort ändern und Wiederherstellung nutzen dieselbe Mindestlänge
// wie das Supabase-Auth-Setting (8).
describe('Passwort-Mindestlänge', () => {
  const login = readFileSync('app/(auth)/login.tsx', 'utf8');

  it('ist 8', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('Registrierung prüft MIN_PASSWORD_LENGTH statt einer festen 6', () => {
    expect(login).toContain('passwort.length < MIN_PASSWORD_LENGTH');
    expect(login).not.toMatch(/passwort\.length\s*<\s*6\b/);
  });

  it('Hinweistexte nennen 8 Zeichen', () => {
    expect(deCH['auth.errorPasswordMin8']).toContain('8');
    const all = ['i18n/de-CH.ts', 'i18n/gsw-CH.ts', 'i18n/locales/en.ts', 'i18n/locales/fr.ts', 'i18n/locales/it.ts']
      .map((p) => readFileSync(p, 'utf8')).join('\n');
    expect(all).not.toContain('errorPasswordMin6');
  });

  it('lokale Supabase-Konfiguration verlangt ebenfalls 8', () => {
    expect(readFileSync('supabase/config.toml', 'utf8')).toMatch(/^minimum_password_length = 8$/m);
  });
});

describe('Geleakte Passwörter (HaveIBeenPwned)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isLeakedPasswordError } = require('@/features/auth/accountSecurity');

  it('erkennt die Supabase-Ablehnung', () => {
    expect(isLeakedPasswordError('Password is known to be weak and easy to guess, please choose a different one.')).toBe(true);
    expect(isLeakedPasswordError('weak password: pwned')).toBe(true);
  });

  it('verwechselt sie nicht mit Länge oder anderen Fehlern', () => {
    expect(isLeakedPasswordError('Password should be at least 8 characters.')).toBe(false);
    expect(isLeakedPasswordError('Invalid login credentials')).toBe(false);
    expect(isLeakedPasswordError(undefined)).toBe(false);
  });

  it('alle drei Passwort-Wege zeigen die verständliche Meldung', () => {
    for (const p of ['app/(auth)/login.tsx', 'app/auth/recovery.tsx', 'app/account-security/change-password.tsx']) {
      expect(readFileSync(p, 'utf8')).toContain("t('auth.errorPasswordLeaked')");
    }
    const all = ['i18n/de-CH.ts', 'i18n/gsw-CH.ts', 'i18n/locales/en.ts', 'i18n/locales/fr.ts', 'i18n/locales/it.ts']
      .map((p) => readFileSync(p, 'utf8'));
    for (const src of all) expect(src).toContain('auth.errorPasswordLeaked');
  });
});
