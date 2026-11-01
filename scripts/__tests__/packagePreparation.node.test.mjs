import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, renameSync, realpathSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const patcher = readFileSync(join(root, 'scripts/patch-expo-task-manager.cjs'), 'utf8');
const fixtureSource = [
  'import android.os.Handler;', 'import java.util.UUID;',
  'private static final Map<String, TaskExecutionCallback> sTaskCallbacks = new HashMap<>();',
  'TaskExecutionCallback taskCallback = sTaskCallbacks.get(eventId);',
  'sTaskCallbacks.put(eventId, callback);',
].join('\n');
function runPatcher(source, args = [], version = '14.0.9') {
  let writes = 0; let dependencyReads = 0; let result = source; let error;
  const fakeRequire = id => {
    if (id === 'node:fs') return { readFileSync: () => result, writeFileSync: (_path, value) => { writes++; result = value; } };
    if (id === 'node:path') return { dirname: () => '/synthetic', join: (...parts) => parts.join('/') };
    dependencyReads++; return { version };
  };
  fakeRequire.resolve = () => '/synthetic/package.json';
  try { vm.runInNewContext(patcher, { require: fakeRequire, process: { argv: ['node', 'patcher', ...args] }, console: { log() {} } }); }
  catch (value) { error = value; }
  return { writes, dependencyReads, source: result, error };
}

test('Checkmodus lehnt ungepatchte Quelle ohne Schreibaktion ab', () => {
  const r = runPatcher(fixtureSource, ['--check']);
  assert.match(r.error?.message ?? '', /missing or incomplete/);assert.equal(r.writes, 0);assert.equal(r.source, fixtureSource);
});
test('Checkmodus lehnt teilweise gepatchte Quelle ohne Reparatur ab', () => {
  const partial = fixtureSource.replace('import android.os.Handler;', 'import android.os.Handler;\nimport android.os.Looper;');
  const r = runPatcher(partial, ['--check']);assert(r.error);assert.equal(r.writes, 0);assert.equal(r.source, partial);
});
test('Normalmodus bleibt idempotent und Checkmodus akzeptiert vollständig gepatchte Quelle', () => {
  const patched = runPatcher(fixtureSource);assert.equal(patched.error, undefined);assert.equal(patched.writes, 1);
  assert.match(patched.source, /ConcurrentHashMap/);assert.match(patched.source, /postDelayed/);
  const checked = runPatcher(patched.source, ['--check']);assert.equal(checked.error, undefined);assert.equal(checked.writes, 0);
  const repeated = runPatcher(patched.source);assert.equal(repeated.error, undefined);assert.equal(repeated.writes, 0);
});
test('Unbekannte oder wiederholte Argumente scheitern vor Dependencyzugriff', () => {
  for (const args of [['--unknown'], ['--check', '--check'], ['--check', '--write']]) {
    const r = runPatcher(fixtureSource, args);assert.match(r.error?.message ?? '', /Usage/);assert.equal(r.writes, 0);assert.equal(r.dependencyReads, 0);
  }
});
test('Fremde Version und unerwartete Patchstelle verändern keine Quelle', () => {
  for (const [source, version] of [[fixtureSource, '99.0.0'], [fixtureSource.replace('import java.util.UUID;', ''), '14.0.9']]) {
    const r = runPatcher(source, [], version);assert(r.error);assert.equal(r.writes, 0);assert.equal(r.source, source);
  }
});
test('GitHub und lokaler Preflight führen alle Prozessregressionen aus', () => {
  const workflow = readFileSync(join(root, '.github/workflows/anyvo-quality-gate.yml'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(workflow, /run: npm run test:process/);
  assert(pkg.scripts['test:process'].includes('developmentProcess.node.test.mjs'));
  assert(pkg.scripts['test:process'].includes('packagePreparation.node.test.mjs'));
  assert.match(readFileSync(join(root, 'scripts/preflight.mjs'), 'utf8'), /run\('npm run test:process'\)/);
});
function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'anyvo-snapshot-regression-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=' + join(dir, 'no-hooks'), ...args], {
    cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0',
      GIT_AUTHOR_NAME: 'synthetic regression', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'synthetic regression', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  });
  git('init', '-q', '-b', 'main');writeFileSync(join(repo, 'AGENTS.md'), '# Synthetic fixture\n');
  git('add', 'AGENTS.md');git('commit', '-qm', 'synthetic fixture');const head = git('rev-parse', 'HEAD').trim();
  const cli = out => spawnSync(process.execPath, [join(root, 'scripts/development-snapshot.mjs'), '--root', repo, '--base', head, '--out', out], { encoding: 'utf8', timeout: 60000 });
  const state = () => [git('show-ref'), git('status', '--porcelain=v1', '-z'), readFileSync(join(repo, 'AGENTS.md'), 'utf8')];
  return { dir, repo, git, head, cli, state };
}
test('Snapshot lehnt Worktree- und Git-interne Ausgaben ohne Schreiben ab', t => {
  const f = fixture(t);const before = f.state();
  for (const out of [join(f.repo, 'blocked'), join(f.repo, '.git/blocked')]) {
    assert.equal(f.cli(out).status, 2);assert.equal(existsSync(out), false);
  }
  assert.deepEqual(f.state(), before);
});
test('Vollständiger externer Snapshot bindet Quellen und erhält Gitstatus', t => {
  const f = fixture(t);const before = f.state();const out = join(f.dir, 'snapshot');
  const r = f.cli(out);assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(readFileSync(join(out, 'SNAPSHOT.json'), 'utf8'));
  assert.equal(data.baseCommit, f.head);assert.equal(data.summary.count, 1);
  assert.equal(data.observation.worktreeStatusesComplete, true);
  assert.equal(readFileSync(join(out, 'canonical-documents/AGENTS.md'), 'utf8'), '# Synthetic fixture\n');
  assert.deepEqual(f.state(), before);
});
test('Nicht lesbarer registrierter Worktree ergibt Teilbericht und Exit zwei', t => {
  const f = fixture(t);const missing = join(f.dir, 'missing');
  f.git('worktree', 'add', '--no-checkout', '--detach', missing, f.head);renameSync(missing, join(f.dir, 'owned-moved-fixture'));
  const before = f.state();const out = join(f.dir, 'incomplete');const r = f.cli(out);
  assert.equal(r.status, 2, r.stderr);
  const data = JSON.parse(readFileSync(join(out, 'SNAPSHOT.json'), 'utf8'));
  assert.equal(data.observation.worktreeStatusesComplete, false);assert.equal(data.summary.classes.UNKNOWN, 1);
  assert.equal(JSON.parse(r.stdout).worktreeStatusesComplete, false);assert.deepEqual(f.state(), before);
});
