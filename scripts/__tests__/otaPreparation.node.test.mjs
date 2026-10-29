import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyDelivery } from '../ota-delivery.mjs';
import { runReleaseQuality } from '../ota-preflight.mjs';

const bytes = Buffer.from('synthetic bundle; never a real app');
const sha = b => createHash('sha256').update(b).digest('hex');
const candidate = () => ({ context: { target: { platform: 'ios', runtime: 'fixture', updatesUrl: 'https://u.expo.dev/fixture' } },
  plan: { bundle: { launchAsset: { sha256: sha(bytes) }, assets: [] } } });
function transport(change = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('assets.eascdn.net')) return new Response(change.bytes ?? bytes);
    return Response.json({ id: 'fixture-update', runtimeVersion: 'fixture', launchAsset: { url: 'https://assets.eascdn.net/fixture', hash: createHash('sha256').update(bytes).digest('base64url') }, assets: [], ...change.manifest });
  };
  return { calls, fetchImpl };
}
test('delivery verifies exact manifest, bundle bytes and platform/runtime request', async () => {
  const t = transport();const result = await verifyDelivery({ candidate: candidate(), updateId: 'fixture-update', fetchImpl: t.fetchImpl });
  assert.equal(result.status, 'PASS');assert.equal(result.launchSHA256, sha(bytes));
  assert.equal(t.calls[0].options.headers['expo-platform'], 'ios');assert.equal(t.calls[0].options.headers['expo-runtime-version'], 'fixture');
  assert.equal(t.calls[0].options.redirect, 'error');
});
test('unavailable CDN, wrong ID/runtime/hash, missing assets and unsupported hosts fail closed', async () => {
  for (const change of [{ manifest: { id: 'other' } }, { manifest: { runtimeVersion: 'other' } }, { bytes: Buffer.from('other') },
    { manifest: { launchAsset: { url: 'https://untrusted.example/a' } } }, { manifest: { assets: [{}] } }]) {
    await assert.rejects(() => verifyDelivery({ candidate: candidate(), updateId: 'fixture-update', fetchImpl: transport(change).fetchImpl }));
  }
  await assert.rejects(() => verifyDelivery({ candidate: candidate(), updateId: 'fixture-update', fetchImpl: async () => new Response('offline', { status: 503 }) }));
  const c = candidate();c.plan.bundle.launchAsset.sha256 = '0'.repeat(64);
  await assert.rejects(() => verifyDelivery({ candidate: c, updateId: 'fixture-update', fetchImpl: transport().fetchImpl }));
  const d = candidate();d.plan.bundle.assets.push({ sha256: sha(bytes) });
  await assert.rejects(() => verifyDelivery({ candidate: d, updateId: 'fixture-update', fetchImpl: transport().fetchImpl }));
});

function runnerFixture(t, fail = '') {
  const dir = mkdtempSync(join(tmpdir(), 'anyvo-local-quality-'));t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'repo');mkdirSync(root);mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, 'tests', 'fixture.test.ts'), '// synthetic test path\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { typecheck: 'tsc --noEmit', lint: 'expo lint', test: 'jest', 'test:process': 'node --test scripts/__tests__/developmentProcess.node.test.mjs scripts/__tests__/otaCandidate.node.test.mjs scripts/__tests__/otaPreparation.node.test.mjs' } }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const npm = join(dir, 'npm');
  writeFileSync(npm, `#!/usr/bin/env node
    const fs=require('fs'),a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(join(dir, 'commands.jsonl'))},JSON.stringify(a)+'\\n');
    if(a.includes(${JSON.stringify(fail || 'never')})){process.stderr.write('synthetic check error');process.exit(1);}
    if(a[0]==='test')fs.writeFileSync(a[a.indexOf('--outputFile')+1],JSON.stringify({success:true,numPassedTests:3,numFailedTests:0,numFailedTestSuites:0,numPendingTests:0}));
    process.stdout.write(${JSON.stringify(fail)}==='lint-success-with-errors'&&a.includes('lint')?'1 error, 0 warnings':'synthetic quality output');`, { mode: 0o700 });
  const originalPath = process.env.PATH;process.env.PATH = dir + ':' + originalPath;t.after(() => { process.env.PATH = originalPath; });
  const args = { root, directory: join(dir, 'quality'), source: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }, target: { platform: 'android', runtime: 'fixture' },
    plan: { producer: 'fixture-writer', review: { sourceCommit: 'a'.repeat(40), reviewer: 'fixture-independent' }, testPaths: ['tests/fixture.test.ts'] }, fullSuite: false };
  return { dir, root, args, calls: () => readFileSync(join(dir, 'commands.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) };
}
test('central runner records all required checks and relevant-test selection', t => {
  const f = runnerFixture(t);const result = JSON.parse(readFileSync(runReleaseQuality(f.args), 'utf8'));
  assert.equal(result.checks.eslint.exitCode, 0);assert.equal(result.checks.tests.passed, 3);assert.equal(result.checks.tests.fullSuite, false);
  assert.deepEqual(Object.keys(result.checks), ['typecheck', 'eslint', 'process', 'tests', 'diff']);
  assert(f.calls().at(-1).includes('--runTestsByPath'));assert(f.calls().every(c => !c.includes('update') && !c.includes('build')));
});
test('ESLint errors stop preparation before Jest and cannot count as PASS', t => {
  const f = runnerFixture(t, 'lint');assert.throws(() => runReleaseQuality(f.args), /LOCAL_CHECK_FAILED_eslint/);
  assert.equal(f.calls().length, 2);
});
test('full-suite risk mode cannot silently select only relevant tests', t => {
  const f = runnerFixture(t);runReleaseQuality({ ...f.args, fullSuite: true });assert(!f.calls().at(-1).includes('--runTestsByPath'));
});
test('reported ESLint errors cannot pass through a zero-exit CLI', t => {
  const f = runnerFixture(t, 'lint-success-with-errors');assert.throws(() => runReleaseQuality(f.args), /ESLINT_REPORTED_ERRORS/);
  assert.equal(f.calls().length, 2);
});
test('changed quality command contract cannot be replaced by an echo-success script', t => {
  const f = runnerFixture(t);writeFileSync(join(f.root, 'package.json'), JSON.stringify({ scripts: { typecheck: 'echo passed', lint: 'expo lint', test: 'jest', 'test:process': 'node --test scripts/__tests__/developmentProcess.node.test.mjs scripts/__tests__/otaCandidate.node.test.mjs scripts/__tests__/otaPreparation.node.test.mjs' } }));
  assert.throws(() => runReleaseQuality(f.args), /QUALITY_COMMAND_CONTRACT_CHANGED/);
});
