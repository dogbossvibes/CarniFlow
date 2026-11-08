// Verhaltenstests für die ANYVO-Claude-Hooks. Ausführen:
//   node --test scripts/__tests__/claudeHooks.node.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCommand, checkFile, evaluate, isSecretFile, DENY, ASK } from '../../.claude/hooks/anyvo-guard.mjs';
import { buildContext, summarizeStatus } from '../../.claude/hooks/anyvo-session-context.mjs';
import { lintTarget } from '../../.claude/hooks/anyvo-post-edit-lint.mjs';
import { analyzeDiffText, findSecretLikeLines } from '../claude/quality-check.mjs';
import { versionFacts } from '../claude/release-preflight.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const decision = (cmd) => checkCommand(cmd)?.[0] ?? null;

test('Release-, OTA-, Build- und DB-Befehle werden gesperrt', () => {
  for (const cmd of [
    'eas update --channel production --platform ios --message x',
    'npx eas-cli@latest build --profile production --platform android',
    'eas submit -p ios',
    'EAS_NO_VCS=1 eas update --branch preview',
    'node scripts/update-production.mjs --platform ios --confirm --message x',
    'npm run update:production:ios -- --message x',
    'npm run build:prod:ios',
    'supabase db push',
    'npx supabase functions deploy delete-account',
    'gh pr merge 12 --squash',
    'gh api repos/o/r/pulls -X POST',
    'bash -c "eas update --channel production"',
    'cd /tmp && eas build',
    'eas env:list',
  ]) assert.equal(decision(cmd), DENY, cmd);
});

test('Datenverlust-Befehle in Git werden gesperrt', () => {
  for (const cmd of [
    'git reset --hard origin/main',
    'git -C /some/worktree clean -fd',
    'git checkout -- app/index.tsx',
    'git checkout .',
    'git restore lib/purchases.ts',
    'git stash drop',
    'git worktree remove --force ../anyvo-x',
    'git worktree prune',
    'git branch -D feat/x',
    'git push --force origin feat/x',
    'git push origin +feat/x',
    'git push origin :feat/x',
    'git push origin main',
    'rm -rf .git',
    'rm -rf /Users/moyo/canisflow-worktrees/anyvo-main',
  ]) assert.equal(decision(cmd), DENY, cmd);
});

test('normale Git-Schreibaktionen verlangen Bestätigung', () => {
  for (const cmd of [
    'git commit -m "x"',
    'git push origin chore/x',
    'git merge origin/main',
    'git switch -c feat/new',
    'git restore --staged file.ts',
    'git worktree add ../anyvo-x -b x',
    'npm install lodash',
    'npx expo install expo-camera',
    'gh pr create --title x',
  ]) assert.equal(decision(cmd), ASK, cmd);
});

test('lesende Befehle bleiben frei', () => {
  for (const cmd of [
    'git status --short',
    'git log --oneline -5',
    'git diff --check',
    'git worktree list',
    'npx tsc --noEmit',
    'npx jest --findRelatedTests lib/purchases.ts',
    'eas update:list --branch production --limit 3 --non-interactive',
    'eas build:list --limit 2',
    'gh pr list',
    'gh api repos/o/r/pulls',
    'cat .env.example',
    'grep -n KEY .env.qa.example',
    'rm -rf node_modules/.cache',
  ]) assert.equal(decision(cmd), null, cmd);
});

test('Secrets: Dateien werden erkannt, Vorlagen nicht', () => {
  assert.equal(isSecretFile('/r/.env'), true);
  assert.equal(isSecretFile('/r/.env.local'), true);
  assert.equal(isSecretFile('/r/.env.qa.local'), true);
  assert.equal(isSecretFile('/r/google-play-service-account.json'), true);
  assert.equal(isSecretFile('/r/AuthKey_ABC.p8'), true);
  assert.equal(isSecretFile('/r/.env.example'), false);
  assert.equal(isSecretFile('/r/.env.qa.example'), false);
  assert.equal(isSecretFile('/r/app/env.ts'), false);
  for (const cmd of ['cat .env', 'grep SUPABASE .env.local', 'head -3 google-play-service-account.json', 'printenv', 'env', 'security find-generic-password -s x']) {
    assert.equal(decision(cmd), DENY, cmd);
  }
});

test('Datei-Tools: Secrets, fremde Worktrees, Koordination, Migrationen', () => {
  const proj = '/Users/moyo/canisflow-worktrees/anyvo-task';
  assert.equal(checkFile('Read', '.env.local', proj)?.[0], DENY);
  assert.equal(checkFile('Write', '.env', proj)?.[0], DENY);
  assert.equal(checkFile('Read', 'app/index.tsx', proj), null);
  assert.equal(checkFile('Edit', 'app/index.tsx', proj), null);
  assert.equal(checkFile('Edit', '/Users/moyo/canisflow-worktrees/anyvo-main/app/index.tsx', proj)?.[0], ASK);
  assert.equal(checkFile('Edit', '/Users/moyo/canisflow/canisflow/lib/x.ts', proj)?.[0], ASK);
  assert.equal(checkFile('Write', '/private/tmp/scratch/notes.md', proj), null);
  assert.equal(checkFile('Edit', 'docs/agent/ANYVO_MASTER_STATUS.md', proj)?.[0], ASK);
  assert.equal(checkFile('Edit', 'docs/agent/tasks/T-181.md', proj), null);
  assert.equal(checkFile('Write', 'supabase/migrations/20261108_x.sql', proj)?.[0], ASK);
  assert.equal(checkFile('Edit', 'sources/foo.md', proj)?.[0], DENY);
  assert.equal(evaluate({ tool_name: 'Glob', tool_input: {} }, proj), null);
});

test('Guard-CLI liefert gültiges Hook-JSON', () => {
  const run = (input) => execFileSync('node', [join(ROOT, '.claude/hooks/anyvo-guard.mjs')], {
    input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  const out = JSON.parse(run({ tool_name: 'Bash', tool_input: { command: 'git reset --hard' } }));
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'git status' } }), '');
  const bad = spawnSync('node', [join(ROOT, '.claude/hooks/anyvo-guard.mjs')], { input: 'not json eas update --channel production', encoding: 'utf8' });
  assert.equal(bad.status, 0);
  assert.equal(JSON.parse(bad.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('Sitzungskontext zählt Änderungen und bleibt lesend', () => {
  assert.deepEqual(summarizeStatus(' M a.ts\n?? b.ts\nA  c.ts\n'), { modified: 2, untracked: 1 });
  const ctx = buildContext(ROOT);
  assert.match(ctx, /Branch: /);
  assert.match(ctx, /Lokale Änderungen: \d+ geändert, \d+ unversioniert/);
  const dir = mkdtempSync(join(tmpdir(), 'anyvo-nogit-'));
  try { assert.match(buildContext(dir), /kein Git-Repository/); } finally { rmSync(dir, { recursive: true }); }
});

test('Post-Edit-Lint wählt nur Projektquellcode', () => {
  const proj = '/r';
  const t = (file_path) => lintTarget({ tool_input: { file_path } }, proj);
  assert.equal(t('/r/lib/x.ts'), 'lib/x.ts');
  assert.equal(t('/r/app/(tabs)/home.tsx'), 'app/(tabs)/home.tsx');
  assert.equal(t('/r/docs/a.md'), null);
  assert.equal(t('/r/node_modules/x/index.js'), null);
  assert.equal(t('/r/ios/Pods/x.js'), null);
  assert.equal(t('/other/lib/x.ts'), null);
});

test('Qualitätscheck erkennt Whitespace-Fehler und Secret-Muster', () => {
  const diff = analyzeDiffText('a.ts', 'const a = 1;   \nconst b = 2;\n');
  assert.equal(diff.length, 1);
  assert.equal(diff[0].line, 1);
  const hits = findSecretLikeLines('x.ts', [
    'const url = "https://x.supabase.co";',
    'const key = "sk_live_' + 'abcdefghijklmnop1234";',
    // Synthetisches Fixture, aufgeteilt, damit der Scanner diese Datei nicht selbst meldet.
    'Authorization: Bearer ' + 'eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiIxIn0.abcdefghijk',
    '-----BEGIN ' + 'PRIVATE KEY-----',
  ]);
  assert.deepEqual(hits.map((h) => h.line), [2, 3, 4]);
  assert.ok(hits.every((h) => !h.text.includes('abcdefghijklmnop1234')), 'Treffer werden maskiert');
});

test('Release-Preflight liest Versionen ohne Secrets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anyvo-pre-'));
  try {
    writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { version: '1.0.4', runtimeVersion: { policy: 'appVersion' }, ios: { buildNumber: '60' }, android: { versionCode: 50 } } }));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.0.4', dependencies: { expo: '~54.0.36' } }));
    const v = versionFacts(dir);
    assert.equal(v.appVersion, '1.0.4');
    assert.equal(v.iosBuildNumber, '60');
    assert.equal(v.androidVersionCode, 50);
    assert.equal(v.runtimeVersion, 'policy:appVersion');
    assert.equal(v.expo, '~54.0.36');
    assert.deepEqual(v.warnings, []);
  } finally { rmSync(dir, { recursive: true }); }
});
