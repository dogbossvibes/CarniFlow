#!/usr/bin/env node
/**
 * Pflichtprüfungen vor einer Production-OTA, am exakten Release-Commit.
 *
 * Läuft nur lokal und nur lesend gegenüber EAS (keine Veröffentlichung, kein Build,
 * keine CI-Minuten). Ersetzt die bisherigen Wegwerf-Skripte des MASTER.
 *
 *   node scripts/release-check.mjs run --platform <ios|android> --base <sha> --evidence <dir>
 *   node scripts/release-check.mjs receipt --platform <ios|android> --runtime <rt> --scope "<text>" --evidence <dir>
 *
 * run      Typecheck, ESLint (geänderte Dateien seit --base), git diff --check, Jest,
 *          OTA-Abdeckung. Schreibt Logs und checks.json nach --evidence. Exit 1 bei Fehler.
 * receipt  Baut quality-receipt.json aus checks.json und review.md (unabhängige Review)
 *          und prüft ihn mit release-quality-evidence.mjs. Verweigert bei fehlgeschlagener
 *          Prüfung, fremdem Commit oder Review ohne «VERDICT: PASS».
 *
 * --base ist der aktive Production-Commit des Ziels (frisch aus EAS lesen).
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CHECKS_FILE = 'checks.json';
export const JEST_ROOTS = ['app', 'features', 'components', 'hooks', 'stores', 'services', 'i18n', 'lib'];
const PLATFORMS = ['ios', 'android'];

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const o = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`Unbekanntes Argument: ${a}`);
    const key = a.slice(2);
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Wert fehlt für --${key}`);
    o[key] = value;
    i += 1;
  }
  if (!['run', 'receipt'].includes(o.command)) throw new Error('Befehl fehlt: run oder receipt');
  if (!PLATFORMS.includes(o.platform)) throw new Error('--platform ios|android fehlt');
  if (!o.evidence) throw new Error('--evidence <dir> fehlt');
  if (o.command === 'run' && !o.base) throw new Error('--base <sha> fehlt (aktiver Production-Commit)');
  if (o.command === 'receipt' && !o.runtime) throw new Error('--runtime fehlt');
  if (o.command === 'receipt' && !o.scope) throw new Error('--scope fehlt');
  return o;
}

/** Nur JS/TS-Dateien der App prüfen; Edge Functions (Deno) haben eigene Regeln. */
export function lintTargets(changedFiles) {
  return changedFiles.filter(f => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && !f.startsWith('supabase/functions/'));
}

/** Liest die unabhängige Review: Zeile 1 reviewer, Zeile 2 sourceCommit, letzte Zeile VERDICT. */
export function parseReview(text) {
  const lines = text.trim().split('\n');
  return {
    reviewer: (lines[0] ?? '').replace(/^reviewer:\s*/, '').trim(),
    sourceCommit: (lines[1] ?? '').replace(/^sourceCommit:\s*/, '').trim(),
    verdict: (lines.at(-1) ?? '').replace(/^VERDICT:\s*/, '').trim(),
  };
}

/** Gründe, aus denen kein Nachweis gebaut werden darf (leer = in Ordnung). */
export function receiptProblems({ checks, review, commit, platform }) {
  const problems = [];
  if (checks.commit !== commit) problems.push(`checks.json gehört zu ${checks.commit}, HEAD ist ${commit}`);
  if (checks.platform !== platform) problems.push(`checks.json gehört zu ${checks.platform}, verlangt ist ${platform}`);
  for (const name of ['typecheck', 'eslint', 'diff', 'tests', 'coverage']) {
    const exit = checks.results?.[name]?.exitCode;
    if (exit !== 0) problems.push(`Prüfung ${name} nicht bestanden (Exit ${exit ?? 'fehlt'})`);
  }
  if (review.reviewer !== 'independent-agent') problems.push('review.md: Zeile 1 muss «reviewer: independent-agent» sein');
  if (review.sourceCommit !== commit) problems.push(`review.md gehört zu ${review.sourceCommit || '(leer)'}, HEAD ist ${commit}`);
  if (review.verdict !== 'PASS') problems.push(`review.md: VERDICT ist «${review.verdict || '(leer)'}», nicht PASS`);
  return problems;
}

const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

function step(name, cmd, args, { cwd, log, env }) {
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  writeFileSync(log, `${r.stdout ?? ''}${r.stderr ?? ''}`);
  const exitCode = r.status ?? 1;
  console.log(`${name}=${exitCode} (${Math.round((Date.now() - started) / 1000)} s)`);
  return exitCode;
}

function run(o, repo) {
  const dir = resolve(o.evidence);
  mkdirSync(dir, { recursive: true });
  const commit = git(repo, 'rev-parse', 'HEAD');
  const base = git(repo, 'rev-parse', '--verify', `${o.base}^{commit}`);
  if (git(repo, 'status', '--porcelain', '--untracked-files=no')) {
    console.error('STOP: Arbeitsverzeichnis hat ungesicherte Änderungen. Geprüft wird nur ein sauberer Commit.');
    return 2;
  }
  console.log(`== ${o.platform} ${commit} base ${base}`);
  const results = {};

  results.typecheck = { exitCode: step('typecheck', 'npx', ['tsc', '--noEmit', '-p', '.'], { cwd: repo, log: join(dir, 'typecheck.log') }) };

  const changed = git(repo, 'diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD').split('\n').filter(Boolean);
  const targets = lintTargets(changed);
  if (targets.length) {
    const r = spawnSync('npx', ['eslint', '-f', 'json', ...targets], { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    writeFileSync(join(dir, 'eslint.json'), r.stdout || '[]');
    results.eslint = { exitCode: r.status ?? 1, files: targets.length };
  } else {
    writeFileSync(join(dir, 'eslint.json'), '[]');
    results.eslint = { exitCode: 0, files: 0 };
  }
  console.log(`eslint=${results.eslint.exitCode} (${results.eslint.files} Dateien)`);

  results.diff = { exitCode: step('diff', 'git', ['-C', repo, 'diff', '--check', base, 'HEAD'], { cwd: repo, log: join(dir, 'diff.log') }) };

  results.tests = {
    exitCode: step('jest', 'npx', ['jest', ...JEST_ROOTS, '--maxWorkers=3', '--json', `--outputFile=${join(dir, 'tests.json')}`],
      { cwd: repo, log: join(dir, 'jest.log'), env: { TZ: 'Europe/Zurich' } }),
  };

  results.coverage = {
    exitCode: step('coverage', 'node', ['scripts/check-ota-coverage.mjs', '--live', '--candidate', commit, '--platform', o.platform],
      { cwd: repo, log: join(dir, 'coverage.log') }),
  };

  const ok = Object.values(results).every(r => r.exitCode === 0);
  writeFileSync(join(dir, CHECKS_FILE), JSON.stringify({ schemaVersion: 1, commit, base, platform: o.platform, finishedAt: new Date().toISOString(), results }, null, 1) + '\n');
  console.log(ok ? `OK: alle Pflichtprüfungen bestanden. Belege: ${dir}` : `STOP: mindestens eine Pflichtprüfung nicht bestanden. Belege: ${dir}`);
  return ok ? 0 : 1;
}

async function receipt(o, repo) {
  const dir = resolve(o.evidence);
  const sha = p => createHash('sha256').update(readFileSync(join(dir, p))).digest('hex');
  for (const f of [CHECKS_FILE, 'review.md', 'typecheck.log', 'eslint.json', 'tests.json', 'diff.log']) {
    if (!existsSync(join(dir, f))) { console.error(`STOP: ${f} fehlt in ${dir}.`); return 2; }
  }
  const commit = git(repo, 'rev-parse', 'HEAD');
  const tree = git(repo, 'rev-parse', 'HEAD^{tree}');
  const checks = JSON.parse(readFileSync(join(dir, CHECKS_FILE), 'utf8'));
  const review = parseReview(readFileSync(join(dir, 'review.md'), 'utf8'));
  const problems = receiptProblems({ checks, review, commit, platform: o.platform });
  if (problems.length) {
    console.error(`STOP: kein Nachweis.\n- ${problems.join('\n- ')}`);
    return 1;
  }
  const eslint = JSON.parse(readFileSync(join(dir, 'eslint.json'), 'utf8'));
  const tests = JSON.parse(readFileSync(join(dir, 'tests.json'), 'utf8'));
  const body = {
    schemaVersion: 1,
    source: { commit, tree },
    target: { platform: o.platform, runtime: o.runtime },
    producer: 'Claude MASTER',
    scope: o.scope,
    checks: {
      typecheck: { exitCode: checks.results.typecheck.exitCode, evidence: { path: 'typecheck.log', sha256: sha('typecheck.log') } },
      eslint: {
        exitCode: checks.results.eslint.exitCode,
        errors: eslint.reduce((a, f) => a + f.errorCount, 0), warnings: eslint.reduce((a, f) => a + f.warningCount, 0),
        evidence: { path: 'eslint.json', sha256: sha('eslint.json') },
      },
      tests: {
        exitCode: checks.results.tests.exitCode, passed: tests.numPassedTests, failed: tests.numFailedTests, skipped: tests.numPendingTests,
        evidence: { path: 'tests.json', sha256: sha('tests.json') },
      },
      diff: { exitCode: checks.results.diff.exitCode, evidence: { path: 'diff.log', sha256: sha('diff.log') } },
    },
    review: { status: review.verdict, sourceCommit: review.sourceCommit, reviewer: 'Claude Pruefer-Agent (unabhaengig)', evidence: { path: 'review.md', sha256: sha('review.md') } },
  };
  const receiptPath = join(dir, 'quality-receipt.json');
  writeFileSync(receiptPath, JSON.stringify(body, null, 1) + '\n');
  const { validateQualityEvidence } = await import(pathToFileURL(join(repo, 'scripts/release-quality-evidence.mjs')).href);
  const res = validateQualityEvidence({ receiptPath, head: commit, tree, platform: o.platform, runtime: o.runtime, repositoryRoot: repo });
  console.log(`${o.platform} ${commit.slice(0, 8)} ${JSON.stringify(res)}`);
  return res.ok ? 0 : 1;
}

export async function main(argv = process.argv.slice(2), repo = process.cwd()) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`STOP: ${e.message}`); return 2; }
  return o.command === 'run' ? run(o, repo) : receipt(o, repo);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(code => process.exit(code), e => { console.error(`STOP: ${e.message}`); process.exit(2); });
}
