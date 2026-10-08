import type { AnalyticsSegment } from '@/features/tracking/engine/trackSegmentAnalysis';
import { RELIABLE_CONFIDENCE_FLOOR } from '@/features/tracking/engine/trackAnalytics';
import { record } from './trackUserExport';

export interface PaceReference { medianMps: number; sessionCount: number; source: 'dog_history' | 'current_search' }
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const median = (values: number[]) => { const a = [...values].sort((a,b) => a-b); const i = Math.floor(a.length / 2); return a.length % 2 ? a[i] : (a[i-1]+a[i])/2; };
export function currentPaceReference(segments: AnalyticsSegment[]): PaceReference | null {
  const usable = segments.filter(s => s != null && s.type === 'straight' && Number.isFinite(s.analysisConfidence) && s.analysisConfidence <= 1 && s.analysisConfidence >= RELIABLE_CONFIDENCE_FLOOR && positive(s.averageSpeedMps));
  if (usable.length < 3) return null;
  return { medianMps: median(usable.map(s => s.averageSpeedMps!)), sessionCount: 1, source: 'current_search' };
}
/** Session-balanced comparison; no other dogs, current run, future runs or different handler-distance settings. */
export function dogPaceReference(current: unknown, history: unknown[]): PaceReference | null {
  const d = record(current), run = record(record(d.track_data).run);
  const date = Date.parse(String(run.started_at ?? d.started_at ?? d.created_at ?? d.session_date ?? ''));
  if (typeof d.dog_id !== 'string' || !Number.isFinite(date) || ![1, 5, 10].includes(run.search_handler_distance_m as number)) return null;
  const values: number[] = [], seen = new Set<string>();
  const rows = history.map(record).sort((a,b) => String(b.session_date ?? '').localeCompare(String(a.session_date ?? '')));
  for (const row of rows) {
    if (row.id === d.id || typeof row.id !== 'string' || seen.has(row.id) || row.dog_id !== d.dog_id) continue;
    seen.add(row.id);
    const r = record(record(row.track_data).run), a = record(r.analytics);
    const prior = Date.parse(String(r.started_at ?? row.started_at ?? row.created_at ?? row.session_date ?? ''));
    if (!Number.isFinite(prior) || prior >= date || !r.ended_at || r.search_handler_distance_m !== run.search_handler_distance_m) continue;
    if (typeof a.analysisConfidence !== 'number' || !Number.isFinite(a.analysisConfidence) || a.analysisConfidence > 1 || a.analysisConfidence < RELIABLE_CONFIDENCE_FLOOR) continue;
    const baseline = currentPaceReference(Array.isArray(a.segments) ? a.segments.filter(s => s != null && typeof s === 'object') : []);
    if (!baseline) continue;
    values.push(baseline.medianMps);
    if (values.length === 20) break;
  }
  return values.length >= 3 ? { medianMps: median(values), sessionCount: values.length, source: 'dog_history' } : null;
}
/** Descriptive only: +/-25% around the reference is a display band, never a training score. */
export function relativePaceBand(speed: number, reference: PaceReference): 'slow' | 'normal' | 'fast' {
  return speed < reference.medianMps * .75 ? 'slow' : speed > reference.medianMps * 1.25 ? 'fast' : 'normal';
}
