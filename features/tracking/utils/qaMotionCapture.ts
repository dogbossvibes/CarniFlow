import { diagnosticsAccessToken } from '@/lib/diagnosticsAccessState';
import { MotionEvidenceBuffer, TURN_EVIDENCE_DEFAULTS, motionTurnDirection, type MotionWindowSample } from './motionTurnEvidence';
import type { ShortLegDiagnostics } from './shortLegCornerDetection';
import { QA_MOTION_CONTEXT_MS, type QaCandidateMotion, type QaMotionSample, type QaSessionCapture, type QaMotionTimeline } from './qaSessionCapture';

export const QA_MOTION_CANDIDATE_LIMIT = 128;
export const QA_MOTION_SAMPLE_LIMIT = 32;
export const QA_MOTION_TIMELINE_LIMIT = 4096;
const relative = (value: number) => Number.isFinite(value) && Math.abs(value) < 1e8 ? Math.round(value) : null;
const CONTEXT_MS = TURN_EVIDENCE_DEFAULTS.halfWindowSec * 1000 + QA_MOTION_CONTEXT_MS;
const round = (value: number, precision = 100) => Math.round(value * precision) / precision;
type Candidate = Pick<ShortLegDiagnostics, 'apexIndex' | 't' | 'headingDeltaDeg' | 'rejectReason' | 'motionAdjustment'>;
type Snapshot = Pick<QaSessionCapture, 'candidateMotionEvidence' | 'motionCaptureDiagnostics' | 'motionTimeline'>;

/** Personal QA only. Reads the existing ring; never feeds evidence back into detection. */
export class QaMotionCapture {
  private timeline: QaMotionTimeline['samples'] = [];
  private observedSamples = 0;
  private rows = new Map<number, QaCandidateMotion>();
  private access: string | null = null;
  private origin: number | null = null;
  private evaluated = 0;
  private omitted = 0;
  private sectionOffset = 0;
  private completedEvaluated = 0;
  private sectionEvaluated = 0;

  clear(): void {
    this.timeline = []; this.observedSamples = 0;
    this.rows.clear();
    this.access = null;
    this.origin = null;
    this.evaluated = this.omitted = 0;
    this.sectionOffset = this.completedEvaluated = this.sectionEvaluated = 0;
  }

  recordSample(sample: MotionWindowSample, origin: number | null, received = Date.now()): void {
    const access = diagnosticsAccessToken();
    if (!access || origin == null || !Number.isFinite(origin)) { this.clear(); return; }
    if (access !== this.access || origin !== this.origin) this.clear();
    this.access = access; this.origin = origin;
    const tMs = relative(sample.t - origin), receivedMs = relative(received - origin);
    this.observedSamples++;
    const values = [sample.headingDelta, sample.rotationMagnitude, sample.accelerationMagnitude, sample.stepDelta, sample.cadence];
    if (tMs == null || receivedMs == null || values.some(v => v != null && (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) >= 1e8))) return;
    if (this.timeline.length >= QA_MOTION_TIMELINE_LIMIT) this.timeline.shift();
    this.timeline.push({ tMs, receivedMs, headingDelta: sample.headingDelta,
      rotationMagnitude: sample.rotationMagnitude, accelerationMagnitude: sample.accelerationMagnitude,
      stepDelta: sample.stepDelta, cadence: sample.cadence, movementState: sample.movementState,
    });
  }

  observe(diagnostics: readonly Candidate[], buffer: MotionEvidenceBuffer, origin: number | null, accepted: ReadonlySet<number>, indexOffset = 0): void {
    const access = diagnosticsAccessToken();
    if (!access || origin == null || !Number.isFinite(origin)) { this.clear(); return; }
    if (access !== this.access || origin !== this.origin) this.clear();
    this.access = access;
    this.origin = origin;
    if (!Number.isInteger(indexOffset) || indexOffset < 0) { this.clear(); return; }
    if (indexOffset < this.sectionOffset) { this.clear(); this.access = access; this.origin = origin; }
    if (indexOffset > this.sectionOffset) {
      this.completedEvaluated += this.sectionEvaluated;
      this.sectionOffset = indexOffset;
    }
    // The detector supplies its complete diagnostic list each time. Limit before
    // Motion lookups and keep no unbounded auxiliary set of discarded candidates.
    const valid = diagnostics.filter(d => Number.isInteger(d.apexIndex) && d.apexIndex >= 0
      && d.t != null && Number.isFinite(d.t) && Math.abs(d.t - origin) < 1e12)
      .map(d => ({ ...d, apexIndex: d.apexIndex + indexOffset }));
    const acceptedGlobal = new Set([...accepted].map(index => index + indexOffset));
    this.sectionEvaluated = valid.length;
    this.evaluated = this.completedEvaluated + valid.length;
    const retained = valid.slice(-QA_MOTION_CANDIDATE_LIMIT);

    const indices = new Set(retained.map(d => d.apexIndex));
    for (const index of this.rows.keys()) if (index >= indexOffset && !indices.has(index)) this.rows.delete(index);
    const observedMs = relative(Date.now() - origin);
    for (const d of retained) {
      const t = d.t!;
      const previous = this.rows.get(d.apexIndex);
      const ev = buffer.evidenceForTrailing(t);
      const context = buffer.samplesIn(t - CONTEXT_MS, t + CONTEXT_MS);
      // Allowlist sensor fields: no raw timestamp, position, account or device ID.
      const current: QaMotionSample[] = context.map(s => ({
        dtMs: Math.round(s.t - t), headingDelta: round(s.headingDelta),
        rotationMagnitude: round(s.rotationMagnitude, 1000),
        accelerationMagnitude: round(s.accelerationMagnitude, 1000),
        stepDelta: s.stepDelta, cadence: s.cadence, movementState: s.movementState,
      }));
      const union = new Map((previous?.samples ?? []).map(s => [s.dtMs, s]));
      for (const sample of current) union.set(sample.dtMs, sample);
      const observed = [...union.values()].sort((a, b) => a.dtMs - b.dtMs);
      const truncated = observed.length > QA_MOTION_SAMPLE_LIMIT;
      // Preserve both context boundaries. A thinned context is explicitly NOT a
      // complete raw stream and must not be used to reconstruct missing samples.
      const samples = truncated
        ? Array.from({ length: QA_MOTION_SAMPLE_LIMIT }, (_, i) => observed[Math.round(i * (observed.length - 1) / (QA_MOTION_SAMPLE_LIMIT - 1))])
        : observed;
      const strongest: QaCandidateMotion = previous && (previous.turnEvidence ?? 0) >= (ev.evidence ?? 0) && previous.motionAvailable
        ? previous : {
          strongestObservedMs: observedMs,
          apexIndex: d.apexIndex, evaluatedAtMs: Math.round(t - origin),
          windowStartMs: Math.round(ev.windowStartMs - t), windowEndMs: Math.round(ev.windowEndMs - t),
          sampleCount: ev.sampleCount, firstSampleAgeMs: null, lastSampleAgeMs: null,
          motionAvailable: ev.available, netYawDeg: round(ev.netYawDeg),
          signedNetYawDeg: round(ev.signedNetYawDeg), direction: motionTurnDirection(ev),
          grossYawDeg: round(ev.grossYawDeg), monotonicity: round(ev.monotonicity, 1000),
          yawShare: round(ev.yawShare, 1000), accelerationEvidence: round(ev.gaitAccelFraction, 1000),
          stepDelta: ev.steps, cadence: ev.cadence, movementState: ev.movementState,
          locomotionEvidence: ev.locomotionSource, turnEvidence: ev.evidence,
          adjustmentApplied: d.motionAdjustment ?? 0, samples: [], source: 'live',
        };
      this.rows.set(d.apexIndex, {
        ...strongest, samples, firstObservedMs: previous?.firstObservedMs ?? observedMs, lastObservedMs: observedMs,
        firstSampleAgeMs: samples[0]?.dtMs ?? null,
        lastSampleAgeMs: samples[samples.length - 1]?.dtMs ?? null,
        contextSamplesTruncated: truncated || previous?.contextSamplesTruncated === true,
        geometryAtLastEvaluation: {
          rejectReason: d.rejectReason, headingMeasured: d.headingDeltaDeg != null,
          accepted: acceptedGlobal.has(d.apexIndex),
        },
      });
    }
    // Retain prior-section evidence with globally unique indices, still bounded.
    const ordered = [...this.rows.keys()].sort((a, b) => a - b);
    for (const index of ordered.slice(0, Math.max(0, ordered.length - QA_MOTION_CANDIDATE_LIMIT))) this.rows.delete(index);
    this.omitted = Math.max(0, this.evaluated - this.rows.size);
  }

  snapshot(): Snapshot {
    if (!this.access || this.access !== diagnosticsAccessToken()) { this.clear(); return {}; }
    const rows = [...this.rows.values()].map(row => ({ ...row,
      geometryAtLastEvaluation: row.geometryAtLastEvaluation && { ...row.geometryAtLastEvaluation },
      samples: row.samples.map(sample => ({ ...sample })),
    }));
    return {
      motionTimeline: { version: 1, limit: QA_MOTION_TIMELINE_LIMIT, observed: this.observedSamples, omitted: this.observedSamples - this.timeline.length, timeBasis: 'relative_to_first_recorded_fix', samples: this.timeline.map(s => ({ ...s })) },
      candidateMotionEvidence: rows,
      motionCaptureDiagnostics: {
        candidateLimit: QA_MOTION_CANDIDATE_LIMIT, samplesPerCandidateLimit: QA_MOTION_SAMPLE_LIMIT,
        contextHalfWindowMs: CONTEXT_MS, candidateRetention: 'latest_apex_indices',
        sampleRetention: 'bounded_observed_context', evaluatedCandidateCount: this.evaluated,
        omittedCandidateCount: this.omitted,
        truncated: this.omitted > 0 || rows.some(row => row.contextSamplesTruncated),
      },
    };
  }
}
