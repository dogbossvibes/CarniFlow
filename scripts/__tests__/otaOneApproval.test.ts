import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHarness, destroyHarness, RELEASE_RUNTIME } from './otaReleaseHarness';

describe('one candidate / one human approval / one publish (offline fake EAS)', () => {
  const h = createHarness();
  beforeEach(() => { h.resetCalls();h.setState(h.defaultState()); });
  afterAll(() => destroyHarness(h));
  const publish = ['--platform', 'ios', '--confirm', '--message', 'fixture-one-approval'];
  const prepared = () => {
    const files = h.fixtureApproval(publish);
    return { ...files, args: [...publish, '--candidate', files.candidate, '--approval', files.approval] };
  };
  it('prepares READY through the existing wrapper and never publishes during preparation', () => {
    const f = prepared(), candidate = JSON.parse(readFileSync(f.candidate, 'utf8'));
    const quality = JSON.parse(readFileSync(h.qualityEvidenceFile, 'utf8'));
    const plan = join(h.dir, 'plan.json');writeFileSync(plan, JSON.stringify({ ...candidate.plan, producer: quality.producer, review: quality.review }));
    const directory = join(h.dir, 'prepared');
    const result = h.run(['--platform', 'ios', '--message', 'fixture-one-approval', '--prepare', '--plan', plan, '--candidate-dir', directory], { approval: false });
    if (result.code !== 0) throw new Error(result.out);
    expect(JSON.parse(readFileSync(join(directory, 'candidate.json'), 'utf8')).recommendation).toBe('READY');
    expect(readFileSync(join(directory, 'FREIGABE.txt'), 'utf8')).toContain('ANYVO OTA – Bereit zur Freigabe');
    expect(h.updateCalls()).toHaveLength(0);
  });
  it('--confirm is never an explicit human approval', () => {
    expect(h.run(publish, { approval: false }).code).toBe(1);expect(h.updateCalls()).toHaveLength(0);
  });
  it('blocks a missing or different approval without publishing', () => {
    const f = prepared();writeFileSync(f.approval, JSON.stringify({ confirm: true }));
    expect(h.run(f.args).code).toBe(1);expect(h.updateCalls()).toHaveLength(0);
  });
  it('blocks a changed release commit/candidate', () => {
    const f = prepared(), c = JSON.parse(readFileSync(f.candidate, 'utf8'));c.context.source.commit = h.base;
    writeFileSync(f.candidate, JSON.stringify(c));expect(h.run(f.args).code).toBe(1);expect(h.updateCalls()).toHaveLength(0);
  });
  it('blocks an intervening change to the approved production basis', () => {
    const f = prepared();h.setState({ groups: [{ group: 'intervening', entries: [{ platform: 'ios', id: 'u-intervening', runtimeVersion: RELEASE_RUNTIME, gitCommitHash: h.base }] }] });
    expect(h.run(f.args).code).toBe(1);expect(h.updateCalls()).toHaveLength(0);
  });
  it('does not turn a missing high-risk device acceptance into READY', () => {
    const f = prepared(), c = JSON.parse(readFileSync(f.candidate, 'utf8'));
    const quality = JSON.parse(readFileSync(h.qualityEvidenceFile, 'utf8'));
    const plan = join(h.dir, 'high-risk-plan.json');writeFileSync(plan, JSON.stringify({ ...c.plan, producer: quality.producer, review: quality.review,
      changes: [{ description: 'Synthetic tracking change', risk: 'high', areas: ['tracking'] }] }));
    const directory = join(h.dir, 'high-risk-prepared');
    const result = h.run(['--platform', 'ios', '--message', 'fixture-high', '--prepare', '--plan', plan, '--candidate-dir', directory], { approval: false });
    expect(result.code).toBe(1);expect(h.updateCalls()).toHaveLength(0);
    const created = JSON.parse(readFileSync(join(directory, 'candidate.json'), 'utf8'));
    expect(created.recommendation).toBe('BLOCKED');expect(created.problems.join(' ')).toMatch(/echte Geräteabnahme/);
  });
  it('rechecks an unchanged approved candidate without asking again or publishing', () => {
    const f = prepared();const result = h.run([...f.args, '--dry-run']);
    expect(result.code).toBe(0);expect(result.out).toContain('keine neue Frage');expect(h.updateCalls()).toHaveLength(0);
  });
  it('publishes once and persists actual IDs; a second attempt is blocked', () => {
    const f = prepared();const first = h.run(f.args);if (first.code !== 0) throw new Error(first.out);
    expect(h.updateCalls()).toHaveLength(1);
    const ledger = join(h.repo, '.git', 'anyvo-ota-attempts');expect(existsSync(ledger)).toBe(true);
    const result = JSON.parse(readFileSync(join(ledger, readdirSync(ledger)[0]), 'utf8'));
    expect(result.status).toBe('SUCCESS');expect(result.platformUpdateId).toBe('u-new-ios');expect(result.updateGroupId).toMatch(/^g-new-/);
    expect(h.run(f.args).code).toBe(1);expect(h.updateCalls()).toHaveLength(1);
  });
  it('failed/uncertain publish is retained and never automatically retried', () => {
    const f = prepared();h.setState({ ...h.defaultState(), failUpdate: true });
    expect(h.run(f.args).code).toBe(1);expect(h.updateCalls()).toHaveLength(1);
    const ledger = join(h.repo, '.git', 'anyvo-ota-attempts');const file = join(ledger, readdirSync(ledger)[0]);
    expect(JSON.parse(readFileSync(file, 'utf8')).status).toBe('UNCONFIRMED');
    expect(h.run(f.args).code).toBe(1);expect(h.updateCalls()).toHaveLength(1);
  });
  it('unavailable CDN leaves actual EAS IDs unconfirmed and blocks a second attempt', () => {
    const f = prepared();h.setState({ ...h.defaultState(), failDelivery: true });
    const first = h.run(f.args);expect(first.code).toBe(2);expect(h.updateCalls()).toHaveLength(1);
    const ledger = join(h.repo, '.git', 'anyvo-ota-attempts');
    const result = JSON.parse(readFileSync(join(ledger, readdirSync(ledger)[0]), 'utf8'));
    expect(result.status).toBe('UNCONFIRMED');expect(result.platformUpdateId).toBe('u-new-ios');expect(result.verifiedProduction).toBeNull();
    expect(h.run(f.args).code).toBe(1);expect(h.updateCalls()).toHaveLength(1);
  });
  it('does not claim success if post-publish runtime verification fails', () => {
    const f = prepared();h.setState({ ...h.defaultState(), publishRuntime: 'wrong-runtime' });
    expect(h.run(f.args).code).toBe(2);expect(h.updateCalls()).toHaveLength(1);
    const ledger = join(h.repo, '.git', 'anyvo-ota-attempts');expect(JSON.parse(readFileSync(join(ledger, readdirSync(ledger)[0]), 'utf8')).status).toBe('UNCONFIRMED');
  });
});
