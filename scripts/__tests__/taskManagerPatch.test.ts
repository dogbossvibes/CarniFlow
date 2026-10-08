import { spawnSync } from 'child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

// Exercise the real patch script against a private copy of the installed SDK
// source. Never patch the shared node_modules or invoke EAS in these tests.
// A normal npm install already applies our patch. Restore its known edits in
// the private fixture so the missing-patch cases also run after postinstall.
const original = readFileSync(join(dirname(require.resolve('expo-task-manager/package.json')),
  'android/src/main/java/expo/modules/taskManager/TaskService.java'), 'utf8')
  .replace('import android.os.Handler;\nimport android.os.Looper;', 'import android.os.Handler;')
  .replace('import java.util.UUID;\nimport java.util.concurrent.ConcurrentHashMap;', 'import java.util.UUID;')
  .replace('sTaskCallbacks = new ConcurrentHashMap<>();', 'sTaskCallbacks = new HashMap<>();')
  .replace('TaskExecutionCallback taskCallback = sTaskCallbacks.remove(eventId);',
    'TaskExecutionCallback taskCallback = sTaskCallbacks.get(eventId);')
  .replace(/(sTaskCallbacks\.put\(eventId, callback\);)\n      \/\/ A headless JS task[\s\S]*?MAX_TASK_EXECUTION_TIME_MS \+ 5000\n      \);/, '$1');
let root: string;
let sourceFile: string;
let packageFile: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'anyvo-task-patch-'));
  const moduleDir = join(root, 'node_modules/expo-task-manager');
  sourceFile = join(moduleDir, 'android/src/main/java/expo/modules/taskManager/TaskService.java');
  packageFile = join(moduleDir, 'package.json');
  mkdirSync(dirname(sourceFile), { recursive: true });
  writeFileSync(packageFile, JSON.stringify({ version: '14.0.9' }));
  writeFileSync(sourceFile, original);
  copyFileSync('scripts/patch-expo-task-manager.cjs', join(root, 'patch.cjs'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function run(args: string[] = [], platform = 'android') {
  return spawnSync(process.execPath, [join(root, 'patch.cjs'), ...args], {
    encoding: 'utf8', env: { ...process.env, EAS_BUILD_PLATFORM: platform },
  });
}
const source = () => readFileSync(sourceFile, 'utf8');

it('applies the callback lifecycle fix and passes verification; repeated install is idempotent', () => {
  expect(run().status).toBe(0);
  const patched = source();
  expect(patched).toContain('sTaskCallbacks = new ConcurrentHashMap<>()');
  expect(patched).toContain('TaskExecutionCallback taskCallback = sTaskCallbacks.remove(eventId);');
  expect(patched).toContain('new Handler(Looper.getMainLooper()).postDelayed(');
  expect(patched).toContain('() -> sTaskCallbacks.remove(eventId), MAX_TASK_EXECUTION_TIME_MS + 5000');
  expect(run(['--check']).status).toBe(0);
  expect(run().status).toBe(0);
  expect(source()).toBe(patched);
});

it('fails verification on unpatched source without changing the dependency', () => {
  const result = run(['--check']);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('patch is missing or incomplete');
  expect(source()).toBe(original);
});

it('rejects an incomplete patch without writing and permits a subsequent install repair', () => {
  expect(run().status).toBe(0);
  const partial = source().replace('TaskExecutionCallback taskCallback = sTaskCallbacks.remove(eventId);',
    'TaskExecutionCallback taskCallback = sTaskCallbacks.get(eventId);');
  writeFileSync(sourceFile, partial);
  expect(run(['--check']).status).toBe(1);
  expect(source()).toBe(partial);
  expect(run().status).toBe(0);
  expect(run(['--check']).status).toBe(0);
});

it('rejects a changed SDK version without modifying its source', () => {
  writeFileSync(packageFile, JSON.stringify({ version: '14.0.10' }));
  expect(run().status).toBe(1);
  expect(source()).toBe(original);
});

it('rejects unexpected source structure atomically', () => {
  const changed = original.replace('sTaskCallbacks.put(eventId, callback);', '// upstream changed');
  writeFileSync(sourceFile, changed);
  expect(run().status).toBe(1);
  expect(source()).toBe(changed);
});

it('rejects unknown arguments instead of unexpectedly patching', () => {
  expect(run(['--unknown']).status).toBe(1);
  expect(source()).toBe(original);
});

it('does not require or mutate Android source in the iOS build verification hook', () => {
  rmSync(join(root, 'node_modules'), { recursive: true });
  expect(run(['--check'], 'ios').status).toBe(0);
});
