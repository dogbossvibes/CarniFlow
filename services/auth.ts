import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

// Required to complete OAuth sessions on web (no-op on native)
WebBrowser.maybeCompleteAuthSession();

export function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email: email.trim(), password });
}

// Rolle wird in den Metadaten mitgegeben; der DB-Trigger handle_new_user
// klammert sie auf 'user'/'trainer' (kein Self-Signup als 'admin').
export function signUp(
  email: string,
  password: string,
  fullName?: string,
  role: 'user' | 'trainer' = 'user',
) {
  return supabase.auth.signUp({
    email:    email.trim(),
    password,
    options:  { data: { full_name: fullName?.trim(), role } },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}

// Sign in with Apple (iOS, nativ). Pflicht laut App-Store-Guideline 4.8, da
// Google-Login angeboten wird. Erfordert in Supabase den aktivierten
// Apple-Provider.
export async function signInWithApple(): Promise<{ error: Error | null }> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) return { error: new Error('Kein Apple-Token erhalten.') };

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token:    credential.identityToken,
    });
    return { error: error ?? null };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return { error: null }; // vom Nutzer abgebrochen
    return { error: e instanceof Error ? e : new Error('Apple-Login fehlgeschlagen') };
  }
}

export const isAppleAuthAvailable = AppleAuthentication.isAvailableAsync;

// Vollständige Kontolöschung über die Edge Function (service-role): Storage +
// auth.users (CASCADE). Danach lokal abmelden.
export async function deleteAccount(): Promise<{ error: Error | null }> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) return { error };
  await supabase.auth.signOut();
  return { error: null };
}

export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  const redirectTo = makeRedirectUri({
    scheme: 'anyvo',
    path:   'auth/callback',
    native: 'anyvo://auth/callback',
  });

  if (Platform.OS === 'web') {
    // On web: let Supabase redirect the browser window directly
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options:  { redirectTo },
    });
    return { error: error ?? null };
  }

  // Native (iOS / Android): use in-app WebBrowser session
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options:  { redirectTo, skipBrowserRedirect: true },
  });

  if (error) return { error };
  if (!data?.url) return { error: new Error('Keine OAuth-URL erhalten.') };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'success') {
    const { error: exchErr } = await supabase.auth.exchangeCodeForSession(result.url);
    if (exchErr) return { error: exchErr };
    return { error: null };
  }

  return { error: null };
}
