/**
 * Search-Guidance Activation Guard — Verdrahtung in run.tsx (statisch, ohne
 * Kommentare) + Pins: Canonical Reference (7cc2cc6) und Search Recovery State
 * (4eeb361) unverändert, Schwellen unverändert.
 */
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_GUIDANCE_OPTIONS, DEFAULT_TRACK_END_OPTIONS } from '@/features/tracking/utils/guidanceEngine';
import { OFF_TRACK } from '@/features/tracking/utils/offTrack';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const run = strip(read('app/track/run.tsx'));
const rec = strip(read('features/tracking/hooks/useSearchRecorder.ts'));
const voice = strip(read('features/tracking/hooks/useTrackVoiceGuidance.ts'));
const haptic = strip(read('features/tracking/hooks/useTrackHapticGuidance.ts'));
const end = strip(read('features/tracking/hooks/useTrackEndGuidance.ts'));
const block = (from: string, to: string) => run.slice(run.indexOf(from), run.indexOf(to));

describe('zentraler Guard', () => {
  it('genau EINE Definition: recording UND START_LOCKED (bestehende Recorder-Authorities)', () => {
    expect((run.match(/const searchGuidanceActive = /g) ?? []).length).toBe(1);
    expect(run).toContain("const searchGuidanceActive = s.recording && s.searchStartState === 'START_LOCKED';");
  });
  it('ACTIVE SEARCH GUIDANCE hängt am Guard: Voice, Haptik, Ende, Segmente, Off-Track', () => {
    expect(block('const voiceRecovery = useMemo', 'const hapticRecovery')).toContain('enabled: searchGuidanceActive,');
    expect(run).toContain('useTrackHapticGuidance(s.dogProgressM, guidanceAngles, guidanceObjects, searchGuidanceActive, hapticRecovery);');
    expect(block('const trackEndState = useTrackEndGuidance', 'const trackEndReached')).toContain('recording: searchGuidanceActive,');
    expect(run).toContain('if (!voiceOn || !searchGuidanceActive || snapData.segments.length === 0) return;');
    const off = block('const fb = offTrackTransitionFeedback', 'const offBanner');
    expect(run).toMatch(/if \(!searchGuidanceActive\) return;\s*const fb = offTrackTransitionFeedback\(prevOffTrackRef\.current, s\.offTrackState\);\s*prevOffTrackRef\.current = s\.offTrackState;/);
    expect(off).not.toContain('!s.recording');
    // keine verstreuten Alt-Bedingungen mehr in den Guidance-Pfaden
    expect(run).not.toContain('recording: s.recording && !arming');
    expect(run).not.toContain('if (!voiceOn || arming || !s.recording');
    expect(run).not.toContain('useTrackHapticGuidance(s.dogProgressM, guidanceAngles, guidanceObjects, true,');
  });
});

describe('Pre-Search-Feedback bewusst NICHT gegated (Klasse A)', () => {
  it('„Suche läuft" + Start-Haptik in beginSearchNow unverändert', () => {
    const begin = block('const beginSearchNow', 'const handleManualStart');
    expect(begin).toContain('hapticSuccess();');
    expect(begin).toContain("Speech.speak('Suche läuft', { language: 'de-DE' })");
  });
  it('„Fährtenansatz erkannt" (START_LOCKED-Übergang) unverändert', () => {
    const lock = block('const prevSearchStartRef', 'const searchStartBanner');
    expect(lock).toContain("if (prev !== 'START_LOCKED' && s.searchStartState === 'START_LOCKED') {");
    expect(lock).toContain("if (voiceOn) say(t('track.searchStartLocked'));");
    expect(lock).not.toContain('searchGuidanceActive');
  });
  it('Resume-Haptik unverändert', () => {
    expect(block('const resumeSearch', 'const endSearch')).toContain('hapticSuccess();');
  });
});

describe('Hooks: disabled verbraucht nichts', () => {
  it('Voice: Guard vor dem Engine-Schritt; Haptik: enabled vor der Suche; Ende: recording vor stepTrackEnd', () => {
    expect(voice).toContain('if (!enabled || !voiceOn || dogProgressM == null || !SPEECH_AVAILABLE) return;');
    expect(voice.indexOf('if (!enabled ||')).toBeLessThan(voice.indexOf('stepGuidanceEngine(candidates'));
    expect(haptic).toContain('if (!enabled || dogProgressM == null || !Haptics) return;');
    expect(haptic.indexOf('if (!enabled ||')).toBeLessThan(haptic.indexOf('firedRef.current.add(bestId)'));
    expect(end).toContain('if (!input.recording || input.dogProgressM == null) return;');
    expect(end.indexOf('if (!input.recording ||')).toBeLessThan(end.indexOf('stepTrackEnd('));
  });
  it('Off-Track wird vom Recorder erst ab recording bewertet (kein Feedback vor Search-Start möglich)', () => {
    expect(rec).toContain('if (!recordingRef.current || pausedRef.current) return;');
    expect(rec.indexOf('if (!recordingRef.current || pausedRef.current) return;')).toBeLessThan(rec.indexOf('stepOffTrack('));
  });
});

describe('Pins: Canonical Reference + Search Recovery State unverändert', () => {
  it('Canonical: eventArcs bleiben Search-Authority', () => {
    expect((run.match(/const arcM = snapData\.eventArcs\[m\.id\]\?\.arcM; return arcM == null \? \[\] : \[\{ id: m\.id, arcM, /g) ?? []).length).toBe(2);
    expect(run).not.toMatch(/arcM:\s*m\.distance_from_start/);
    expect(run).not.toMatch(/atM:\s*m\.distance_from_start,/);
  });
  it('Recovery: runUuid, Seeds und Spiegelungen unverändert', () => {
    expect(block('const beginSearchNow', 'const handleManualStart')).toContain('startSearchSession(runUuid, startMs)');
    const resume = block('const resumeSearch', 'const endSearch');
    expect(resume).toContain('prevOffTrackRef.current = runState.offTrackState;');
    expect(resume).toContain('segmentAnnouncementRef.current = { ...runState.segmentAnnouncements };');
    expect(resume).toMatch(/runState \}\)/);
    for (const s of ['initialAnnouncedIds: snapData.recovery?.voiceFiredIds', 'initialFiredIds: snapData.recovery?.hapticFiredIds',
      'initialFired: snapData.recovery?.endFired ?? false', 'noteSearchVoiceFired(id)', 'noteSearchHapticFired(id)', 'noteSearchEndFired()',
      'setSearchSegmentAnnouncements(result.state)']) expect(run).toContain(s);
    expect(rec).toContain('cursorMRef.current = seedCursorM; maxCursorMRef.current = seedCursorM;');
    expect(rec).toContain('maxCursorM: maxCursorMRef.current');
  });
  it('Schwellen unverändert', () => {
    expect(DEFAULT_GUIDANCE_OPTIONS).toEqual({ announceAheadM: 10, reachedM: 1.5, passedM: 2.5 });
    expect(DEFAULT_TRACK_END_OPTIONS).toEqual({ reachedProgressRatio: 0.97, reachedGeomM: 3.0, approachingRemainingM: 10 });
    expect(OFF_TRACK).toEqual({ MIN_WARNING_M: 3, ACCURACY_WARN_FACTOR: 1.5, OFF_EXTRA_M: 2, RECOVERY_FACTOR: 0.6, MAX_RELIABLE_ACCURACY_M: 20, WARN_CONSECUTIVE: 2, OFF_CONSECUTIVE: 3, RECOVER_CONSECUTIVE: 3 });
    expect(voice).toContain('const SPEAK_GAP_MS     = 3500;');
    expect(haptic).toContain('const ANGLE_AHEAD_M  = 6;');
    expect(haptic).toContain('const OBJECT_AHEAD_M = 4;');
    expect(rec).toContain('const OBJECT_HIT_M = 2.5;');
    expect(rec).toContain('const LOOKAHEAD_M = 20;');
  });
});
