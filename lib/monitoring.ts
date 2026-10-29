import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Crash-/Error-Reporting. Doppelt abgesichert:
//  1) Ohne EXPO_PUBLIC_SENTRY_DSN ist alles ein No-op (kein Datenversand).
//  2) Der Nutzer kann Absturzberichte im Profil deaktivieren (Opt-out). Die
//     Präferenz wird lokal gespeichert; standardmässig sind Berichte aktiv.
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const PREF_KEY = 'crash_reporting_enabled';
let initialized = false;
let reportingAllowed = true;
let preferenceRevision = 0;
let lifecycle: Promise<void> = Promise.resolve();
let preferenceWrites: Promise<void> = Promise.resolve();

// Initialisierung und Schliessen dürfen sich nicht überholen. Ein fehlgeschlagener
// SDK-Aufruf darf spätere Einstellungsänderungen nicht dauerhaft blockieren.
function serializeLifecycle(action: () => Promise<void>): Promise<void> {
  const pending = lifecycle.then(action);
  lifecycle = pending.catch(() => {});
  return pending;
}

// Lokale Nutzer-Präferenz (Default: an). 'false' = ausdrücklich deaktiviert.
export async function isCrashReportingEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(PREF_KEY)) !== 'false'; }
  catch { return true; }
}

// Initialisiert Sentry, sofern DSN vorhanden UND vom Nutzer nicht deaktiviert.
export function initMonitoring(): Promise<void> {
  if (initialized || !DSN || !reportingAllowed) return Promise.resolve();
  const revision = preferenceRevision;
  return serializeLifecycle(async () => {
    if (initialized || !reportingAllowed || revision !== preferenceRevision) return;
    const enabled = await isCrashReportingEnabled();
    // Ein inzwischen erfolgtes Opt-out hat Vorrang vor dem alten Speicherwert.
    if (!enabled || !reportingAllowed || revision !== preferenceRevision) return;
    try {
      Sentry.init({
        dsn:              DSN,
        tracesSampleRate: 0,        // nur Crashes/Errors, kein Performance-Tracing
        enabled:          true,
        beforeSend: event => reportingAllowed && initialized ? event : null,
      });
      initialized = true;
    } catch {
      initialized = false;
    }
  });
}

// Stoppt das Reporting zur Laufzeit (beim Deaktivieren durch den Nutzer).
function disableMonitoring(): Promise<void> {
  const needsClose = initialized;
  // Sofort sperren, auch wenn Speicher oder SDK-Schliessen noch ausstehen.
  initialized = false;
  return serializeLifecycle(async () => {
    if (needsClose) {
      try { await Sentry.close(); } catch { /* best-effort; lokale Sperre bleibt */ }
    }
  });
}

// Setzt die Präferenz und schaltet Reporting sofort ein/aus.
export async function setCrashReportingEnabled(enabled: boolean): Promise<void> {
  reportingAllowed = enabled;
  preferenceRevision++;
  // Die Schreibreihenfolge folgt der Nutzerentscheidung, nicht der I/O-Latenz.
  const saved = preferenceWrites.then(async () => {
    try { await AsyncStorage.setItem(PREF_KEY, enabled ? 'true' : 'false'); } catch { /* wie bisher best-effort */ }
  });
  preferenceWrites = saved;
  if (enabled) {
    await saved;
    await initMonitoring();
  } else {
    await Promise.all([saved, disableMonitoring()]);
  }
}

export function captureError(error: unknown, extra?: Record<string, unknown>) {
  if (initialized && reportingAllowed) {
    Sentry.captureException(error, extra ? { extra } : undefined);
  } else if (__DEV__) {
    // Ohne DSN/deaktiviert: lokal sichtbar machen.
    console.error('[monitoring]', error, extra ?? '');
  }
}
