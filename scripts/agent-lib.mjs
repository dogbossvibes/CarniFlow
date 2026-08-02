// ANYVO — Agent-Handoff: geteilte, AUSSCHLIESSLICH LESENDE Helfer.
// Nur Node-Standardbibliothek. Führt NIE schreibende Git-/Netz-/DB-Kommandos aus.
// Genutzt von agent-handoff.mjs, agent-status.mjs, agent-start.mjs.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo-Wurzel = Elternordner von scripts/
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const AGENT_DIR = resolve(ROOT, 'docs/agent');
export const HANDOFF_PATH = resolve(AGENT_DIR, 'SESSION_HANDOFF.md');
export const MARKER_START = '<!-- AUTO-GENERATED:START -->';
export const MARKER_END = '<!-- AUTO-GENERATED:END -->';
export const VALID_AGENTS = ['claude', 'codex', 'unknown'];

// Nur lesende Git-/Shell-Kommandos. Bei Fehler leere Zeichenkette (kein Abbruch).
export function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

export const isGitRepo = () => sh('git rev-parse --is-inside-work-tree') === 'true';
export const gitBranch = () => sh('git branch --show-current') || '(detached/unknown)';
export const gitStatusShort = () => sh('git status --short');
export const gitDiffStat = () => sh('git diff --stat');
export const gitModified = () => sh('git diff --name-only').split('\n').filter(Boolean);
export const gitUntracked = () => sh('git ls-files --others --exclude-standard').split('\n').filter(Boolean);
export const gitRecentCommits = (n = 5) => sh(`git log -${n} --oneline`);
export const nodeVersion = () => process.version;

// Package-Manager grob erkennen (nur anhand vorhandener Lockdateien; keine Ausführung).
export function packageManager() {
  if (existsSync(resolve(ROOT, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(ROOT, 'yarn.lock'))) return 'yarn';
  if (existsSync(resolve(ROOT, 'bun.lockb'))) return 'bun';
  if (existsSync(resolve(ROOT, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

export function readHandoff() {
  const exists = existsSync(HANDOFF_PATH);
  return { path: HANDOFF_PATH, exists, text: exists ? readFileSync(HANDOFF_PATH, 'utf8') : '' };
}

// Liest aus dem AUTO-GENERATED-Block Generated-Zeit + Agent.
export function parseAuto(text) {
  const start = text.indexOf(MARKER_START);
  const end = text.indexOf(MARKER_END);
  if (start === -1 || end === -1 || end < start) return { generated: null, agent: null };
  const block = text.slice(start, end);
  const gen = block.match(/Generated:\s*(.+)/)?.[1]?.trim() ?? null;
  const agent = block.match(/Agent:\s*(.+)/)?.[1]?.trim() ?? null;
  const generated = gen ? new Date(gen) : null;
  return { generated: generated && !isNaN(generated) ? generated : null, agent };
}

// Erste nicht-leere Zeile unter einer `## Überschrift` (für z. B. "Current task").
export function parseManualField(text, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'mi');
  const m = re.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length).split('\n');
  for (const line of rest) {
    const t = line.trim();
    if (t.startsWith('## ')) break;                 // nächste Sektion erreicht
    if (t && !/^_.*_$/.test(t)) return t;           // Platzhalter (_..._) überspringen
  }
  return null;
}

// Konservative Stale-Erkennung: neueste Änderungszeit unter den von Git als
// geändert/untracked gemeldeten Dateien (ohne die Agent-Doku selbst). Ist diese
// neuer als der Handoff-Timestamp, ist der Handoff WAHRSCHEINLICH veraltet.
export function newestChangeMs() {
  const lines = gitStatusShort().split('\n').filter(Boolean);
  let newest = 0;
  for (const line of lines) {
    const file = line.slice(3).replace(/^"|"$/g, '').split(' -> ').pop();
    if (!file || file.startsWith('docs/agent/')) continue;   // Agent-Doku selbst ignorieren
    try {
      const abs = resolve(ROOT, file);
      if (existsSync(abs)) {
        const ms = statSync(abs).mtimeMs;
        if (ms > newest) newest = ms;
      }
    } catch { /* Datei evtl. gelöscht – ignorieren */ }
  }
  return newest;
}
