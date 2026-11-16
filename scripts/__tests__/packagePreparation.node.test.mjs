import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, renameSync, realpathSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// Die fünf Tests zum --check-Modus von scripts/patch-expo-task-manager.cjs galten der
// Variante für expo-task-manager 14.0.9 (SDK 54). Mit der Zusammenführung von main und
// der iOS-60-Linie gilt die SDK-58-Variante (58.0.13, prüfsummengesichert), die keinen
// --check-Modus hat; der Build-Check läuft dort über scripts/native-map-crash-check.mjs.
test('GitHub und lokaler Preflight führen alle Prozessregressionen aus', () => {
  const workflow = readFileSync(join(root, '.github/workflows/anyvo-quality-gate.yml'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(workflow, /run: npm run test:process/);
  assert(pkg.scripts['test:process'].includes('developmentProcess.node.test.mjs'));
  assert(pkg.scripts['test:process'].includes('packagePreparation.node.test.mjs'));
  assert.match(readFileSync(join(root, 'scripts/preflight.mjs'), 'utf8'), /run\('npm run test:process'\)/);
});
test('Quality Gate überspringt die Vollprüfung nur bei ausschliesslich .md-Änderungen', () => {
  const workflow = readFileSync(join(root, '.github/workflows/anyvo-quality-gate.yml'), 'utf8');
  // Klassifizierung: jede geänderte Datei muss auf .md enden, leere Liste zählt nicht als Doku.
  assert(workflow.includes(`if [[ -n "$changed" ]] && ! grep -qvE '\\.md$' <<<"$changed"; then`));
  // Commit-/Whitespace-Prüfung läuft immer (kein if vor der Klassifizierung).
  const beforeScope = workflow.slice(0, workflow.indexOf('Classify change scope'));
  assert(!beforeScope.includes('steps.scope.outputs.docs_only'));
  // Alle schweren Schritte sind an docs_only != 'true' gebunden.
  for (const name of ['Set up Node.js 22', 'Install dependencies exactly from package-lock',
    'Offline process and package regression tests', 'TypeScript typecheck', 'ESLint', 'Complete Jest test suite']) {
    assert(workflow.includes(`- name: ${name}\n        if: steps.scope.outputs.docs_only != 'true'\n`), name);
  }
  // Neuer Push auf denselben PR bricht den alten Lauf ab.
  assert.match(workflow, /cancel-in-progress: true/);
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
