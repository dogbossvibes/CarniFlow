import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';
import { EMAIL_CONFIRM_REDIRECT_URL, RECOVERY_DEEP_LINK } from '@/features/auth/accountSecurity';
import { reportDiagnostic } from '@/lib/diagnostics';

// Required to complete OAuth sessions on web (no-op on native)
WebBrowser.maybeCompleteAuthSession();

export async function signIn(email: string, password: string) {
  const res = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  // Diagnose (nur Beobachtung): echten Auth-Fehlercode sichtbar machen, z. B.
  // 'invalid_credentials' vs 'email_not_confirmed'. Rückgabe unverändert.
  if (res.error) reportDiagnostic('email_login', 'email', res.error);
  return res;
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
    options:  {
      data:           { full_name: fullName?.trim(), role },
      // Nach serverseitiger E-Mail-Verifikation leitet Supabase auf diese
      // dedizierte Bestätigungsseite (nicht mehr nur auf die Homepage).
      emailRedirectTo: EMAIL_CONFIRM_REDIRECT_URL,
    },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}

export function getPasswordRecoveryRedirectTo() {
  return makeRedirectUri({
    scheme: 'anyvo',
    path:   'auth/recovery',
    native: RECOVERY_DEEP_LINK,
  });
}

export async function resetPasswordForEmail(email: string) {
  const redirectTo = getPasswordRecoveryRedirectTo();
  const res = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  // Diagnose (nur Beobachtung): der Client zeigt aus Datenschutzgründen immer
  // „Erfolg" — hier wird der tatsächliche Fehler (Rate-Limit, Mailer, …) sichtbar.
  if (res.error) reportDiagnostic('password_reset', 'email', res.error, { redirectTo });
  return res;
}

export function requestPasswordReauthentication() {
  return supabase.auth.reauthenticate();
}

// Passwort ändern (nur für E-Mail/Passwort-Konten sinnvoll).
export function updatePassword(password: string, nonce?: string) {
  return supabase.auth.updateUser({
    password,
    ...(nonce?.trim() ? { nonce: nonce.trim() } : {}),
  });
}

// E-Mail-Adresse ändern. Supabase schickt eine Bestätigung an die NEUE Adresse
// (und je nach Projekt-Setting an die alte). Erfordert einen konfigurierten
// E-Mail-Versand (SMTP) im Supabase-Projekt.
export function updateEmail(email: string) {
  return supabase.auth.updateUser({ email: email.trim() });
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
    if (!credential.identityToken) {
      const tokenErr = new Error('Kein Apple-Token erhalten.');
      reportDiagnostic('apple_oauth', 'apple', tokenErr, { stage: 'missing_identity_token' });
      return { error: tokenErr };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token:    credential.identityToken,
    });
    if (error) reportDiagnostic('apple_oauth', 'apple', error, { stage: 'supabase_id_token' });
    return { error: error ?? null };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return { error: null }; // vom Nutzer abgebrochen
    reportDiagnostic('apple_oauth', 'apple', e, { stage: 'native_sign_in', nativeCode: e?.code ?? null });
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

export type GoogleOAuthResult = { error: Error | null; cancelled?: boolean };

let googleOAuthInFlight: Promise<GoogleOAuthResult> | null = null;

export function parseOAuthCallbackUrl(url: string): { code: string | null; error: string | null } {
  const [beforeHash, rawHash = ''] = url.split('#');
  const queryString = beforeHash.split('?')[1] ?? '';
  const normalizedHash = rawHash.replace(/^\/?/, '').replace(/^\?/, '');
  const hashString = normalizedHash.includes('?') ? normalizedHash.split('?')[1] : normalizedHash;
  const queryParams = new URLSearchParams(queryString);
  const hashParams = new URLSearchParams(hashString);

  return {
    code: queryParams.get('code') ?? hashParams.get('code'),
    error:
      queryParams.get('error_description')
      ?? hashParams.get('error_description')
      ?? queryParams.get('error')
      ?? hashParams.get('error'),
  };
}

async function runGoogleOAuth(): Promise<GoogleOAuthResult> {
  const redirectTo = makeRedirectUri({
    scheme: 'anyvo',
    path:   'auth/callback',
    native: 'anyvo://auth/callback',
  });

  // Kontoauswahl erzwingen: ohne `prompt=select_account` übernimmt Google bei
  // bestehender Google-Session stillschweigend das zuletzt verwendete Konto.
  // Gleicher OAuth-Parameter für Web, iOS und Android (Provider-seitig).
  const queryParams = { prompt: 'select_account' } as const;

  if (Platform.OS === 'web') {
    // On web: let Supabase redirect the browser window directly
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options:  { redirectTo, queryParams },
    });
    if (error) reportDiagnostic('google_oauth', 'google', error, { stage: 'web_oauth', redirectTo });
    return { error: error ?? null };
  }

  // Native (iOS / Android): use in-app WebBrowser session
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options:  { redirectTo, skipBrowserRedirect: true, queryParams },
  });

  if (error) { reportDiagnostic('google_oauth', 'google', error, { stage: 'sign_in_with_oauth', redirectTo }); return { error }; }
  if (!data?.url) {
    const urlErr = new Error('Keine OAuth-URL erhalten.');
    reportDiagnostic('google_oauth', 'google', urlErr, { stage: 'no_oauth_url', redirectTo });
    return { error: urlErr };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  // User dismissed the browser or cancelled consent — not an error.
  if (result.type !== 'success') return { error: null, cancelled: true };

  // Pull the PKCE authorization code out of the redirect URL.
  // exchangeCodeForSession expects ONLY the code string, not the whole URL —
  // passing the full URL sends it verbatim as auth_code and always fails.
  const { code, error: oauthErr } = parseOAuthCallbackUrl(result.url);

  if (oauthErr) {
    const cbErr = new Error(oauthErr);
    reportDiagnostic('google_oauth', 'google', cbErr, { stage: 'callback_error', redirectTo });
    return { error: cbErr };
  }
  if (!code) {
    const noCodeErr = new Error('Kein Anmelde-Code von Google erhalten.');
    reportDiagnostic('google_oauth', 'google', noCodeErr, { stage: 'no_code', redirectTo });
    return { error: noCodeErr };
  }

  const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exchErr) reportDiagnostic('google_oauth', 'google', exchErr, { stage: 'exchange_code', redirectTo });
  return { error: exchErr ?? null };
}

export async function signInWithGoogle(): Promise<GoogleOAuthResult> {
  if (googleOAuthInFlight) return googleOAuthInFlight;

  googleOAuthInFlight = runGoogleOAuth().finally(() => {
    googleOAuthInFlight = null;
  });

  return googleOAuthInFlight;
}
