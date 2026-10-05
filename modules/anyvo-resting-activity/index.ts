// anyvo-resting-activity — Liegezeit-Live-Activity V2 (iOS, ActivityKit).
// Reine Darstellung: jede Operation wirkt nur auf die Activity mit exakt passender
// dogId + sessionId. Ohne natives Modul (Android, älterer Build) → sichere No-ops.
import Native from './src/AnyvoRestingActivityModule';
import type { RestingActivityInfo, RestingActivityStartInput } from './src/AnyvoRestingActivity.types';

export type { RestingActivityInfo, RestingActivityStartInput } from './src/AnyvoRestingActivity.types';

export function isRestingActivityModuleAvailable(): boolean {
  return Native != null;
}

export function isRestingActivitySupported(): boolean {
  if (!Native) return false;
  try { return Native.isSupported(); } catch { return false; }
}

export function startRestingActivity(input: RestingActivityStartInput): string | null {
  if (!Native) return null;
  try { return Native.start(input) ?? null; } catch { return null; }
}

export async function endRestingActivity(dogId: string, sessionId: string): Promise<number> {
  if (!Native) return 0;
  try { return await Native.end(dogId, sessionId); } catch { return 0; }
}

export async function endRestingActivityById(activityId: string): Promise<boolean> {
  if (!Native) return false;
  try { return await Native.endActivity(activityId); } catch { return false; }
}

export function listRestingActivities(): RestingActivityInfo[] {
  if (!Native) return [];
  try { return Native.list() ?? []; } catch { return []; }
}

export async function endLegacyRestingActivities(): Promise<number> {
  if (!Native) return 0;
  try { return await Native.endLegacyResting(); } catch { return 0; }
}
