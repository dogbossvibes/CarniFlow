/* global __dirname */
// Backport https://github.com/react-native-maps/react-native-maps/pull/5871
// to Expo SDK 54's pinned package. Fail closed if the dependency changes.
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VERSION = '1.20.1';
const ORIGINAL_SHA256 = '4c034393e5f366ec975a2984a8a39102e8c7163692712be7022a2d7dabcc813b';
const PATCHED_SHA256 = '5a4355e79d080c44e75b45f1838ae8691d471d4dc807af54538926ee962751d4';
const BEFORE = '    [_reactSubviews insertObject:(UIView *)subview atIndex:(NSUInteger) atIndex];';
const AFTER = `    if (subview != nil) {
        NSUInteger safeIndex = MIN((NSUInteger)atIndex, _reactSubviews.count);
        [_reactSubviews insertObject:(UIView *)subview atIndex:safeIndex];
    }`;
const sha256 = (source) => createHash('sha256').update(source).digest('hex');

function patchSource(source, version) {
  if (version !== VERSION) throw new Error(`AIRMap patch requires react-native-maps ${VERSION}; received ${version}`);
  const hash = sha256(source);
  if (hash === PATCHED_SHA256) return { source, changed: false, sha256: hash };
  if (hash !== ORIGINAL_SHA256) throw new Error(`Unexpected AIRMap.m SHA256 ${hash}; review the native patch before building`);
  const patched = source.replace(BEFORE, AFTER);
  if (sha256(patched) !== PATCHED_SHA256) throw new Error('AIRMap patch output verification failed');
  return { source: patched, changed: true, sha256: PATCHED_SHA256 };
}

function patchInstalledMaps(projectRoot = path.resolve(__dirname, '..')) {
  const packageFile = require.resolve('react-native-maps/package.json', { paths: [projectRoot] });
  const { version } = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const sourceFile = path.join(path.dirname(packageFile), 'ios/AirMaps/AIRMap.m');
  const result = patchSource(fs.readFileSync(sourceFile, 'utf8'), version);
  if (result.changed) fs.writeFileSync(sourceFile, result.source);
  return { ...result, sourceFile };
}

if (require.main === module) {
  const result = patchInstalledMaps();
  console.log(`[AIRMap] ${VERSION}: ${result.changed ? 'patched' : 'already patched'}; SHA256 ${result.sha256}`);
}

module.exports = { VERSION, ORIGINAL_SHA256, PATCHED_SHA256, BEFORE, AFTER, sha256, patchSource, patchInstalledMaps };
