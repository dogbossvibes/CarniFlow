import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  planChecks, findException, validateExceptions, isBundleRelevant, checkEntry, main,
} from '../check-ota-coverage.mjs';

const sha = n => String(n).repeat(40).slice(0, 40);
const entry = (o) => ({ branch: 'production', isRollBackToEmbedded: false, platform: 'ios',
  runtimeVersion: 'r1', group: 'g', message: 'm', createdAt: '2026-11-01T00:00:00Z', gitCommitHash: sha('a'), ...o });

test('planChecks orders per lane and uses previous OTA of same runtime as base', () => {
  const plan = planChecks([
    entry({ group: 'g2', createdAt: '2026-11-02T00:00:00Z', gitCommitHash: sha('b') }),
    entry({ group: 'g1', createdAt: '2026-11-01T00:00:00Z', gitCommitHash: sha('a') }),
    entry({ group: 'g3', runtimeVersion: 'r2', createdAt: '2026-11-03T00:00:00Z', gitCommitHash: sha('c') }),
  ]);
  assert.deepEqual(plan.map(p => [p.group, p.base]), [['g1', null], ['g2', sha('a')], ['g3', null]]);
});

test('planChecks skips rollbacks, other branches, missing commits and filters platform/since', () => {
  const plan = planChecks([
    entry({ group: 'rb', isRollBackToEmbedded: true }),
    entry({ group: 'pv', branch: 'preview' }),
    entry({ group: 'nc', gitCommitHash: null }),
    entry({ group: 'an', platform: 'android' }),
    entry({ group: 'old', createdAt: '2026-10-01T00:00:00Z', gitCommitHash: sha('d') }),
    entry({ group: 'ok', createdAt: '2026-11-05T00:00:00Z', gitCommitHash: sha('e') }),
  ], { platform: 'ios', since: '2026-11-01' });
  assert.deepEqual(plan.map(p => p.group), ['ok']);
  assert.equal(plan[0].base, sha('d'), 'older OTA still serves as base');
});

test('exceptions match by group, commit or runtime and require a reason', () => {
  const e = entry({ group: 'gx', gitCommitHash: sha('f'), runtimeVersion: 'old-rt' });
  assert.ok(findException([{ group: 'gx' }], e));
  assert.ok(findException([{ commit: sha('f') }], e));
  assert.ok(findException([{ runtimeVersion: 'old-rt', platform: 'ios' }], e));
  assert.equal(findException([{ runtimeVersion: 'old-rt', platform: 'android' }], e), undefined);
  assert.equal(validateExceptions([{ group: 'gx', reason: 'kurz', decidedBy: 'x', date: 'd' }]).length, 1);
  assert.equal(validateExceptions([{ reason: 'ausreichend begründet', decidedBy: 'x', date: 'd' }]).length, 1);
  assert.deepEqual(validateExceptions([{ group: 'gx', reason: 'durch Build 58 ersetzt', decidedBy: 'Nutzer', date: '2026-11-09' }]), []);
});

test('docs, scripts and tests are not bundle relevant', () => {
  assert.equal(isBundleRelevant('docs/agent/X.md'), false);
  assert.equal(isBundleRelevant('scripts/update-production.mjs'), false);
  assert.equal(isBundleRelevant('features/a/__tests__/b.test.ts'), false);
  assert.equal(isBundleRelevant('app/(tabs)/training.tsx'), true);
  assert.equal(isBundleRelevant('locales/de.json'), true);
});

function repoFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ota-cov-test-'));
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@example.invalid'); g('config', 'user.name', 't');
  mkdirSync(join(dir, 'app'));
  writeFileSync(join(dir, 'app/a.ts'), 'line1\nline2\nline3\n');
  writeFileSync(join(dir, 'app/b.ts'), 'b1\n');
  g('add', '.'); g('commit', '-qm', 'base');
  const base = g('rev-parse', 'HEAD');
  return { dir, g, base, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function gitFor(dir) {
  const git = (args, opts = {}) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
  git.repo = dir;
  return git;
}

test('checkEntry: ancestor, ported content and missing OTA', () => {
  const { dir, g, base, cleanup } = repoFixture();
  try {
    // OTA on a release branch
    g('switch', '-qc', 'release');
    writeFileSync(join(dir, 'app/a.ts'), 'line1\nline2 OTA\nline3\n');
    g('commit', '-qam', 'ota fix');
    const ota = g('rev-parse', 'HEAD');
    // Candidate 1: descends from OTA
    writeFileSync(join(dir, 'app/b.ts'), 'b2\n'); g('commit', '-qam', 'later');
    const desc = g('rev-parse', 'HEAD');
    // Candidate 2: separate line that ported the change (cherry-pick style) plus more edits
    g('switch', '-q', 'main');
    writeFileSync(join(dir, 'app/a.ts'), 'line0\nline1\nline2 OTA\nline3\n'); g('commit', '-qam', 'ported');
    const ported = g('rev-parse', 'HEAD');
    // Candidate 3: separate line without the change
    g('switch', '-qc', 'other', base);
    writeFileSync(join(dir, 'app/b.ts'), 'b3\n'); g('commit', '-qam', 'unrelated');
    const missing = g('rev-parse', 'HEAD');

    const git = gitFor(dir);
    const idx = join(dir, '.git', 'tmp-index');
    const e = entry({ gitCommitHash: ota, base });
    assert.equal(checkEntry(git, e, desc, idx).via, 'Vorfahre');
    assert.equal(checkEntry(git, e, ported, idx).status, 'ENTHALTEN');
    const r = checkEntry(git, e, missing, idx);
    assert.equal(r.status, 'FEHLT');
    assert.deepEqual(r.files, ['app/a.ts']);
    assert.equal(g('status', '--porcelain'), '', 'worktree untouched');
  } finally { cleanup(); }
});

test('main: exit 1 for missing OTA, exit 0 once excepted, exit 2 without ledger', () => {
  const { dir, g, base, cleanup } = repoFixture();
  try {
    g('switch', '-qc', 'release');
    writeFileSync(join(dir, 'app/a.ts'), 'changed\n'); g('commit', '-qam', 'ota');
    const ota = g('rev-parse', 'HEAD');
    g('switch', '-q', 'main');
    const log = console.log; const err = console.error; console.log = () => {}; console.error = () => {};
    try {
      assert.equal(main(['--candidate', 'main'], dir), 2);
      mkdirSync(join(dir, 'docs/agent'), { recursive: true });
      writeFileSync(join(dir, 'docs/agent/ota-ledger.json'), JSON.stringify([entry({ gitCommitHash: ota, base })]));
      assert.equal(main(['--candidate', 'main'], dir), 1);
      writeFileSync(join(dir, 'docs/agent/ota-coverage-exceptions.json'),
        JSON.stringify([{ commit: ota, reason: 'Test: bewusst nicht übernommen', decidedBy: 'Test', date: '2026-11-09' }]));
      assert.equal(main(['--candidate', 'main'], dir), 0);
      assert.equal(main(['--bogus'], dir), 2);
    } finally { console.log = log; console.error = err; }
  } finally { cleanup(); }
});
