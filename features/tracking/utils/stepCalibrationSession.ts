import { calculateDistance } from './gpsFilter';
import { calibrateStepLength, isAcceptableCalibration } from './stepCalibration';

export type CalibrationFix = { lat: number; lng: number; accuracy: number | null; t: number };
export type CalibrationPhase = 'warming' | 'ready' | 'measuring' | 'finishing' | 'result' | 'error';
export type CalibrationIssue = 'signal' | 'interrupted' | 'implausible' | 'uncertain' | 'course';
export type CalibrationState = {
  phase: CalibrationPhase; distanceM: number; accuracy: number | null;
  stepLengthM: number | null; issue: CalibrationIssue | null;
};
// Conservative application gates, not a statistical confidence interval or accuracy guarantee.
const MAX_ACCURACY_M = 5;
const MAX_FIX_AGE_MS = 3000;
const MAX_GAP_MS = 10000;
const ACQUISITION_TIMEOUT_MS = 30000;
const MAX_MEASUREMENT_MS = 300000;
const MIN_WALK_MS = 15000;
const MAX_RELATIVE_ENDPOINT_UNCERTAINTY = 0.20;

export function usableCalibrationFix(f: CalibrationFix, now: number): boolean {
  return Number.isFinite(f.lat) && Math.abs(f.lat) <= 90 && Number.isFinite(f.lng) && Math.abs(f.lng) <= 180
    && f.accuracy != null && Number.isFinite(f.accuracy) && f.accuracy >= 0 && f.accuracy <= MAX_ACCURACY_M
    && Number.isFinite(f.t) && f.t <= now + 1000 && f.t >= now - MAX_FIX_AGE_MS;
}

function anchor(points: CalibrationFix[]): CalibrationFix | null {
  if (points.length < 3 || points[points.length - 1].t - points[0].t < 2000) return null;
  if (points.some(p => calculateDistance(p, points[0]) > 3)) return null;
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return {
    lat: median(points.map(p => p.lat)), lng: median(points.map(p => p.lng)),
    // Never divide reported accuracy by sqrt(n): adjacent GNSS fixes are correlated.
    accuracy: Math.max(1, ...points.map(p => p.accuracy!)), t: points[points.length - 1].t,
  };
}

/** Runtime-only measurement; no recorder, raw track, account, storage or fusion writes. */
export class StepCalibrationSession {
  state: CalibrationState = { phase: 'warming', distanceM: 0, accuracy: null, stepLengthM: null, issue: null };
  private window: CalibrationFix[] = [];
  private start: CalibrationFix | null = null;
  private last: CalibrationFix | null = null;
  private path: CalibrationFix[] = [];
  private startedAt = 0;
  private phaseAt: number;
  private lastClock: number;
  constructor(now: number) { this.phaseAt = now; this.lastClock = now; }

  fail(issue: CalibrationIssue) {
    this.state = { ...this.state, phase: 'error', stepLengthM: null, issue };
  }
  tick(now: number) {
    if (now < this.lastClock - 1000) { this.fail('interrupted'); return; }
    this.lastClock = now;
    if (['warming', 'ready', 'finishing'].includes(this.state.phase) && now - this.phaseAt > ACQUISITION_TIMEOUT_MS) this.fail('signal');
    if (this.state.phase === 'ready' && (!this.last || now - this.last.t > MAX_FIX_AGE_MS)) {
      this.window = []; this.state = { ...this.state, phase: 'warming' };
    }
    if ((this.state.phase === 'measuring' || this.state.phase === 'finishing') && (!this.last || now - this.last.t > MAX_GAP_MS || now - this.startedAt > MAX_MEASUREMENT_MS)) this.fail('interrupted');
  }
  begin(now: number): boolean {
    this.tick(now);
    if (this.state.phase !== 'ready') return false;
    const fixed = anchor(this.window);
    if (!fixed || now - fixed.t > MAX_FIX_AGE_MS) return false;
    this.start = fixed; this.startedAt = now; this.path = [fixed];
    this.state = { ...this.state, phase: 'measuring', distanceM: 0 };
    return true;
  }
  finish(now: number) {
    this.tick(now);
    if (this.state.phase !== 'measuring') return;
    if (now - this.startedAt < MIN_WALK_MS) { this.fail('implausible'); return; }
    this.phaseAt = now; this.window = [];
    this.state = { ...this.state, phase: 'finishing' };
  }
  add(fix: CalibrationFix, now: number) {
    this.tick(now);
    if (this.state.phase === 'error' || this.state.phase === 'result') return;
    if (!usableCalibrationFix(fix, now) || (this.last && fix.t <= this.last.t)) return;
    if (this.last && fix.t - this.last.t < 200) return;
    if (this.state.phase === 'measuring' && this.last && calculateDistance(this.last, fix) > 4 * ((fix.t - this.last.t) / 1000) + 2 * MAX_ACCURACY_M) {
      this.fail('signal'); return;
    }
    this.last = fix;
    this.state = { ...this.state, accuracy: fix.accuracy };
    if (this.state.phase === 'measuring') {
      this.path.push(fix);
      this.state = { ...this.state, distanceM: calculateDistance(this.start!, fix) };
      return;
    }
    if (this.state.phase === 'finishing' && fix.t < this.phaseAt) return;
    this.window.push(fix);
    this.window = this.window.filter(p => fix.t - p.t <= 5000).slice(-5);
    const end = anchor(this.window);
    if (!end) { if (this.state.phase === 'ready') this.state = { ...this.state, phase: 'warming' }; return; }
    if (this.state.phase !== 'finishing') { this.state = { ...this.state, phase: 'ready' }; return; }
    const distanceM = calculateDistance(this.start!, end);
    const uncertainty = this.start!.accuracy! + end.accuracy!;
    let issue: CalibrationIssue | null = null;
    if (!isAcceptableCalibration(distanceM)) issue = 'implausible';
    else if (uncertainty / distanceM > MAX_RELATIVE_ENDPOINT_UNCERTAINTY) issue = 'uncertain';
    else if (!this.isStraight(end)) issue = 'course';
    this.state = { ...this.state, phase: 'result', distanceM, issue, stepLengthM: issue ? null : calibrateStepLength(distanceM) };
  }
  private isStraight(end: CalibrationFix): boolean {
    const start = this.start!;
    // Local tangent plane is used only for detecting a visibly curved calibration walk.
    const scale = Math.cos(start.lat * Math.PI / 180);
    const dx = (end.lng - start.lng) * scale, dy = end.lat - start.lat;
    const norm = dx * dx + dy * dy;
    if (norm === 0) return false;
    return this.path.every(p => {
      const projection = Math.max(0, Math.min(1, ((p.lng - start.lng) * scale * dx + (p.lat - start.lat) * dy) / norm));
      const projected = { lat: start.lat + projection * dy, lng: start.lng + projection * (end.lng - start.lng) };
      return calculateDistance(p, projected) <= Math.max(5, 2 * (p.accuracy ?? MAX_ACCURACY_M));
    });
  }
}
