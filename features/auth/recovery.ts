// Reine, testbare Logik für den Passwort-Recovery-Callback.
// KEINE Netzwerk-/Supabase-Aufrufe hier — nur Entscheidung + sichere Kontextfelder.
// Tokens/Codes werden NIE zurückgegeben oder geloggt, nur ihr Vorhandensein.

export interface RecoveryParams {
  code?: string;
  token_hash?: string;
  type?: string;
  error?: string;
  error_description?: string;
}

export type RecoveryAction =
  | { kind: 'error' }                          // Deep-Link trägt error/error_description
  | { kind: 'exchange'; code: string }         // PKCE-Code → exchangeCodeForSession
  | { kind: 'verifyOtp'; tokenHash: string }   // token_hash → verifyOtp (prefetch-resistent)
  | { kind: 'session' };                       // kein Token → bestehende Session prüfen

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

// Entscheidet den initialen Recovery-Schritt. Reihenfolge:
//  1) explizite Fehler-Parameter gewinnen (abgelaufener/verbrauchter Link),
//  2) token_hash (robust gegen Link-Prefetch, da erst verifyOtp den Token einlöst),
//  3) PKCE-code (bestehender Flow),
//  4) sonst: bereits vorhandene Recovery-Session prüfen.
export function resolveRecoveryAction(p: RecoveryParams): RecoveryAction {
  if (nonEmpty(p.error) || nonEmpty(p.error_description)) return { kind: 'error' };
  if (nonEmpty(p.token_hash) && (p.type ?? 'recovery') === 'recovery') {
    return { kind: 'verifyOtp', tokenHash: p.token_hash };
  }
  if (nonEmpty(p.code)) return { kind: 'exchange', code: p.code };
  return { kind: 'session' };
}

// Nur unkritische Booleans/Typen für die Diagnose — niemals die Werte selbst.
export function recoveryDiagnosticContext(p: RecoveryParams): {
  codePresent: boolean; tokenHashPresent: boolean; type: string | null; errorParamPresent: boolean;
} {
  return {
    codePresent: nonEmpty(p.code),
    tokenHashPresent: nonEmpty(p.token_hash),
    type: nonEmpty(p.type) ? p.type! : null,
    errorParamPresent: nonEmpty(p.error) || nonEmpty(p.error_description),
  };
}

export type RecoveryErrorKind = 'same_device' | 'expired' | 'network' | 'generic';

// Klassifiziert einen Session-Exchange-/verifyOtp-Fehler für eine präzise
// Nutzermeldung (verbraucht/abgelaufen vs. falsches Gerät vs. Netzwerk).
export function classifyRecoveryError(message: string | null | undefined): RecoveryErrorKind {
  const m = (message ?? '').toLowerCase();
  if (/flow state|verifier|code challenge|code_verifier/.test(m)) return 'same_device';
  if (/expired|invalid|not found|otp|used/.test(m)) return 'expired';
  if (/network|fetch|timeout|connection/.test(m)) return 'network';
  return 'generic';
}
