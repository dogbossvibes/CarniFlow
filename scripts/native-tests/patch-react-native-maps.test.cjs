const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const patch = require('../patch-react-native-maps.cjs');
const pkg = require.resolve('react-native-maps/package.json');
const installed = fs.readFileSync(path.join(path.dirname(pkg), patch.SOURCE_PATH), 'utf8');
test('SDK58 upstream native source contains the reviewed nil and bounded-index protection', () => {
  assert.equal(patch.patchSource(installed, patch.VERSION).changed, false);
  assert.ok(installed.includes(patch.AFTER));
});
test('guard is byte-preserving and repeatable', () => {
  const first = patch.patchInstalledMaps();
  assert.deepEqual(patch.patchInstalledMaps(), first);
  assert.equal(first.source, installed);
});
test('unknown dependency versions fail closed', () => {
  for (const version of ['1.20.1', '1.29.12', undefined]) {
    assert.throws(() => patch.patchSource(installed, version), /requires react-native-maps/);
  }
});
test('missing nil guard, missing index bound, source drift all block installation', () => {
  for (const source of [installed + '\n', installed.replace(patch.AFTER, patch.BEFORE),
    installed.replace('MIN((NSUInteger)atIndex, _reactSubviews.count)', '(NSUInteger)atIndex')]) {
    assert.throws(() => patch.patchSource(source, patch.VERSION), /Unexpected AIRMap/);
  }
});
test('native safety hooks remain mandatory', () => {
  const { scripts } = require('../../package.json');
  assert.equal(scripts.postinstall, 'node scripts/patch-expo-task-manager.cjs && node scripts/patch-react-native-maps.cjs');
  assert.equal(scripts['eas-build-post-install'], 'node scripts/native-map-crash-check.mjs');
});
