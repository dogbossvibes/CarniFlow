import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────
// Laufzeit-Diagnose — NUR Beobachtung, KEINE Geschäftslogik.
//
// Sendet strukturierte Fehlerdetails an Sentry (via lib/monitoring.captureError)
// bzw. in DEV an die Konsole, damit fehlgeschlagene Auth-/IAP-Flows ihren echten
// Fehlercode/Status/native Code sichtbar machen (statt nur einen generischen
// UI-Text). Enthält NIEMALS Tokens, Passwörter, Authorization-Header oder
// Apple/Google-ID-Tokens — ausschliesslich unkritische Fehler-/Kontextfelder.
//
// Bewusst OHNE Top-Level-Imports von expo-constants/expo-updates/monitoring:
// alle werden lazy in try/catch geladen, damit dieses Modul in Tests und in
// jeder Laufzeitumgebung import-sicher bleibt und selbst nie wirft.
// ─────────────────────────────────────────────────────────────────────────

export type DiagnosticOperation =
  | 'email_login' | 'signup' | 'password_reset' | 'password_recovery'
  | 'google_oauth' | 'apple_oauth'
  | 'iap_configure' | 'iap_offerings' | 'iap_purchase';

export type DiagnosticProvider = 'email' | 'google' | 'apple' | 'store' | null;

// App-/Update-/Plattform-Kontext. Alles defensiv; fehlende Module → Feld null.
function appContext(): Record<string, unknown> {
  const ctx: Record<string, unknown> = { platform: Platform.OS };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default;
    const cfg = Constants?.expoConfig;
    ctx.appVersion = cfg?.version ?? null;
    ctx.build = Platform.OS === 'ios'
      ? (cfg?.ios?.buildNumber ?? null)
      : (cfg?.android?.versionCode ?? null);
  } catch { /* expo-constants nicht verfügbar */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates');
    ctx.runtimeVersion = Updates?.runtimeVersion ?? null;
    ctx.updateId = Updates?.updateId ?? null;
    ctx.channel = Updates?.channel ?? null;
  } catch { /* expo-updates nicht verfügbar */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SUPABASE_URL } = require('@/lib/supabase');
    ctx.supabaseRef = typeof SUPABASE_URL === 'string'
      ? (SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0] || null)
      : null;
  } catch { /* egal */ }
  return ctx;
}

// Extrahiert ausschliesslich unkritische Fehlerfelder (kein Token/Secret).
function safeError(error: unknown): Record<string, unknown> {
  const e = error as { name?: unknown; message?: unknown; code?: unknown; error_code?: unknown; status?: unknown; nativeErrorCode?: unknown; userInfo?: { code?: unknown } } | null;
  const message = typeof e?.message === 'string' ? e.message : String(error ?? '');
  return {
    name: e?.name ?? null,
    message,
    code: e?.code ?? e?.error_code ?? null,   // Supabase AuthError.code / nativer Fehlercode
    status: e?.status ?? null,                // HTTP-Status
    nativeCode: e?.nativeErrorCode ?? e?.userInfo?.code ?? null,
  };
}

// Zentrale, wurf-sichere Diagnose-Ausgabe. Beeinflusst NIE den Aufruf-Flow.
export function reportDiagnostic(
  operation: DiagnosticOperation,
  provider: DiagnosticProvider,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  try {
    const err = safeError(error);
    const ctx = { operation, provider, ...appContext(), error: err, ...(extra ?? {}) };
    const captured = error instanceof Error ? error : new Error(`[${operation}] ${err.message}`);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/lib/monitoring').captureError(captured, ctx);
    if (__DEV__) console.warn(`[diagnostic:${operation}]`, ctx);
  } catch { /* Diagnose darf den Flow nie beeinflussen */ }
}
