/* eslint-disable import/first */
// Verifiziert, dass die Registrierung den dedizierten E-Mail-Bestätigungs-
// Redirect an Supabase übergibt (statt auf die Homepage zu fallen).

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(() => Promise.resolve({ data: { session: null, user: null }, error: null })),
    },
  },
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(({ native, scheme, path }) => native ?? `${scheme}://${path}`),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 'FULL_NAME', EMAIL: 'EMAIL' },
}));

import { supabase } from '@/lib/supabase';
import { signUp } from '@/services/auth';
import { EMAIL_CONFIRM_REDIRECT_URL } from '@/features/auth/accountSecurity';

const auth = supabase.auth as jest.Mocked<typeof supabase.auth>;

describe('signUp email confirmation redirect', () => {
  beforeEach(() => jest.clearAllMocks());

  it('übergibt emailRedirectTo an Supabase', async () => {
    await signUp('  User@Example.com ', 'geheim123', '  Sandra  ');

    expect(auth.signUp).toHaveBeenCalledTimes(1);
    const arg = auth.signUp.mock.calls[0][0] as any;
    expect(arg.email).toBe('User@Example.com');
    expect(arg.options.emailRedirectTo).toBe(EMAIL_CONFIRM_REDIRECT_URL);
    expect(arg.options.data).toEqual({ full_name: 'Sandra', role: 'user' });
  });

  it('verwendet die dedizierte Bestätigungsseite, nicht die Homepage', () => {
    expect(EMAIL_CONFIRM_REDIRECT_URL).toBe('https://anyvo.app/auth/confirmed');
    expect(EMAIL_CONFIRM_REDIRECT_URL).not.toBe('https://anyvo.app');
    expect(EMAIL_CONFIRM_REDIRECT_URL).not.toBe('https://anyvo.app/');
  });
});
