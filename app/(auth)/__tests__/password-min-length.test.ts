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
