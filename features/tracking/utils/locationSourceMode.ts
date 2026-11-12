// Account-bound preferences, effective only with the dedicated server capability.
import { getQaPreferences, setQaPreference, subscribeQaPreferences, loadQaPreferences } from './qaPreferences';
export type LocationSourceMode = 'legacy' | 'precision';

export function getLocationSourceMode(): LocationSourceMode { return getQaPreferences().source; }
export function setLocationSourceMode(value: LocationSourceMode): void { setQaPreference('source', value); }
export function subscribeLocationSourceMode(fn: (value: LocationSourceMode) => void): () => void {
  return subscribeQaPreferences(() => fn(getLocationSourceMode()));
}
export async function loadPersistedLocationSourceMode(): Promise<LocationSourceMode> { await loadQaPreferences(); return getLocationSourceMode(); }
