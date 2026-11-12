import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeTaskBranch, isExpectedOrigin, parseRemoteHead, performUpload } from '../agent-github-push.mjs';

const SHA = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const REMOTE = 'c'.repeat(40);
const BRANCH = 'codex/safe-sync';

function fixture({ branch = BRANCH, origin = 'git@github.com:dogbossvibes/CarniFlow.git', dirty = '', remote = null, fetched = remote, ancestor = true, confirmed = SHA } = {}) {
  const calls = [];
  const git = args => {
    calls.push(args);
    if (args[0] === 'symbolic-ref') return branch;
    if (args[0] === 'remote') return origin;
    if (args[0] === 'status') return dirty;
    if (args[0] === 'fetch') return '';
    if (args[0] === 'merge-base') {
      if (!ancestor) throw Error('not ancestor');
      return '';
    }
    if (args[0] === 'push') return '';
    if (args[0] === 'ls-remote') {
      const pushes = calls.filter(x => x[0] === 'push').length;
      const sha = pushes > 0 ? confirmed : remote;
      return sha ? `${sha}\trefs/heads/${branch}\n` : '';
    }
    if (args[0] === 'rev-parse') {
      if (args.includes('HEAD')) return SHA;
      if (args.some(x => x.includes('origin/main'))) return MAIN;
      return fetched;
    }
    throw Error(`Unexpected Git command: ${args.join(' ')}`);
  };
  return { git, calls };
}

test('nur Task-Branches; nie main, release, backup, integration oder hotfix', () => {
  for (const branch of ['main', 'master', 'production', 'release/ios57', 'integration/test', 'backup/tmp', 'hotfix/live', 'feature', 'foo..bar', '']) {
    assert.equal(isSafeTaskBranch(branch), false, branch);
  }
  for (const branch of ['codex/foo', 'fix/foo', 'feat/foo', 'ci/test-upload']) assert.equal(isSafeTaskBranch(branch), true, branch);
});

test('nur erwartete GitHub-Remote-URL ohne Zugangsdaten', () => {
  for (const url of ['git@github.com:dogbossvibes/CarniFlow.git', 'https://github.com/dogbossvibes/CarniFlow', 'ssh://git@github.com/dogbossvibes/CarniFlow.git']) assert(isExpectedOrigin(url));
  for (const url of ['https://token@github.com/dogbossvibes/CarniFlow', 'git@github.com:other/CarniFlow.git', '/tmp/mock.git', 'https://evil.example/foo']) assert(!isExpectedOrigin(url));
});

test('Remote-Ref wird exakt und mit gültiger SHA geparst', () => {
  assert.equal(parseRemoteHead('', BRANCH), null);
  assert.equal(parseRemoteHead(`${REMOTE}\trefs/heads/${BRANCH}\n`, BRANCH), REMOTE);
  assert.throws(() => parseRemoteHead(`${REMOTE}\trefs/heads/main\n`, BRANCH));
  assert.throws(() => parseRemoteHead(`bad\trefs/heads/${BRANCH}\n`, BRANCH));
});

test('sauberer neuer Task-Branch wird normal gepusht und verifiziert', () => {
  const f = fixture();
  const res = performUpload(f.git);
  assert.equal(res.head, SHA);
  assert.equal(res.branch, BRANCH);
  assert.deepEqual(f.calls.find(x => x[0] === 'push'), ['push', '--porcelain', '--set-upstream', 'origin', `HEAD:refs/heads/${BRANCH}`]);
  assert(f.calls.findIndex(x => x[0] === 'fetch') < f.calls.findIndex(x => x[0] === 'push'));
});

test('remote Task-Branch darf nur Fast-Forward erfahren', () => {
  const f = fixture({ remote: REMOTE });
  performUpload(f.git);
  assert(f.calls.some(x => x[0] === 'merge-base' && x.includes(REMOTE)));
});

test('Branchschutz, falsches Remote und Dirty Worktree stoppen vor Netzwerkzugriff', () => {
  for (const options of [{ branch: 'main' }, { origin: 'https://evil.example/other.git' }, { dirty: ' M app/index.tsx' }]) {
    const f = fixture(options);
    assert.throws(() => performUpload(f.git));
    assert(!f.calls.some(x => ['fetch', 'push', 'ls-remote'].includes(x[0])));
  }
});

test('divergierte oder während des Preflights veränderte Remote stoppt vor Push', () => {
  for (const opts of [{ remote: REMOTE, ancestor: false }, { remote: REMOTE, fetched: SHA }]) {
    const f = fixture(opts);
    assert.throws(() => performUpload(f.git));
    assert(!f.calls.some(x => x[0] === 'push'));
  }
});

test('fehlender GitHub-HEAD nach Push ist kein bestätigter Upload', () => {
  const f = fixture({ confirmed: REMOTE });
  assert.throws(() => performUpload(f.git), /nicht.*bestätigt/);
});
