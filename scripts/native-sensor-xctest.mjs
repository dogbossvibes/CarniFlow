import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
if (process.env.ANYVO_NATIVE_SENSOR_XCTEST === '1' && process.env.EAS_BUILD_PLATFORM !== 'ios') throw new Error('Native sensor XCTest profile requires iOS');
if (process.env.EAS_BUILD_PLATFORM === 'ios') {
  execFileSync('xcodebuild', ['-version'], { stdio: 'inherit' });
  execFileSync('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path'], { stdio: 'inherit' });
  const scratch = mkdtempSync(path.join(tmpdir(), 'anyvo-motion-xctest-'));
  try {
    execFileSync('xcrun', ['swift', 'test', '--package-path', 'modules/anyvo-motion', '--scratch-path', scratch], { stdio: 'inherit' });
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
