// Fährten-Simulator (T-192/T-205) — reiner Testcode.
// Lässt den ECHTEN useSearchRecorder (unverändert) mit simulierten GPS- und
// Bewegungsdaten laufen und wertet danach mit computeTrackAnalyticsV3 aus —
// verdrahtet wie in app/track/run.tsx. Seit T-205 laufen auch die echte
// Sprachführung (useTrackVoiceGuidance + Warteschlange), die echte Ende-Erkennung
// (useTrackEndGuidance) und die Ansagen «Suche gestartet», «Gegenstand erkannt» und
// Off-Track mit; Pausen, manuelles Antippen und ein App-Abbruch mit Wiederaufnahme
// über den echten Speicherweg (Store-Snapshot in AsyncStorage + SQLite-Suchpunkte)
// lassen sich einspielen. Die Uhr ist Jests künstliche Zeit: Timer laufen in Simulationszeit.
// Die Testdatei muss zuerst ./searchMocks importieren.
import React, { useEffect, useMemo, useRef } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/i18n/config';
import { useSearchRecorder, type SearchObject, type SearchRecorder, type SearchResult } from '../../hooks/useSearchRecorder';
import { say, speechLanguage, useTrackVoiceGuidance, type GuidanceAngle } from '../../hooks/useTrackVoiceGuidance';
import { useTrackEndGuidance } from '../../hooks/useTrackEndGuidance';
import type { GuidanceObject } from '../../hooks/useTrackHapticGuidance';
import type { AnalyticsAngleKind, AnalyticsCornerInput, AnalyticsObjectInput } from '../../engine/trackAnalytics';
import { computeTrackAnalyticsV3, type TrackAnalyticsV3 } from '../../engine/trackAnalyticsV3';
import { useTrackingStore, type TrackPointSample } from '../../store/trackingStore';
import { loadPending } from '../../store/trackPersist';
import { dedupeSearchPoints } from '../../store/searchRecovery';
import { _peekSearchBuffer, discardSearchBuffer, flushSearchPoints } from '../../store/searchPersist';
import type { SearchRunState } from '../../store/searchRunState';
import { buildSearchEventArcs } from '../../utils/canonicalArc';
import { haversineM, type SearchHandlerDistanceM } from '../../utils/searchGeometry';
import { offTrackTransitionFeedback } from '../../utils/offTrackFeedback';
import { requestVoice, resetVoiceEvents, voiceDiagnostics } from '../../utils/voiceEvents';
import type { MotionWindowSample } from '../../utils/motionTurnEvidence';
import type { VoiceDiagnostic } from '../../utils/trackingUxDiagnostics';
import type { OffTrackState } from '../../utils/offTrack';
import type { SimFix } from './gpsModel';
import { toLatLng, type LayRunResult } from './layRunner';
import { searchBridge, type BridgeFix, type BridgeMotion, type SpokenEntry } from './searchBridge';

/** Bedienhandlung während der Absuche (Simulationszeit in ms). */
export interface SearchAction { atMs: number; kind: 'markObject' | 'pause' | 'unpause' | 'kill' | 'restart' | 'interruptSpeech' }

export interface SearchRunInput {
  /** Ergebnis des Legens — daraus entsteht die Referenz genau wie im Laufbildschirm. */
  lay: LayRunResult;
  fixes: readonly SimFix[];
  motion: readonly MotionWindowSample[];
  motionAvailable?: boolean;
  /** In der App gewählter Abstand Hundeführer ↔ Hund. */
  handlerDistanceM: SearchHandlerDistanceM;
  actions?: readonly SearchAction[];
  /** Beginn der Absuche (ms) für relative Zeiten; Standard = erstes Ereignis. */
  startMs?: number;
}

/** Zustand nach jeder GPS-Messung (für Pfote, Fortschritt und «falscher Schenkel»). */
export interface TraceSample {
  tMs: number; appDogM: number; appHandlerM: number; trackLengthM: number;
  locked: boolean; activeObjectWait: boolean; paused: boolean;
  handler: { latitude: number; longitude: number } | null;
}
export interface AnnouncedEntry { tMs: number; featureId: string; appDogM: number }
export interface KillRecord {
  atMs: number; restartMs: number | null;
  /** Akzeptierte Suchpunkte im Speicher beim Abbruch / nach der Wiederaufnahme wiederhergestellt. */
  pointsBefore: number; pointsRestored: number;
  foundBefore: string[]; foundRestored: string[];
  voiceFiredBefore: string[]; voiceFiredRestored: string[];
  pendingFound: boolean;
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
  startMs: number;
  trace: TraceSample[];
  spoken: SpokenEntry[];
  announced: AnnouncedEntry[];
  voiceDiagnostics: VoiceDiagnostic[];
  endFiredAtMs: number[];
  kills: KillRecord[];
  /** Geometrie der Ereignisse auf der gelegten Linie (für die Auswertung). */
  featureArcs: Record<string, number>;
}

// Leerer Store-Zustand (Aktionen inklusive) — ein App-Abbruch verliert alles im Speicher.
const PRISTINE_STORE = useTrackingStore.getState();

interface HarnessCallbacks {
  onReady: (s: SearchRecorder) => void;
  onAnnounced: (id: string) => void;
  onEndFired: () => void;
}
interface HarnessProps {
  laidPoints: { latitude: number; longitude: number }[]; laidObjects: SearchObject[]; angleArcM: number[];
  handlerDistanceM: SearchHandlerDistanceM;
  guidanceAngles: GuidanceAngle[]; guidanceObjects: GuidanceObject[];
  seed: SearchRunState | null;
  cb: { current: HarnessCallbacks };
}

/** Recorder + Sprach- und Ende-Führung, verdrahtet wie app/track/run.tsx (Ansage eingeschaltet). */
function Harness(p: HarnessProps) {
  const s = useSearchRecorder({ laidPoints: p.laidPoints, laidObjects: p.laidObjects, level: 'training', handlerDistanceM: p.handlerDistanceM, angleArcM: p.angleArcM });
  p.cb.current.onReady(s);
  const searchGuidanceActive = s.recording && s.searchStartState === 'START_LOCKED';
  const seed = p.seed;
  const cb = p.cb;

  const autoDwellKey = s.autoDwellObjectIds.join('|');
  useEffect(() => {
    if (!s.recording) return;
    autoDwellKey.split('|').filter(Boolean).forEach(id => requestVoice({ eventType: 'object',
      text: i18n.t('track.voiceObjectDetected') as string, language: speechLanguage(i18n.language as never),
      priority: 6, onceKey: `auto_dwell:${id}`, phase: 'search' }));
  }, [s.recording, autoDwellKey]);

  const voiceRecovery = useMemo(() => ({
    initialAnnouncedIds: seed?.voiceFiredIds,
    onAnnounced: (id: string) => { useTrackingStore.getState().noteSearchVoiceFired(id); cb.current.onAnnounced(id); },
    enabled: searchGuidanceActive,
  }), [seed, searchGuidanceActive, cb]);
  useTrackVoiceGuidance(s.dogProgressM, p.guidanceAngles, true, undefined, p.guidanceObjects, voiceRecovery,
    { handlerPosition: s.position, configuredDogLeadM: p.handlerDistanceM, activeObjectWait: s.activeObjectWait });

  const endPoint = p.laidPoints.length ? p.laidPoints[p.laidPoints.length - 1] : null;
  const finalIndex = p.laidObjects.length - 1;
  const finalObject = finalIndex >= 0 ? p.laidObjects[finalIndex] : null;
  const finalObjectPendingNearEnd = !!(finalObject && endPoint && s.objectStatuses[finalIndex] === 'pending' && haversineM(finalObject.at, endPoint) <= 3);
  const handlerToEnd = s.endHandlerFix && endPoint ? haversineM(s.endHandlerFix.position, endPoint) : null;
  const lastSegmentReached = s.trackLengthM > 0 && s.progressM / s.trackLengthM >= 0.75 && handlerToEnd != null && handlerToEnd <= 5;
  const confirmEnd = s.confirmEnd;
  const onEndFired = useMemo(() => () => {
    useTrackingStore.getState().noteSearchEndFired();
    confirmEnd();
    cb.current.onEndFired();
  }, [cb, confirmEnd]);
  useTrackEndGuidance({
    recording: searchGuidanceActive, paused: s.paused, continuityEpoch: s.continuityEpoch, sessionId: null, runId: 'sim-run',
    dogProgressM: s.dogProgressM, handlerProgressM: s.progressM, handlerPosition: s.position, endHandlerFix: s.endHandlerFix,
    lastSegmentReached, trackLengthM: s.trackLengthM, estimatedDogPosition: s.estimatedDogPosition, endPoint,
    openMandatoryObjects: Math.max(0, s.totalObjects - s.foundObjects), activeObjectWait: s.activeObjectWait,
    finalObjectPendingNearEnd, voiceOn: true, initialFired: seed?.endFired ?? false, onFired: onEndFired,
  });

  // Off-Track-Ansage nur auf echten Übergängen (wie run.tsx).
  const prevOffTrack = useRef<OffTrackState>(seed?.offTrackState ?? 'on_track');
  useEffect(() => {
    if (!searchGuidanceActive) return;
    const fb = offTrackTransitionFeedback(prevOffTrack.current, s.offTrackState);
    prevOffTrack.current = s.offTrackState;
    if (fb) say(i18n.t(fb.voiceKey) as string);
  }, [s.offTrackState, searchGuidanceActive]);
  return null;
}

async function flushMicrotasks(n = 6): Promise<void> {
  await act(async () => { for (let i = 0; i < n; i++) await Promise.resolve(); });
}

async function snapshotPersisted(): Promise<{ storage: [string, string | null][]; sqlite: number }> {
  const keys = await AsyncStorage.getAllKeys();
  const storage = (await AsyncStorage.multiGet(keys)) as [string, string | null][];
  return { storage: storage.map(([k, v]) => [k, v]), sqlite: searchBridge.sqlite.length };
}
async function restorePersisted(snap: { storage: [string, string | null][]; sqlite: number }): Promise<void> {
  await AsyncStorage.clear();
  const pairs = snap.storage.filter((e): e is [string, string] => e[1] != null);
  if (pairs.length) await AsyncStorage.multiSet(pairs);
  searchBridge.sqlite.length = Math.min(searchBridge.sqlite.length, snap.sqlite);
}

export async function runSearch(input: SearchRunInput): Promise<SearchRunResult> {
  const { lay } = input;
  // ── Referenz wie buildSnap() in run.tsx: Linie mit Zeitstempeln, Marker auf die Linie projiziert.
  const laidPoints = lay.line.map(p => ({ ...toLatLng(p.x, p.y), t: p.tMs }));
  const laidAccuracies = lay.line.map(p => p.accuracy);
  const cornerMarkers = lay.corners.map((c, i) => ({ id: `winkel-${i}`, ...latLng(c.x, c.y), distance_from_start: c.atM, t: c.committedAtMs, angleKind: c.kind }));
  const objectMarkers = lay.objects.map((o, i) => ({ id: `gegenstand-${i}`, ...latLng(o.x, o.y), distance_from_start: o.atM, t: o.tMs, accuracy: o.accuracy }));
  const eventArcs = buildSearchEventArcs([...cornerMarkers, ...objectMarkers], laidPoints);
  // accuracyM wie in run.tsx (T-196); auf älteren Ständen ignoriert der Recorder das Feld.
  const laidObjects: SearchObject[] = objectMarkers.map((m, i) => {
    const object: SearchObject = { at: { latitude: m.lat, longitude: m.lng }, index: i, recoveryIndex: i, material: 'holz', id: m.id, atM: eventArcs[m.id]?.arcM ?? null };
    return Object.assign(object, { accuracyM: m.accuracy });
  });
  const angleArcM = cornerMarkers.flatMap(m => { const at = eventArcs[m.id]?.arcM; return at == null ? [] : [at]; });
  // Führungslisten wie run.tsx (kanonische arcM; Marker ohne bestimmbare Lage bleiben aussen vor).
  const guidanceAngles: GuidanceAngle[] = cornerMarkers.flatMap(m => { const arcM = eventArcs[m.id]?.arcM; return arcM == null ? [] : [{ id: m.id, arcM, angleKind: m.angleKind, lat: m.lat, lng: m.lng }]; });
  const guidanceObjects: GuidanceObject[] = objectMarkers.flatMap(m => { const arcM = eventArcs[m.id]?.arcM; return arcM == null ? [] : [{ id: m.id, arcM, material: 'holz', lat: m.lat, lng: m.lng }]; });
  const featureArcs: Record<string, number> = {};
  for (const m of [...cornerMarkers, ...objectMarkers]) { const a = eventArcs[m.id]?.arcM; if (a != null) featureArcs[m.id] = a; }

  type Event = { at: number; order: number; fix?: SimFix; motion?: MotionWindowSample; action?: SearchAction };
  const events: Event[] = [
    ...input.motion.map((motion): Event => ({ at: motion.t, order: 1, motion })),
    ...input.fixes.map((fix): Event => ({ at: fix.receivedMs, order: 2, fix })),
    ...(input.actions ?? []).map((action): Event => ({ at: action.atMs, order: 0, action })),
  ].sort((a, b) => a.at - b.at || a.order - b.order);
  const startMs = input.startMs ?? (events.length ? events[0].at - 1 : 0);

  const out: SearchRunResult = { result: null as unknown as SearchResult, analytics: null, startLocked: false, startLockedAfterS: null,
    progressM: 0, trackLengthM: 0, objectsLaid: laidObjects.length, fixComputeMaxMs: 0, startMs,
    trace: [], spoken: [], announced: [], voiceDiagnostics: [], endFiredAtMs: [], kills: [], featureArcs };

  let recorder!: SearchRecorder;
  let renderer: ReactTestRenderer | null = null;
  const cb = { current: {
    onReady: (s: SearchRecorder) => { recorder = s; },
    onAnnounced: (id: string) => out.announced.push({ tMs: Date.now(), featureId: id, appDogM: recorder?.dogProgressM ?? 0 }),
    onEndFired: () => out.endFiredAtMs.push(Date.now()),
  } };
  const mount = (seed: SearchRunState | null) => {
    act(() => {
      renderer = TestRenderer.create(<Harness laidPoints={laidPoints} laidObjects={laidObjects} angleArcM={angleArcM}
        handlerDistanceM={input.handlerDistanceM} guidanceAngles={guidanceAngles} guidanceObjects={guidanceObjects} seed={seed} cb={cb} />);
    });
  };

  const realLog = console.log, realWarn = console.warn;
  console.log = () => {}; console.warn = () => {};
  jest.useFakeTimers({ now: startMs, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'performance'] });
  let clock = startMs;
  const advanceTo = (ms: number) => { if (ms > clock) { act(() => { jest.advanceTimersByTime(ms - clock); }); clock = ms; } };
  let killed = false;
  let killSnap: Awaited<ReturnType<typeof snapshotPersisted>> | null = null;
  try {
    // ── Frischer Zustand je Lauf (Store, Zwischenspeicher, SQLite, Sprachausgabe).
    useTrackingStore.setState(PRISTINE_STORE, true);
    await AsyncStorage.clear();
    searchBridge.sqlite.length = 0; searchBridge.speech.reset();
    searchBridge.feedFix = null; searchBridge.feedMotion = null;
    searchBridge.motionAvailable = input.motionAvailable ?? true;
    resetVoiceEvents(startMs);
    // Ansagen auf Deutsch wie bei den Kundinnen (Länge der Sätze bestimmt die Sprechdauer).
    if (i18n.language !== 'de') await i18n.changeLanguage('de');

    mount(null);
    await flushMicrotasks();
    // Wie beginSearchNow(): Ansage, Recorder starten, dann Run-Metadaten sofort persistieren.
    requestVoice({ eventType: 'search_start', text: i18n.t('track.voiceSearchStarted') as string,
      language: speechLanguage(i18n.language as never), priority: 2, onceKey: 'search-started', phase: 'search' });
    act(() => { recorder.start(); });
    useTrackingStore.getState().setSearchRunId('sim-run');
    useTrackingStore.getState().setSearchHandlerDistanceM(input.handlerDistanceM);
    useTrackingStore.getState().startSearchSession('sim-run', startMs);
    await flushMicrotasks();
    if (!fixSink()) throw new Error('Positionsquelle des Such-Recorders wurde nicht gestartet (searchMocks zuerst importieren).');

    for (const ev of events) {
      advanceTo(ev.at);
      if (ev.action) {
        const a = ev.action;
        if (a.kind === 'kill' && !killed) {
          const store = useTrackingStore.getState();
          await flushMicrotasks();
          killSnap = await snapshotPersisted();
          out.kills.push({ atMs: clock, restartMs: null, pointsBefore: store.searchTrackPoints.length, pointsRestored: 0,
            foundBefore: [...store.searchRunState.foundObjectIds], foundRestored: [],
            voiceFiredBefore: [...store.searchRunState.voiceFiredIds], voiceFiredRestored: [], pendingFound: false });
          // Prozess weg: Bildschirm, Sprachausgabe, Puffer im Speicher.
          act(() => { renderer?.unmount(); });
          renderer = null;
          searchBridge.speech.kill();
          const buffered = _peekSearchBuffer().sessionId;
          if (buffered) await discardSearchBuffer(buffered);
          out.voiceDiagnostics.push(...voiceDiagnostics().events);
          killed = true;
        } else if (a.kind === 'restart' && killed && killSnap) {
          // Alles, was nach dem Abbruch noch geschrieben wurde (Aufräumen beim Unmount), hat es nie gegeben.
          await restorePersisted(killSnap);
          useTrackingStore.setState(PRISTINE_STORE, true);
          resetVoiceEvents(clock);
          const pending = await loadPending(null);
          const record = out.kills[out.kills.length - 1];
          record.restartMs = clock; record.pendingFound = pending != null;
          let saved: TrackPointSample[] = [];
          let runState: SearchRunState | null = null;
          if (pending) {
            useTrackingStore.getState().restoreSearchSession(pending);
            const rows: TrackPointSample[] = searchBridge.sqlite.map(r => ({ lat: r.latitude, lng: r.longitude, accuracy: r.accuracy ?? null,
              altitude: r.altitude ?? null, speed: r.speed ?? null, heading: null, t: Date.parse(r.timestamp), ...(r.breakBefore ? { breakBefore: true } : {}) }));
            saved = dedupeSearchPoints([...rows, ...(pending.searchPoints ?? [])].filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.t)));
            useTrackingStore.getState().setSearchPoints(saved);
            runState = useTrackingStore.getState().searchRunState;
          }
          record.pointsRestored = saved.length;
          record.foundRestored = [...(runState?.foundObjectIds ?? [])];
          record.voiceFiredRestored = [...(runState?.voiceFiredIds ?? [])];
          mount(runState);
          await flushMicrotasks();
          const startedAtMs = pending?.searchStartedAt ?? startMs;
          // Wie resumeSearch() in run.tsx.
          act(() => {
            recorder.start(pending ? { points: saved.map(p => ({ latitude: p.lat, longitude: p.lng, ...(p.breakBefore ? { breakBefore: true } : {}) })),
              pointsTimeSec: saved.map(p => Math.max(0, (p.t - startedAtMs) / 1000)), startedAtMs, runState: runState ?? undefined } : undefined);
          });
          await flushMicrotasks();
          killed = false;
        } else if (!killed) {
          if (a.kind === 'markObject') act(() => { recorder.markObject(); });
          else if (a.kind === 'pause') act(() => { recorder.setPaused(true); });
          else if (a.kind === 'unpause') act(() => { recorder.setPaused(false); });
          else if (a.kind === 'interruptSpeech') searchBridge.speech.stop();
        }
        continue;
      }
      if (killed) continue;
      if (ev.motion) {
        const m = ev.motion;
        const sample: BridgeMotion = { timestamp: m.t, movementState: m.movementState, stepDelta: m.stepDelta,
          accelerationMagnitude: m.accelerationMagnitude, rotationMagnitude: m.rotationMagnitude, headingDelta: m.headingDelta,
          motionConfidence: 1, activityAgeMs: 0 };
        motionSink()?.(sample);
        continue;
      }
      const fix = ev.fix!;
      const started = performance.now();
      act(() => { fixSink()!({ ...toBridge(fix), t: fix.tMs }); });
      out.fixComputeMaxMs = Math.max(out.fixComputeMaxMs, performance.now() - started);
      if (!out.startLocked && recorder.searchStartState === 'START_LOCKED') { out.startLocked = true; out.startLockedAfterS = (fix.tMs - startMs) / 1000; }
      out.trace.push({ tMs: fix.tMs, appDogM: recorder.dogProgressM, appHandlerM: recorder.progressM, trackLengthM: recorder.trackLengthM,
        locked: recorder.searchStartState === 'START_LOCKED', activeObjectWait: recorder.activeObjectWait, paused: recorder.paused,
        handler: recorder.position ? { latitude: recorder.position.latitude, longitude: recorder.position.longitude } : null });
    }
    // Laufende Ansage ausklingen lassen.
    advanceTo(clock + 4000);
    out.progressM = recorder.progressM; out.trackLengthM = recorder.trackLengthM;
    let result!: SearchResult;
    act(() => { result = recorder.stop(); });
    await flushMicrotasks();
    await flushSearchPoints().catch(() => false);
    out.result = result;
    out.spoken = searchBridge.speech.log.slice();
    out.voiceDiagnostics.push(...voiceDiagnostics().events);

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
    jest.clearAllTimers();
    jest.useRealTimers();
    console.log = realLog; console.warn = realWarn;
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
