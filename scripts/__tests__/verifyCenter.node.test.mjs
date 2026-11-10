// Offline-Tests für reine Funktionen des Prüfzentrums (kein Docker, kein Netzwerk).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { newEntries, safeEnv } from '../verify-center/lib.mjs';
import { parseTsc, eslintFindings, jestFailures, buildQualityReceipt, normalizeMessage } from '../verify-center/code-layer.mjs';
import { stripDraftGuard, schemaPlan, regressionCases, SUITES } from '../verify-center/db-plan.mjs';
import { parseArgs } from '../verify-center.mjs';
import { validateQualityEvidence } from '../release-quality-evidence.mjs';

test('newEntries zählt nur zusätzliche Vorkommen (Multimenge)', () => {
  const key = x => x;
  assert.deepEqual(newEntries(['a', 'a', 'b'], ['a', 'b'], key), ['a']);
  assert.deepEqual(newEntries(['a'], ['a', 'a'], key), []);
  assert.deepEqual(newEntries(['c'], [], key), ['c']);
});

test('safeEnv entfernt Remote-DB-/Projektvariablen', () => {
  process.env.SUPABASE_DB_PASSWORD = 'x'; process.env.DATABASE_URL = 'postgres://remote'; process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x';
  process.env.PGHOST = 'remote';
  const env = safeEnv();
  for (const k of ['SUPABASE_DB_PASSWORD', 'DATABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL', 'PGHOST']) assert.equal(env[k], undefined, k);
  assert.equal(env.CI, 'true');
  delete process.env.SUPABASE_DB_PASSWORD; delete process.env.DATABASE_URL; delete process.env.EXPO_PUBLIC_SUPABASE_URL; delete process.env.PGHOST;
});

test('parseTsc liest Fehlerzeilen', () => {
  const e = parseTsc("app/a.tsx(3,5): error TS2322: Type 'x' is not assignable.\nsonstiges");
  assert.deepEqual(e, [{ file: 'app/a.tsx', line: 3, code: 'TS2322', message: "Type 'x' is not assignable." }]);
});

test('eslintFindings und jestFailures', () => {
  const f = eslintFindings([{ filePath: '/r/app/a.ts', messages: [{ line: 1, ruleId: 'no-undef', severity: 2, message: 'm' }] }], '/r');
  assert.deepEqual(f, [{ file: 'app/a.ts', line: 1, rule: 'no-undef', severity: 2, message: 'm' }]);
  const j = jestFailures({ testResults: [
    { name: '/r/a.test.ts', status: 'failed', assertionResults: [{ status: 'failed', fullName: 'x' }, { status: 'passed', fullName: 'y' }] },
    { name: '/r/b.test.ts', status: 'failed', assertionResults: [] },
  ] });
  assert.deepEqual(j, [{ file: '/r/a.test.ts', test: 'x' }, { file: '/r/b.test.ts', test: '(Suite konnte nicht laufen)' }]);
});

test('stripDraftGuard entfernt nur den Freigabe-Guard und begin/commit', () => {
  const sql = [
    'do $$', 'begin', "  raise exception 'T-184: keine Ausführungsfreigabe. Nicht ausführen.';", 'end', '$$;', '',
    'begin;', 'alter table t add column c text;',
    'do $$ begin perform 1; end $$;',
    'create function f() returns void language plpgsql as $f$', 'begin', '  null;', 'end $f$;',
    'commit;',
  ].join('\n');
  const r = stripDraftGuard(sql, /keine Ausführungsfreigabe/);
  assert.equal(r.removedGuards, 1);
  assert.equal(r.removedTx, 2);
  assert.doesNotMatch(r.sql, /keine Ausführungsfreigabe/);
  assert.match(r.sql, /do \$\$ begin perform 1; end \$\$;/);
  assert.match(r.sql, /alter table t add column c text;/);
  assert.match(r.sql, /\nbegin\n {2}null;/, 'plpgsql-begin ohne Semikolon bleibt');
});

test('schemaPlan ordnet Root-Setup vor die abhängige Migration', () => {
  const root = mkdtempSync(join(tmpdir(), 'vc-plan-'));
  try {
    mkdirSync(join(root, 'supabase/migrations'), { recursive: true });
    mkdirSync(join(root, 'supabase/local'), { recursive: true });
    for (const f of ['20260913220000_track_markers_contract.sql', '20260802100000_user_entitlements.sql', 'README.md']) writeFileSync(join(root, 'supabase/migrations', f), '');
    for (const f of ['TRACK_MODULE_SETUP.sql', 'TRACK_MARKER_ANGLE.sql', 'SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql']) writeFileSync(join(root, f), '');
    for (const f of ['a_cases.sql', 'b_rls_test.sql', 'baseline.sql']) writeFileSync(join(root, 'supabase/local', f), '');
    const ids = schemaPlan(root).map(s => s.id);
    assert.deepEqual(ids, ['baseline.sql', 'SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql', '20260802100000_user_entitlements.sql',
      'TRACK_MODULE_SETUP.sql', 'TRACK_MARKER_ANGLE.sql', '20260913220000_track_markers_contract.sql']);
    assert.deepEqual(regressionCases(root).map(c => c.id), ['a_cases.sql', 'b_rls_test.sql']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('parseArgs validiert Ebenen, Suiten und Plattform', () => {
  assert.deepEqual(parseArgs(['--layers', 'db', '--db-suite', 'training-doku-rating-scale']).layers, ['db']);
  assert.throws(() => parseArgs(['--layers', 'ota']), /Unbekannte Ebene/);
  assert.throws(() => parseArgs(['--db-suite', 'nope']), /Unbekannte DB-Suite/);
  assert.throws(() => parseArgs(['--platform', 'web']), /ios\|android/);
  assert.throws(() => parseArgs(['--target']), /braucht einen Wert/);
  assert.ok(SUITES['training-doku-rating-scale'].markers.length === 3);
});

test('Qualitätsbeleg ist schema-kompatibel; ohne Review nicht release-tauglich', () => {
  const repo = mkdtempSync(join(tmpdir(), 'vc-repo-'));
  const out = mkdtempSync(join(tmpdir(), 'vc-out-'));
  try {
    mkdirSync(join(out, 'evidence'));
    for (const f of ['typecheck.log', 'eslint.json', 'jest.json', 'diff-check.log']) writeFileSync(join(out, 'evidence', f), f);
    const head = 'a'.repeat(40); const tree = 'b'.repeat(40);
    const code = { verdict: 'PASS', absoluteClean: true, checks: {
      typecheck: { exitCode: 0, evidence: 'evidence/typecheck.log' },
      eslint: { exitCode: 0, errors: 0, warnings: 2, evidence: 'evidence/eslint.json' },
      tests: { exitCode: 0, passed: 10, failed: 0, skipped: 1, evidence: 'evidence/jest.json' },
      diff: { exitCode: 0, evidence: 'evidence/diff-check.log' } } };
    const receipt = buildQualityReceipt({ out, head, tree, platform: 'ios', runtime: '1.0.8', code, producer: 'verify-center@x' });
    writeFileSync(join(out, 'quality-evidence.json'), JSON.stringify(receipt));
    const v = validateQualityEvidence({ receiptPath: join(out, 'quality-evidence.json'), head, tree, platform: 'ios', runtime: '1.0.8', repositoryRoot: repo });
    assert.equal(v.ok, false);
    assert.ok(v.problems.some(p => /Review/.test(p)), v.problems.join(';'));
    assert.ok(!v.problems.some(p => /HEAD\/Tree|Plattform|ESLint|Testnachweis|fehlgeschlagen/.test(p)), v.problems.join(';'));

    // Mit unabhängigem Review (anderer Reviewer, gleicher Commit) wird der Beleg gültig.
    writeFileSync(join(out, 'evidence', 'review.md'), 'PASS');
    receipt.review = { status: 'PASS', reviewer: 'Review-Agent', sourceCommit: head,
      evidence: { path: 'evidence/review.md', sha256: createHash('sha256').update('PASS').digest('hex') } };
    writeFileSync(join(out, 'quality-evidence.json'), JSON.stringify(receipt));
    const ok = validateQualityEvidence({ receiptPath: join(out, 'quality-evidence.json'), head, tree, platform: 'ios', runtime: '1.0.8', repositoryRoot: repo });
    assert.deepEqual(ok, { ok: true, problems: [] });
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
});

test('normalizeMessage macht ESLint-Meldungen zwischen Snapshots vergleichbar', () => {
  const m = r => `Error: Calling setState\n\n${r}/app/a.tsx:9:3\n  9 | x`;
  assert.equal(normalizeMessage(m('/tmp/w/head'), '/tmp/w/head'), normalizeMessage(m('/tmp/w/base'), '/tmp/w/base'));
  assert.equal(normalizeMessage('Pfad /tmp/w/head/x.ts', '/tmp/w/head'), 'Pfad x.ts');
});
