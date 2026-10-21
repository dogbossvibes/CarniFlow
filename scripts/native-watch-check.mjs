import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run before CocoaPods/prebuild too: Watch UI and transport have no Expo/Pod dependencies.
if (process.env.EAS_BUILD_PLATFORM === 'ios' || process.argv.includes('--local')) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const scratch = mkdtempSync(path.join(tmpdir(), 'anyvo-watch-sdk-check-'));
  try {
    const sdk = name => execFileSync('xcrun', ['--sdk', name, '--show-sdk-path'], { encoding: 'utf8' }).trim();
    const watchSDK = sdk('watchsimulator');
    const phoneSDK = sdk('iphonesimulator');
    execFileSync('xcrun', ['swift', 'test', '--package-path', path.join(root, 'modules/anyvo-wearable-control'),
      '--scratch-path', path.join(scratch, 'PackageTests')], { stdio: 'inherit' });
    const core = ['WatchSessionContract.swift', 'WatchCommandState.swift']
      .map(file => path.join(root, 'modules/anyvo-wearable-control/ios/Core', file));
    const common = ['-swift-version', '5', '-parse-as-library', '-typecheck', '-module-cache-path', path.join(scratch, 'ModuleCache')];
    execFileSync('xcrun', ['swiftc', ...common, '-sdk', watchSDK, '-target', 'arm64-apple-watchos9.0-simulator',
      ...core, ...['AnyvoWatchApp.swift', 'WatchSessionModel.swift', 'WatchSessionView.swift'].map(file => path.join(root, 'plugins/ios/watch', file))], { stdio: 'inherit' });
    execFileSync('xcrun', ['swiftc', ...common, '-sdk', phoneSDK, '-target', 'arm64-apple-ios15.1-simulator',
      ...core, path.join(root, 'modules/anyvo-wearable-control/ios/AnyvoWatchPhoneTransport.swift')], { stdio: 'inherit' });
    console.log('PASS actual watchOS/iOS simulator SDK typechecks; no simulator execution or device QA claimed');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
