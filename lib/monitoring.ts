import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Crash-/Error-Reporting. Doppelt abgesichert:
//  1) Ohne EXPO_PUBLIC_SENTRY_DSN ist alles ein No-op (kein Datenversand).
//  2) Der Nutzer kann Absturzberichte im Profil deaktivieren (Opt-out). Die
//     Präferenz wird lokal gespeichert; standardmässig sind Berichte aktiv.
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const PREF_KEY = 'crash_reporting_enabled';
let initialized = false;

// Lokale Nutzer-Präferenz (Default: an). 'false' = ausdrücklich deaktiviert.
export async function isCrashReportingEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(PREF_KEY)) !== 'false'; }
  catch { return true; }
}

// Initialisiert Sentry, sofern DSN vorhanden UND vom Nutzer nicht deaktiviert.
export async function initMonitoring(): Promise<void> {
  if (initialized || !DSN) return;
  if (!(await isCrashReportingEnabled())) return;
  Sentry.init({
    dsn:              DSN,
    tracesSampleRate: 0,        // nur Crashes/Errors, kein Performance-Tracing
    enabled:          true,
  });
  initialized = true;
}

// Stoppt das Reporting zur Laufzeit (beim Deaktivieren durch den Nutzer).
async function disableMonitoring(): Promise<void> {
  if (!initialized) return;
  try { await Sentry.close(); } catch { /* best-effort */ }
  initialized = false;
}

// Setzt die Präferenz und schaltet Reporting sofort ein/aus.
export async function setCrashReportingEnabled(enabled: boolean): Promise<void> {
  try { await AsyncStorage.setItem(PREF_KEY, enabled ? 'true' : 'false'); } catch { /* egal */ }
  if (enabled) await initMonitoring();
  else         await disableMonitoring();
}

export function captureError(error: unknown, extra?: Record<string, unknown>) {
  if (initialized) {
    Sentry.captureException(error, extra ? { extra } : undefined);
  } else if (__DEV__) {
    // Ohne DSN/deaktiviert: lokal sichtbar machen.
    console.error('[monitoring]', error, extra ?? '');
  }
}
