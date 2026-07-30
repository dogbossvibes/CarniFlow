import {
  EMAIL_CHANGE_PENDING_MESSAGE,
  PASSWORD_RESET_LINK_LABEL,
  PASSWORD_RESET_SUCCESS_MESSAGE,
  RECOVERY_DEEP_LINK,
  canChangeAnyvoEmail,
  canChangeAnyvoPassword,
  getAuthProvider,
  isReauthenticationError,
  isRecoveryRoutePath,
  providerLabel,
  validateNewPassword,
} from '@/features/auth/accountSecurity';

const user = (provider?: string) => ({ app_metadata: provider ? { provider } : {} });

describe('Auth account security policy', () => {
  it('1. Passwort-vergessen-Link ist fachlich benannt', () => {
    expect(PASSWORD_RESET_LINK_LABEL).toBe('Passwort vergessen?');
  });

  it('3/18. Reset-Erfolgsmeldung ist generisch und verrät kein Konto', () => {
    expect(PASSWORD_RESET_SUCCESS_MESSAGE).toContain('Wenn für diese E-Mail-Adresse ein Konto besteht');
    expect(PASSWORD_RESET_SUCCESS_MESSAGE).not.toContain('existiert nicht');
  });

  it('4. Recovery Deep Link nutzt das bestehende ANYVO-Scheme', () => {
    expect(RECOVERY_DEEP_LINK).toBe('anyvo://auth/recovery');
    expect(isRecoveryRoutePath('auth/recovery')).toBe(true);
    expect(isRecoveryRoutePath('/auth/recovery')).toBe(true);
  });

  it('7. Passwort-Mismatch blockiert', () => {
    expect(validateNewPassword('12345678', '87654321')).toBe('Die beiden Passwörter stimmen nicht überein.');
  });

  it('8. zu kurzes Passwort blockiert', () => {
    expect(validateNewPassword('1234567', '1234567')).toContain('mindestens 8 Zeichen');
  });

  it('9. gültiges Passwort passiert die Policy', () => {
    expect(validateNewPassword('12345678', '12345678')).toBeNull();
  });

  it('10/13. Email-Account sieht ANYVO-Passwort und E-Mail-Änderung', () => {
    const provider = getAuthProvider(user('email') as never);
    expect(canChangeAnyvoPassword(provider)).toBe(true);
    expect(canChangeAnyvoEmail(provider)).toBe(true);
  });

  it('11/14. Google-only sieht kein ANYVO-Passwort und keine ANYVO-E-Mail-Änderung', () => {
    const provider = getAuthProvider(user('google') as never);
    expect(providerLabel(provider)).toBe('Google');
    expect(canChangeAnyvoPassword(provider)).toBe(false);
    expect(canChangeAnyvoEmail(provider)).toBe(false);
  });

  it('12/15. Apple-only sieht kein ANYVO-Passwort und keine ANYVO-E-Mail-Änderung', () => {
    const provider = getAuthProvider(user('apple') as never);
    expect(providerLabel(provider)).toBe('Apple');
    expect(canChangeAnyvoPassword(provider)).toBe(false);
    expect(canChangeAnyvoEmail(provider)).toBe(false);
  });

  it('17. E-Mail-Pending-Text ist mit Secure Email Change kompatibel', () => {
    expect(EMAIL_CHANGE_PENDING_MESSAGE).toContain('bisherige Adresse');
    expect(EMAIL_CHANGE_PENDING_MESSAGE).toContain('Sicherheitseinstellungen');
  });

  it('Reauthentication-Fehler werden für den Nonce-Flow erkannt', () => {
    expect(isReauthenticationError('reauth_nonce_missing')).toBe(true);
    expect(isReauthenticationError('Nonce required')).toBe(true);
    expect(isReauthenticationError('Network error')).toBe(false);
  });
});
