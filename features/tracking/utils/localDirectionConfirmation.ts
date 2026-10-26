import {
  CORNER_GAP_M, STRAIGHT_TOL_DEG, SCALES_M, evaluateShortLegCorner, stableLegWindow,
  type ShortLegDiagnostics, type ShortLegPoint, type TurnEvidenceLookup,
} from './shortLegCornerDetection';
import { calculateDistance } from './gpsFilter';
import { motionTurnDirection } from './motionTurnEvidence';

// Additional acute-corner hypothesis. These are quality gates, not a calibrated
// probability of positional correctness. Never lower the regular detector gates.
const BASELINES_M = [1, 1.2] as const;
const CONFIRMATIONS = 3;
const CONFIRMATION_MS = 2000;
const NEW_SUPPORT_M = 2;
interface Pending {
  firstTime: number; firstDistance: number; firstSupportEnd: number; count: number;
}
export interface LocalDirectionState {
  pending: Map<string, Pending>;
  primarySeen: Map<number, number>;
  confirmed: Map<number, ShortLegDiagnostics>;
  lastPoint: ShortLegPoint | null;
  count: number;
}
export const createLocalDirectionState = (): LocalDirectionState => ({
  pending: new Map(), primarySeen: new Map(), confirmed: new Map(), lastPoint: null, count: 0,
});

/** Call once per append-only detector prefix. The owner must replace state at
 * every pause, recording gap and new session. Repeated evaluation of the same
 * prefix cannot count as fresh evidence. No future samples or synthetic points. */
export function confirmLocalDirections(
  state: LocalDirectionState, points: readonly ShortLegPoint[],
  diagnostics: readonly ShortLegDiagnostics[],
  primary: readonly { apexIndex: number; atM: number }[],
  evidenceAt?: TurnEvidenceLookup,
): ShortLegDiagnostics[] {
  const now = points.at(-1);
  if (!now || now.t == null || !Number.isFinite(now.t)) return [];
  if (state.lastPoint === now) return [...state.confirmed.values()];
  if (points.length <= state.count || (state.lastPoint?.t != null && now.t <= state.lastPoint.t)) {
    state.pending.clear();
    return [...state.confirmed.values()];
  }
  state.lastPoint = now; state.count = points.length;
  for (const c of primary) state.primarySeen.set(c.apexIndex, c.atM);
  const active = new Set<string>();
  for (const original of diagnostics) {
    if (original.rejectReason !== 'no_window_before' && original.rejectReason !== 'no_window_after') continue;
    const i = original.apexIndex, apex = points[i];
    if (!apex || state.confirmed.has(i)) continue;
    // Once the largest existing leg window is behind us, no new measured
    // support can enter it. Do not rescan old route geometry indefinitely.
    if (now.cumDist - apex.cumDist > SCALES_M[SCALES_M.length - 1]) continue;
    const occupied = [...state.primarySeen.values(), ...[...state.confirmed.keys()].map(index => points[index].cumDist)];
    if (occupied.some(atM => Math.abs(atM - apex.cumDist) < CORNER_GAP_M)) continue;
    // Both views must establish the acute corner from GPS alone. Motion can
    // veto a conflict, but cannot rescue absent or unreliable GPS geometry.
    const views = BASELINES_M.map(b => evaluateShortLegCorner(points, i, -Infinity, null, undefined, undefined, b));
    const kind = views[0].kind;
    if ((kind !== 'spitz_links' && kind !== 'spitz_rechts') || !views.every(v => v.accepted && v.kind === kind)) continue;
    const ev = evidenceAt?.(apex.t ?? null);
    const motionDirection = ev?.available ? motionTurnDirection(ev) : null;
    const direction = kind === 'spitz_links' ? 'links' : 'rechts';
    if (ev?.available && (ev.evidence ?? 0) >= 0.5 && motionDirection != null && motionDirection !== direction) continue;
    const windows = BASELINES_M.map(b => [false, true].map(forward => stableLegWindow(points, i, forward, STRAIGHT_TOL_DEG, b)));
    if (!windows.every(pair => pair.every(w => {
      if (!w) return false;
      const end = points[w.endIndex];
      return apex.accuracy != null && Number.isFinite(apex.accuracy) && apex.accuracy > 0
        && end.accuracy != null && Number.isFinite(end.accuracy) && end.accuracy > 0
        && calculateDistance(apex, end) > Math.hypot(apex.accuracy, end.accuracy);
    }))) continue;
    const endIndex = Math.min(...windows.map(pair => pair[1]!.endIndex));
    const key = `${i}:${kind}`;
    active.add(key);
    let pending = state.pending.get(key);
    if (!pending) {
      pending = { firstTime: now.t, firstDistance: now.cumDist, firstSupportEnd: endIndex, count: 0 };
      state.pending.set(key, pending);
    }
    pending.count++;
    if (endIndex >= pending.firstSupportEnd + 2
      && calculateDistance(points[endIndex], points[pending.firstSupportEnd]) >= NEW_SUPPORT_M
      && pending.count >= CONFIRMATIONS && now.t - pending.firstTime >= CONFIRMATION_MS
      && now.cumDist - pending.firstDistance >= NEW_SUPPORT_M) {
      state.confirmed.set(i, { ...views[0].diagnostics });
      state.pending.delete(key);
    }
  }
  for (const key of state.pending.keys()) if (!active.has(key)) state.pending.delete(key);
  return [...state.confirmed.values()];
}
