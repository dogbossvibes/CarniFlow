/**
 * Canonical Reference Progress — Verdrahtung in run.tsx + Unveränderlichkeit
 * der Voice-/Haptik-/Fund-/Ende-Logik (Tests 13–15 des Auftrags).
 *
 * Statische Prüfung des Quelltexts (Kommentare entfernt), plus Import der
 * unveränderten Konstanten.
 */
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_GUIDANCE_OPTIONS, DEFAULT_TRACK_END_OPTIONS } from '@/features/tracking/utils/guidanceEngine';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

const run = stripComments(read('app/track/run.tsx'));
const voice = stripComments(read('features/tracking/hooks/useTrackVoiceGuidance.ts'));
const haptic = stripComments(read('features/tracking/hooks/useTrackHapticGuidance.ts'));
const recorder = stripComments(read('features/tracking/hooks/useSearchRecorder.ts'));
const endHook = stripComments(read('features/tracking/hooks/useTrackEndGuidance.ts'));

describe('run.tsx: Search-Guidance verwendet ausschliesslich kanonische arcM', () => {
  it('Snapshot baut eventArcs aus Markern + laidPoints (canonicalArc.ts)', () => {
    expect(run).toContain("from '@/features/tracking/utils/canonicalArc'");
    expect(run).toContain('const eventArcs = buildSearchEventArcs(st.markers, laidPoints);');
    expect(run).toContain('eventArcs,');
    expect(run).toContain('eventArcs: {} as Record<string, CanonicalArc>');
  });

  it('guidanceAngles / guidanceObjects lesen arcM aus eventArcs, nie aus distance_from_start', () => {
    const occurrences = run.match(/const arcM = snapData\.eventArcs\[m\.id\]\?\.arcM; return arcM == null \? \[\] : \[\{ id: m\.id, arcM, /g) ?? [];
    expect(occurrences.length).toBe(2);   // Winkel + Gegenstände
    expect(run).not.toMatch(/arcM:\s*m\.distance_from_start/);
    // Analytics-Eingaben ebenfalls kanonisch (gleicher Maßstab wie die Samples).
    expect(run).toMatch(/const atM = snapData\.eventArcs\[m\.id\]\?\.arcM; return atM == null \? \[\] : \[\{ atM, angleKind/);
    expect(run).toMatch(/atM: snapData\.eventArcs\[m\.id\]\?\.arcM \?\? m\.distance_from_start/);
    expect(run).not.toMatch(/atM:\s*m\.distance_from_start,/);
  });

  it('useTrackVoiceGuidance / useTrackHapticGuidance bekommen weiterhin dieselben Listen (dogProgressM + arcM)', () => {
    expect(run).toContain('useTrackVoiceGuidance(s.dogProgressM, guidanceAngles, voiceOn, stepLengthM, guidanceObjects);');
    expect(run).toContain('useTrackHapticGuidance(s.dogProgressM, guidanceAngles, guidanceObjects, true);');
  });
});

describe('13. Voice-/Haptik-Schwellen unverändert', () => {
  it('Guidance-Engine-Defaults', () => {
    expect(DEFAULT_GUIDANCE_OPTIONS).toEqual({ announceAheadM: 10, reachedM: 1.5, passedM: 2.5 });
  });
  it('Voice-Hook: Entprellung und kein eigener Maßstab', () => {
    expect(voice).toContain('const SPEAK_GAP_MS     = 3500;');
    expect(voice).not.toContain('canonicalArc');
    expect(voice).not.toContain('distance_from_start');
  });
  it('Haptik-Hook: Vorlaufdistanzen/Entprellung', () => {
    expect(haptic).toContain('const ANGLE_AHEAD_M  = 6;');
    expect(haptic).toContain('const OBJECT_AHEAD_M = 4;');
    expect(haptic).toContain('const GAP_MS         = 2500;');
    expect(haptic).not.toContain('canonicalArc');
  });
});

describe('14. Objekt-Fundlogik unverändert (koordinatenbasiert)', () => {
  it('OBJECT_HIT_M und der Fund-Block sind unverändert', () => {
    expect(recorder).toContain('const OBJECT_HIT_M = 2.5;');
    expect(recorder).toContain("const dogProgress = startLocked ? estimateDogProgressM(maxCursorMRef.current, handlerDistanceM, arc.total) : maxCursorMRef.current;");
    expect(recorder).toContain('const objectReference = dogPos ?? sm;');
    expect(recorder).toContain('if (!foundRef.current.has(i) && distM(objectReference, o.at) <= OBJECT_HIT_M) {');
    expect(recorder).not.toContain('canonicalArc');
  });
  it('Recorder nutzt die zentrale buildArc aus searchGeometry (ein Maßstab)', () => {
    expect(recorder).toMatch(/import \{[^}]*buildArc[^}]*\} from '@\/features\/tracking\/utils\/searchGeometry'/);
    expect(recorder).not.toMatch(/function buildArc\(/);
    expect(recorder).toContain('const arc = useMemo(() => buildArc(laidPoints), [laidPoints]);');
  });
});

describe('15. Enderkennung unverändert', () => {
  it('Track-End-Defaults', () => {
    expect(DEFAULT_TRACK_END_OPTIONS).toEqual({ reachedProgressRatio: 0.97, reachedGeomM: 3.0, approachingRemainingM: 10 });
  });
  it('useTrackEndGuidance arbeitet weiter auf laidPoints[last] + dogProgress + Geometrie', () => {
    expect(endHook).not.toContain('canonicalArc');
    expect(run).toContain('const endPoint = snapData.laidPoints.length ? snapData.laidPoints[snapData.laidPoints.length - 1] : null;');
  });
});
