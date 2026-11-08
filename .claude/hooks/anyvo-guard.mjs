#!/usr/bin/env node
// ANYVO Projekt-Guard (Claude Code PreToolUse-Hook, versioniert im Repo).
//
// Zweck: Git-/Worktree-Schutz, Secret-Schutz und Release-Sperre unabhängig von
// lokalen Freigabelisten. Ergänzt den optionalen Nutzer-Guard
// (~/.claude/hooks/anyvo-release-guard.py); bei Überschneidung gilt die strengere
// Entscheidung. Der Hook liest nur die Tool-Eingabe, ruft nichts Remote auf und
// schreibt nichts.
//
// Entscheidungen:
//   deny – nie durch Claude ausführen (Release, Datenverlust, Secrets).
//          Freigegebene Releases führt die Nutzerin selbst im Terminal aus.
//   ask  – nur nach ausdrücklicher Bestätigung im Freigabedialog.
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DENY = 'deny';
export const ASK = 'ask';

// Regeln gelten für den Beginn eines normalisierten Befehlssegments.
export const COMMAND_RULES = [
  // Releases, OTA, Builds, Store
  [DENY, /^eas(-cli)?(@\S+)?\s+(update|build|submit)(\s|$)/, 'EAS-OTA/Build/Store-Submit'],
  [DENY, /^eas(-cli)?(@\S+)?\s+(update|channel|branch):(republish|rollback|roll-back-to-embedded|delete|edit|rollout|pause|resume|create|rename)\b/, 'EAS-Update/Channel-Änderung'],
  [DENY, /^eas(-cli)?(@\S+)?\s+(env|secret):/, 'EAS-Umgebungsvariablen/Secrets'],
  [DENY, /^eas(-cli)?(@\S+)?\s+(credentials|metadata:push|device:create)\b/, 'EAS-Credentials/Store-Metadaten'],
  [DENY, /^node\s+(\S*\/)?(update-production|release-command)\.mjs\b/, 'ANYVO-Release-Skript'],
  [DENY, /^(npm|pnpm|yarn|bun)\s+(run\s+)?(update:|build:(dev|prod|local)|release:)/, 'npm-Release/Build-Skript'],
  [DENY, /^(xcrun\s+(altool|notarytool)|fastlane\s+(deliver|pilot|supply|upload_to)|iTMSTransporter)\b/, 'Store-Upload'],
  // Datenbank / Backend
  [DENY, /^supabase\s+(db\s+(push|reset)|migration\s+(up|repair|squash)|functions\s+(deploy|delete)|secrets\b|projects\s+(create|delete))/, 'Supabase-Remote-Änderung'],
  [DENY, /^(psql|pg_dump|pg_restore)\b/, 'Direkter Datenbankzugriff'],
  // GitHub
  [DENY, /^gh\s+pr\s+(merge|close|ready)\b/, 'GitHub-PR-Merge/Close'],
  [DENY, /^gh\s+(release|secret|variable|ruleset)\s+(create|delete|edit|upload|set|remove)\b/, 'GitHub-Release/Secrets'],
  [DENY, /^gh\s+(repo\s+(edit|delete|rename|archive)|workflow\s+(run|enable|disable)|auth\s+(token|logout|refresh))\b/, 'GitHub-Repo/Workflow/Token'],
  [DENY, /^gh\s+api\b.*(\s(-X|--method)\s*['"]?(POST|PATCH|PUT|DELETE)\b|\s(-f|-F|--field|--raw-field|--input)\s)/i, 'GitHub-API-Schreibzugriff'],
  // Git: Datenverlust und fremde Arbeit
  [DENY, /^git\s+reset\s+.*--(hard|merge|keep)\b/, 'git reset mit Datenverlust'],
  [DENY, /^git\s+clean\b/, 'git clean'],
  [DENY, /^git\s+checkout\s+(.*\s)?(--\s|\.(\s|$))/, 'git checkout von Dateien (verwirft Änderungen)'],
  [DENY, /^git\s+restore\b(?!.*--staged)/, 'git restore (verwirft Änderungen)'],
  [DENY, /^git\s+stash\s+(drop|clear)\b/, 'Stash löschen'],
  [DENY, /^git\s+worktree\s+(remove\s+.*(-f|--force)|prune)\b/, 'Worktree erzwungen entfernen/prunen'],
  [DENY, /^git\s+branch\s+.*(-D|--delete\s+--force|-df)\b/, 'Branch erzwungen löschen'],
  [DENY, /^git\s+push\b.*(\s(-f|--force|--force-with-lease|--mirror|--delete|-d)\b|\s\+\S|\s:\S)/, 'Force-/Delete-Push'],
  [DENY, /^git\s+push\s+\S+\s+(\S+:)?(refs\/heads\/)?main(\s|$)/, 'Push auf main'],
  [DENY, /^git\s+(filter-branch|filter-repo|update-ref\s+-d|reflog\s+(expire|delete)|gc\s+.*--prune=now)\b/, 'Git-Historie umschreiben/löschen'],
  [ASK, /^git\s+(commit|push|merge|rebase|cherry-pick|revert|reset|restore|stash|switch|checkout|tag|am|apply|pull)\b/, 'Git-Schreibaktion'],
  [ASK, /^git\s+worktree\s+(add|remove|move)\b/, 'Worktree-Änderung'],
  [ASK, /^git\s+branch\s+.*(-d|-m|-M|--delete|--move)\b/, 'Branch löschen/umbenennen'],
  [ASK, /^(npm|pnpm|yarn|bun)\s+(run\s+)?agent:github:push\b/, 'GitHub-Autosync-Push'],
  [ASK, /^(npm\s+(i|install|ci|uninstall|update)|npx\s+expo\s+install|expo\s+install)\b/, 'Abhängigkeiten ändern'],
  [ASK, /^gh\s+(pr\s+(create|edit|comment)|issue\s+(create|edit|comment|close))\b/, 'GitHub-Schreibaktion'],
];

// Dateien mit Secrets: weder lesen noch ausgeben noch schreiben.
const SECRET_PATTERN = /(^|\/)(\.env(\.[\w.-]+)?|google-play-service-account\.json|[^/]*\.(p8|p12|mobileprovision|keystore|jks|pem)|credentials\.json|GoogleService-Info\.plist|google-services\.json)$/;
// Beispiel-/Vorlagendateien (.env.example, .env.qa.example) enthalten keine Secrets.
export const isSecretFile = (p) => SECRET_PATTERN.test(p) && !/\.(example|sample|template)$/.test(p);
const SECRET_READERS = /^(cat|less|more|head|tail|bat|grep|rg|egrep|awk|sed|strings|xxd|od|base64|cp|mv|scp|curl|open|code|pbcopy|source|\.|tee|dd)\b/;
const SECRET_PRINT = /^(printenv(\s|$)|security\s+(find|dump|export)-)/;

// Koordinationsdateien: nur durch den zuständigen Integrator ändern.
export const COORDINATION_FILE = /(^|\/)docs\/agent\/(ANYVO_MASTER_STATUS|ACTIVE_WORK|TASKS|SESSION_HANDOFF|CURRENT_STATE|WORK_LOG|PLATFORM_STATUS)\.md$/;
const MIGRATION_FILE = /(^|\/)supabase\/migrations\//;
const SYNCED_SOURCES = /(^|\/)sources\//;
// Pfade, in denen ANYVO-Worktrees liegen.
const WORKTREE_ROOTS = [/^\/Users\/[^/]+\/canisflow(-worktrees)?\//, /\/\.codex\/\.chatgpt-projects\//];

const WRAPPERS = new Set(['sudo', 'env', 'exec', 'command', 'nohup', 'time', 'xargs', 'npx', 'bunx', 'pnpx', 'timeout', 'caffeinate']);
const SPLIT = /\|\||&&|;|\||\n|\$\(|`|\)|&/;

function tokenize(segment) {
  const out = [];
  const re = /"((?:\\.|[^"\\])*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(segment))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export function normalize(segment) {
  const toks = tokenize(segment);
  const nested = [];
  toks.forEach((t, i) => {
    if (['-c', '-lc', '-ic'].includes(t) && i > 0 && /(^|\/)(ba|z|da|k)?sh$/.test(toks[i - 1]) && toks[i + 1]) nested.push(toks[i + 1]);
  });
  while (toks.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0]) || WRAPPERS.has(toks[0]) || /^(-y|--yes|-[a-zA-Z]|\d+[smh]?)$/.test(toks[0]))) toks.shift();
  if (toks.length) toks[0] = toks[0].split('/').pop();
  if (toks[0] === 'git' || toks[0] === 'gh') {
    let i = 1;
    while (i < toks.length && toks[i].startsWith('-')) i += ['-C', '-c', '-R', '--repo', '--git-dir', '--work-tree'].includes(toks[i]) ? 2 : 1;
    toks.splice(1, i - 1);
  }
  return { norm: toks.join(' '), nested };
}

function rank(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a[0] === DENY ? a : b[0] === DENY ? b : a;
}

export function checkCommand(cmd, depth = 0) {
  let worst = null;
  for (const raw of cmd.split(SPLIT)) {
    const seg = raw.trim().replace(/^[({!\s]+/, '');
    if (!seg) continue;
    const { norm, nested } = normalize(seg);
    if (depth < 3) for (const n of nested) worst = rank(worst, checkCommand(n, depth + 1));
    for (const [decision, pattern, label] of COMMAND_RULES) {
      if (pattern.test(norm)) { worst = rank(worst, [decision, `${label}: ${norm.slice(0, 120)}`]); break; }
    }
    if (SECRET_PRINT.test(norm) || /^(sudo\s+)?env\s*$/.test(seg)) {
      worst = rank(worst, [DENY, 'Ausgabe von Umgebungsvariablen/Schlüsselbund kann Secrets offenlegen']);
    }
    const secretToken = tokenize(seg).map((t) => t.replace(/^[<>]+|[;,)]+$/g, '')).find((t) => t && isSecretFile(t));
    if (secretToken && (SECRET_READERS.test(norm) || /[<>]/.test(seg))) {
      worst = rank(worst, [DENY, `Zugriff auf Secret-Datei ${secretToken.split('/').pop()}`]);
    }
    if (/^rm\s+(-\S*[rR]\S*\s+)/.test(norm) && /(\.git(\/|\s|$)|canisflow-worktrees\/anyvo-[^/\s]+\/?(\s|$)|supabase\/migrations)/.test(norm)) {
      worst = rank(worst, [DENY, `Rekursives Löschen geschützter Pfade: ${norm.slice(0, 100)}`]);
    }
  }
  return worst;
}

function insideAnyWorktreeRoot(p) { return WORKTREE_ROOTS.some((re) => re.test(p)); }

export function checkFile(tool, filePath, projectDir) {
  if (!filePath) return null;
  const abs = resolve(projectDir || process.cwd(), filePath);
  if (isSecretFile(abs)) return [DENY, `Secret-Datei ${tool === 'Read' ? 'lesen' : 'ändern'} ist gesperrt (${abs.split('/').pop()})`];
  if (tool === 'Read') return null;
  if (SYNCED_SOURCES.test(abs) && projectDir && abs.startsWith(projectDir + sep)) return [DENY, 'sources/ ist synchronisiert und read-only'];
  if (projectDir && !abs.startsWith(projectDir + sep) && insideAnyWorktreeRoot(abs)) {
    return [ASK, `Schreibzugriff außerhalb des aktuellen Worktrees (${projectDir}) auf ${abs}`];
  }
  if (COORDINATION_FILE.test(abs)) return [ASK, 'Globale Koordinationsdatei: nur der zuständige Integrator ändert sie'];
  if (MIGRATION_FILE.test(abs)) return [ASK, 'Supabase-Migration: lokal reviewbar vorbereiten, nie remote ausführen'];
  return null;
}

export function evaluate(input, projectDir = process.env.CLAUDE_PROJECT_DIR) {
  const tool = input?.tool_name || '';
  const tin = input?.tool_input || {};
  if (tool === 'Bash') return checkCommand(String(tin.command || ''));
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Read'].includes(tool)) {
    return checkFile(tool, tin.file_path || tin.notebook_path || '', projectDir ? resolve(projectDir) : undefined);
  }
  return null;
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }
  let result;
  try { result = evaluate(JSON.parse(raw)); } catch {
    // Fail-closed nur bei erkennbar riskantem Inhalt.
    if (/eas(-cli)?\S*\s+(update|build|submit)\b|update-production|db push|functions deploy|pr merge|reset --hard|git clean/.test(raw)) {
      result = [DENY, 'Eingabe nicht auswertbar, enthält aber riskanten Befehl'];
    }
  }
  if (result) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: result[0],
      permissionDecisionReason: `ANYVO Projekt-Guard: ${result[1]}`,
    } }));
  }
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
