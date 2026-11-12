// No global/legacy QA preferences: the current server-authorized account is required.
import { loadQaPreferences } from './qaPreferences';
export function hydrateQaModes(): Promise<void> { return loadQaPreferences(); }
