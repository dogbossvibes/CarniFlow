import { emptyPositionTiming, observePositionTiming, type PositionTiming } from './positionTimingDiagnostics';
import type { StreamSample } from './positionStream';
import type { GnssStatusAndroid } from '@/features/tracking/native/types';
import { normalizeFixQuality, validUncertainty, type LocationFixQuality } from './locationFixQuality';
import { DEFAULT_FUSION_CONFIG } from '@/features/tracking/engine/trackFusionEngine';

export interface PositionDiagnostics {
  active: boolean;
  timing: PositionTiming;
  fix: (Required<LocationFixQuality> & {
    accuracy: number | null; timestamp: number; source: StreamSample['source']; provider: string | null;
  }) | null;
  gnss: GnssStatusAndroid | null;
}
let generation = 0;
let snapshot: PositionDiagnostics = { active: false, fix: null, gnss: null, timing: emptyPositionTiming() };
const listeners = new Set<() => void>();
const emit = (next: PositionDiagnostics) => { snapshot = next; listeners.forEach(fn => { try { fn(); } catch { /* diagnostics cannot interrupt recording */ } }); };
export const getPositionDiagnostics = () => snapshot;
export const subscribePositionDiagnostics = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function beginPositionDiagnostics(): number {
  const id = ++generation;
  emit({ active: true, fix: null, gnss: null, timing: emptyPositionTiming() });
  return id;
}
export function recordPositionDiagnostics(id: number, sample: StreamSample): void {
  if (id !== generation || !snapshot.active) return;
  emit({ ...snapshot, timing: observePositionTiming(snapshot.timing, sample.t), fix: { ...normalizeFixQuality(sample), accuracy: validUncertainty(sample.accuracy),
    timestamp: sample.t ?? Date.now(), source: sample.source, provider: sample.provider ?? null },
    gnss: sample.source === 'native' ? snapshot.gnss : null });
}
export function recordGnssDiagnostics(id: number, status: GnssStatusAndroid): void {
  if (id !== generation || !snapshot.active || (snapshot.fix && snapshot.fix.source !== 'native')) return;
  if (!Number.isInteger(status.satelliteCount) || status.satelliteCount < 0
    || !Number.isInteger(status.usedInFixCount) || status.usedInFixCount < 0 || status.usedInFixCount > status.satelliteCount
    || !Number.isFinite(status.timestamp)) return;
  emit({ ...snapshot, gnss: { ...status, averageCn0DbHz: validUncertainty(status.averageCn0DbHz), maxCn0DbHz: validUncertainty(status.maxCn0DbHz) } });
}
export function endPositionDiagnostics(id: number): void {
  if (id === generation) emit({ ...snapshot, active: false });
}
/** Display freshness uses the existing fix age limit; no continuity decision. */
export function diagnosticAgeMs(timestamp: number | null | undefined, nowMs: number): number | null {
  return timestamp != null && Number.isFinite(timestamp) && timestamp <= nowMs ? nowMs - timestamp : null;
}
export function diagnosticIsFresh(timestamp: number | null | undefined, nowMs: number): boolean {
  const age = diagnosticAgeMs(timestamp, nowMs);
  return age != null && age <= DEFAULT_FUSION_CONFIG.maxFixAgeMs;
}
