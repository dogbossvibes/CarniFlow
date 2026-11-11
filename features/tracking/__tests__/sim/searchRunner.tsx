// Fährten-Simulator (T-192) — reiner Testcode.
// Lässt den ECHTEN useSearchRecorder (unverändert) mit simulierten GPS- und
// Bewegungsdaten laufen und wertet danach mit computeTrackAnalyticsV3 aus —
// verdrahtet wie in app/track/run.tsx. Die Testdatei muss zuerst ./searchMocks importieren.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchObject, type SearchRecorder, type SearchResult } from '../../hooks/useSearchRecorder';
import type { AnalyticsAngleKind, AnalyticsCornerInput, AnalyticsObjectInput } from '../../engine/trackAnalytics';
import { computeTrackAnalyticsV3, type TrackAnalyticsV3 } from '../../engine/trackAnalyticsV3';
import { buildSearchEventArcs } from '../../utils/canonicalArc';
import type { SearchHandlerDistanceM } from '../../utils/searchGeometry';
import type { MotionWindowSample } from '../../utils/motionTurnEvidence';
import type { SimFix } from './gpsModel';
import { toLatLng, type LayRunResult } from './layRunner';
import { searchBridge, type BridgeFix, type BridgeMotion } from './searchBridge';

export interface SearchRunInput {
  /** Ergebnis des Legens — daraus entsteht die Referenz genau wie im Laufbildschirm. */
  lay: LayRunResult;
  fixes: readonly SimFix[];
  motion: readonly MotionWindowSample[];
  motionAvailable?: boolean;
  /** In der App gewählter Abstand Hundeführer ↔ Hund. */
  handlerDistanceM: SearchHandlerDistanceM;
}

export interface SearchRunResult {
  result: SearchResult;
  analytics: TrackAnalyticsV3 | null;
  startLocked: boolean;
  startLockedAfterS: number | null;
  progressM: number;
  trackLengthM: number;
  objectsLaid: number;
  fixComputeMaxMs: number;
}

function Harness(props: { onReady: (s: SearchRecorder) => void; laidPoints: { latitude: number; longitude: number }[]; laidObjects: SearchObject[]; angleArcM: number[]; handlerDistanceM: number }) {
  const s = useSearchRecorder({ laidPoints: props.laidPoints, laidObjects: props.laidObjects, level: 'training', handlerDistanceM: props.handlerDistanceM, angleArcM: props.angleArcM });
  props.onReady(s);
  return null;
}

export async function runSearch(input: SearchRunInput): Promise<SearchRunResult> {
  const { lay } = input;
  // ── Referenz wie buildSnap() in run.tsx: Linie mit Zeitstempeln, Marker auf die Linie projiziert.
  const laidPoints = lay.line.map(p => ({ ...toLatLng(p.x, p.y), t: p.tMs }));
  const laidAccuracies = lay.line.map(p => p.accuracy);
  const cornerMarkers = lay.corners.map((c, i) => ({ id: `winkel-${i}`, ...latLng(c.x, c.y), distance_from_start: c.atM, t: c.committedAtMs, angleKind: c.kind }));
  const objectMarkers = lay.objects.map((o, i) => ({ id: `gegenstand-${i}`, ...latLng(o.x, o.y), distance_from_start: o.atM, t: o.tMs, accuracy: o.accuracy }));
  const eventArcs = buildSearchEventArcs([...cornerMarkers, ...objectMarkers], laidPoints);
  const laidObjects: SearchObject[] = objectMarkers.map((m, i) => ({
    at: { latitude: m.lat, longitude: m.lng }, index: i, recoveryIndex: i, material: 'holz', id: m.id, atM: eventArcs[m.id]?.arcM ?? null,
  }));
  const angleArcM = cornerMarkers.flatMap(m => { const at = eventArcs[m.id]?.arcM; return at == null ? [] : [at]; });

  searchBridge.feedFix = null; searchBridge.feedMotion = null;
  searchBridge.motionAvailable = input.motionAvailable ?? true;
  let recorder!: SearchRecorder;
  let renderer: ReactTestRenderer | null = null;
  const out: SearchRunResult = { result: null as unknown as SearchResult, analytics: null, startLocked: false, startLockedAfterS: null,
    progressM: 0, trackLengthM: 0, objectsLaid: laidObjects.length, fixComputeMaxMs: 0 };

  type Event = { at: number; order: number; fix?: SimFix; motion?: MotionWindowSample };
  const events: Event[] = [
    ...input.motion.map((motion): Event => ({ at: motion.t, order: 0, motion })),
    ...input.fixes.map((fix): Event => ({ at: fix.receivedMs, order: 1, fix })),
  ].sort((a, b) => a.at - b.at || a.order - b.order);
  const startMs = events.length ? events[0].at - 1 : 0;
  let clock = startMs;

  const realNow = Date.now, realLog = console.log, realWarn = console.warn;
  Date.now = () => clock;
  console.log = () => {}; console.warn = () => {};
  try {
    act(() => {
      renderer = TestRenderer.create(<Harness laidPoints={laidPoints} laidObjects={laidObjects} angleArcM={angleArcM}
        handlerDistanceM={input.handlerDistanceM} onReady={s => { recorder = s; }} />);
    });
    await act(async () => { await Promise.resolve(); });
    act(() => { recorder.start(); });
    await act(async () => { await Promise.resolve(); });
    if (!fixSink()) throw new Error('Positionsquelle des Such-Recorders wurde nicht gestartet (searchMocks zuerst importieren).');

    for (const ev of events) {
      clock = ev.at;
      if (ev.motion) {
        const m = ev.motion;
        motionSink()?.({ timestamp: m.t, movementState: m.movementState, stepDelta: m.stepDelta,
          accelerationMagnitude: m.accelerationMagnitude, rotationMagnitude: m.rotationMagnitude, headingDelta: m.headingDelta,
          motionConfidence: 1, activityAgeMs: 0 });
        continue;
      }
      const fix = ev.fix!;
      const started = performance.now();
      act(() => { fixSink()!({ ...toBridge(fix), t: fix.tMs }); });
      out.fixComputeMaxMs = Math.max(out.fixComputeMaxMs, performance.now() - started);
      if (!out.startLocked && recorder.searchStartState === 'START_LOCKED') { out.startLocked = true; out.startLockedAfterS = (fix.tMs - startMs) / 1000; }
    }
    out.progressM = recorder.progressM; out.trackLengthM = recorder.trackLengthM;
    let result!: SearchResult;
    act(() => { result = recorder.stop(); });
    out.result = result;

    // ── Auswertung wie in run.tsx.
    const corners: AnalyticsCornerInput[] = cornerMarkers.flatMap(m => {
      const atM = eventArcs[m.id]?.arcM;
      return atM == null || m.angleKind === 'absatz' || m.angleKind === 'abriss' ? [] : [{ atM, angleKind: m.angleKind as AnalyticsAngleKind }];
    });
    const objects: AnalyticsObjectInput[] = objectMarkers.map((m, i) => ({
      objectId: m.id, objectIndex: i + 1, atM: eventArcs[m.id]?.arcM ?? m.distance_from_start, material: 'holz',
      found: result.foundObjectIndices.includes(i), positionAccuracyM: m.accuracy,
      legIndex: 1 + corners.filter(c => c.atM <= (eventArcs[m.id]?.arcM ?? m.distance_from_start)).length,
    }));
    out.analytics = result.analyticsSamples.length ? computeTrackAnalyticsV3({
      samples: result.analyticsSamples, corners, objects,
      breaks: result.breaks.map(b => ({ startedAtSec: b.startedAtSec, recoveredAtSec: b.recoveredAtSec ?? null, durationSec: b.durationSec ?? null })),
      trackLengthM: out.trackLengthM, durationS: result.durationS, handlerDistanceHintM: input.handlerDistanceM,
      referenceLine: laidPoints.map((p, i) => ({ latitude: p.latitude, longitude: p.longitude, accuracy: laidAccuracies[i] ?? null })),
    }) : null;
  } finally {
    act(() => { renderer?.unmount(); });
    Date.now = realNow; console.log = realLog; console.warn = realWarn;
  }
  return out;
}

const fixSink = (): ((fix: BridgeFix) => void) | null => searchBridge.feedFix;
const motionSink = (): ((sample: BridgeMotion) => void) | null => searchBridge.feedMotion;

function latLng(x: number, y: number): { lat: number; lng: number } {
  const p = toLatLng(x, y);
  return { lat: p.latitude, lng: p.longitude };
}
function toBridge(fix: SimFix) {
  return { ...latLng(fix.x, fix.y), accuracy: fix.accuracy, speed: fix.speedMps, course: null };
}
