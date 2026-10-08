// Account-bound preferences, effective only with the dedicated server capability.
import { getQaPreferences, setQaPreference, subscribeQaPreferences, loadQaPreferences } from './qaPreferences';
export type TrackingEngineMode = 'build40' | 'current';

export function getTrackingEngineMode(): TrackingEngineMode { return getQaPreferences().engine; }
export function setTrackingEngineMode(value: TrackingEngineMode): void { setQaPreference('engine', value); }
export function subscribeTrackingEngineMode(fn: (value: TrackingEngineMode) => void): () => void {
  return subscribeQaPreferences(() => fn(getTrackingEngineMode()));
}
export async function loadPersistedTrackingEngineMode(): Promise<TrackingEngineMode> { await loadQaPreferences(); return getTrackingEngineMode(); }
