import type { ShortLegDiagnostics } from './shortLegCornerDetection';

export const PIPELINE_LIMIT = 2048;
const fixReasons = ['start_lock_active', 'accuracy', 'gps_outlier', 'distance_gate'] as const;
const reasons = ['no_window_before', 'no_window_after', 'too_close_to_previous', 'no_turn', 'turn_below_noise', 'turn_not_concentrated', 'angle_unclear', 'low_evidence', 'unknown'] as const;
const numericFields = ['legBeforeM', 'legAfterM', 'sampleCountBefore', 'sampleCountAfter', 'headingDeltaDeg', 'interiorAngleDeg', 'accuracyM', 'confidence', 'spreadBeforeDeg', 'spreadAfterDeg', 'confidenceBeforeMotion', 'motionAdjustment', 'motionTurnEvidence'] as const;
const finite = (n: unknown): number | null => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e8 ? n : null;
export type Decision = Record<typeof numericFields[number], number | null> & {
  section: number; apexIndex: number; tMs: number | null; evaluatedMs: number | null;
  acceptedCandidate: boolean; motionSupported: boolean; reason: typeof reasons[number] | null;
};
export type FixObservation = { measurementMs: number | null; receivedMs: number | null; speedMps: number | null; accuracyM: number | null; outcome: 'warmup' | 'paused' | 'rejected' | 'accepted'; reason: string | null };
export interface PipelineDiagnostics {
  version: 1; timeBasis: 'wall_relative_to_recording_start'; decisionSemantics: 'latest_observed_per_section_apex_not_persisted_markers';
  limit: number; observedFixes: number; omittedFixes: number; evictedDecisionRows: number;
  fixes: FixObservation[]; decisions: Decision[];
}
/** Bounded, coordinate-free observations. Never used as tracking input. */
export class QaPipelineDiagnostics {
  private origin = 0;
  private fixes: FixObservation[] = [];
  private decisions = new Map<string, Decision>();
  private observedFixes = 0;
  private evicted = 0;
  reset(origin: number) { this.origin = origin; this.fixes = []; this.decisions.clear(); this.observedFixes = 0; this.evicted = 0; }
  fix(measured: number, received: number, speed: number | null, accuracy: number | null, outcome: FixObservation['outcome'], reason: string | null) {
    this.observedFixes++;
    if (this.fixes.length >= PIPELINE_LIMIT) this.fixes.shift();
    this.fixes.push({ measurementMs: finite(measured - this.origin), receivedMs: finite(received - this.origin), speedMps: finite(speed), accuracyM: finite(accuracy), outcome, reason: reason && (fixReasons as readonly string[]).includes(reason) ? reason : null });
  }
  observe(rows: readonly ShortLegDiagnostics[], accepted: ReadonlySet<number>, section: number, received: number) {
    for (const d of rows) {
      const key = `${section}:${d.apexIndex}`;
      if (!this.decisions.has(key) && this.decisions.size >= PIPELINE_LIMIT) { this.decisions.delete(this.decisions.keys().next().value!); this.evicted++; }
      const values = Object.fromEntries(numericFields.map(k => [k, finite(d[k])])) as Record<typeof numericFields[number], number | null>;
      this.decisions.set(key, { ...values, section, apexIndex: d.apexIndex, tMs: d.t == null ? null : finite(d.t - this.origin), evaluatedMs: finite(received - this.origin), acceptedCandidate: accepted.has(d.apexIndex), motionSupported: d.motionSupported, reason: d.rejectReason == null ? null : reasons.includes(d.rejectReason) ? d.rejectReason : 'unknown' });
    }
  }
  snapshot(): PipelineDiagnostics { return { version: 1, timeBasis: 'wall_relative_to_recording_start', decisionSemantics: 'latest_observed_per_section_apex_not_persisted_markers', limit: PIPELINE_LIMIT, observedFixes: this.observedFixes, omittedFixes: Math.max(0, this.observedFixes - this.fixes.length), evictedDecisionRows: this.evicted, fixes: this.fixes.map(r => ({ ...r })), decisions: [...this.decisions.values()].map(r => ({ ...r })) }; }
}

export function assertPipelineDiagnostics(v: PipelineDiagnostics) {
  const fail = () => { throw new Error('Invalid pipeline diagnostics'); };
  const keys = (o: object, expected: string[]) => { if (!o || Object.keys(o).length !== expected.length || Object.keys(o).some(k => !expected.includes(k))) fail(); };
  keys(v, ['version','timeBasis','decisionSemantics','limit','observedFixes','omittedFixes','evictedDecisionRows','fixes','decisions']);
  if (v.version !== 1 || v.timeBasis !== 'wall_relative_to_recording_start' || v.decisionSemantics !== 'latest_observed_per_section_apex_not_persisted_markers' || v.limit !== PIPELINE_LIMIT) fail();
  if (!Array.isArray(v.fixes) || !Array.isArray(v.decisions) || v.fixes.length > PIPELINE_LIMIT || v.decisions.length > PIPELINE_LIMIT) fail();
  for (const n of [v.observedFixes,v.omittedFixes,v.evictedDecisionRows]) if (!Number.isInteger(n) || n < 0 || finite(n) == null) fail();
  if (v.observedFixes !== v.fixes.length + v.omittedFixes) fail();
  for (const r of v.fixes) {
    keys(r,['measurementMs','receivedMs','speedMps','accuracyM','outcome','reason']);
    for (const n of [r.measurementMs,r.receivedMs,r.speedMps,r.accuracyM]) if (n !== null && finite(n) == null) fail();
    if (!['warmup','paused','rejected','accepted'].includes(r.outcome) || (r.reason !== null && !(fixReasons as readonly string[]).includes(r.reason))) fail();
  }
  for (const r of v.decisions) {
    keys(r,[...numericFields,'section','apexIndex','tMs','evaluatedMs','acceptedCandidate','motionSupported','reason']);
    for (const n of [...numericFields.map(k=>r[k]),r.tMs,r.evaluatedMs]) if (n !== null && finite(n) == null) fail();
    for (const n of [r.section,r.apexIndex]) if (!Number.isInteger(n) || n < 0 || finite(n) == null) fail();
    if (typeof r.acceptedCandidate !== 'boolean' || typeof r.motionSupported !== 'boolean' || (r.reason !== null && !reasons.includes(r.reason))) fail();
  }
}
