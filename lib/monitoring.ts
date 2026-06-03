import * as Sentry from '@sentry/react-native';

// Crash-/Error-Reporting. Guarded per DSN: ohne EXPO_PUBLIC_SENTRY_DSN ist alles
// ein No-op (kein Breaking Change, kein Datenversand). Mit DSN + Build werden
// Abstürze + via captureError gemeldete Fehler an Sentry geschickt.
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
let initialized = false;

export function initMonitoring() {
  if (initialized || !DSN) return;
  Sentry.init({
    dsn:              DSN,
    tracesSampleRate: 0,        // nur Crashes/Errors, kein Performance-Tracing
    enabled:          true,
  });
  initialized = true;
}

export function captureError(error: unknown, extra?: Record<string, unknown>) {
  if (initialized) {
    Sentry.captureException(error, extra ? { extra } : undefined);
  } else if (__DEV__) {
    // Ohne DSN: lokal sichtbar machen.
    console.error('[monitoring]', error, extra ?? '');
  }
}
