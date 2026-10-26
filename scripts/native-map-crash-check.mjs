import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import patch from './patch-react-native-maps.cjs';

// Run automatically for iOS EAS builds, or explicitly on a Mac before handoff.
if (process.env.EAS_BUILD_PLATFORM === 'ios' || process.argv.includes('--local')) {
  if (process.platform !== 'darwin') throw new Error('AIRMap native contract tests require macOS Foundation');
  execFileSync(process.execPath, ['--test', fileURLToPath(new URL('./native-tests/patch-react-native-maps.test.cjs', import.meta.url))], { stdio: 'inherit' });
  const packageFile = import.meta.resolve('react-native-maps/package.json');
  const version = JSON.parse(readFileSync(new URL(packageFile), 'utf8')).version;
  const installed = readFileSync(new URL('ios/AirMaps/AIRMap.m', packageFile), 'utf8');
  const verified = patch.patchSource(installed, version);
  if (verified.changed) throw new Error('AIRMap patch is missing; postinstall must run before native tests');
  const original = installed.replace(patch.AFTER, patch.BEFORE);
  if (patch.sha256(original) !== patch.ORIGINAL_SHA256) throw new Error('Cannot reconstruct original negative control');
  const template = readFileSync(new URL('./native-tests/AIRMapChildContract.m', import.meta.url), 'utf8');
  const method = (source, signature) => {
    const start = source.indexOf(signature);
    const end = source.indexOf('\n#pragma clang diagnostic pop', start);
    if (start < 0 || end < 0) throw new Error(`Cannot extract ${signature}`);
    return source.slice(start, end);
  };
  const scratch = mkdtempSync(path.join(tmpdir(), 'anyvo-map-contract-'));
  try {
    for (const [name, source] of [['original', original], ['patched', installed]]) {
      const generated = template
        .replace('/* INSERT_METHOD */', method(source, '- (void)insertReactSubview:'))
        .replace('/* REMOVE_METHOD */', method(source, '- (void)removeReactSubview:'));
      const sourceFile = path.join(scratch, `${name}.m`);
      const binaryFile = path.join(scratch, name);
      writeFileSync(sourceFile, generated);
      execFileSync('xcrun', ['--sdk', 'macosx', 'clang', '-fobjc-arc', '-Wall', '-Wextra', '-Werror', '-Wno-sign-compare',
        // Upstream's unchanged loop counters use int against NSUInteger.
        '-framework', 'Foundation', sourceFile, '-o', binaryFile], { stdio: 'inherit' });
      execFileSync(binaryFile, name === 'original' ? ['original'] : [], { stdio: 'inherit' });
    }
    console.log(`AIRMap ${version} SHA256 ${patch.PATCHED_SHA256}; host contract only, device QA still required`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
