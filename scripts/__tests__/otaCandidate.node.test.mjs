import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCandidate, validateCandidate, validateHumanApproval, claimAttempt, formatApprovalReport, riskFor, artifact, readJson } from '../ota-candidate.mjs';

function fixture(t, paths = ['components/Label.tsx'], changes = [{ description: 'Text klarer anzeigen', risk: 'low', areas: ['ui'] }]) {
  const dir = mkdtempSync(join(tmpdir(), 'anyvo-one-approval-'));t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'repo');mkdirSync(root);const log = join(dir, 'proof.log');writeFileSync(log, 'synthetic evidence only\n');const proof = artifact(log, root);
  const source = { commit: 'a'.repeat(40), tree: 'b'.repeat(40), branch: 'release/test' };
  const target = { platform: 'ios', runtime: 'fixture-runtime', appVersion: '1.0.5', channel: 'production', environment: 'production' };
  const context = { source, target, production: { baseline: { group: 'g-before', gitCommitHash: 'c'.repeat(40) }, other: { group: 'android-before' } },
    native: { buildId: 'fixture-native', commit: 'c'.repeat(40), platform: 'ios', runtime: target.runtime }, environmentDigest: 'd'.repeat(64), changedPaths: paths, risk: riskFor(paths, changes) };
  const quality = { schemaVersion: 1, source: { commit: source.commit, tree: source.tree }, target: { platform: target.platform, runtime: target.runtime }, producer: 'fixture-writer',
    checks: { process: { exitCode: 0, evidence: proof }, typecheck: { exitCode: 0, evidence: proof }, eslint: { exitCode: 0, errors: 0, warnings: 0, evidence: proof },
      tests: { exitCode: 0, passed: 12, failed: 0, skipped: 0, fullSuite: true, evidence: proof }, diff: { exitCode: 0, evidence: proof } },
    review: { status: 'PASS', sourceCommit: source.commit, reviewer: 'fixture-independent', evidence: proof } };
  const qualityFile = join(dir, 'quality.json');
  const plan = { bundle: { status: 'PASS', sourceCommit: source.commit, platform: target.platform, runtime: target.runtime, environment: 'production', evidence: proof, launchAsset: proof, assets: [] }, changes, regressions: ['Textanzeige und Layout'], testRationale: 'Fixture regression coverage', sourceBackup: { status: 'PASS', commit: source.commit, repository: 'dogbossvibes/CarniFlow', ref: 'fixture-only', evidence: proof } };
  const create = () => { writeFileSync(qualityFile, JSON.stringify(quality));return createCandidate({ context, plan, qualityFile, root }); };
  const approval = candidate => ({ schemaVersion: 1, kind: 'human-production-approval', decision: 'PUBLISH_PRODUCTION_ONCE', scope: 'production-ota-only', candidateDigest: candidate.digest,
    commit: source.commit, platform: target.platform, runtime: target.runtime, humanMessageReference: 'synthetic-test-human-message-not-real-approval', explicitStatement: 'Synthetic test only', approvedAt: new Date().toISOString() });
  return { dir, root, log, proof, source, target, context, quality, qualityFile, plan, create, approval };
}
test('complete low-risk preflight creates one precise READY report', t => {
  const f = fixture(t), c = f.create();assert.equal(c.recommendation, 'READY');
  const report = formatApprovalReport(c);assert.match(report, /READY/);assert(report.includes(f.source.commit));assert(report.includes(c.digest));assert.match(report, /Commit, Push, Merge, Build, Store und DB sind nicht enthalten/);
});
test('missing backup or failed local quality blocks readiness', t => {
  const f = fixture(t);f.plan.sourceBackup.status = 'UNKNOWN';assert.equal(f.create().recommendation, 'BLOCKED');
  f.quality.checks.eslint.exitCode = 1;assert.throws(f.create);
});
test('medium-risk changes require functional regression evidence', t => {
  const f = fixture(t, ['app/training-hub.tsx']);assert.equal(f.create().recommendation, 'BLOCKED');
  f.plan.functionalQA = { status: 'PASS', sourceCommit: f.source.commit, platform: 'ios', runtime: f.target.runtime, scenarios: ['edit existing record'], evidence: f.proof };
  assert.equal(f.create().recommendation, 'READY');
});
test('known critical files elevate a declared low risk and require physical QA plus full suite', t => {
  const f = fixture(t, ['features/tracking/engine/layProcessingSession.ts']);assert.equal(f.context.risk.level, 'high');assert.equal(f.create().recommendation, 'BLOCKED');
  f.plan.functionalQA = { status: 'PASS', sourceCommit: f.source.commit, platform: 'ios', runtime: f.target.runtime, scenarios: ['resume'], evidence: f.proof };
  f.plan.deviceQA = { status: 'PASS', kind: 'physical-device', deviceModel: 'synthetic fixture', osVersion: 'fixture', performedAt: new Date().toISOString(),
    sourceCommit: f.source.commit, platform: 'ios', runtime: f.target.runtime, nativeBuildId: f.context.native.buildId,
    scenarios: [{ area: 'tracking', result: 'PASS', description: 'Synthetic physical test record only' }], evidence: f.proof };
  assert.equal(f.create().recommendation, 'READY');f.quality.checks.tests.fullSuite = false;assert.equal(f.create().recommendation, 'BLOCKED');
  f.quality.checks.tests.fullSuite = true;f.plan.deviceQA.kind = 'simulator';assert.equal(f.create().recommendation, 'BLOCKED');
});
test('changed HEAD, tree, platform, runtime, baseline and environment invalidate the candidate', t => {
  const f = fixture(t), c = f.create();
  for (const [part, field] of [['source', 'commit'], ['source', 'tree'], ['target', 'platform'], ['target', 'runtime']]) {
    const next = structuredClone(f.context);next[part][field] = 'changed';assert.throws(() => validateCandidate(c, next, f.root));
  }
  const next = structuredClone(f.context);next.production.baseline.group = 'changed';assert.throws(() => validateCandidate(c, next, f.root));
  assert.throws(() => validateCandidate(c, { ...f.context, environmentDigest: 'changed' }, f.root));
});
test('modified scope, quality or evidence cannot reuse an approval', t => {
  const f = fixture(t), c = f.create();const modified = structuredClone(c);modified.plan.changes[0].description = 'different scope';
  assert.throws(() => validateCandidate(modified, f.context, f.root));
  writeFileSync(f.log, 'changed artifact');assert.throws(() => validateCandidate(c, f.context, f.root));
});
test('missing explicit human approval and consent for another candidate are rejected', t => {
  const f = fixture(t), c = f.create();
  for (const value of [null, {}, { confirm: true }, { ...f.approval(c), candidateDigest: 'other' }, { ...f.approval(c), scope: 'push-and-build' }, { ...f.approval(c), humanMessageReference: '' }]) assert.throws(() => validateHumanApproval(value, c));
});
test('unchanged candidate reuses exactly one approval without another prompt', t => {
  const f = fixture(t), c = f.create(), a = f.approval(c);
  for (let n = 0; n < 3; n++) { validateCandidate(c, f.context, f.root);validateHumanApproval(a, c); }
});
test('persistent attempt claim blocks a second publication after success or uncertainty', t => {
  for (const status of ['SUCCESS', 'UNCONFIRMED']) {
    const f = fixture(t), c = f.create(), common = join(f.dir, 'git-common');mkdirSync(common);
    const attempt = claimAttempt(common, c);attempt.finish({ status });assert.equal(readJson(attempt.path).status, status);
    assert.throws(() => claimAttempt(common, c));
  }
});
test('unfinished claim remains unconfirmed and cannot be silently retried', t => {
  const f = fixture(t), c = f.create();const common = join(f.dir, 'common');mkdirSync(common);
  const attempt = claimAttempt(common, c);assert.equal(readJson(attempt.path).status, 'UNCONFIRMED');assert.throws(() => claimAttempt(common, c));
});
test('unknown risk labels fail closed', () => assert.throws(() => riskFor([], [{ description: 'test', risk: 'unclassified' }])));
test('a reported failed optional QA must never be ignored for a low-risk candidate', t => {
  const f = fixture(t);f.plan.deviceQA = { status: 'FAIL' };assert.equal(f.create().recommendation, 'BLOCKED');
  delete f.plan.deviceQA;f.plan.functionalQA = { status: 'FAIL' };assert.equal(f.create().recommendation, 'BLOCKED');
});
test('report never prints evidence contents or grants unrelated operations', t => {
  const f = fixture(t);writeFileSync(f.log, 'SYNTHETIC_SECRET_VALUE');f.proof.sha256 = artifact(f.log, f.root).sha256;
  const c = f.create();assert(!formatApprovalReport(c).includes('SYNTHETIC_SECRET_VALUE'));assert.equal(c.context.target.environment, 'production');
});

test('missing bundle provenance or process regressions cannot be approved', t => {
  const f = fixture(t);delete f.plan.bundle;assert.equal(f.create().recommendation, 'BLOCKED');
  const g = fixture(t);g.plan.bundle.environment = 'preview';assert.equal(g.create().recommendation, 'BLOCKED');
  const h = fixture(t);delete h.quality.checks.process;assert.equal(h.create().recommendation, 'BLOCKED');
});
