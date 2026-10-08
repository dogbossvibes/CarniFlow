// Account-bound preferences, effective only with the dedicated server capability.
import { getQaPreferences, setQaPreference, subscribeQaPreferences, loadQaPreferences } from './qaPreferences';

export function isQaDiagnosticsEnabled(): boolean { return getQaPreferences().diagnostics; }
export function setQaDiagnosticsEnabled(value: boolean): void { setQaPreference('diagnostics', value); }
export function subscribeQaDiagnostics(fn: (value: boolean) => void): () => void {
  return subscribeQaPreferences(() => fn(isQaDiagnosticsEnabled()));
}
export async function loadPersistedQaDiagnostics(): Promise<boolean> { await loadQaPreferences(); return isQaDiagnosticsEnabled(); }
