const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const patch = require('../patch-react-native-maps.cjs');
const packageFile = require.resolve('react-native-maps/package.json');
const installed = fs.readFileSync(path.join(path.dirname(packageFile), 'ios/AirMaps/AIRMap.m'), 'utf8');
const original = patch.sha256(installed) === patch.PATCHED_SHA256
  ? installed.replace(patch.AFTER, patch.BEFORE) : installed;
assert.equal(patch.sha256(original), patch.ORIGINAL_SHA256);

test('exact pinned source is patched and produces the verified upstream backport', () => {
  const result = patch.patchSource(original, '1.20.1');
  assert.equal(result.changed, true);
  assert.equal(patch.sha256(result.source), patch.PATCHED_SHA256);
  assert.equal(result.source.replace(patch.AFTER, patch.BEFORE), original);
});
test('second application is byte-for-byte idempotent', () => {
  const first = patch.patchSource(original, '1.20.1');
  assert.deepEqual(patch.patchSource(first.source, '1.20.1'), { ...first, changed: false });
});
test('both patched and original files reject every unsupported version', () => {
  for (const version of ['1.20.0', '1.20.2', '1.29.3', undefined]) {
    for (const source of [original, patch.patchSource(original, '1.20.1').source]) {
      assert.throws(() => patch.patchSource(source, version), /requires react-native-maps/);
    }
  }
});
test('drift, duplicate insertion and partial patches fail closed', () => {
  for (const source of [original + '\n', original + patch.BEFORE,
    original.replace(patch.BEFORE, '    if (subview) ' + patch.BEFORE),
    original.replace('insertReactSubview:', 'changedInsertReactSubview:')]) {
    assert.throws(() => patch.patchSource(source, '1.20.1'), /Unexpected AIRMap.m SHA256/);
  }
});
test('installation changes only the expected file and preserves it on repeat or failure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anyvo-map-install-test-'));
  try {
    const pkg = path.join(root, 'node_modules/react-native-maps');
    const sourceFile = path.join(pkg, 'ios/AirMaps/AIRMap.m');
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    const metadata = JSON.stringify({ name: 'react-native-maps', version: '1.20.1' });
    fs.writeFileSync(path.join(pkg, 'package.json'), metadata);
    fs.writeFileSync(sourceFile, original);
    assert.equal(patch.patchInstalledMaps(root).changed, true);
    const time = fs.statSync(sourceFile).mtimeMs;
    assert.equal(patch.patchInstalledMaps(root).changed, false);
    assert.equal(fs.statSync(sourceFile).mtimeMs, time);
    assert.equal(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'), metadata);
    fs.writeFileSync(sourceFile, original + '\n');
    assert.throws(() => patch.patchInstalledMaps(root), /Unexpected AIRMap.m/);
    assert.equal(fs.readFileSync(sourceFile, 'utf8'), original + '\n');
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ version: '1.29.3' }));
    assert.throws(() => patch.patchInstalledMaps(root), /requires react-native-maps/);
    assert.equal(fs.readFileSync(sourceFile, 'utf8'), original + '\n');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('release hooks preserve sensor and TaskManager checks and add the map checks', () => {
  const { scripts } = require('../../package.json');
  assert.equal(scripts.postinstall, 'node scripts/patch-expo-task-manager.cjs && node scripts/patch-react-native-maps.cjs');
  assert.equal(scripts['eas-build-post-install'], 'node scripts/native-sensor-xctest.mjs && node scripts/native-map-crash-check.mjs && node scripts/native-watch-check.mjs');
});
