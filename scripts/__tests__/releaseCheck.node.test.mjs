import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, lintTargets, parseReview, receiptProblems } from '../release-check.mjs';

const sha = n => String(n).repeat(40).slice(0, 40);
const passed = { typecheck: { exitCode: 0 }, eslint: { exitCode: 0 }, diff: { exitCode: 0 }, tests: { exitCode: 0 }, coverage: { exitCode: 0 } };
const goodReview = `reviewer: independent-agent\nsourceCommit: ${sha('a')}\n- geprüft\nVERDICT: PASS\n`;

test('parseArgs accepts a complete run call', () => {
  const o = parseArgs(['run', '--platform', 'ios', '--base', sha('b'), '--evidence', 'out']);
  assert.deepEqual(o, { command: 'run', platform: 'ios', base: sha('b'), evidence: 'out' });
});

test('parseArgs rejects missing or unknown input', () => {
  assert.throws(() => parseArgs(['run', '--platform', 'ios', '--evidence', 'out']), /--base/);
  assert.throws(() => parseArgs(['run', '--platform', 'web', '--base', 'x', '--evidence', 'out']), /--platform/);
  assert.throws(() => parseArgs(['publish', '--platform', 'ios', '--evidence', 'out']), /run oder receipt/);
  assert.throws(() => parseArgs(['receipt', '--platform', 'ios', '--evidence', 'out', '--scope', 's']), /--runtime/);
  assert.throws(() => parseArgs(['run', '--platform', '--base', 'x']), /Wert fehlt/);
});

test('lintTargets keeps app code and skips edge functions and non-code', () => {
  assert.deepEqual(
    lintTargets(['app/a.tsx', 'supabase/functions/x/index.ts', 'docs/a.md', 'scripts/b.mjs', 'i18n/de-CH.ts']),
    ['app/a.tsx', 'scripts/b.mjs', 'i18n/de-CH.ts'],
  );
});

test('parseReview reads reviewer, commit and verdict', () => {
  assert.deepEqual(parseReview(goodReview), { reviewer: 'independent-agent', sourceCommit: sha('a'), verdict: 'PASS' });
});

test('receiptProblems is empty only when everything matches', () => {
  const checks = { commit: sha('a'), platform: 'ios', results: passed };
  assert.deepEqual(receiptProblems({ checks, review: parseReview(goodReview), commit: sha('a'), platform: 'ios' }), []);
});

test('receiptProblems names failed checks, wrong commit, wrong platform and missing PASS', () => {
  const checks = { commit: sha('a'), platform: 'ios', results: { ...passed, tests: { exitCode: 1 }, coverage: undefined } };
  const review = parseReview(`reviewer: independent-agent\nsourceCommit: ${sha('c')}\nVERDICT: FAIL\n`);
  const problems = receiptProblems({ checks, review, commit: sha('b'), platform: 'android' }).join('\n');
  assert.match(problems, /checks\.json gehört zu a+, HEAD ist b+/);
  assert.match(problems, /verlangt ist android/);
  assert.match(problems, /Prüfung tests nicht bestanden \(Exit 1\)/);
  assert.match(problems, /Prüfung coverage nicht bestanden \(Exit fehlt\)/);
  assert.match(problems, /review\.md gehört zu c+/);
  assert.match(problems, /nicht PASS/);
});

test('receiptProblems rejects a review that is not from the independent agent', () => {
  const checks = { commit: sha('a'), platform: 'ios', results: passed };
  const review = parseReview(`reviewer: master\nsourceCommit: ${sha('a')}\nVERDICT: PASS\n`);
  assert.match(receiptProblems({ checks, review, commit: sha('a'), platform: 'ios' }).join('\n'), /independent-agent/);
});
