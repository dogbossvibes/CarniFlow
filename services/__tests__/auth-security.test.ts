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
import * as WebBrowser from 'expo-web-browser';
import {
  getPasswordRecoveryRedirectTo,
  parseOAuthCallbackUrl,
  requestPasswordReauthentication,
  resetPasswordForEmail,
  signInWithGoogle,
  updateEmail,
  updatePassword,
} from '@/services/auth';

const auth = supabase.auth as jest.Mocked<typeof supabase.auth>;
const browser = WebBrowser as jest.Mocked<typeof WebBrowser>;

describe('Auth security service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://google.test/oauth' }, error: null } as any);
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null } as any);
    browser.openAuthSessionAsync.mockResolvedValue({ type: 'dismiss' } as any);
  });

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

  it('20. Google Login tauscht den nativen Success-Code genau einmal aus', async () => {
    browser.openAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url:  'anyvo://auth/callback?code=pkce-code',
    } as any);

    const result = await signInWithGoogle();

    expect(result).toEqual({ error: null });
    expect(browser.openAuthSessionAsync).toHaveBeenCalledWith('https://google.test/oauth', 'anyvo://auth/callback');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
  });

  it('20. Google Login startet bei parallelem Tippen keinen zweiten PKCE-Flow', async () => {
    let finishBrowser!: (result: unknown) => void;
    browser.openAuthSessionAsync.mockImplementationOnce(() => new Promise((resolve) => {
      finishBrowser = resolve;
    }) as any);

    const first = signInWithGoogle();
    const second = signInWithGoogle();

    await Promise.resolve();
    await Promise.resolve();

    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(browser.openAuthSessionAsync).toHaveBeenCalledTimes(1);

    finishBrowser({ type: 'success', url: 'anyvo://auth/callback?code=single-code' });

    await expect(first).resolves.toEqual({ error: null });
    await expect(second).resolves.toEqual({ error: null });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('single-code');
  });

  it('20. Google Login behandelt cancel/dismiss nicht als Loginfehler', async () => {
    browser.openAuthSessionAsync.mockResolvedValueOnce({ type: 'cancel' } as any);

    await expect(signInWithGoogle()).resolves.toEqual({ error: null, cancelled: true });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('20. Google Login meldet fehlenden Code kontrolliert', async () => {
    browser.openAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url:  'anyvo://auth/callback',
    } as any);

    const result = await signInWithGoogle();

    expect(result.error?.message).toBe('Kein Anmelde-Code von Google erhalten.');
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('20. Google Login gibt Supabase-OAuth-Fehler zurück', async () => {
    auth.signInWithOAuth.mockResolvedValueOnce({
      data:  { url: null },
      error: new Error('provider disabled'),
    } as any);

    const result = await signInWithGoogle();

    expect(result.error?.message).toBe('provider disabled');
    expect(browser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('20. OAuth Callback Parser liest Query- und Fragment-Parameter robust', () => {
    expect(parseOAuthCallbackUrl('anyvo://auth/callback?code=query-code')).toEqual({
      code:  'query-code',
      error: null,
    });
    expect(parseOAuthCallbackUrl('anyvo://auth/callback#code=hash-code')).toEqual({
      code:  'hash-code',
      error: null,
    });
    expect(parseOAuthCallbackUrl('anyvo://auth/callback?error_description=access_denied')).toEqual({
      code:  null,
      error: 'access_denied',
    });
  });
});
