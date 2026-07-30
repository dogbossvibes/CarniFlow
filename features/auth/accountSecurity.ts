import type { User } from '@supabase/supabase-js';

export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_RESET_LINK_LABEL = 'Passwort vergessen?';
export const PASSWORD_RESET_SUCCESS_MESSAGE =
  'Wenn für diese E-Mail-Adresse ein Konto besteht, haben wir dir einen Link zum Zurücksetzen des Passworts gesendet.';
export const EMAIL_CHANGE_PENDING_MESSAGE =
  'Bitte prüfe deine E-Mails und bestätige die Änderung. Abhängig von den Sicherheitseinstellungen kann auch eine Bestätigung über deine bisherige Adresse erforderlich sein.';
export const RECOVERY_DEEP_LINK = 'anyvo://auth/recovery';

export type AuthProvider = 'email' | 'google' | 'apple' | string;

export function getAuthProvider(user: Pick<User, 'app_metadata'> | null | undefined): AuthProvider {
  return (user?.app_metadata?.provider as string | undefined) ?? 'email';
}

export function providerLabel(provider: AuthProvider): string {
  if (provider === 'google') return 'Google';
  if (provider === 'apple') return 'Apple';
  if (provider === 'email') return 'E-Mail';
  return provider;
}

export function isEmailPasswordProvider(provider: AuthProvider): boolean {
  return provider === 'email';
}

export function canChangeAnyvoPassword(provider: AuthProvider): boolean {
  return isEmailPasswordProvider(provider);
}

export function canChangeAnyvoEmail(provider: AuthProvider): boolean {
  return isEmailPasswordProvider(provider);
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Bitte mindestens ${MIN_PASSWORD_LENGTH} Zeichen verwenden.`;
  }
  if (password !== confirm) {
    return 'Die beiden Passwörter stimmen nicht überein.';
  }
  return null;
}

export function isReauthenticationError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('nonce')
    || normalized.includes('reauth')
    || normalized.includes('recent')
    || normalized.includes('secure password')
    || normalized.includes('reauth_nonce_missing');
}

export function isRecoveryRoutePath(path: string | null | undefined): boolean {
  return path === 'auth/recovery' || path === '/auth/recovery';
}
