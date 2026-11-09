import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { digest, liveFingerprint, validateDeviceReceipt, validatePolicyBinding, DEVICE_CASES, requireReleaseGate } from '../release-entry-gate.mjs';
import { releaseCommandArgs } from '../release-command.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
function fixture(operation = 'production-ota') {
  const policyCommit = 'a'.repeat(40), sourceCommit = 'b'.repeat(40);
  const live = [{ channel: 'production', branch: 'production', fingerprint: 'c'.repeat(64) }];
  const policy = { schemaVersion: 1, complete: true, preparedBy: 'coordinator', approvedBy: 'reviewer',
    inventory: { commit: 'd'.repeat(40), path: 'inventory.json', sha256: 'e'.repeat(64) }, live, openBlockers: [] };
  const plan = { schemaVersion: 1, operation, policyCommit, sourceCommit, inventory: policy.inventory,
    platform: 'ios', runtime: 'sdk58-customer-ios-v1', buildId: '12345678-1234-1234-1234-123456789012',
    appVersion: '1.0.7', buildNumber: '59', nativeFingerprint: 'f'.repeat(40), updateId: 'update-tested',
    channel: 'production', environment: 'production', profile: 'customer-ios', message: 'tested fix' };
  const artifact = Buffer.from('physical iPhone test evidence');
  const receipt = { ...plan, status: 'PASS', physicalDevice: true, deviceModel: 'iPhone', osVersion: '27',
    tester: 'human', testedAt: '2026-11-04T20:00:00Z', openBlockers: [], otaSource: 'OTA', emergencyFallback: false,
    checks: Object.fromEntries(DEVICE_CASES.map(key => [key, { status: 'PASS', evidence: { path: `${key}.json`, sha256: digest(artifact) } }])) };
  return { policy, policyCommit, plan, operation, live, receipt, artifact };
}
test('exact current policy and physical-device evidence pass', () => {
  const f = fixture(); assert.doesNotThrow(() => validatePolicyBinding(f));
  assert.doesNotThrow(() => validateDeviceReceipt(f.receipt, f, () => f.artifact));
});
for (const [name, change] of [
  ['unknown inventory', f => { f.policy.complete = false; }],
  ['self-approved', f => { f.policy.approvedBy = ' COORDINATOR '; }],
  ['stale policy', f => { f.plan.policyCommit = 'f'.repeat(40); }],
  ['wrong source', f => { f.plan.sourceCommit = 'HEAD'; }],
  ['new OTA in another runtime', f => { f.live = [{ ...f.live[0], fingerprint: '9'.repeat(64) }]; }],
  ['missing live read', f => { f.live = []; }],
  ['wrong inventory', f => { f.plan.inventory = {}; }],
  ['open crash', f => { f.policy.openBlockers = ['Build59 stop crash']; }],
  ['unknown operation', f => { f.operation = 'publish-anything'; }],
]) test(`policy blocks ${name}`, () => { const f = fixture(); change(f); assert.throws(() => validatePolicyBinding(f)); });
test('an unfixed crash permits preparing a test build, never customer approval', () => {
  const f = fixture('build'); f.policy.openBlockers = ['stop crash']; assert.doesNotThrow(() => validatePolicyBinding(f));
  f.operation = f.plan.operation = 'customer-check'; assert.throws(() => validatePolicyBinding(f));
});
for (const field of ['sourceCommit', 'policyCommit', 'platform', 'runtime', 'buildId', 'buildNumber', 'appVersion', 'nativeFingerprint', 'updateId']) {
  test(`device receipt bound to ${field}`, () => { const f = fixture(); f.receipt[field] = 'wrong'; assert.throws(() => validateDeviceReceipt(f.receipt, f, () => f.artifact)); });
}
for (const key of DEVICE_CASES) test(`device ${key} cannot be omitted`, () => {
  const f = fixture(); delete f.receipt.checks[key]; assert.throws(() => validateDeviceReceipt(f.receipt, f, () => f.artifact));
});
for (const [name, change] of [
  ['simulator', f => { f.receipt.physicalDevice = false; }],
  ['unknown tester', f => { f.receipt.tester = ''; }],
  ['embedded', f => { f.receipt.otaSource = 'Embedded'; }],
  ['fallback', f => { f.receipt.emergencyFallback = true; }],
  ['open data-loss report', f => { f.receipt.openBlockers = ['missing track']; }],
  ['changed evidence', f => { f.artifact = Buffer.from('changed'); }],
]) test(`device gate blocks ${name}`, () => { const f = fixture(); change(f); assert.throws(() => validateDeviceReceipt(f.receipt, f, () => f.artifact)); });
test('live fingerprint observes older-runtime OTA and channel mapping changes', () => {
  const channel = { id: 'production', branchMapping: 'one' };
  const currentPage = [{ group: 'g1', runtimeVersion: 'sdk58-customer-ios-v1', platforms: 'ios' }];
  const before = liveFingerprint(channel, { currentPage });
  assert.notEqual(before, liveFingerprint(channel, { currentPage: [{ group: 'g2', runtimeVersion: 'sdk58-qa-ios-v1', platforms: 'ios' }, ...currentPage] }));
  assert.notEqual(before, liveFingerprint({ ...channel, branchMapping: 'two' }, { currentPage }));
  assert.throws(() => liveFingerprint(channel, {}));
});
test('managed command rejects extra flags, auto-submit, both platforms and production update bypass', () => {
  const { plan } = fixture();
  for (const args of [['--auto-submit'], ['--platform', 'all'], ['--platform', 'ios', '--platform', 'ios'], ['--skip']]) {
    assert.throws(() => releaseCommandArgs('build', plan, args));
  }
  assert.throws(() => releaseCommandArgs('update', plan, []));
  assert.throws(() => releaseCommandArgs('submit', { ...plan, platform: 'android' }, []));
  assert.equal(releaseCommandArgs('customer-check', plan, []), null);
});
test('all npm EAS build/update entries route through gates', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  assert.equal(Object.values(scripts).filter(value => /^eas (build|update|submit)\b/.test(value)).length, 0);
  for (const name of ['build:prod:ios', 'build:prod:android', 'build:local:ios:dev', 'update:preview', 'update:development']) {
    assert.match(scripts[name], /^node scripts\/release-command.mjs /);
  }
});
test('real entrypoints without a plan fail before any EAS command (offline)', () => {
  for (const args of [['scripts/release-command.mjs', 'build'], ['scripts/release-command.mjs', 'update'],
    ['scripts/release-command.mjs', 'submit'], ['scripts/release-command.mjs', 'customer-check'],
    ['scripts/update-production.mjs', '--platform', 'ios', '--confirm', '--message', 'fixture']]) {
    const env = { ...process.env, PATH: '/nonexistent', ANYVO_RELEASE_PLAN: '' };
    const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stdout + result.stderr, /ANYVO_RELEASE_PLAN fehlt/);
    assert.doesNotMatch(result.stdout + result.stderr, /ENOENT/);
  }
});

test('full gate uses real Git, content, quality, resolved config, live read and device receipts', t => {
  const dir = mkdtempSync(join(tmpdir(), 'anyvo-entry-integration-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo'), bin = join(dir, 'bin'); mkdirSync(repo); mkdirSync(bin);
  const put = (path, value) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value)); };
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Release fixture'); git('config', 'user.email', 'fixture@example.invalid');
  put(join(repo, '.gitignore'), 'node_modules/\n'); put(join(repo, 'core.txt'), 'protected Build58 behavior');
  put(join(repo, 'task.md'), 'existing approved task');
  put(join(repo, 'eas.json'), { build: { customer: { environment: 'production', channel: 'production', developmentClient: false } } });
  git('add', '.'); git('commit', '-qm', 'fixture source'); const base = git('rev-parse', 'HEAD');
  const inventory = { schemaVersion: 1, scope: 'ANYVO_SHARED_FEATURE_BASELINE', complete: true, revision: 'one',
    preparedBy: 'writer', approvedBy: 'reviewer', protectedBaselines: [{ id: 'protected', sourceCommit: base, paths: ['core.txt'] }],
    packages: [{ id: 'core', state: 'released', sourceCommit: base, sourceFiles: ['core.txt'], platforms: ['ios'], taskReport: { commit: base, path: 'task.md' } }] };
  put(join(repo, 'inventory.json'), inventory); git('add', '.'); git('commit', '-qm', 'fixture inventory');
  const inventoryRef = { commit: git('rev-parse', 'HEAD'), path: 'inventory.json', sha256: digest(readFileSync(join(repo, 'inventory.json'))) };
  const channel = { id: 'production', branchMapping: 'production' }, list = { currentPage: [] };
  const policy = { schemaVersion: 1, complete: true, preparedBy: 'coordinator', approvedBy: 'reviewer', projectId: 'project',
    inventory: inventoryRef, openBlockers: [], live: [{ channel: 'production', branch: 'production', fingerprint: liveFingerprint(channel, list) }] };
  put(join(repo, 'docs/agent/release-policy.json'), policy); git('add', '.'); git('commit', '-qm', 'fixture policy');
  const head = git('rev-parse', 'HEAD'); git('update-ref', 'refs/anyvo/release-policy', head);
  const f = fixture(); const plan = { ...f.plan, operation: 'build', profile: 'customer', policyCommit: head, sourceCommit: head,
    inventory: inventoryRef, nativeSourceCommit: head, updateGroup: 'tested-group', manifest: 'manifest.json', qualityEvidence: 'quality.json', deviceEvidence: 'device.json' };
  put(join(dir, 'manifest.json'), { schemaVersion: 1, candidateCommit: head, platform: plan.platform, runtime: plan.runtime,
    inventory: inventoryRef, producer: 'writer', packages: [{ id: 'core', kind: 'ancestry' }] });
  put(join(dir, 'proof.log'), 'verified'); const evidence = { path: 'proof.log', sha256: digest('verified') };
  put(join(dir, 'quality.json'), { schemaVersion: 1, source: { commit: head, tree: git('rev-parse', 'HEAD^{tree}') },
    target: { platform: plan.platform, runtime: plan.runtime }, producer: 'writer',
    review: { status: 'PASS', sourceCommit: head, reviewer: 'reviewer', evidence },
    checks: { typecheck: { exitCode: 0, evidence }, diff: { exitCode: 0, evidence },
      eslint: { exitCode: 0, errors: 0, warnings: 0, evidence }, tests: { exitCode: 0, passed: 1, failed: 0, skipped: 0, evidence } } });
  const device = { ...f.receipt, ...plan, checks: Object.fromEntries(DEVICE_CASES.map(key => [key, { status: 'PASS', evidence }])) };
  put(join(dir, 'device.json'), device); put(join(dir, 'plan.json'), plan);
  const statePath = join(dir, 'live.json');
  const state = { channel, list, build: { id: plan.buildId, status: 'FINISHED', gitCommitHash: head, platform: 'IOS',
    runtime: { version: plan.runtime }, appVersion: plan.appVersion, appBuildVersion: plan.buildNumber },
    update: [{ id: plan.updateId, group: plan.updateGroup, gitCommitHash: head, platform: plan.platform, runtimeVersion: plan.runtime }] };
  put(statePath, state);
  put(join(bin, 'eas'), `#!${process.execPath}\nconst fs=require('fs');const s=JSON.parse(fs.readFileSync(${JSON.stringify(statePath)}));const k={'channel:view':'channel','update:list':'list','build:view':'build','update:view':'update'}[process.argv[2]];if(!k)process.exit(91);console.log(JSON.stringify(s[k]));\n`); chmodSync(join(bin, 'eas'), 0o755);
  put(join(repo, 'node_modules/.bin/expo'), `#!${process.execPath}\nconsole.log(JSON.stringify({runtimeVersion:${JSON.stringify(plan.runtime)},extra:{eas:{projectId:'project'}}}));\n`); chmodSync(join(repo, 'node_modules/.bin/expo'), 0o755);
  const previousPath = process.env.PATH, previousPlan = process.env.ANYVO_RELEASE_PLAN;
  process.env.PATH = `${bin}:${previousPath}`; process.env.ANYVO_RELEASE_PLAN = join(dir, 'plan.json');
  t.after(() => { process.env.PATH = previousPath; if (previousPlan === undefined) delete process.env.ANYVO_RELEASE_PLAN; else process.env.ANYVO_RELEASE_PLAN = previousPlan; });
  assert.equal(requireReleaseGate('build', { repositoryRoot: repo }).content.ok, true);
  plan.operation = 'production-ota'; put(join(dir, 'plan.json'), plan);
  assert.equal(requireReleaseGate('production-ota', { repositoryRoot: repo }).content.ok, true);
  state.update[0].gitCommitHash = base; put(statePath, state);
  assert.throws(() => requireReleaseGate('production-ota', { repositoryRoot: repo }), /getestete OTA/);
  state.update[0].gitCommitHash = head;
  state.list.currentPage.push({ group: 'new-old-runtime-ota', runtimeVersion: 'old-runtime', platforms: 'ios' }); put(statePath, state);
  assert.throws(() => requireReleaseGate('production-ota', { repositoryRoot: repo }), /Neuere\/geänderte OTA/);
  state.list.currentPage = []; put(statePath, state);
  put(join(repo, 'core.txt'), 'changed protected behavior');
  assert.throws(() => requireReleaseGate('production-ota', { repositoryRoot: repo }), /saubere/);
});
