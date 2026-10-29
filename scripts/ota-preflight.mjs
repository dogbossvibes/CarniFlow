// Local half of --prepare in the existing OTA wrapper. No publish/build/DB calls.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { artifact, writeNew } from './ota-candidate.mjs';

export function runReleaseQuality({ plan, directory, root, source, target, fullSuite }) {
  directory = resolve(directory);
  const rel = relative(root, directory);
  if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../')) throw new Error('OUTPUT_INSIDE_SOURCE');
  // Parent must already exist; no overwritten evidence from earlier candidates.
  if (!existsSync(dirname(directory))) throw new Error('OUTPUT_PARENT_MISSING');
  if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  if (!plan.review || plan.review.sourceCommit !== source.commit) throw new Error('INDEPENDENT_REVIEW_MISSING');
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
  if (scripts?.typecheck !== 'tsc --noEmit' || scripts.lint !== 'expo lint' || scripts.test !== 'jest' || scripts['test:process'] !== 'node --test scripts/__tests__/developmentProcess.node.test.mjs scripts/__tests__/otaCandidate.node.test.mjs scripts/__tests__/otaPreparation.node.test.mjs') throw new Error('QUALITY_COMMAND_CONTRACT_CHANGED');
  const checks = {};
  const run = (key, args) => {
    const result = spawnSync('npm', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, CI: '1', GIT_OPTIONAL_LOCKS: '0', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1' } });
    const output = String(result.stdout ?? '') + String(result.stderr ?? '');
    const exitCode = result.error || typeof result.status !== 'number' ? 1 : result.status;
    const file = join(directory, key + '.log');writeFileSync(file, output, { flag: 'wx', mode: 0o600 });
    checks[key] = { exitCode, evidence: artifact(file, root) };
    if (exitCode !== 0) throw new Error('LOCAL_CHECK_FAILED_' + key);
  };
  run('typecheck', ['run', 'typecheck', '--', '--incremental', 'false']);
  run('eslint', ['run', 'lint', '--', '--no-cache']);
  // Never accept reported errors even if an upstream CLI erroneously exits 0.
  // ANSI control sequences must not conceal a formatter's error summary.
  const lint = stripVTControlCharacters(readFileSync(join(directory, 'eslint.log'), 'utf8'));
  if ([...lint.matchAll(/(\d+) errors?\b/g)].some(m => Number(m[1]) > 0) || /(?:^|\n)\s*\d+:\d+\s+error\b/.test(lint)) throw new Error('ESLINT_REPORTED_ERRORS');
  checks.eslint.errors = 0;checks.eslint.warnings = Number(/(\d+) warnings?/.exec(lint)?.[1] ?? 0);
  run('process', ['run', 'test:process']);
  const testsJson = join(directory, 'jest.json');
  const testArgs = ['test', '--', '--runInBand', '--watch=false', '--watchman=false', '--json', '--outputFile', testsJson];
  if (!fullSuite) {
    if (!Array.isArray(plan.testPaths) || !plan.testPaths.length) throw new Error('RELEVANT_TEST_PATHS_MISSING');
    for (const path of plan.testPaths) if (typeof path !== 'string' || path.startsWith('-') || isAbsolute(path) || path.split('/').includes('..') || !/\.test\.[jt]sx?$/.test(path) || !existsSync(join(root, path))) throw new Error('INVALID_TEST_PATH');
    testArgs.push('--runTestsByPath', ...plan.testPaths);
  }
  run('tests', testArgs);
  artifact(testsJson, root);
  const tests = JSON.parse(readFileSync(testsJson, 'utf8'));
  if (!tests.success || tests.numFailedTests || tests.numFailedTestSuites || tests.numPassedTests < 1) throw new Error('JEST_RESULT_FAILED');
  Object.assign(checks.tests, { passed: tests.numPassedTests, failed: tests.numFailedTests, skipped: tests.numPendingTests, fullSuite });
  let diff = '';
  try { diff = execFileSync('git', ['diff', '--check'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }); }
  catch { throw new Error('DIFF_FAILED'); }
  const diffFile = join(directory, 'diff.log');writeFileSync(diffFile, diff, { flag: 'wx', mode: 0o600 });
  checks.diff = { exitCode: 0, evidence: artifact(diffFile, root) };
  const file = join(directory, 'quality.json');
  writeNew(file, { schemaVersion: 1, source: { commit: source.commit, tree: source.tree }, target: { platform: target.platform, runtime: target.runtime },
    producer: plan.producer, review: plan.review, checks });
  return file;
}
