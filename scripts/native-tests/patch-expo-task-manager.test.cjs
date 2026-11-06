const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const patch = require('../patch-expo-task-manager.cjs');
const pkg = require.resolve('expo-task-manager/package.json');
let original = fs.readFileSync(path.join(path.dirname(pkg), patch.SOURCE_PATH), 'utf8');
if (patch.sha256(original) === patch.PATCHED_SHA256) {
  for (const [before, after] of [...patch.changes].reverse()) original = original.replace(after, before);
}
test('exact SDK58 upstream source is known and completion cleanup already exists', () => {
  assert.equal(patch.sha256(original), patch.ORIGINAL_SHA256);
  assert.ok(original.includes('TaskExecutionCallback taskCallback = sTaskCallbacks.remove(eventId);'));
});
test('preserve expiry and concurrent-map safeguards with verified output', () => {
  const result = patch.patchSource(original, patch.VERSION);
  assert.equal(result.changed, true);
  assert.equal(result.sha256, patch.PATCHED_SHA256);
  assert.ok(result.source.includes('MAX_TASK_EXECUTION_TIME_MS + 5000'));
  assert.ok(result.source.includes('sTaskCallbacks = new ConcurrentHashMap<>()'));
  assert.ok(result.source.includes('TaskExecutionCallback taskCallback = sTaskCallbacks.remove(eventId);'));
});
test('repeated patch application is byte-identical', () => {
  const result = patch.patchSource(original, patch.VERSION);
  assert.deepEqual(patch.patchSource(result.source, patch.VERSION), { ...result, changed: false });
});
test('version/source/partial patch drift fail closed', () => {
  assert.throws(() => patch.patchSource(original, '58.0.14'), /Review/);
  for (const source of [original + '\n', original.replace('sTaskCallbacks.remove(eventId)', 'sTaskCallbacks.get(eventId)')]) {
    assert.throws(() => patch.patchSource(source, patch.VERSION), /Unexpected/);
  }
});

test('check-only rejects an unpatched source without writing and verifies patched bytes', () => {
  const os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anyvo-sdk58-task-check-'));
  try {
    const moduleRoot = path.join(root, 'node_modules/expo-task-manager');
    const sourceFile = path.join(moduleRoot, patch.SOURCE_PATH);
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(path.join(moduleRoot, 'package.json'), JSON.stringify({ name: 'expo-task-manager', version: patch.VERSION }));
    fs.writeFileSync(sourceFile, original);
    assert.throws(() => patch.patchInstalled(root, { checkOnly: true }), /missing or incomplete/);
    assert.equal(fs.readFileSync(sourceFile, 'utf8'), original);
    patch.patchInstalled(root);
    const bytes = fs.readFileSync(sourceFile, 'utf8');
    assert.equal(patch.patchInstalled(root, { checkOnly: true }).changed, false);
    assert.equal(fs.readFileSync(sourceFile, 'utf8'), bytes);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
