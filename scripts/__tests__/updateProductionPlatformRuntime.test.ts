import { spawnSync } from 'child_process';
import { createHarness, destroyHarness, type Harness } from './otaReleaseHarness';

const androidRuntime = '1.0.5-greeting-v1';
const expo = {
  version: '1.0.5', runtimeVersion: { policy: 'appVersion' },
  ios: { bundleIdentifier: 'com.anyvo.app' },
  android: { package: 'com.anyvo.app', runtimeVersion: androidRuntime },
};
function resolve(config: unknown, platform?: string): string | null {
  const js = `import { resolveReleaseRuntime } from './scripts/update-production.mjs';
    process.stdout.write(JSON.stringify(resolveReleaseRuntime(${JSON.stringify(config)}, ${JSON.stringify(platform) ?? 'undefined'})));`;
  const result = spawnSync('node', ['--input-type=module', '-e', js], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

describe('Effective platform runtime follows the native Expo configuration', () => {
  it('keeps iOS on appVersion and selects the distinct Android native runtime', () => {
    expect(resolve({ expo }, 'android')).toBe(androidRuntime);
    expect(resolve({ expo }, 'ios')).toBe('1.0.5');
    expect(resolve({ ...expo, ios: { runtimeVersion: 'ios-only' } }, 'ios')).toBe('ios-only');
  });
  it('requires the platform when a platform override exists', () => {
    expect(resolve({ expo })).toBeNull();
    expect(resolve({ expo }, 'all')).toBeNull();
    expect(resolve({ expo }, '')).toBeNull();
  });
  it.each([null, '', '  ', false, 49, {}, { policy: 'fingerprint' }, { policy: 'nativeVersion' }])(
    'fails closed for an explicit unsupported override %j instead of using appVersion', runtimeVersion => {
      expect(resolve({ expo: { ...expo, android: { runtimeVersion } } }, 'android')).toBeNull();
    },
  );
  it('supports platform appVersion policy and trims string overrides', () => {
    expect(resolve({ expo: { ...expo, android: { runtimeVersion: { policy: 'appVersion' } } } }, 'android')).toBe('1.0.5');
    expect(resolve({ expo: { ...expo, android: { runtimeVersion: ` ${androidRuntime} ` } } }, 'android')).toBe(androidRuntime);
    expect(resolve({ expo: { ...expo, version: undefined, android: { runtimeVersion: { policy: 'appVersion' } } } }, 'android')).toBeNull();
  });
  it('preserves the existing shared string and appVersion fallbacks without overrides', () => {
    for (const platform of [undefined, 'ios', 'android']) {
      expect(resolve({ expo: { version: '1.0.5', runtimeVersion: { policy: 'appVersion' } } }, platform)).toBe('1.0.5');
      expect(resolve({ runtimeVersion: 'shared-native' }, platform)).toBe('shared-native');
      expect(resolve({ expo: { version: '1.0.5', runtimeVersion: { policy: 'fingerprint' } } }, platform)).toBeNull();
    }
  });
  it.each(['ios', 'android'])('uses the SDK platform version for %s appVersion policy', platform => {
    const shared = { version: '1.0.5', runtimeVersion: { policy: 'appVersion' }, [platform]: { version: '1.0.6' } };
    expect(resolve({ expo: shared }, platform)).toBe('1.0.6');
    expect(resolve({ expo: shared })).toBeNull();
    expect(resolve({ expo: { ...shared, version: undefined } }, platform)).toBe('1.0.6');
    expect(resolve({ expo: { ...shared, [platform]: { version: '1.0.6', runtimeVersion: { policy: 'appVersion' } } } }, platform)).toBe('1.0.6');
    for (const version of [null, '', '  ', false, 49]) {
      expect(resolve({ expo: { ...shared, [platform]: { version } } }, platform)).toBeNull();
    }
  });
});

describe('Wrapper CLI uses the selected platform runtime without any real publication', () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness({ appJson: { expo }, appVersion: '1.0.5' });
    h.setState({ groups: [
      { group: 'android-native', entries: [{ platform: 'android', id: 'u-a', gitCommitHash: h.base, runtimeVersion: androidRuntime }] },
      { group: 'ios-original', entries: [{ platform: 'ios', id: 'u-i', gitCommitHash: h.base, runtimeVersion: '1.0.5' }] },
    ] });
  });
  afterEach(() => destroyHarness(h));
  it.each([['android', androidRuntime], ['ios', '1.0.5']])('selects %s runtime %s in dry-run', (platform, runtime) => {
    const result = h.run(['--platform', platform, '--dry-run', '--message', 'platform runtime guard'], { envFile: h.fullEnvFile });
    expect(result.code).toBe(0);
    expect(result.out).toContain('Publish würde ERLAUBT.');
    expect(h.calls().filter(args => args[0] === 'update:list')[0]).toEqual(expect.arrayContaining(['--platform', platform, '--runtime-version', runtime]));
    expect(h.updateCalls()).toEqual([]);
  });
  it('rejects an old Android runtime flag before baseline lookup, even with confirm', () => {
    const result = h.run(['--platform', 'android', '--runtime', '1.0.5', '--confirm', '--message', 'must stop']);
    expect(result.code).toBe(1);
    expect(result.out).toContain(`Runtime-Mismatch: Release ${androidRuntime}, erwartet 1.0.5`);
    expect(h.calls().filter(args => args[0] === 'update:list')).toEqual([]);
    expect(h.updateCalls()).toEqual([]);
  });
});
