/**
 * Search-Recovery-State — Verdrahtung in run.tsx (statisch, Kommentare entfernt)
 * + Unveränderlichkeit (Canonical Arc, Voice-/Haptik-/Ende-Schwellen).
 */
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_GUIDANCE_OPTIONS, DEFAULT_TRACK_END_OPTIONS } from '@/features/tracking/utils/guidanceEngine';
import { OFF_TRACK } from '@/features/tracking/utils/offTrack';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const run = strip(read('app/track/run.tsx'));
const block = (from: string, to: string) => run.slice(run.indexOf(from), run.indexOf(to));

describe('run.tsx — Search-Recovery-State', () => {
  it('runId: frische Session bekommt die runUuid (kein null-Überschreiben mehr)', () => {
    const begin = block('const beginSearchNow', 'const handleManualStart');
    expect(begin).toContain('startSearchSession(runUuid, startMs)');
    expect(begin).not.toContain('startSearchSession(null');
  });

  it('Recovery-Snapshot enthält den Run-State; frischer/discard-Snapshot nicht', () => {
    expect(run).toContain('recovery: withRecovery ? st.searchRunState : null');
    expect(block("if (decision.kind === 'recovery')", "} else {")).toContain('setSnap(buildSnap(true))');
    expect(block('const discardSearch', 'const runPoints')).toContain('setSnap(buildSnap(false))');
    expect(run).toContain('recovery: null as SearchRunState | null');
  });

  it('resumeSearch: seedet Off-Track/Segmente vor dem Start und übergibt runState an den Recorder', () => {
    const resume = block('const resumeSearch', 'const endSearch');
    expect(resume).toContain('const runState = useTrackingStore.getState().searchRunState;');
    expect(resume).toContain('prevOffTrackRef.current = runState.offTrackState;');
    expect(resume).toContain('segmentAnnouncementRef.current = { ...runState.segmentAnnouncements };');
    expect(resume).toMatch(/s\.start\(\{ points: saved\.map\([^)]*\)\), startedAtMs: [^,]+, runState \}\)/);
  });

  it('discard: Dedupe-Refs und Snapshot werden geleert (kein Überlauf in den nächsten Run)', () => {
    const discard = block('const discardSearch', 'const runPoints');
    expect(discard).toContain('resetSearchPoints()');
    expect(discard).toContain('segmentAnnouncementRef.current = {};');
    expect(discard).toContain("prevOffTrackRef.current = 'on_track';");
  });

  it('Voice/Haptik/Ende/Segmente: Seeds aus snapData.recovery, Auslösungen in den Store gespiegelt', () => {
    expect(run).toContain('initialAnnouncedIds: snapData.recovery?.voiceFiredIds');
    expect(run).toContain('noteSearchVoiceFired(id)');
    expect(run).toContain('initialFiredIds: snapData.recovery?.hapticFiredIds');
    expect(run).toContain('noteSearchHapticFired(id)');
    expect(run).toContain('initialFired: snapData.recovery?.endFired ?? false');
    expect(run).toContain('noteSearchEndFired()');
    expect(run).toContain('setSearchSegmentAnnouncements(result.state)');
    expect(run).toContain('useTrackVoiceGuidance(s.dogProgressM, guidanceAngles, voiceOn, stepLengthM, guidanceObjects, voiceRecovery,');
    expect(run).toContain('useTrackHapticGuidance(s.dogProgressM, guidanceAngles, guidanceObjects, searchGuidanceActive, hapticRecovery);');
  });

  it('laidObjects tragen die Marker-ID (stabile Fund-Identität)', () => {
    expect(run).toContain("index: i, material: m.material ?? '', id: m.id, atM: eventArcs[m.id]?.arcM ?? null }))");
  });

  it('Completed/„Beenden": Store-Reset (clearPending) bleibt der Cleanup-Pfad', () => {
    expect(block('const endSearch', 'const discardSearch')).toContain('useTrackingStore.getState().reset();');
    expect(block('const handleFinish', 'const guardedBack')).toContain('useTrackingStore.getState().reset();');
  });
});

describe('18. Canonical-Arc-Regression (7cc2cc6 unverändert)', () => {
  it('Guidance/Analytics nutzen weiterhin eventArcs, nie distance_from_start', () => {
    expect((run.match(/const arcM = snapData\.eventArcs\[m\.id\]\?\.arcM; return arcM == null \? \[\] : \[\{ id: m\.id, arcM, /g) ?? []).length).toBe(2);
    expect(run).not.toMatch(/arcM:\s*m\.distance_from_start/);
    expect(run).not.toMatch(/atM:\s*m\.distance_from_start,/);
    expect(run).toContain('const eventArcs = buildSearchEventArcs(st.markers, laidPoints);');
  });
  it('canonicalArc.ts / searchGeometry.buildArc unverändert referenziert', () => {
    // Seit dem Self-Crossing-Fix projiziert canonicalArc auf ALLE Segmente
    // (projectOntoSegments, dieselbe Rechnung wie projectForward; Nearest-
    // Fallback numerisch identisch — canonicalArcSelfCrossing.test.ts A).
    expect(strip(read('features/tracking/utils/canonicalArc.ts'))).toContain('projectOntoSegments(');
    expect(strip(read('features/tracking/hooks/useSearchRecorder.ts'))).toContain('const arc = useMemo(() => buildArc(laidPoints), [laidPoints]);');
  });
});

describe('Schwellen unverändert', () => {
  it('Voice-/Haptik-/Ende-/Off-Track-Konstanten', () => {
    expect(DEFAULT_GUIDANCE_OPTIONS).toEqual({ announceAheadM: 10, reachedM: 1.5, passedM: 2.5 });
    expect(DEFAULT_TRACK_END_OPTIONS).toEqual({ reachedProgressRatio: 0.90, reachedGeomM: 3.0, approachingRemainingM: 10 });
    expect(OFF_TRACK).toEqual({ MIN_WARNING_M: 3, ACCURACY_WARN_FACTOR: 1.5, OFF_EXTRA_M: 2, RECOVERY_FACTOR: 0.6, MAX_RELIABLE_ACCURACY_M: 20, WARN_CONSECUTIVE: 2, OFF_CONSECUTIVE: 3, RECOVER_CONSECUTIVE: 3 });
    const voice = strip(read('features/tracking/hooks/useTrackVoiceGuidance.ts'));
    const haptic = strip(read('features/tracking/hooks/useTrackHapticGuidance.ts'));
    const rec = strip(read('features/tracking/hooks/useSearchRecorder.ts'));
    expect(voice).toContain('const SPEAK_GAP_MS     = 3500;');
    expect(haptic).toContain('const ANGLE_AHEAD_M  = 6;');
    expect(haptic).toContain('const OBJECT_AHEAD_M = 4;');
    expect(rec).toContain('stepObjectDwell(previous, {');
    expect(rec).toContain('const LOOKAHEAD_M = 20;');
    expect(rec).toContain('const BACK_M = 4;');
    expect(rec).toContain('const BREAK_THRESHOLD_M = 6.0;');
    expect(rec).not.toContain('distM(objectReference, o.at) <= OBJECT_HIT_M');
  });
  it('Cursor-Seed läuft über den normalen Fenster-Projektionspfad (kein Voll-Linien-Workaround)', () => {
    const rec = strip(read('features/tracking/hooks/useSearchRecorder.ts'));
    // Seit dem Live-Cursor-Fix (Self-Crossing): Kandidaten im UNVERÄNDERTEN Fenster
    // [cursor − BACK_M, cursor + LOOKAHEAD_M], Auswahl per Lotfuss-Kontinuität; ohne
    // Vorgänger weiterhin projectForward mit demselben Fenster.
    expect(rec).toContain('const cands = projectForwardCandidates(sm, laidPoints, arc.cum, cursorMRef.current, LOOKAHEAD_M, BACK_M);');
    expect(rec).toContain(': projectForward(sm, laidPoints, arc.cum, cursorMRef.current, LOOKAHEAD_M, BACK_M);');
    expect(rec).toContain('cursorMRef.current = seedCursorM; maxCursorMRef.current = seedCursorM;');
    expect(rec).toContain('lockedAtM: seedCursorM');
  });
});
