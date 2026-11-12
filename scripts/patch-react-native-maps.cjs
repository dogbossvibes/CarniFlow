/* global __dirname */
// SDK58: the reviewed upstream AIRMap already contains the nil/index crash fix.
// Keep the install hook fail-closed; do not silently drop the production safeguard.
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const VERSION = '1.29.11';
const SOURCE_PATH = 'ios/AirMaps/AIRMap.mm';
const PATCHED_SHA256 = '1fece835e2b4e5b6ce7d0328b77649314b259c160c1d875fa390ca5bbe469e7c';
const BEFORE = '    [_reactSubviews insertObject:(UIView *)subview atIndex:(NSUInteger) atIndex];';
const AFTER = `    if (subview != nil) {
        NSUInteger safeIndex = MIN((NSUInteger)atIndex, _reactSubviews.count);
        [_reactSubviews insertObject:(UIView *)subview atIndex:safeIndex];
    }`;
const sha256 = source => createHash('sha256').update(source).digest('hex');
function patchSource(source, version) {
  if (version !== VERSION) throw new Error(`AIRMap guard requires react-native-maps ${VERSION}; received ${version}`);
  if (sha256(source) !== PATCHED_SHA256 || !source.includes(AFTER)) {
    throw new Error('Unexpected AIRMap source; review native crash protection before building');
  }
  return { source, changed: false, sha256: PATCHED_SHA256 };
}
function patchInstalledMaps(projectRoot = path.resolve(__dirname, '..')) {
  const packageFile = require.resolve('react-native-maps/package.json', { paths: [projectRoot] });
  const { version } = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const sourceFile = path.join(path.dirname(packageFile), SOURCE_PATH);
  return { ...patchSource(fs.readFileSync(sourceFile, 'utf8'), version), sourceFile };
}
if (require.main === module) {
  const result = patchInstalledMaps();
  console.log(`[AIRMap] ${VERSION}: upstream crash guard verified; SHA256 ${result.sha256}`);
}
module.exports = { VERSION, SOURCE_PATH, PATCHED_SHA256, BEFORE, AFTER, sha256, patchSource, patchInstalledMaps };
