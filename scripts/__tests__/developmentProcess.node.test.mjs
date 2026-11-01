import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { inspectNativeChanges as inspectNative, classifyNativePath } from '../check-native-changes.mjs';
import { reserveTask, finishReservation, readTaskRegistry, registryDirectory } from '../task-registry.mjs';
import { validateQualityEvidence } from '../release-quality-evidence.mjs';
import { parseWorktrees, worktreeRisk, matchingReportIdentity } from '../development-snapshot.mjs';

const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const inspectNativeChanges = options => inspectNative({ readPackage: () => '{}', ...options });
const fixture = t => { const dir = mkdtempSync(join(tmpdir(), 'anyvo-process-test-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };
const gitFixture = ({ committed = '', dirty = '', untracked = '', oldPackage = '{}', indexPackage = oldPackage } = {}) => args => {
  if (args[0] === 'rev-parse') return args.includes('--is-inside-work-tree') ? 'true' : sha;
  if (args[0] === 'diff') return args.includes(sha) ? committed : dirty;
  if (args[0] === 'ls-files') return untracked;
  if (args[0] === 'show') return args[1] === ':package.json' ? indexPackage : oldPackage;
  throw new Error('Unexpected Git invocation');
};

test('missing basis refuses before invoking Git', () => {
  assert.throws(() => inspectNativeChanges({ runGit: () => assert.fail('Git called') }));
});
test('invalid repository or missing revision fails closed', () => {
  assert.throws(() => inspectNativeChanges({ base: sha, runGit: () => { throw new Error('private stderr'); } }));
});
test('native module, generated project and patch paths cover both platforms', () => {
  for (const path of ['modules/location/ios/Manager.swift', 'ios/App/Info.plist']) assert.equal(classifyNativePath(path), 'ios');
  for (const path of ['modules/location/android/Module.kt', 'android/build.gradle.kts']) assert.equal(classifyNativePath(path), 'android');
  for (const path of ['modules/location/expo-module.config.json', 'scripts/patch-rn.cjs', 'app.config.mjs']) assert.equal(classifyNativePath(path), 'both');
  assert.equal(classifyNativePath('app/home.tsx'), null);
});
test('committed, staged/working and untracked native files all count', () => {
  const result = inspectNativeChanges({ base: sha, runGit: gitFixture({ committed: 'modules/a/ios/A.swift\0', dirty: 'modules/a/android/A.kt\0', untracked: 'scripts/patch-a.cjs\0' }) });
  assert.equal(result.hits.length, 3);
  assert.equal(result.requiresNativeBuild, true);
});
test('deleted/renamed native source is not hidden by rename detection', () => {
  const calls = []; const run = gitFixture({ committed: 'modules/old/ios/A.swift\0src/A.ts\0' });
  const result = inspectNativeChanges({ base: sha, runGit: args => { calls.push(args); return run(args); } });
  assert.equal(result.requiresNativeBuild, true);
  assert(calls.filter(a => a[0] === 'diff').every(a => a.includes('--no-renames') && a.includes('-z')));
});
test('dependency edit without lockfile still requires native review', () => {
  const result = inspectNativeChanges({ base: sha, runGit: gitFixture({ dirty: 'package.json\0', oldPackage: '{"dependencies":{"native":"1"}}' }), readPackage: () => '{"dependencies":{"native":"2"}}' });
  assert.equal(result.requiresNativeBuild, true);
});
test('scripts-only package change remains JS/tooling-only', () => {
  const result = inspectNativeChanges({ base: sha, runGit: gitFixture({ dirty: 'package.json\0', oldPackage: '{"dependencies":{"x":"1"}}' }), readPackage: () => '{"dependencies":{"x":"1"},"scripts":{"x":"test"}}' });
  assert.equal(result.requiresNativeBuild, false);
});
test('staged dependency cannot hide behind a reverted working copy', () => {
  const result = inspectNativeChanges({ base: sha, runGit: gitFixture({ dirty: 'package.json\0', indexPackage: '{"dependencies":{"native":"new"}}' }), readPackage: () => '{}' });
  assert.equal(result.requiresNativeBuild, true);
});
test('failed diff or invalid package never yields JS-only', () => {
  assert.throws(() => inspectNativeChanges({ base: sha, runGit: args => args[0] === 'rev-parse' ? (args.includes('--is-inside-work-tree') ? 'true' : sha) : (() => { throw new Error(); })() }));
  assert.throws(() => inspectNativeChanges({ base: sha, runGit: gitFixture({ dirty: 'package.json\0' }), readPackage: () => '{' }));
});

// Real synthetic repositories: never stage or commit in the actual ANYVO source.
function nativeGitFixture(t, initial) {
  const dir = fixture(t);
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=' + join(dir, 'no-hooks'), ...args], {
    cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0',
      GIT_AUTHOR_NAME: 'synthetic regression', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'synthetic regression', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  }).trim();
  const save = pkg => writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg) + '\n');
  const commit = pkg => { save(pkg);git('add', 'package.json');git('commit', '-qm', 'synthetic fixture');return git('rev-parse', 'HEAD'); };
  git('init', '-q', '-b', 'main');const base = commit(initial);
  return { dir, git, save, commit, base, inspect: () => inspectNative({ base, cwd: dir }) };
}
test('real Git HEAD dependency change stays native when index and working tree revert to base', t => {
  const original = { dependencies: { native: '1' } };const f = nativeGitFixture(t, original);
  f.commit({ dependencies: { native: '2' } });f.save(original);f.git('add', 'package.json');
  assert.equal(f.inspect().requiresNativeBuild, true);
});
test('real Git index and working dependency contracts are inspected independently', t => {
  for (const layer of ['index', 'working']) {
    const original = { dependencies: { native: '1' } };const f = nativeGitFixture(t, original);
    f.save({ dependencies: { native: '2' } });
    if (layer === 'index') { f.git('add', 'package.json');f.save(original); }
    assert.equal(f.inspect().requiresNativeBuild, true);
  }
});
test('real Git package autolinking and codegen changes each require native review', t => {
  for (const config of [{ expo: { autolinking: { exclude: ['expo-location'] } } }, { codegenConfig: { name: 'ChangedNativeSpec', type: 'modules', jsSrcsDir: 'src' } }]) {
    const f = nativeGitFixture(t, { dependencies: { native: '1' } });
    f.commit({ dependencies: { native: '1' }, ...config });
    assert.equal(f.git('status', '--porcelain'), '');assert.equal(f.inspect().requiresNativeBuild, true);
  }
});
test('real Git install and EAS build hook changes each require native review', t => {
  for (const hook of ['preinstall', 'postinstall', 'prepare', 'eas-build-pre-install', 'eas-build-post-install']) {
    const f = nativeGitFixture(t, { scripts: { [hook]: 'node scripts/old.cjs' } });
    f.commit({ scripts: { [hook]: 'node scripts/new.cjs' } });assert.equal(f.inspect().requiresNativeBuild, true);
  }
});
test('real Git stable build hook catches a changed referenced script', t => {
  const f = nativeGitFixture(t, { scripts: { postinstall: 'node scripts/setup.cjs' } });
  mkdirSync(join(f.dir, 'scripts'));writeFileSync(join(f.dir, 'scripts/setup.cjs'), '// synthetic native setup\n');
  assert.equal(f.inspect().requiresNativeBuild, true);
  assert(f.inspect().hits.some(hit => hit.path === 'scripts/setup.cjs'));
});
test('real Git lifecycle aliases cannot conceal changes to the named npm script', t => {
  const before = { scripts: { postinstall: 'npm run native:setup', 'native:setup': 'node scripts/old.cjs' } };
  const f = nativeGitFixture(t, before);
  f.commit({ scripts: { ...before.scripts, 'native:setup': 'node scripts/new.cjs' } });
  assert.equal(f.inspect().requiresNativeBuild, true);
});
test('real Git recursive aliases and chained paths catch changed referenced local scripts', t => {
  const f = nativeGitFixture(t, { scripts: { postinstall: 'npm run native:setup', 'native:setup': 'npm run native:first && npm run native:second',
    'native:first': 'node scripts/first.cjs', 'native:second': 'node tools/second.cjs' } });
  mkdirSync(join(f.dir, 'tools'));writeFileSync(join(f.dir, 'tools/second.cjs'), '// synthetic native setup\n');
  assert(f.inspect().hits.some(hit => hit.path === 'tools/second.cjs'));
});
test('real Git implicit pre/post alias scripts are part of the native hook contract', t => {
  const before = { scripts: { postinstall: 'npm run native:setup', 'native:setup': 'echo prepare', 'prenative:setup': 'echo before' } };
  const f = nativeGitFixture(t, before);
  f.commit({ scripts: { ...before.scripts, 'prenative:setup': 'node tools/generated-native.cjs' } });
  assert.equal(f.inspect().requiresNativeBuild, true);
});
test('real Git pnpm/yarn named local aliases are checked without executing commands', t => {
  for (const call of ['pnpm run native:setup', 'yarn run native:setup', 'pnpm native:setup', 'yarn native:setup', 'npm run --silent "native:setup"']) {
    const before = { scripts: { postinstall: call, 'native:setup': 'echo before' } };const f = nativeGitFixture(t, before);
    f.commit({ scripts: { ...before.scripts, 'native:setup': 'echo after' } });assert.equal(f.inspect().requiresNativeBuild, true);
  }
});
test('real Git missing, dynamic, cyclic and unsupported aliases fail closed', t => {
  for (const scripts of [{ postinstall: 'npm run missing' }, { postinstall: 'npm run $TARGET' },
    { postinstall: '$PKGMGR run native:setup', 'native:setup': 'echo unchanged' },
    { postinstall: 'npm run native:a', 'native:a': 'npm run native:b', 'native:b': 'npm run native:a' },
    { postinstall: 'npm --prefix other run setup' }, { postinstall: 'npm run --workspace other setup' }]) {
    const f = nativeGitFixture(t, { scripts });assert.throws(f.inspect);
  }
});
test('real Git unrelated test-script changes stay tooling-only even with stable lifecycle aliases', t => {
  const before = { scripts: { postinstall: 'npm run native:setup', 'native:setup': 'echo stable', test: 'old tests' } };
  const f = nativeGitFixture(t, before);f.commit({ scripts: { ...before.scripts, test: 'new tests' } });
  assert.equal(f.inspect().requiresNativeBuild, false);
});
test('real Git quoted and unsupported managers never silently pass a native alias change', t => {
  for (const command of ["'npm' run native:setup", '"npm" run native:setup', 'bun run native:setup',
    'corepack npm run native:setup', 'env npm run native:setup', 'sh -c native:setup']) {
    const before = { scripts: { postinstall: command, 'native:setup': 'node scripts/old.cjs' } };
    const f = nativeGitFixture(t, before);f.commit({ scripts: { ...before.scripts, 'native:setup': 'node scripts/new.cjs' } });
    assert.throws(f.inspect);
  }
});
test('real Git unsupported shell grammar and inline evaluation fail closed without execution', t => {
  for (const postinstall of ['node -e "process.exit(0)"', 'echo before | unknown-command', 'echo before &',
    'echo before > native-output', '(npm run setup)', 'echo before\necho after']) {
    const f = nativeGitFixture(t, { scripts: { postinstall } });assert.throws(f.inspect);
  }
});
test('real Git root React Native config is native with unchanged package contracts', t => {
  const f = nativeGitFixture(t, {});
  writeFileSync(join(f.dir, 'react-native.config.js'), 'module.exports = { dependencies: {} };\n');
  f.git('add', 'react-native.config.js');f.git('commit', '-qm', 'synthetic root native config');
  assert(f.inspect().hits.some(hit => hit.path === 'react-native.config.js' && hit.platform === 'both'));
});
test('real Git missing or malformed package snapshots fail closed', t => {
  for (const layer of ['HEAD', 'index', 'working', 'missing-working', 'missing-index']) {
    const f = nativeGitFixture(t, {});
    if (layer === 'missing-working') unlinkSync(join(f.dir, 'package.json'));
    else if (layer === 'missing-index') f.git('rm', '--cached', 'package.json');
    else {
      writeFileSync(join(f.dir, 'package.json'), '{');
      if (layer !== 'working') { f.git('add', 'package.json');if (layer === 'HEAD') f.git('commit', '-qm', 'synthetic malformed package');f.save({}); }
    }
    assert.throws(f.inspect);
  }
});
test('real Git ordinary test scripts remain tooling-only and bad package fails closed', t => {
  const f = nativeGitFixture(t, { scripts: { test: 'old test' } });
  f.commit({ scripts: { test: 'new test', 'test:process': 'node --test test.mjs' } });
  assert.equal(f.inspect().requiresNativeBuild, false);
  writeFileSync(join(f.dir, 'package.json'), '{');assert.throws(f.inspect);
});

const reservation = dir => ({ commonDir: dir, owner: 'workshop', purpose: 'isolated tooling', branch: 'chore/test', worktree: join(dir, 'worktree'), baseCommit: sha });
test('allocation preserves historical IDs and refuses duplicate explicit IDs', t => {
  const dir = fixture(t);const args = reservation(dir);
  const a = reserveTask({ ...args, existingIds: ['T-99'] });
  assert.equal(a.taskId, 'T-100');
  assert.throws(() => reserveTask({ ...args, requestedId: a.taskId }));
  finishReservation(dir, a, 'creation_failed');
  assert.equal(reserveTask(args).taskId, 'T-101');
  assert.equal(readTaskRegistry(dir)[0].status, 'creation_failed');
});
test('allocation rejects missing owner/purpose/basis before making registry', t => {
  const dir = fixture(t);
  assert.throws(() => reserveTask({ ...reservation(dir), owner: undefined }));
  assert.throws(() => reserveTask({ ...reservation(dir), purpose: '' }));
  assert.throws(() => reserveTask({ ...reservation(dir), baseCommit: 'missing' }));
  assert.equal(readdirSync(dir).length, 0);
});
test('foreign reservation cannot be updated', t => {
  const dir = fixture(t);const r = reserveTask(reservation(dir));
  assert.throws(() => finishReservation(dir, { ...r, reservationId: 'other' }, 'created'));
  assert.equal(readTaskRegistry(dir)[0].status, 'reserved');
});
test('unsafe numeric task IDs never allocate', t => {
  const dir = fixture(t);
  assert.throws(() => reserveTask({ ...reservation(dir), requestedId: 'T-999999999999999999999' }));
});
test('parallel processes reserve unique IDs without overwriting', async t => {
  const dir = fixture(t);
  const moduleUrl = new URL('../task-registry.mjs', import.meta.url).href;
  const code = 'import {reserveTask} from ' + JSON.stringify(moduleUrl) + ';const r=reserveTask(JSON.parse(process.argv[1]));process.stdout.write(r.taskId);';
  const ids = await Promise.all(Array.from({ length: 12 }, () => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', code, JSON.stringify(reservation(dir))], { stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';p.stdout.on('data', d => { text += d; });p.on('error', reject);p.on('exit', status => status === 0 ? resolve(text) : reject(new Error('allocator failed')));
  })));
  assert.equal(new Set(ids).size, 12);
  assert.equal(readdirSync(registryDirectory(dir)).length, 12);
});

function qualityFixture(t) {
  const dir = fixture(t);const repo = join(dir, 'repo');mkdirSync(repo);
  const log = join(dir, 'checks.log');writeFileSync(log, 'offline checks\n');
  const evidence = { path: 'checks.log', sha256: createHash('sha256').update(readFileSync(log)).digest('hex') };
  const receipt = { schemaVersion: 1, source: { commit: sha, tree }, target: { platform: 'ios', runtime: 'test-runtime' }, producer: 'writer',
    checks: { typecheck: { exitCode: 0, evidence }, eslint: { exitCode: 0, errors: 0, warnings: 11, evidence }, tests: { exitCode: 0, passed: 10, failed: 0, skipped: 0, evidence }, diff: { exitCode: 0, evidence } },
    review: { status: 'PASS', sourceCommit: sha, reviewer: 'reviewer', evidence } };
  const file = join(dir, 'receipt.json');
  const validate = () => { writeFileSync(file, JSON.stringify(receipt)); return validateQualityEvidence({ receiptPath: file, head: sha, tree, platform: 'ios', runtime: 'test-runtime', repositoryRoot: repo }); };
  return { repo, log, receipt, validate };
}
test('complete exact source/target evidence accepts known lint warnings', t => { assert.equal(qualityFixture(t).validate().ok, true); });
test('wrong commit, tree, platform or runtime fails', t => {
  const f = qualityFixture(t);
  for (const [object, key] of [[f.receipt.source, 'commit'], [f.receipt.source, 'tree'], [f.receipt.target, 'platform'], [f.receipt.target, 'runtime']]) {
    const old = object[key];object[key] = 'wrong';assert.equal(f.validate().ok, false);object[key] = old;
  }
});
test('each failed check, zero tests, or own review refuses evidence', t => {
  const f = qualityFixture(t);
  for (const check of Object.values(f.receipt.checks)) { check.exitCode = 1;assert.equal(f.validate().ok, false);check.exitCode = 0; }
  f.receipt.checks.tests.passed = 0;assert.equal(f.validate().ok, false);f.receipt.checks.tests.passed = 10;
  f.receipt.review.reviewer = 'writer';assert.equal(f.validate().ok, false);
});
test('reviewer identity normalization rejects padded, case and Unicode-equivalent self review', t => {
  const f = qualityFixture(t);
  for (const reviewer of [' writer ', '\tWRITER\n', 'ｗｒｉｔｅｒ', '   ', '']) {
    f.receipt.review.reviewer = reviewer;assert.equal(f.validate().ok, false);
  }
  f.receipt.producer = ' Writer  Team ';f.receipt.review.reviewer = 'writer team';assert.equal(f.validate().ok, false);
  f.receipt.producer = ' ';f.receipt.review.reviewer = 'reviewer';assert.equal(f.validate().ok, false);
});
test('changed artifacts and evidence in source tree fail closed', t => {
  const f = qualityFixture(t);writeFileSync(f.log, 'tampered');assert.equal(f.validate().ok, false);
  writeFileSync(f.log, 'offline checks\n');const inside = join(f.repo, '..evidence');mkdirSync(inside);writeFileSync(join(inside, 'proof.log'), 'offline checks\n');
  f.receipt.checks.typecheck.evidence = { ...f.receipt.checks.typecheck.evidence, path: join(inside, 'proof.log') };assert.equal(f.validate().ok, false);
});
test('missing receipt is refused without IO or external calls', () => {
  assert.equal(validateQualityEvidence({ head: sha, tree, platform: 'ios', runtime: 'x', repositoryRoot: '/unused' }).ok, false);
});
test('inventory preserves spaces and supports NUL-delimited Git paths', () => {
  const text = 'worktree /tmp/a b\0HEAD ' + sha + '\0branch refs/heads/test\0\0worktree /tmp/c\0HEAD ' + tree + '\0detached\0\0';
  const rows = parseWorktrees(text);
  assert.equal(rows.length, 2);assert.equal(rows[0].worktree, '/tmp/a b');assert.equal(rows[1].detached, true);
});
test('inventory classifies conflict, release WIP and unknown without cleanup', () => {
  const release = { branch: 'refs/heads/release/test' };
  assert.equal(worktreeRisk(release, ' M a\0'), 'DIRTY_RELEASE');
  assert.equal(worktreeRisk({}, ' M a\0'), 'DIRTY_TRACKED');
  assert.equal(worktreeRisk({}, '?? a\0'), 'UNTRACKED_ONLY');
  assert.equal(worktreeRisk({}, 'UU a\0'), 'CONFLICT');
  assert.equal(worktreeRisk({}, ''), 'CLEAN');assert.equal(worktreeRisk({}, null), 'UNKNOWN');
});
test('inventory accepts documented table owner only for the exact branch and worktree', t => {
  const dir = fixture(t);const reports = join(dir, 'docs/agent/tasks');mkdirSync(reports, { recursive: true });
  const report = '# T-1 — test\n| Branch | feature/test |\n| Worktree | ' + dir + ' |\n| Verantwortlicher Agent | assigned owner |\n';
  writeFileSync(join(reports, 'T-1.md'), report);
  assert.equal(matchingReportIdentity({ worktree: dir }, 'feature/test').owner, 'assigned owner');
  assert.equal(matchingReportIdentity({ worktree: dir }, 'feature/tes'), null);
  writeFileSync(join(reports, 'T-1.md'), report.replace('| ' + dir + ' |', '| /different/worktree |'));
  assert.equal(matchingReportIdentity({ worktree: dir }, 'feature/test'), null);
});
