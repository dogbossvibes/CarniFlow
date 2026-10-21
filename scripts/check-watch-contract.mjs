import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleRoot = path.join(root, 'modules/anyvo-wearable-control');
const scratch = mkdtempSync(path.join(tmpdir(), 'anyvo-watch-contract-'));
const moduleCache = process.env.ANYVO_WATCH_TEST_MODULE_CACHE ?? path.join(tmpdir(), 'anyvo-watch-native-check-v1');
try {
  const binary = path.join(scratch, 'watch-contract');
  execFileSync('xcrun', ['--sdk', 'macosx', 'swiftc', '-swift-version', '5',
    '-module-cache-path', moduleCache,
    ...['ios/Core/WatchSessionContract.swift', 'ios/Core/WatchCommandState.swift',
      'tests/Shared/WatchAssertions.swift', 'tests/Shared/WatchContractChecks.swift', 'tests/Host/main.swift']
      .map(file => path.join(moduleRoot, file)), '-o', binary], {
    stdio: 'inherit', env: { ...process.env, CLANG_MODULE_CACHE_PATH: moduleCache },
  });
  execFileSync(binary, [path.join(moduleRoot, 'tests/Native/Fixtures/wire-fixtures-v1.json')], { stdio: 'inherit' });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
