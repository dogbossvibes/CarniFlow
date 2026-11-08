#!/usr/bin/env node
// ANYVO SessionStart-Hook: gibt Claude zu Beginn den tatsächlichen Arbeitskontext.
// Ausschliesslich lesend und lokal: kein fetch, kein Schreiben, keine Secrets.
// Ausgabe (stdout) wird von Claude Code als Sitzungskontext übernommen.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Kein fest eingetragener Benutzerpfad (öffentliches Repo); per Umgebungsvariable überschreibbar.
const MAIN_WORKTREE = process.env.ANYVO_MAIN_WORKTREE || join(homedir(), 'canisflow-worktrees', 'anyvo-main');

function git(cwd, ...args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    }).trim();
  } catch { return null; }
}

export function summarizeStatus(porcelain) {
  const lines = (porcelain || '').split('\n').filter(Boolean);
  return {
    modified: lines.filter((l) => !l.startsWith('??')).length,
    untracked: lines.filter((l) => l.startsWith('??')).length,
  };
}

export function buildContext(cwd) {
  const root = git(cwd, 'rev-parse', '--show-toplevel');
  if (!root) return 'ANYVO-Kontext: kein Git-Repository im Arbeitsverzeichnis gefunden.';
  const branch = git(root, 'branch', '--show-current') || '(detached HEAD)';
  const head = git(root, 'rev-parse', '--short', 'HEAD') || '?';
  const { modified, untracked } = summarizeStatus(git(root, 'status', '--porcelain=v1'));
  const counts = git(root, 'rev-list', '--left-right', '--count', 'origin/main...HEAD');
  const [behind, ahead] = counts ? counts.split(/\s+/).map(Number) : [null, null];
  const lastFetch = git(root, 'log', '-1', '--format=%cr', 'origin/main');
  const tasksDir = join(root, 'docs/agent/tasks');
  const reports = existsSync(tasksDir)
    ? readdirSync(tasksDir).filter((f) => /^T-\d+\.md$/.test(f) && git(root, 'status', '--porcelain', '--', `docs/agent/tasks/${f}`))
    : [];
  const out = [
    'ANYVO-Arbeitskontext (automatisch, lesend erhoben):',
    `- Worktree: ${root}`,
    `- Branch: ${branch} @ ${head}`,
    `- Lokale Änderungen: ${modified} geändert, ${untracked} unversioniert${modified + untracked ? ' — nicht als eigene Arbeit annehmen, nicht überschreiben' : ''}`,
  ];
  if (behind !== null) out.push(`- Gegenüber origin/main (lokaler Stand, letzter main-Commit ${lastFetch}): ${behind} zurück, ${ahead} voraus${behind > 50 ? ' — veraltete Basis, vor Code-Arbeit Basis klären' : ''}`);
  if (reports.length) out.push(`- Offene Task-Reports in diesem Worktree: ${reports.join(', ')}`);
  if (resolve(root) === MAIN_WORKTREE) out.push('- Achtung: kanonischer main-Worktree. Aufgaben in eigenem Task-Worktree ausführen (npm run agent:wt:create).');
  out.push(`- Kanonische Regeln/Status: ${MAIN_WORKTREE}/docs/agent/ANYVO_MASTER_STATUS.md und ACTIVE_WORK.md`);
  out.push('- Werkzeuge: /anyvo-start, /anyvo-quality, /anyvo-mobile-test, /anyvo-release-preflight; Guard: .claude/hooks/anyvo-guard.mjs');
  return out.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(buildContext(process.env.CLAUDE_PROJECT_DIR || process.cwd()) + '\n'); } catch { /* nie blockieren */ }
  process.exit(0);
}
