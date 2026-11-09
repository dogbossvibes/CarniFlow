import { spawnSync } from 'child_process';
import { createHarness, destroyHarness, type Harness } from './otaReleaseHarness';

const nativeRuntime = '1.0.5-motion-v2';
const config = { expo: { version: '1.0.5', runtimeVersion: { policy: 'appVersion' }, ios: { runtimeVersion: nativeRuntime } } };
function resolve(app: unknown, platform?: string): unknown {
  const args = platform === undefined ? [app] : [app, platform];
  const js = `import { resolveReleaseRuntime } from './scripts/update-production.mjs'; process.stdout.write(JSON.stringify(resolveReleaseRuntime(...${JSON.stringify(args)})));`;
  const r = spawnSync('node', ['--input-type=module', '-e', js], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

describe('Plattform-Runtime ohne Änderung der Marketingversion', () => {
  it('iOS nutzt den nativen Override, Android behält die Root-Policy', () => {
    expect(resolve(config, 'ios')).toBe(nativeRuntime);
    expect(resolve(config, 'android')).toBe('1.0.5');
  });
  it('ohne Plattform bleibt ein Override mehrdeutig', () => {
    expect(resolve(config)).toBeNull();
  });
  it.each(['all', 'web', ''])('unzulässige Plattform %s wird verweigert', platform => {
    expect(resolve(config, platform)).toBeNull();
  });
  it.each(['1.0.3', '1.0.4', '1.0.5'])('bestehende Root-Runtime %s bleibt unverändert', version => {
    const app = { expo: { version, runtimeVersion: { policy: 'appVersion' } } };
    for (const p of [undefined, 'ios', 'android']) expect(resolve(app, p)).toBe(version);
  });
  it.each([null, '', {}, { policy: 'fingerprint' }])('ungültiger/unsupported Override %j fällt nicht auf Root zurück', override => {
    expect(resolve({ expo: { ...config.expo, ios: { runtimeVersion: override } } }, 'ios')).toBeNull();
  });
  it('plattformbezogene appVersion-Policy und Android-Override werden berücksichtigt', () => {
    const app = { expo: { ...config.expo, ios: { version: '1.0.7', runtimeVersion: { policy: 'appVersion' } }, android: { runtimeVersion: 'android-custom' } } };
    expect(resolve(app, 'ios')).toBe('1.0.7');
    expect(resolve(app, 'android')).toBe('android-custom');
  });
});

// Nur temporäres Fixture-Repo und falsches EAS, ausschließlich --dry-run.
describe('CLI wählt ausschließlich die tatsächliche Plattform-Runtime', () => {
  let h: Harness;
  beforeAll(() => { h = createHarness({ appJson: config }); });
  afterAll(() => destroyHarness(h));
  beforeEach(() => {
    h.resetCalls();
    h.setState({ groups: [
      { group: 'old-ios-105', entries: [{ platform: 'ios', id: 'u-old', gitCommitHash: h.base, runtimeVersion: '1.0.5' }] },
      { group: 'native-ios', entries: [{ platform: 'ios', id: 'u-native', gitCommitHash: h.base, runtimeVersion: nativeRuntime }] },
      { group: 'android-105', entries: [{ platform: 'android', id: 'u-android', gitCommitHash: h.base, runtimeVersion: '1.0.5' }] },
    ] });
  });
  it('iOS wählt die neue Runtime, obwohl die alte 105-Group neuer ist', () => {
    const r = h.run(['--platform', 'ios', '--dry-run', '--message', 'fixture'], { envFile: h.fullEnvFile });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/ACTIVE PRODUCTION[^\n]*Group native-ios/);
    expect(r.out).not.toMatch(/ACTIVE PRODUCTION[^\n]*old-ios-105/);
    expect(h.calls().filter(a => a[0] === 'update:list' && a.includes('--runtime-version')).some(a => a[a.indexOf('--runtime-version') + 1] === nativeRuntime)).toBe(true);
    expect(h.updateCalls()).toEqual([]);
  });
  it('ohne eigene neue Runtime-Basis gibt es keinen Rückfall auf 105', () => {
    h.setState({ groups: [{ group: 'old-ios-105', entries: [{ platform: 'ios', id: 'u-old', gitCommitHash: h.base, runtimeVersion: '1.0.5' }] }] });
    const r = h.run(['--platform', 'ios', '--dry-run', '--message', 'fixture'], { envFile: h.fullEnvFile });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(nativeRuntime);
    expect(h.updateCalls()).toEqual([]);
  });
  it('Android wählt weiterhin seine Root-Runtime und veröffentlicht nichts', () => {
    const r = h.run(['--platform', 'android', '--dry-run', '--message', 'fixture'], { envFile: h.fullEnvFile });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/ACTIVE PRODUCTION[^\n]*Group android-105/);
    expect(h.updateCalls()).toEqual([]);
  });
  it('--runtime 105 kann den iOS-Override nicht umgehen', () => {
    const r = h.run(['--platform', 'ios', '--runtime', '1.0.5', '--dry-run', '--message', 'fixture'], { envFile: h.fullEnvFile });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('Runtime-Mismatch');
    expect(h.updateCalls()).toEqual([]);
  });
});
