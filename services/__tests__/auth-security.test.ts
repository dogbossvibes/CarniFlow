/* eslint-disable import/first */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      updateUser: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      reauthenticate: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      signInWithOAuth: jest.fn(() => Promise.resolve({ data: { url: 'https://google.test?code=abc' }, error: null })),
      exchangeCodeForSession: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    },
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(({ native, scheme, path }) => native ?? `${scheme}://${path}`),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: 'dismiss' })),
}));

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 'FULL_NAME', EMAIL: 'EMAIL' },
}));

import { supabase } from '@/lib/supabase';
import {
  getPasswordRecoveryRedirectTo,
  requestPasswordReauthentication,
  resetPasswordForEmail,
  signInWithGoogle,
  updateEmail,
  updatePassword,
} from '@/services/auth';

const auth = supabase.auth as jest.Mocked<typeof supabase.auth>;

describe('Auth security service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('2. Reset verwendet resetPasswordForEmail mit Recovery-URL', async () => {
    await resetPasswordForEmail(' user@example.com ');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'anyvo://auth/recovery',
    });
  });

  it('4. Recovery Redirect ist anyvo://auth/recovery', () => {
    expect(getPasswordRecoveryRedirectTo()).toBe('anyvo://auth/recovery');
  });

  it('9. updateUser(password) wird bei gültigem Passwort-Service-Aufruf genutzt', async () => {
    await updatePassword('12345678');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: '12345678' });
  });

  it('9. updateUser(password, nonce) sendet den Reauth-Nonce', async () => {
    await updatePassword('12345678', ' 123456 ');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: '12345678', nonce: '123456' });
  });

  it('16. E-Mail-Änderung nutzt updateEmail/updateUser(email)', async () => {
    await updateEmail(' new@example.com ');
    expect(auth.updateUser).toHaveBeenCalledWith({ email: 'new@example.com' });
  });

  it('Reauthentication nutzt die installierte Supabase-v2-API', async () => {
    await requestPasswordReauthentication();
    expect(auth.reauthenticate).toHaveBeenCalledTimes(1);
  });

  it('20. Google Login behält OAuth bei und erzwingt Kontoauswahl', async () => {
    await signInWithGoogle();
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'anyvo://auth/callback',
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
  });
});
