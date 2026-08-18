#!/usr/bin/env node
// ANYVO — Worktree-Helfer für parallelen Multi-Agent-Betrieb.
//
// Grundregel: 1 Task = 1 Task-ID = 1 Branch = 1 Worktree = 1 Primary Agent.
// Worktrees sind Geschwister-Ordner: ../anyvo-<slug>.
//
// SICHERHEIT — dieses Skript führt NIEMALS aus:
//   commit · push · merge · reset · checkout · clean · rebase · Branch-Löschung ·
//   worktree remove --force · Remote-/DB-Zugriffe · Tests · Deploy/OTA.
// Es entfernt einen Worktree NUR, wenn dieser sauber ist (keine uncommitteten/
// untracked Änderungen). Fremde Worktrees und der Haupt-Tree werden nie verändert.
//
// Kommandos:
//   node scripts/agent-worktree.mjs create <slug> [--branch <name>] [--base <ref>] [--task T-XX]
//   node scripts/agent-worktree.mjs list
//   node scripts/agent-worktree.mjs finish <slug>
//   node scripts/agent-worktree.mjs remove <slug>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

// ── Git-Helfer (nur explizit erlaubte Kommandos) ──────────────────────────
function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}
function gitReadRoot() {
  try { return git(['rev-parse', '--show-toplevel']); }
  catch { fail('Kein Git-Repository gefunden.'); }
}

const ROOT = gitReadRoot();
const TASKS_DIR = resolve(ROOT, 'docs/agent/tasks');
const TEMPLATE = resolve(TASKS_DIR, '_TEMPLATE.md');

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }
function ok(msg) { console.log('✓ ' + msg); }
function info(msg) { console.log('  ' + msg); }

// slug: kebab-case, keine Pfad-/Shell-Sonderzeichen
function assertSlug(slug) {
  if (!slug) fail('Bitte einen <slug> angeben, z. B. "track-fix".');
  if (!/^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/.test(slug))
    fail(`Ungültiger slug "${slug}". Erlaubt: klein, a–z 0–9 und Bindestrich (2–50 Zeichen).`);
  return slug;
}

function parseFlags(argv) {
  const flags = {}; const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { flags[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
    else rest.push(a);
  }
  return { flags, rest };
}

// Worktrees als strukturierte Liste aus `git worktree list --porcelain`
function worktrees() {
  const out = git(['worktree', 'list', '--porcelain']);
  const items = []; let cur = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9), branch: null, head: null, detached: false, bare: false }; items.push(cur); }
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5, 5 + 12);
    else if (line === 'detached') cur.detached = true;
    else if (line === 'bare') cur.bare = true;
  }
  return items;
}

// Sauber? -> keine uncommitteten + keine untracked Änderungen in diesem Worktree.
function isClean(dir) {
  const out = git(['-C', dir, 'status', '--porcelain']);
  return out.length === 0;
}

function branchExists(name) {
  try { git(['show-ref', '--verify', '--quiet', `refs/heads/${name}`]); return true; }
  catch { return false; }
}

function nextTaskId(explicit) {
  if (explicit) {
    if (!/^T-\d+$/.test(explicit)) fail(`Ungültige --task "${explicit}". Format: T-<Zahl>.`);
    return explicit;
  }
  let max = 60; // Fallback: nächste freie laut TASKS.md ist T-61
  if (existsSync(TASKS_DIR)) {
    for (const f of readdirSync(TASKS_DIR)) {
      const m = /^T-(\d+)\.md$/.exec(f);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return `T-${max + 1}`;
}

function scaffoldTaskReport(destWorktree, { taskId, slug, branch, base, worktreeRel }) {
  if (!existsSync(TEMPLATE)) { info(`Hinweis: Vorlage ${TEMPLATE} fehlt — überspringe Task-Report.`); return null; }
  const tpl = readFileSync(TEMPLATE, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  const filled = tpl
    .replace(/<TASK-ID>/g, taskId)
    .replace('<Kurztitel>', slug)
    .replace('`../anyvo-<slug>`', '`' + worktreeRel + '`')
    .replace('`<branch>`', '`' + branch + '`')
    .replace('`<z. B. main / HEAD>`', '`' + base + '`')
    + `\n<!-- angelegt ${today} via agent:wt:create -->\n`;
  const destDir = resolve(destWorktree, 'docs/agent/tasks');
  mkdirSync(destDir, { recursive: true });
  const dest = resolve(destDir, `${taskId}.md`);
  if (existsSync(dest)) { info(`Task-Report existiert bereits: ${dest} — nicht überschrieben.`); return dest; }
  writeFileSync(dest, filled);
  return dest;
}

// ── create ────────────────────────────────────────────────────────────────
function cmdCreate(argv) {
  const { flags, rest } = parseFlags(argv);
  const slug = assertSlug(rest[0]);
  const branch = (flags.branch && flags.branch !== true) ? String(flags.branch) : slug;
  const base = (flags.base && flags.base !== true) ? String(flags.base) : 'HEAD';
  const taskId = nextTaskId(flags.task && flags.task !== true ? String(flags.task) : null);
  const dir = resolve(ROOT, '..', `anyvo-${slug}`);
  const worktreeRel = `../anyvo-${slug}`;

  if (existsSync(dir)) fail(`Zielordner existiert bereits: ${dir}. Anderen <slug> wählen oder zuerst entfernen.`);
  if (branchExists(branch)) fail(`Branch "${branch}" existiert bereits. Mit --branch <name> einen freien Namen wählen.`);
  // Basis muss auflösbar sein
  try { git(['rev-parse', '--verify', '--quiet', base + '^{commit}']); }
  catch { fail(`Basis-Ref "${base}" ist nicht auflösbar. Beispiel: --base main`); }

  // Neuer Worktree + neuer Branch. Kein Wechsel/Reset im Haupt-Tree.
  git(['worktree', 'add', '-b', branch, dir, base]);
  ok(`Worktree erstellt: ${dir}`);
  info(`Branch: ${branch}   Basis: ${base}   Task-ID: ${taskId}`);

  const report = scaffoldTaskReport(dir, { taskId, slug, branch, base, worktreeRel });
  if (report) ok(`Task-Report angelegt: ${report.replace(ROOT + '/', '')}`.replace(dir + '/', worktreeRel + '/'));

  // .opencode-Verfügbarkeit prüfen (versioniert -> sollte im Worktree vorhanden sein)
  const hasOpencode = existsSync(resolve(dir, 'opencode.json')) && existsSync(resolve(dir, '.opencode/agent'));
  info(hasOpencode
    ? 'OpenCode-Konfiguration ist im Worktree vorhanden (.opencode/ + opencode.json).'
    : '⚠ OpenCode-Konfiguration fehlt im Worktree — ist .opencode/ bereits committet?');

  console.log('');
  info('Nächste Schritte:');
  info(`  cd ${worktreeRel}`);
  info('  opencode            # Primary Agent starten, AGENTS.md + docs/agent/ lesen');
  info(`  # Task-Report pflegen: docs/agent/tasks/${taskId}.md`);
  console.log('');
  info('Kein Commit/Push/Merge ausgeführt. Globale Handoff-Dateien wurden NICHT verändert.');
}

// ── list ────────────────────────────────────────────────────────────────
function cmdList() {
  const items = worktrees();
  console.log('ANYVO — WORKTREES');
  console.log('─'.repeat(60));
  for (const w of items) {
    const clean = w.bare ? '—' : (isClean(w.path) ? 'clean' : 'DIRTY');
    const label = w.bare ? '(bare)' : w.detached ? `(detached ${w.head})` : (w.branch || '(?)');
    console.log(`${clean.padEnd(6)} ${label.padEnd(34)} ${w.path}`);
  }
  console.log('');
  info('DIRTY = uncommittete oder untracked Änderungen. Solche Worktrees werden nicht entfernt.');
}

// ── finish (read-only Checkliste, löscht nichts) ─────────────────────────
function cmdFinish(argv) {
  const { rest } = parseFlags(argv);
  const slug = assertSlug(rest[0]);
  const dir = resolve(ROOT, '..', `anyvo-${slug}`);
  const w = worktrees().find(x => resolve(x.path) === dir);
  if (!w) fail(`Kein Worktree gefunden für ../anyvo-${slug}. Vorhandene: npm run agent:wt:list`);

  const clean = isClean(dir);
  const status = git(['-C', dir, 'status', '--short']);
  console.log(`ANYVO — TASK FINISH  (${w.branch || 'detached'})`);
  console.log('─'.repeat(60));
  info(`Worktree : ${dir}`);
  info(`Branch   : ${w.branch || '(detached)'}`);
  info(`Zustand  : ${clean ? 'clean' : 'DIRTY'}`);
  if (!clean) { console.log('\nUncommittete/untracked Änderungen:'); console.log(status.split('\n').map(l => '  ' + l).join('\n')); }
  console.log('');
  info('Abschluss-Checkliste (manuell, nichts davon automatisiert):');
  info('  [ ] Task-Report docs/agent/tasks/<TASK-ID>.md vollständig & Status gesetzt');
  info('  [ ] Tests ausgeführt und Ergebnisse eingetragen');
  info('  [ ] Task-Commit erstellt (nur Task-Scope) — nach Freigabe');
  info('  [ ] Review durch Codex/Analyst angefordert');
  info('  [ ] KEIN Push/Merge ohne ausdrückliche Freigabe');
  info('  [ ] Integration + globale Doku übernimmt der Integrations-Agent');
  console.log('');
  info('Dieses Kommando ist rein informativ und hat nichts verändert oder gelöscht.');
}

// ── remove (nur wenn clean; nie --force) ─────────────────────────────────
function cmdRemove(argv) {
  const { rest } = parseFlags(argv);
  const slug = assertSlug(rest[0]);
  const dir = resolve(ROOT, '..', `anyvo-${slug}`);

  if (resolve(dir) === resolve(ROOT)) fail('Der Haupt-Working-Tree wird nicht entfernt.');
  const w = worktrees().find(x => resolve(x.path) === dir);
  if (!w) fail(`Kein Worktree gefunden für ../anyvo-${slug}. Vorhandene: npm run agent:wt:list`);
  if (!isClean(dir)) {
    console.error('✗ Worktree ist DIRTY — Entfernen abgelehnt (Schutz fremder/eigener Arbeit).');
    console.error('  Uncommittete/untracked Änderungen:');
    console.error(git(['-C', dir, 'status', '--short']).split('\n').map(l => '    ' + l).join('\n'));
    console.error('  Bitte committen oder bewusst manuell aufräumen. Kein --force durch dieses Skript.');
    process.exit(1);
  }
  // Sauber -> sicher entfernen (ohne --force). Branch bleibt erhalten.
  git(['worktree', 'remove', dir]);
  ok(`Worktree entfernt: ${dir}`);
  info(`Branch "${w.branch || '(detached)'}" wurde NICHT gelöscht. Bei Bedarf manuell: git branch -d ${w.branch || ''}`.trim());
}

// ── Dispatch ────────────────────────────────────────────────────────────
const [cmd, ...argv] = process.argv.slice(2);
switch (cmd) {
  case 'create': cmdCreate(argv); break;
  case 'list': cmdList(); break;
  case 'finish': cmdFinish(argv); break;
  case 'remove': cmdRemove(argv); break;
  default:
    console.log('ANYVO Worktree-Helfer');
    console.log('  node scripts/agent-worktree.mjs create <slug> [--branch <name>] [--base <ref>] [--task T-XX]');
    console.log('  node scripts/agent-worktree.mjs list');
    console.log('  node scripts/agent-worktree.mjs finish <slug>');
    console.log('  node scripts/agent-worktree.mjs remove <slug>   (nur wenn clean)');
    if (cmd) fail(`Unbekanntes Kommando "${cmd}".`);
}
