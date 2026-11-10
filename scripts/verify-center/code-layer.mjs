// Ebene 1 – Code: Typecheck, ESLint (nur neue Fehler ggü. Basis zählen),
// Jest (betroffen + gesamt, neue Fehlschläge ggü. Basis), git diff --check.
// Geprüft wird der exakte Commit (git archive), nicht die Arbeitskopie.
import { existsSync, statSync, symlinkSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { run, git, sha256, sha256File, writeFile, readJson, log, newEntries } from './lib.mjs';

const TS_ERROR = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

export function parseTsc(output) {
  return output.split('\n').map(l => l.match(TS_ERROR)).filter(Boolean)
    .map(m => ({ file: m[1], line: Number(m[2]), code: m[4], message: m[5] }));
}

export function eslintFindings(json, root) {
  const out = [];
  for (const f of json ?? []) for (const m of f.messages ?? []) {
    out.push({ file: relative(root, f.filePath), line: m.line, rule: m.ruleId ?? '(parse)', severity: m.severity, message: normalizeMessage(m.message, root) });
  }
  return out;
}

// React-Compiler-Meldungen enthalten Codeauszug und absoluten Snapshot-Pfad;
// für den Basisvergleich zählt nur die erste Zeile ohne Pfad.
export function normalizeMessage(message, root) {
  const first = String(message ?? '').split('\n')[0];
  return root ? first.split(root + '/').join('').split(root).join('') : first;
}

export function jestFailures(json) {
  const failed = [];
  for (const file of json?.testResults ?? []) {
    const assertions = file.assertionResults ?? [];
    for (const a of assertions) if (a.status === 'failed') failed.push({ file: file.name, test: a.fullName });
    if (file.status === 'failed' && !assertions.some(a => a.status === 'failed')) failed.push({ file: file.name, test: '(Suite konnte nicht laufen)' });
  }
  return failed;
}

/**
 * Erstellt eine saubere, isolierte Kopie des Commits: `git clone --shared` (liest
 * Objekte des Ziel-Repos nur über alternates, schreibt nie hinein), Remote wird
 * entfernt (kein Push möglich), dann detached Checkout. Tests, die Git-Historie
 * brauchen (`git show <alter Commit>`), funktionieren so wie im Worktree.
 */
export function exportSnapshot(repo, commit, dest, nodeModulesFrom) {
  const common = resolve(repo, git(repo, 'rev-parse', '--git-common-dir'));
  const steps = [
    ['clone', '-q', '--shared', '--no-checkout', '--no-tags', common, dest],
    ['-C', dest, 'remote', 'remove', 'origin'],
    ['-C', dest, '-c', 'advice.detachedHead=false', 'checkout', '-q', '--detach', commit],
  ];
  for (const args of steps) {
    const r = run('git', args, { env: process.env });
    if (r.code !== 0) throw new Error(`git ${args.join(' ')} fehlgeschlagen: ${r.stderr}`);
  }
  const lock = join(dest, 'package-lock.json');
  const lockSha = existsSync(lock) ? sha256File(lock) : null;
  let exact = false;
  if (nodeModulesFrom) {
    symlinkSync(realpathSync(join(nodeModulesFrom, 'node_modules')), join(dest, 'node_modules'));
    const srcLock = join(nodeModulesFrom, 'package-lock.json');
    exact = Boolean(lockSha && existsSync(srcLock) && sha256File(srcLock) === lockSha);
  }
  return { dir: dest, lockSha, nodeModulesFrom, nodeModulesExact: exact };
}

/** Sucht eine installierte node_modules-Quelle, deren package-lock exakt zum Commit passt. */
export function findNodeModules(candidates, wantedLockSha) {
  const usable = candidates.filter(c => c && existsSync(join(c, 'node_modules', '.package-lock.json')) && statSync(join(c, 'node_modules')).isDirectory());
  return usable.find(c => existsSync(join(c, 'package-lock.json')) && sha256File(join(c, 'package-lock.json')) === wantedLockSha) ?? null;
}

function bin(dir, name) { return join(dir, 'node_modules', '.bin', name); }

function runTsc(dir) {
  const r = run(bin(dir, 'tsc'), ['--noEmit', '--pretty', 'false'], { cwd: dir });
  return { ...r, errors: parseTsc(r.stdout + r.stderr) };
}

function runEslint(dir, outFile) {
  const r = run(bin(dir, 'eslint'), ['-f', 'json', '-o', outFile, '.'], { cwd: dir });
  const json = readJson(outFile, null);
  return { ...r, json, findings: json ? eslintFindings(json, dir) : null };
}

function runJest(dir, outFile, extra = []) {
  const r = run(bin(dir, 'jest'), ['--ci', '--silent', '--json', `--outputFile=${outFile}`, ...extra], { cwd: dir, timeoutMs: 40 * 60 * 1000 });
  return { ...r, json: readJson(outFile, null) };
}

const jestCounts = json => json ? {
  passed: json.numPassedTests, failed: json.numFailedTests,
  skipped: (json.numPendingTests ?? 0) + (json.numTodoTests ?? 0), suites: json.numTotalTestSuites,
} : null;

export async function runCodeLayer({ target, head, base, work, out, nodeModulesCandidates }) {
  const ev = join(out, 'evidence');
  const result = { layer: 'code', checks: {}, notes: [] };
  const headLock = sha256(run('git', ['-C', target, 'show', `${head}:package-lock.json`], { env: process.env }).stdout);
  const nm = findNodeModules(nodeModulesCandidates, headLock);
  if (!nm) {
    result.verdict = 'FAIL';
    result.notes.push('Keine installierten node_modules mit exakt passendem package-lock gefunden. Im Ziel-Worktree `npm ci` ausführen (Nutzer/Owner) und erneut prüfen.');
    return result;
  }
  log(`Code: Snapshot ${head.slice(0, 8)} / Basis ${base.slice(0, 8)}, node_modules aus ${nm}`);
  const h = exportSnapshot(target, head, join(work, 'head'), nm);
  const b = exportSnapshot(target, base, join(work, 'base'), nm);
  result.snapshot = { nodeModulesFrom: nm, headLockExact: h.nodeModulesExact, baseLockExact: b.nodeModulesExact };
  if (!b.nodeModulesExact) result.notes.push('Basis hat ein anderes package-lock; Basis-Vergleich nutzt die node_modules des HEAD (Näherung).');

  // Typecheck
  log('Code: tsc (HEAD)');
  const tsc = runTsc(h.dir);
  writeFile(join(ev, 'typecheck.log'), tsc.stdout + tsc.stderr);
  let tscNew = tsc.errors;
  if (tsc.code !== 0) {
    log('Code: tsc (Basis) für Vergleich');
    const tb = runTsc(b.dir);
    writeFile(join(ev, 'typecheck-base.log'), tb.stdout + tb.stderr);
    tscNew = newEntries(tsc.errors, tb.errors, e => `${e.file}|${e.code}|${e.message}`);
  }
  result.checks.typecheck = { exitCode: tsc.code, errors: tsc.errors.length, newErrors: tscNew, ms: tsc.ms,
    verdict: tsc.code === 0 || (tsc.errors.length > 0 && tscNew.length === 0) ? 'PASS' : 'FAIL', evidence: 'evidence/typecheck.log' };

  // ESLint
  log('Code: ESLint (HEAD + Basis)');
  const le = runEslint(h.dir, join(ev, 'eslint.json'));
  const lb = runEslint(b.dir, join(ev, 'eslint-base.json'));
  if (!le.findings) {
    result.checks.eslint = { exitCode: le.code, verdict: 'FAIL', error: le.stderr.slice(0, 2000) };
  } else {
    const errs = le.findings.filter(f => f.severity === 2);
    const baseErrs = (lb.findings ?? []).filter(f => f.severity === 2);
    const added = newEntries(errs, baseErrs, f => `${f.file}|${f.rule}|${f.message}`);
    result.checks.eslint = { exitCode: le.code, errors: errs.length, warnings: le.findings.length - errs.length,
      baseErrors: lb.findings ? baseErrs.length : null, newErrors: added, ms: le.ms + lb.ms,
      verdict: lb.findings && added.length === 0 ? 'PASS' : 'FAIL', evidence: 'evidence/eslint.json' };
  }

  // Jest betroffen
  const changed = git(target, 'diff', '--name-only', '--diff-filter=ACMR', `${base}..${head}`).split('\n')
    .filter(f => /\.(tsx?|jsx?|mjs|cjs)$/.test(f) && existsSync(join(h.dir, f)));
  if (changed.length) {
    log(`Code: Jest betroffen (${changed.length} geänderte Dateien)`);
    const ja = runJest(h.dir, join(ev, 'jest-affected.json'), ['--findRelatedTests', ...changed]);
    const fa = jestFailures(ja.json);
    result.checks.testsAffected = { exitCode: ja.code, ...jestCounts(ja.json), failures: fa, changedFiles: changed.length,
      verdict: ja.json && ja.json.numTotalTests > 0 ? (fa.length === 0 ? 'PASS' : 'CHECK_FULL') : 'NO_TESTS', ms: ja.ms };
  } else {
    result.checks.testsAffected = { verdict: 'NO_TESTS', changedFiles: 0 };
  }

  // Jest gesamt
  log('Code: Jest gesamt');
  const jf = runJest(h.dir, join(ev, 'jest.json'));
  writeFile(join(ev, 'jest.log'), jf.stderr.slice(-200000));
  const failures = jestFailures(jf.json);
  let newFailures = failures;
  if (failures.length) {
    const files = [...new Set(failures.map(f => relative(h.dir, f.file)))].filter(f => existsSync(join(b.dir, f)));
    if (files.length) {
      log(`Code: ${files.length} fehlschlagende Testdateien gegen Basis prüfen`);
      const jb = runJest(b.dir, join(ev, 'jest-base-failing.json'), ['--runTestsByPath', ...files]);
      const baseFail = jestFailures(jb.json).map(f => ({ ...f, file: relative(b.dir, f.file) }));
      newFailures = newEntries(failures.map(f => ({ ...f, file: relative(h.dir, f.file) })), baseFail, f => `${f.file}|${f.test}`);
    } else {
      newFailures = failures.map(f => ({ ...f, file: relative(h.dir, f.file) }));
    }
  }
  // Neue Fehlschläge einmal isoliert wiederholen: bestehen sie dann, gelten sie als
  // instabil (lastabhängig) – sichtbar gemeldet, aber nicht als Regression gezählt.
  let flaky = [];
  if (newFailures.length) {
    const files = [...new Set(newFailures.map(f => f.file))];
    log(`Code: ${files.length} Testdatei(en) mit neuen Fehlschlägen isoliert wiederholen`);
    const jr = runJest(h.dir, join(ev, 'jest-rerun.json'), ['--runTestsByPath', ...files]);
    const still = jr.json ? jestFailures(jr.json).map(f => ({ ...f, file: relative(h.dir, f.file) })) : null;
    if (still) {
      flaky = newFailures.filter(f => !still.some(x => x.file === f.file && x.test === f.test));
      newFailures = newFailures.filter(f => still.some(x => x.file === f.file && x.test === f.test));
    }
  }
  result.checks.tests = { exitCode: jf.code, ...jestCounts(jf.json), failures: failures.map(f => ({ ...f, file: relative(h.dir, f.file) })),
    newFailures, flaky, ms: jf.ms, verdict: jf.json && jf.json.numPassedTests > 0 && newFailures.length === 0 ? 'PASS' : 'FAIL', evidence: 'evidence/jest.json' };
  if (result.checks.testsAffected.verdict === 'CHECK_FULL') {
    const affectedNew = result.checks.testsAffected.failures.filter(f => newFailures.some(n => f.test === n.test));
    result.checks.testsAffected.verdict = affectedNew.length ? 'FAIL' : 'PASS';
    result.checks.testsAffected.note = 'Fehlschläge vorbestehend (auch auf Basis).';
  }

  // git diff --check
  const dc = run('git', ['-C', target, 'diff', '--check', `${base}..${head}`], { env: process.env });
  writeFile(join(ev, 'diff-check.log'), `git diff --check ${base}..${head}\nexit=${dc.code}\n${dc.stdout}${dc.stderr}`);
  result.checks.diff = { exitCode: dc.code, verdict: dc.code === 0 ? 'PASS' : 'FAIL', evidence: 'evidence/diff-check.log' };

  const verdicts = ['typecheck', 'eslint', 'testsAffected', 'tests', 'diff'].map(k => result.checks[k]?.verdict);
  result.verdict = verdicts.every(v => v === 'PASS' || v === 'NO_TESTS') ? 'PASS' : 'FAIL';
  result.absoluteClean = tsc.code === 0 && result.checks.eslint?.errors === 0 && jf.code === 0 && dc.code === 0;
  result.headDir = h.dir;
  result.baseDir = b.dir;
  return result;
}

/** Beleg im Schema von scripts/release-quality-evidence.mjs (schemaVersion 1). */
export function buildQualityReceipt({ out, head, tree, platform, runtime, code, producer }) {
  const evidence = rel => ({ path: rel, sha256: sha256(readFileSync(resolve(out, rel))) });
  const c = code.checks;
  const receipt = {
    schemaVersion: 1,
    producer,
    createdAt: new Date().toISOString(),
    source: { commit: head, tree },
    target: { platform: platform ?? null, runtime: runtime ?? null },
    checks: {
      typecheck: { exitCode: c.typecheck.exitCode, evidence: evidence(c.typecheck.evidence) },
      eslint: { exitCode: c.eslint.exitCode, errors: c.eslint.errors, warnings: c.eslint.warnings, evidence: evidence(c.eslint.evidence) },
      tests: { exitCode: c.tests.exitCode, passed: c.tests.passed, failed: c.tests.failed, skipped: c.tests.skipped, evidence: evidence(c.tests.evidence) },
      diff: { exitCode: c.diff.exitCode, evidence: evidence(c.diff.evidence) },
    },
    // Unabhängiger Review kann nicht vom Erzeuger selbst bestätigt werden.
    review: { status: 'PENDING', reviewer: null, sourceCommit: head, evidence: null },
    verifyCenter: { verdict: code.verdict, absoluteClean: code.absoluteClean },
  };
  return receipt;
}
