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
//   node scripts/agent-worktree.mjs create <slug> --base <ref> --owner <owner> --purpose <purpose> [--branch <name>] [--task T-XX]
//   node scripts/agent-worktree.mjs list
//   node scripts/agent-worktree.mjs finish <slug>
//   node scripts/agent-worktree.mjs remove <slug>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { reserveTask, finishReservation } from './task-registry.mjs';

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

function existingTaskIds() {
  const ids = new Set();
  for (const item of worktrees()) {
    const dir = resolve(item.path, 'docs/agent/tasks');
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const match = /^(T-\d+)\.md$/.exec(name);
      if (match) ids.add(match[1]);
    }
  }
  return [...ids];
}

function scaffoldTaskReport(destWorktree, { taskId, slug, branch, base, owner, worktreeRel }) {
  if (!existsSync(TEMPLATE)) { info(`Hinweis: Vorlage ${TEMPLATE} fehlt — überspringe Task-Report.`); return null; }
  const tpl = readFileSync(TEMPLATE, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  const filled = tpl
    .replace(/<TASK-ID>/g, taskId)
    .replace('<Kurztitel>', slug)
    .replace('`../anyvo-<slug>`', '`' + worktreeRel + '`')
    .replace('`<branch>`', '`' + branch + '`')
    .replace('`<explizit, z. B. feat/track-module-rewrite>`', '`' + base + '`')
    .replace('`<explizit: main@SHA; ältere Runtime nur mit belegter Release-Basis>`', '`' + base + '`')
    .replace('`<opencode-primary \\| engineering-lead \\| codex \\| …>`', '`' + owner + '`')
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
  // --base ist bewusst PFLICHT: eine explizite Basis verhindert eine versteckte,
  // womöglich falsche Ausgangsbasis (z. B. still HEAD). Kein stiller Default.
  if (!flags.base || flags.base === true) {
    const cur = (() => { try { return git(['branch', '--show-current']); } catch { return ''; } })();
    console.error('✗ --base fehlt. Bitte die Ausgangsbasis EXPLIZIT angeben (kein stiller Default).');
    console.error('  • Normalfall: aktueller freigegebener Integrations-/Entwicklungsbranch');
    if (cur) console.error(`    → aktuell führend: --base ${cur}`);
    console.error('  • Nur bewusst vom stabilen Hauptbranch ausgehen: --base main');
    process.exit(1);
  }
  const base = String(flags.base);
  if (flags.task === true) fail('--task verlangt eine explizite Task-ID.');
  const dir = resolve(ROOT, '..', `anyvo-${slug}`);
  const worktreeRel = `../anyvo-${slug}`;

  if (existsSync(dir)) fail(`Zielordner existiert bereits: ${dir}. Anderen <slug> wählen oder zuerst entfernen.`);
  if (branchExists(branch)) fail(`Branch "${branch}" existiert bereits. Mit --branch <name> einen freien Namen wählen.`);
  // Basis muss auflösbar sein
  let baseCommit;
  try { baseCommit = git(['rev-parse', '--verify', '--end-of-options', base + '^{commit}']); }
  catch { fail(`Basis-Ref "${base}" ist nicht auflösbar. Beispiel: --base main`); }

  const commonDir = resolve(ROOT, git(['rev-parse', '--git-common-dir']));
  let reservation;
  try {
    reservation = reserveTask({ commonDir, requestedId: typeof flags.task === 'string' ? flags.task : undefined,
      existingIds: existingTaskIds(), owner: flags.owner, purpose: flags.purpose, branch, worktree: dir, baseCommit });
  } catch { fail('Task-ID nicht reserviert. Owner/Zweck, vorhandene IDs und Registry prüfen; nichts überschrieben.'); }
  const taskId = reservation.taskId;

  // Neuer Worktree + neuer Branch. Kein Wechsel/Reset im Haupt-Tree.
  try {
    git(['worktree', 'add', '-b', branch, dir, baseCommit]);
    finishReservation(commonDir, reservation, 'created');
  } catch {
    // Never remove partial worktrees or reuse the reservation after uncertainty.
    try { finishReservation(commonDir, reservation, 'creation_failed'); } catch { /* retain evidence */ }
    fail('Worktree-Erstellung nicht vollständig bestätigt. Vorhandene Dateien und Task-ID bleiben erhalten.');
  }
  ok(`Worktree erstellt: ${dir}`);
  info(`Branch: ${branch}   Basis: ${base}   Task-ID: ${taskId}`);

  const report = scaffoldTaskReport(dir, { taskId, slug, branch, base: baseCommit, owner: reservation.owner, worktreeRel });
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
    console.log('  node scripts/agent-worktree.mjs create <slug> --base <ref> --owner <chat/owner> --purpose <zweck> [--branch <name>] [--task T-XX]');
    console.log('    (--base ist Pflicht: explizite Ausgangsbasis, z. B. der aktuelle Integrationsbranch)');
    console.log('  node scripts/agent-worktree.mjs list');
    console.log('  node scripts/agent-worktree.mjs finish <slug>');
    console.log('  node scripts/agent-worktree.mjs remove <slug>   (nur wenn clean)');
    if (cmd) fail(`Unbekanntes Kommando "${cmd}".`);
}
