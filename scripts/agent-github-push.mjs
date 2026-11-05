#!/usr/bin/env node
// Upload only an already reviewed, committed task branch. Never merge or release.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const SHA_RE = /^[0-9a-f]{40}$/;
const REPO_URL = 'https://github.com/dogbossvibes/CarniFlow';

export function isSafeTaskBranch(branch) {
  if (!branch || !/^[a-zA-Z0-9._/-]+$/.test(branch) || branch.includes('..')) return false;
  if (/^(main|master|production|develop|development)$/i.test(branch)) return false;
  if (/^(release|hotfix|integration|backup)\//i.test(branch)) return false;
  return branch.includes('/'); // Task namespace required; avoid unnamed/shared branches.
}

export function isExpectedOrigin(url) {
  return /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)dogbossvibes\/CarniFlow(?:\.git)?\/?$/i.test((url || '').trim());
}

export function parseRemoteHead(text, branch) {
  const rows = text.trim().split('\n').filter(Boolean);
  if (rows.length === 0) return null;
  const ref = `refs/heads/${branch}`;
  if (rows.length !== 1) throw Error('Mehrdeutige Remote-Antwort: STOP.');
  const [sha, name] = rows[0].trim().split(/\s+/);
  if (!SHA_RE.test(sha || '') || name !== ref) throw Error('Ungültiger Remote-Branch: STOP.');
  return sha;
}

export function performUpload(git) {
  // No writes or remote commands before local safety checks.
  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
  if (!isSafeTaskBranch(branch)) throw Error('Kein isolierter Task-Branch (oder geschützter Branch): STOP.');
  const origin = git(['remote', 'get-url', 'origin']).trim();
  if (!isExpectedOrigin(origin)) throw Error('Unerwartetes Git-Remote; nur dogbossvibes/CarniFlow zugelassen: STOP.');
  const dirty = git(['status', '--porcelain=v1', '--untracked-files=all']).trim();
  if (dirty) throw Error('Worktree ist nicht sauber; uncommittete/untracked Dateien bleiben lokal: STOP.');
  const head = git(['rev-parse', '--verify', 'HEAD']).trim();
  if (!SHA_RE.test(head)) throw Error('Ungültiger lokaler HEAD: STOP.');

  // Refresh remote-tracking facts; do not touch branches or edit files.
  git(['fetch', '--no-tags', 'origin']);
  const remoteMain = git(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}']).trim();
  if (!SHA_RE.test(remoteMain)) throw Error('Remote main nicht prüfbar: STOP.');
  const ref = `refs/heads/${branch}`;
  const remoteSha = parseRemoteHead(git(['ls-remote', '--heads', 'origin', ref]), branch);
  if (remoteSha) {
    const fetched = git(['rev-parse', '--verify', `refs/remotes/origin/${branch}^{commit}`]).trim();
    if (fetched !== remoteSha) throw Error('Remote-Branch änderte sich während des Preflights: STOP.');
    try { git(['merge-base', '--is-ancestor', remoteSha, head]); }
    catch { throw Error('Remote-Branch ist nicht Vorfahre von HEAD: STOP; kein Force-Push.'); }
  }

  git(['push', '--porcelain', '--set-upstream', 'origin', `HEAD:${ref}`]);
  const confirmed = parseRemoteHead(git(['ls-remote', '--heads', 'origin', ref]), branch);
  if (confirmed !== head) throw Error('Push wurde nicht durch identischen GitHub-HEAD bestätigt: STOP.');
  return { branch, head, main: remoteMain, url: `${REPO_URL}/tree/${branch}` };
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(), encoding: 'utf8', maxBuffer: 5 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw Error('Keine Parameter zulässig; nur geprüfte, bereits commitete Task-Branches hochladen.');
    const result = performUpload(runGit);
    console.log(`GitHub-Push bestätigt: ${result.branch} @ ${result.head}`);
    console.log(result.url);
    console.log('Kein Merge, keine OTA, kein Build und kein Release durchgeführt.');
  } catch (e) {
    console.error(`GitHub-Upload abgebrochen: ${e.message}`);
    process.exitCode = 1;
  }
}
