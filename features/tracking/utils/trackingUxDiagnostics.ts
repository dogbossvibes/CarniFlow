/** Relative, bounded diagnostics for tracking UX events. */
export const TRACKING_UX_QA_LIMITS = Object.freeze({ voice: 100, end: 300, dwell: 100, manualAngles: 100 });

export type VoiceEventType = 'approach' | 'search_start' | 'angle' | 'object' | 'end' | 'status' | 'segment';
export interface VoiceDiagnostic {
  eventType: VoiceEventType;
  triggerTSec: number;
  queuedTSec: number | null;
  spokenTSec: number | null;
  delayMs: number | null;
  priority: number;
  onceKey: string;
  phase: string;
  suppressedReason: string | null;
  progressM?: number | null;
  distanceM?: number | null;
}

export function boundedPush<T>(items: T[], item: T, limit: number): boolean {
  if (items.length >= limit) return false;
  items.push(item);
  return true;
}
