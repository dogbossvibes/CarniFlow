import { Platform, TurboModuleRegistry } from 'react-native';

// Nativer Google-Login (Android: System-Kontoauswahl, iOS: Google-SDK).
// Ersetzt den Web-Login über die Supabase-Adresse, sobald der Build das native
// Modul enthält UND die Client-IDs gesetzt sind. Sonst meldet
// isNativeGoogleSignInAvailable() false und services/auth.ts nutzt den
// bisherigen Web-Login. Dadurch bleibt eine OTA auf ältere Builds (ohne Modul,
// z. B. iOS 60) unverändert funktionsfähig.
//
// Die Client-IDs sind öffentliche Kennungen (keine Secrets), kommen aber aus der
// EAS-Umgebung, damit sie zentral gepflegt werden:
//   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID  — Web-Client (derselbe wie im Supabase-Google-Provider)
//   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID  — iOS-Client (nur iOS nötig)

const NATIVE_MODULE_NAME = 'RNGoogleSignin';

export type NativeGoogleIdTokenResult =
  | { type: 'success'; idToken: string }
  | { type: 'cancelled' }
  | { type: 'unavailable'; reason: string };

function readClientIds() {
  return {
    webClientId: (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim(),
    iosClientId: (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim(),
  };
}

function hasNativeModule(): boolean {
  try {
    return TurboModuleRegistry.get(NATIVE_MODULE_NAME) != null;
  } catch {
    return false;
  }
}

export function isNativeGoogleSignInAvailable(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  const { webClientId, iosClientId } = readClientIds();
  if (!webClientId) return false;
  if (Platform.OS === 'ios' && !iosClientId) return false;
  return hasNativeModule();
}

type GoogleSigninLib = typeof import('@react-native-google-signin/google-signin');

let lib: GoogleSigninLib | null = null;
let configured = false;

function loadLib(): GoogleSigninLib {
  // Erst laden, wenn das native Modul sicher vorhanden ist: das Paket ruft beim
  // Import TurboModuleRegistry.getEnforcing auf und würde sonst werfen.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!lib) lib = require('@react-native-google-signin/google-signin') as GoogleSigninLib;
  return lib;
}

/**
 * Holt ein Google-ID-Token über die native Kontoauswahl.
 * Wirft nie: Fehler werden als 'unavailable' gemeldet, damit der Aufrufer auf
 * den Web-Login zurückfallen kann. Abbruch durch die Nutzerin = 'cancelled'.
 */
export async function getNativeGoogleIdToken(): Promise<NativeGoogleIdTokenResult> {
  if (!isNativeGoogleSignInAvailable()) return { type: 'unavailable', reason: 'not-configured' };

  try {
    const { GoogleSignin, isCancelledResponse, isSuccessResponse, isErrorWithCode, statusCodes } = loadLib();

    if (!configured) {
      const { webClientId, iosClientId } = readClientIds();
      GoogleSignin.configure({
        webClientId,
        ...(Platform.OS === 'ios' ? { iosClientId } : {}),
      });
      configured = true;
    }

    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    // Kontoauswahl erzwingen (wie bisher prompt=select_account): nur die
    // Google-SDK-Sitzung beenden, nie die ANYVO-/Supabase-Sitzung.
    try { await GoogleSignin.signOut(); } catch { /* keine vorherige Google-Sitzung */ }

    let response;
    try {
      response = await GoogleSignin.signIn();
    } catch (err) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) return { type: 'cancelled' };
      const code = isErrorWithCode(err) ? String(err.code) : 'unknown';
      return { type: 'unavailable', reason: `sign-in-error:${code}` };
    }

    if (isCancelledResponse(response)) return { type: 'cancelled' };
    if (!isSuccessResponse(response)) return { type: 'unavailable', reason: 'no-success' };

    const idToken = response.data.idToken;
    if (!idToken) return { type: 'unavailable', reason: 'no-id-token' };
    return { type: 'success', idToken };
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
    return { type: 'unavailable', reason: `native-error:${code}` };
  }
}
