import * as fs from 'fs';
import * as path from 'path';
import { detectShortLegCorners } from '@/features/tracking/utils/shortLegCornerDetection';
import { fuseTurns } from '@/features/tracking/utils/turnFusion';
import { MotionEvidenceBuffer, type MotionWindowSample } from '@/features/tracking/utils/motionTurnEvidence';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';
import { assertNoAbsoluteData } from '@/features/tracking/utils/qaTrackExport';

const fixtureDir = path.join(__dirname, 'fixtures', 'realFieldV21', 'new');

for (const [file, expected] of [
  ['1FN.json', ['rechts', 'links']],
  ['2FN.json', ['spitz_rechts', 'spitz_links', 'rechts', 'links']],
] as const) {
  it(`${file}: aktuelle Fusion gegen reale Ground Truth`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(fixtureDir, file), 'utf8'));
    const points = capturedDetectorBuffer(data.detectorPoints);
    const samples = new Map<number, MotionWindowSample>();
    for (const candidate of data.candidateMotionEvidence ?? []) {
      for (const sample of candidate.samples) {
        const t = Math.round(candidate.evaluatedAtMs + sample.dtMs);
        samples.set(t, { t, headingDelta: sample.headingDelta,
          rotationMagnitude: sample.rotationMagnitude, accelerationMagnitude: sample.accelerationMagnitude,
          stepDelta: sample.stepDelta, cadence: sample.cadence, movementState: sample.movementState });
      }
    }
    const motion = new MotionEvidenceBuffer(1e9);
    [...samples.values()].sort((a, b) => a.t - b.t).forEach(sample => motion.push(sample));
    const lookup = samples.size ? (t: number | null) => t == null ? null : motion.evidenceForTrailing(t) : undefined;
    const rule = detectShortLegCorners(points, null, lookup);
    const fused = fuseTurns(points, { turnEvidenceAt: lookup, motionSamples: [...samples.values()] });
    // Die Ground Truth ist absichtlich unabhängig vom alten marker[]-Export.
    // Beide realen Läufe sind derzeit Fall C: bei den fehlenden Ecken bricht
    // die GPS-Geometrie, Motion allein darf keine Ecke persistieren. Diese
    // Baseline hält den Befund reproduzierbar fest, ohne einen Fix zu raten.
    const current = file === '1FN.json' ? ['rechts'] : ['rechts', 'spitz_links', 'rechts'];
    expect(rule.corners.map(c => c.kind)).toEqual(current);
    expect(fused.corners.map(c => c.kind)).toEqual(current);
    expect(current).not.toEqual(expected);
    expect(data.schemaMinor).toBe(1);
    expect(() => assertNoAbsoluteData(data)).not.toThrow();
    expect(JSON.stringify(data)).not.toMatch(/"(?:lat|lng|latitude|longitude)"/);
    expect(data.markers.filter((m: { type: string }) => m.type === 'gegenstand')).toHaveLength(file === '1FN.json' ? 3 : 2);
    expect(fused.turns.every(t => t.source === 'gps')).toBe(true);
  });
}
