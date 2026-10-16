import { MotionEvidenceBuffer, type MotionWindowSample } from '../motionTurnEvidence';
const sample = (t: number): MotionWindowSample => ({ t, headingDelta: 20, rotationMagnitude: 0.5,
  accelerationMagnitude: 0.2, stepDelta: 1, cadence: 60, movementState: 'walking' });

describe('live Motion sample ordering', () => {
  it('does not count duplicated or late samples as additional yaw and steps', () => {
    const b = new MotionEvidenceBuffer();
    [1000,1250,1500,1500,1250].forEach(t => b.push(sample(t)));
    expect(b.samplesIn(0,2000).map(s => s.t)).toEqual([1000,1250,1500]);
    expect(b.evidenceFor(1250).steps).toBe(3);
  });
  it('ignores nonfinite timestamps without poisoning retention and resets for a new run', () => {
    const b = new MotionEvidenceBuffer(1);
    b.push(sample(1000)); b.push(sample(Infinity)); b.push(sample(NaN)); b.push(sample(1250));
    expect(b.samplesIn(0,2000).map(s => s.t)).toEqual([1000,1250]);
    b.clear(); b.push(sample(100)); expect(b.span).toEqual({ firstMs:100, lastMs:100 });
  });
});
