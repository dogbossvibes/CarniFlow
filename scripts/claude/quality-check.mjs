#!/usr/bin/env node
// ANYVO Qualitätscheck für Claude-Arbeit im aktuellen Worktree.
// Ausschliesslich lesend und lokal: kein fetch, kein Push, keine Remote-Aufrufe,
// kein --fix, keine Dateiänderung. Secrets werden nie im Klartext ausgegeben.
//
//   node scripts/claude/quality-check.mjs              # geänderte Dateien gegen HEAD
//   node scripts/claude/quality-check.mjs --base origin/main
//   node scripts/claude/quality-check.mjs --full       # zusätzlich alle Jest-Tests
//   node scripts/claude/quality-check.mjs --skip-tsc   # nur für Doku-Änderungen
//
// Exit 0 = alle ausgeführten Prüfungen bestanden, 1 = Befund, 2 = nicht bestimmbar.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|toml|sql|swift|kt|kts|gradle|plist|xml|html|css|sh|txt)$/;
const SECRET_PATTERNS = [
  [/\b(sk|rk)_(live|test)_[A-Za-z0-9]{12,}/, 'Stripe-artiger Schlüssel'],
  [/\b(appl|goog|amzn)_[A-Za-z0-9]{20,}/, 'RevenueCat-SDK-Schlüssel'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}/, 'JWT/Supabase-Key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'Private Key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub-Token'],
  [/\bsbp_[A-Za-z0-9]{30,}/, 'Supabase-Access-Token'],
  [/\b(AKIA|ASIA)[A-Z0-9]{16}\b/, 'AWS-Key'],
  // Zusammengesetzt, damit dieses Skript sich nicht selbst meldet.
  [new RegExp(['service', 'role'].join('_') + '\\s*[:=]\\s*["\']ey', 'i'), 'Supabase-Service-Role-Wert'],
];

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...opts });
}
function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
}

export function analyzeDiffText(file, text) {
  const issues = [];
  text.split('\n').forEach((line, i) => {
    if (/[ \t]+$/.test(line)) issues.push({ file, line: i + 1, problem: 'Leerzeichen am Zeilenende' });
    if (/^(<<<<<<<|>>>>>>>|=======)( |$)/.test(line)) issues.push({ file, line: i + 1, problem: 'Konfliktmarker' });
  });
  return issues;
}

const mask = (s) => s.replace(/[A-Za-z0-9_\-+/=]{12,}/g, (m) => `${m.slice(0, 4)}…(${m.length})`);
export function findSecretLikeLines(file, lines) {
  const hits = [];
  lines.forEach((line, i) => {
    for (const [re, label] of SECRET_PATTERNS) {
      if (re.test(line)) { hits.push({ file, line: i + 1, label, text: mask(line.trim()).slice(0, 120) }); break; }
    }
  });
  return hits;
}

export function changedFiles(root, base) {
  const tracked = git(root, 'diff', '--name-only', '--diff-filter=ACMR', base).split('\n').filter(Boolean);
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
  return { tracked, untracked, all: [...new Set([...tracked, ...untracked])] };
}

function addedLines(root, base, file, untracked) {
  if (untracked) return readFileSync(join(root, file), 'utf8').split('\n');
  const diff = git(root, 'diff', '-U0', base, '--', file);
  return diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
}

function main() {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const baseIdx = args.indexOf('--base');
  const base = baseIdx >= 0 ? args[baseIdx + 1] : 'HEAD';
  let root;
  try { root = git(process.cwd(), 'rev-parse', '--show-toplevel'); } catch { console.error('STOP: kein Git-Repository.'); process.exit(2); }
  const results = [];
  const record = (name, status, detail = '') => { results.push({ name, status, detail }); console.log(`${status === 'PASS' ? '✓' : status === 'SKIP' ? '–' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

  console.log(`ANYVO Qualitätscheck · ${root}`);
  console.log(`Branch ${git(root, 'branch', '--show-current') || '(detached)'} @ ${git(root, 'rev-parse', '--short', 'HEAD')} · Basis ${base}\n`);
  let files;
  try { files = changedFiles(root, base); } catch { console.error(`STOP: Basis ${base} nicht auflösbar.`); process.exit(2); }
  const existing = files.all.filter((f) => existsSync(join(root, f)) && statSync(join(root, f)).isFile());
  console.log(`Geänderte Dateien: ${files.tracked.length} versioniert, ${files.untracked.length} unversioniert\n`);

  // 1. Whitespace/Konfliktmarker: git diff --check + unversionierte Textdateien
  const check = sh('git', ['-C', root, 'diff', '--check', base]);
  const wsIssues = files.untracked.filter((f) => TEXT.test(f) && existsSync(join(root, f)) && statSync(join(root, f)).size < 2_000_000)
    .flatMap((f) => analyzeDiffText(f, readFileSync(join(root, f), 'utf8')));
  if (check.status === 0 && wsIssues.length === 0) record('git diff --check (+ unversionierte Textdateien)', 'PASS');
  else record('git diff --check (+ unversionierte Textdateien)', 'FAIL', [check.stdout.trim(), ...wsIssues.map((i) => `${i.file}:${i.line} ${i.problem}`)].filter(Boolean).join('; ').slice(0, 800));

  // 2. Secret-Muster in hinzugefügten Zeilen
  const secretHits = existing.filter((f) => TEXT.test(f)).flatMap((f) => findSecretLikeLines(f, addedLines(root, base, f, files.untracked.includes(f))));
  record('Secret-Muster in neuen Zeilen', secretHits.length ? 'FAIL' : 'PASS', secretHits.map((h) => `${h.file}:${h.line} ${h.label}`).join('; '));

  const hasNodeModules = existsSync(join(root, 'node_modules/.bin/tsc'));
  const code = existing.filter((f) => CODE.test(f) && !/^(ios|android|_bmad|\.agents|dist)\//.test(f));
  // 3. TypeScript (gesamtes Projekt: Typfehler wirken dateiübergreifend)
  if (flag('--skip-tsc')) record('TypeScript (tsc --noEmit)', 'SKIP', 'auf Wunsch übersprungen');
  else if (!hasNodeModules) record('TypeScript (tsc --noEmit)', 'FAIL', 'node_modules fehlt — nicht ausführbar, kein Bestehen');
  else {
    const r = sh(join(root, 'node_modules/.bin/tsc'), ['--noEmit'], { cwd: root, timeout: 600000 });
    record('TypeScript (tsc --noEmit)', r.status === 0 ? 'PASS' : 'FAIL', r.status === 0 ? '' : `${(r.stdout.match(/error TS/g) || []).length} Fehler; erste: ${r.stdout.split('\n').slice(0, 3).join(' | ')}`);
  }
  // 4. ESLint nur für geänderte Code-Dateien
  if (!code.length) record('ESLint (geänderte Dateien)', 'SKIP', 'keine Code-Dateien geändert');
  else if (!hasNodeModules) record('ESLint (geänderte Dateien)', 'FAIL', 'node_modules fehlt');
  else {
    const r = sh(join(root, 'node_modules/.bin/eslint'), ['--no-warn-ignored', ...code], { cwd: root, timeout: 600000 });
    const errors = Number((r.stdout.match(/(\d+) errors?/) || [0, 0])[1]);
    const warnings = Number((r.stdout.match(/(\d+) warnings?/) || [0, 0])[1]);
    record('ESLint (geänderte Dateien)', r.status === 0 ? 'PASS' : errors ? 'FAIL' : 'PASS', `${errors} Fehler, ${warnings} Warnungen`);
  }
  // 5. Jest: betroffene Tests oder komplett
  const jestBin = join(root, 'node_modules/.bin/jest');
  if (!existsSync(jestBin)) record('Jest', 'FAIL', 'node_modules fehlt');
  else if (!flag('--full') && !code.length) record('Jest (betroffene Tests)', 'SKIP', 'keine Code-Dateien geändert');
  else {
    const jestArgs = flag('--full') ? ['--ci', '--silent'] : ['--ci', '--silent', '--passWithNoTests', '--findRelatedTests', ...code];
    const r = sh(jestBin, jestArgs, { cwd: root, timeout: 1200000 });
    const summary = (r.stderr + r.stdout).split('\n').filter((l) => /^(Tests|Test Suites):/.test(l)).join(' · ');
    record(flag('--full') ? 'Jest (alle Tests)' : 'Jest (betroffene Tests)', r.status === 0 ? 'PASS' : 'FAIL', summary || (r.status === null ? 'Timeout/Abbruch' : `Exit ${r.status}`));
  }
  // 6. Node-Tests der Tooling-Skripte, wenn Skripte geändert wurden
  const toolingTests = files.all.some((f) => /^(scripts|\.claude\/hooks)\//.test(f));
  if (toolingTests) {
    const r = sh('node', ['--test', 'scripts/__tests__/claudeHooks.node.test.mjs'], { cwd: root, timeout: 300000 });
    record('Node-Tests Claude-Tooling', r.status === 0 ? 'PASS' : 'FAIL', (r.stdout.match(/^(?:#|ℹ) (pass|fail) \d+/gm) || []).join(' '));
  }
  // 7. Kritische Bereiche markieren (kein Fehler, aber Abnahmehinweis)
  const critical = [
    [/(^|\/)(track|tracking|faehrte|gps|sensor|imu|location)/i, 'GPS/Tracking/Fährte → /anyvo-tracking-review + Feldtest'],
    [/(^|\/)(supabase\/|.*rls|.*polic)/i, 'Supabase/RLS → /anyvo-security-review'],
    [/(purchases|revenuecat|subscription|entitlement|paywall|quota)/i, 'RevenueCat/Abo → Sandbox-Kauf/Restore prüfen'],
    [/^(ios|android|plugins|modules)\/|app\.json$|app\.config\.|eas\.json$|package\.json$/, 'Native/Config → check-native-changes + nativer Build nötig?'],
  ];
  const flags = [...new Set(files.all.flatMap((f) => critical.filter(([re]) => re.test(f)).map(([, l]) => l)))];
  if (flags.length) { console.log('\nKritische Bereiche berührt (Abnahme nötig):'); flags.forEach((l) => console.log(`  • ${l}`)); }

  const failed = results.filter((r) => r.status === 'FAIL');
  console.log(`\nErgebnis: ${failed.length ? `${failed.length} Prüfung(en) nicht bestanden` : 'alle ausgeführten Prüfungen bestanden'}; übersprungen: ${results.filter((r) => r.status === 'SKIP').length}.`);
  console.log('Hinweis: Unit-Tests ersetzen keine Geräte-/Feldabnahme. Kein Commit/Push ausgeführt.');
  process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
