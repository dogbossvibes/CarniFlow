import { readFileSync, writeFileSync } from 'fs';
import { createHarness, destroyHarness } from './otaReleaseHarness';

describe('required quality evidence at the exact release source (offline fake EAS)', () => {
  const h = createHarness();
  const original = readFileSync(h.qualityEvidenceFile, 'utf8');
  beforeEach(() => { h.resetCalls(); h.setState(h.defaultState()); writeFileSync(h.qualityEvidenceFile, original); });
  afterAll(() => destroyHarness(h));
  const args = ['--platform', 'ios', '--confirm', '--message', 'quality test'];
  it('does not publish without a quality receipt', () => {
    expect(h.run(args, { qualityEvidence: false }).code).toBe(1);
    expect(h.updateCalls()).toHaveLength(0);
  });
  it('does not publish with receipts from another commit', () => {
    const d = JSON.parse(original); d.source.commit = h.base;
    writeFileSync(h.qualityEvidenceFile, JSON.stringify(d));
    expect(h.run(args).code).toBe(1);
    expect(h.updateCalls()).toHaveLength(0);
  });
  it('does not publish after a failed or missing independent review', () => {
    const d = JSON.parse(original); d.review.status = 'CHANGES_REQUIRED';
    writeFileSync(h.qualityEvidenceFile, JSON.stringify(d));
    expect(h.run(args).code).toBe(1);
    expect(h.updateCalls()).toHaveLength(0);
  });
  it('does not publish when padded reviewer identity is the producer', () => {
    const d = JSON.parse(original); d.review.reviewer = ` ${d.producer} `;
    writeFileSync(h.qualityEvidenceFile, JSON.stringify(d));
    expect(h.run(args).code).toBe(1);
    expect(h.updateCalls()).toHaveLength(0);
  });
  it.each(['ios', 'android'])('preserves the existing guarded %s publication path', platform => {
    const result = h.run(['--platform', platform, '--confirm', '--message', 'quality test']);
    if (result.code !== 0) throw new Error(result.out);
    expect({ code: result.code, output: result.out }).toMatchObject({ code: 0 });
    expect(h.updateCalls()).toHaveLength(1);
  });
});
