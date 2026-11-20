#!/usr/bin/env node
/**
 * ANYVO OTA-Abdeckungsprüfung („keine OTA vergessen“).
 *
 * Liest alle jemals veröffentlichten Production-OTAs (EAS-Branch `production`,
 * alle Runtimes) samt Quell-Commit und prüft, ob ihr Inhalt im Kandidaten
 * (Standard: HEAD) enthalten ist. Gedacht vor jedem neuen nativen Build und vor
 * der ersten OTA auf einer neuen Runtime – genau dort gingen bei Build 59 frühere
 * OTAs verloren.
 *
 * Eine OTA gilt als enthalten, wenn
 *   1. ihr Commit Vorfahre des Kandidaten ist, oder
 *   2. ihre App-relevante Änderung (gegenüber der vorherigen OTA derselben
 *      Runtime/Plattform) im Kandidaten bereits vorhanden ist (Reverse-Apply), oder
 *   3. sie in docs/agent/ota-coverage-exceptions.json begründet ausgenommen ist.
 *
 * Nur lesend: kein Checkout, kein Schreiben in den Worktree (temporärer Git-Index
 * im Temp-Ordner), keine EAS-Schreibaktion. Das Verzeichnis aller OTAs wird in
 * docs/agent/ota-ledger.json fortgeschrieben (nur mit --refresh).
 *
 * Aufruf:
 *   node scripts/check-ota-coverage.mjs [--candidate <ref>] [--refresh | --live]
 *        [--platform ios|android] [--since YYYY-MM-DD] [--json]
 *   --refresh  neue OTAs aus EAS lesen und ins Verzeichnis schreiben
 *   --live     neue OTAs aus EAS lesen, Verzeichnis-Datei NICHT ändern
 * Exit 0 = alles enthalten/ausgenommen, 1 = OTA fehlt/unklar, 2 = Prüfung nicht möglich.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEDGER_PATH = 'docs/agent/ota-ledger.json';
export const EXCEPTIONS_PATH = 'docs/agent/ota-coverage-exceptions.json';

// Pfade, die nicht ins OTA-Bundle gehören: Doku, Skripte, Tests, CI, Ausgaben.
const NON_BUNDLE = [
  /^docs\//, /\.md$/i, /^scripts\//, /^\.github\//, /^outputs\//, /^qa\//,
  /(^|\/)__tests__\//, /\.test\.[cm]?[jt]sx?$/, /^\.claude\//, /^\.agents\//, /^_bmad\//,
];
export const isBundleRelevant = path => !NON_BUNDLE.some(rx => rx.test(path));

const SHA = /^[0-9a-f]{40}$/;

/** Reiner Kern: ordnet OTAs und bestimmt je OTA die Vergleichsbasis. */
export function planChecks(ledger, { platform, since } = {}) {
  const entries = ledger
    .filter(e => e.branch === 'production' && !e.isRollBackToEmbedded && SHA.test(e.gitCommitHash ?? ''))
    .filter(e => !platform || e.platform === platform)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lastByLane = new Map();
  const plan = [];
  for (const e of entries) {
    const lane = `${e.platform}|${e.runtimeVersion}`;
    const base = lastByLane.get(lane) ?? null;
    lastByLane.set(lane, e.gitCommitHash);
    if (since && e.createdAt.slice(0, 10) < since) continue;
    plan.push({ ...e, base });
  }
  return plan;
}

export function findException(exceptions, entry) {
  return exceptions.find(x =>
    (x.group && x.group === entry.group)
    || (x.commit && x.commit === entry.gitCommitHash)
    || (x.runtimeVersion && x.runtimeVersion === entry.runtimeVersion && (!x.platform || x.platform === entry.platform)));
}

export function validateExceptions(exceptions) {
  const problems = [];
  if (!Array.isArray(exceptions)) return ['Ausnahmeliste ist kein Array.'];
  exceptions.forEach((x, i) => {
    if (!(x.group || x.commit || x.runtimeVersion)) problems.push(`Ausnahme ${i}: group, commit oder runtimeVersion fehlt.`);
    if (!x.reason || String(x.reason).trim().length < 10) problems.push(`Ausnahme ${i}: Begründung fehlt/zu kurz.`);
    if (!x.decidedBy || !x.date) problems.push(`Ausnahme ${i}: decidedBy/date fehlt.`);
  });
  return problems;
}

function makeGit(repo) {
  return (args, opts = {}) => execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...opts,
  });
}

function hasCommit(git, sha) {
  try { git(['cat-file', '-e', `${sha}^{commit}`]); return true; } catch { return false; }
}

/** Prüft eine OTA gegen den Kandidaten. Liefert { status, files }. */
export function checkEntry(git, entry, candidate, indexFile) {
  const sha = entry.gitCommitHash;
  if (!hasCommit(git, sha)) {
    try { git(['fetch', '-q', 'origin', sha]); } catch { /* bleibt unbekannt */ }
    if (!hasCommit(git, sha)) return { status: 'UNBEKANNT', files: [] };
  }
  try { git(['merge-base', '--is-ancestor', sha, candidate]); return { status: 'ENTHALTEN', via: 'Vorfahre', files: [] }; } catch { /* weiter */ }
  let base = entry.base && hasCommit(git, entry.base) ? entry.base : null;
  if (!base) { try { base = git(['rev-parse', `${sha}^`]).trim(); } catch { base = null; } }
  if (!base) return { status: 'UNBEKANNT', files: [] };
  const files = git(['diff', '--name-only', base, sha]).split('\n').filter(Boolean).filter(isBundleRelevant);
  if (!files.length) return { status: 'ENTHALTEN', via: 'keine App-Änderung', files: [] };
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  git(['read-tree', candidate], { env });
  const missing = [];
  for (const f of files) {
    // Datei im Kandidaten identisch mit OTA-Stand → enthalten.
    let same = false;
    try { same = git(['rev-parse', `${candidate}:${f}`]).trim() === git(['rev-parse', `${sha}:${f}`]).trim(); } catch { /* fehlt */ }
    if (same) continue;
    const patch = git(['diff', '--binary', base, sha, '--', f]);
    const applies = extra => spawnSync('git', ['-C', git.repo, 'apply', '--cached', '--reverse', '--check', ...extra, '-'],
      { input: patch, env, encoding: 'utf8' }).status === 0;
    // Strenger Abgleich mit Kontext; sonst ohne Kontext (Code drumherum verschoben),
    // aber nur wenn die OTA Zeilen hinzugefügt hat – reine Löschungen wären so nicht prüfbar.
    const addsLines = /^\+(?!\+\+)/m.test(patch);
    if (!applies([]) && !(addsLines && applies(['-C0']))) missing.push(f);
  }
  return missing.length
    ? { status: 'FEHLT', files: missing, total: files.length }
    : { status: 'ENTHALTEN', via: 'Inhalt vorhanden', files: [] };
}

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

// Zeitlimit je EAS-Aufruf: ohne Limit blieb die Prüfung am 2026-11-20 über Stunden hängen.
export const EAS_TIMEOUT_MS = Number(process.env.OTA_COVERAGE_EAS_TIMEOUT_MS) || 120_000;

function eas(args, cwd) {
  try {
    return execFileSync('eas', args, {
      cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      timeout: EAS_TIMEOUT_MS, killSignal: 'SIGKILL',
    });
  } catch (e) {
    if (e?.code === 'ETIMEDOUT' || e?.signal === 'SIGKILL') {
      throw new Error(`EAS antwortet nicht innert ${Math.round(EAS_TIMEOUT_MS / 1000)} s (eas ${args.slice(0, 2).join(' ')}). Netz prüfen und erneut starten.`);
    }
    throw e;
  }
}

/** Ergänzt das Verzeichnis um neue Production-OTA-Gruppen aus EAS (nur lesend gegenüber EAS). */
export function refreshLedger(repo, ledger) {
  const known = new Set(ledger.map(e => `${e.group}|${e.platform}`));
  const groups = [];
  for (let offset = 0; ; offset += 50) {
    const page = JSON.parse(eas(['update:list', '--branch', 'production', '--json', '--non-interactive', '--limit', '50', '--offset', String(offset)], repo)).currentPage ?? [];
    groups.push(...page);
    if (page.length < 50) break;
  }
  let added = 0;
  for (const g of groups) {
    const platforms = String(g.platforms ?? '').split(',').map(p => p.trim()).filter(Boolean);
    if (platforms.every(p => known.has(`${g.group}|${p}`))) continue;
    const view = JSON.parse(eas(['update:view', g.group, '--json'], repo));
    for (const u of Array.isArray(view) ? view : [view]) {
      if (known.has(`${u.group}|${u.platform}`)) continue;
      ledger.push({
        group: u.group, updateId: u.id, platform: u.platform, runtimeVersion: u.runtimeVersion,
        branch: u.branch, createdAt: u.createdAt, gitCommitHash: u.gitCommitHash ?? null,
        isRollBackToEmbedded: !!u.isRollBackToEmbedded, message: u.message ?? '',
      });
      known.add(`${u.group}|${u.platform}`);
      added += 1;
    }
  }
  ledger.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.platform.localeCompare(b.platform));
  return added;
}

function parseArgs(argv) {
  const o = { candidate: 'HEAD', refresh: false, live: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--candidate') o.candidate = argv[++i];
    else if (a === '--live') o.live = true;
    else if (a === '--platform') o.platform = argv[++i];
    else if (a === '--since') o.since = argv[++i];
    else if (a === '--refresh') o.refresh = true;
    else if (a === '--json') o.json = true;
    else throw new Error(`Unbekannte Option: ${a}`);
  }
  if (o.platform && !['ios', 'android'].includes(o.platform)) throw new Error('--platform muss ios oder android sein.');
  if (o.since && !/^\d{4}-\d{2}-\d{2}$/.test(o.since)) throw new Error('--since erwartet YYYY-MM-DD.');
  return o;
}

export function main(argv = process.argv.slice(2), repo = process.cwd()) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(`STOP: ${e.message}`); return 2; }
  const git = makeGit(repo);
  git.repo = repo;
  let candidate;
  try { candidate = git(['rev-parse', '--verify', `${opts.candidate}^{commit}`]).trim(); }
  catch { console.error(`STOP: Kandidat ${opts.candidate} nicht gefunden.`); return 2; }

  const ledgerFile = resolve(repo, LEDGER_PATH);
  const ledger = readJson(ledgerFile, []);
  if (opts.refresh || opts.live) {
    try {
      const added = refreshLedger(repo, ledger);
      // --live: frisch aus EAS, aber Worktree bleibt sauber (für Build-/Release-Einstiege).
      if (opts.refresh) writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
      console.log(`OTA-Verzeichnis ${opts.refresh ? 'aktualisiert' : 'frisch gelesen'}: ${added} neue Einträge, ${ledger.length} gesamt.`);
    } catch (e) {
      console.error(`STOP: OTA-Liste aus EAS nicht lesbar (${e.message.split('\n')[0]}). Keine Abdeckungsaussage.`);
      return 2;
    }
  }
  if (!ledger.length) { console.error(`STOP: ${LEDGER_PATH} leer. Erst mit --refresh aus EAS lesen.`); return 2; }

  const exceptions = readJson(resolve(repo, EXCEPTIONS_PATH), []);
  const exProblems = validateExceptions(exceptions);
  if (exProblems.length) { exProblems.forEach(p => console.error(`STOP: ${p}`)); return 2; }

  const tmp = mkdtempSync(join(tmpdir(), 'anyvo-ota-coverage-'));
  const indexFile = join(tmp, 'index');
  const results = [];
  try {
    for (const entry of planChecks(ledger, opts)) {
      const ex = findException(exceptions, entry);
      const r = checkEntry(git, entry, candidate, indexFile);
      results.push({ ...entry, ...r, exception: r.status === 'ENTHALTEN' ? null : ex?.reason ?? null });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const open = results.filter(r => r.status !== 'ENTHALTEN' && !r.exception);
  if (opts.json) {
    console.log(JSON.stringify({ candidate, checked: results.length, open: open.length, results }, null, 2));
  } else {
    const count = s => results.filter(r => r.status === s).length;
    console.log(`Kandidat ${candidate.slice(0, 12)}: ${results.length} Production-OTAs geprüft – `
      + `${count('ENTHALTEN')} enthalten, ${results.filter(r => r.exception).length} ausgenommen, ${open.length} offen.`);
    for (const r of open) {
      console.log(`\n✗ ${r.status}: ${r.createdAt.slice(0, 10)} ${r.platform} ${r.runtimeVersion} – ${r.message.slice(0, 80)}`);
      console.log(`  Gruppe ${r.group}, Commit ${r.gitCommitHash.slice(0, 12)}`);
      if (r.files.length) console.log(`  fehlt in: ${r.files.slice(0, 8).join(', ')}${r.files.length > 8 ? ` (+${r.files.length - 8})` : ''}`);
    }
    console.log(open.length
      ? `\nSTOP: ${open.length} frühere OTA(s) fehlen im Kandidaten. Nachziehen oder in ${EXCEPTIONS_PATH} begründet ausnehmen.`
      : '\nOK: Keine frühere Production-OTA fehlt.');
  }
  return open.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
