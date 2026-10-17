import { execFileSync, spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { createHarness, destroyHarness, type Harness } from './otaReleaseHarness';

const runtime = '1.0.5-motion-v2';
const buildId = '00000000-0000-4000-8000-000000000052';
const sourceEas = () => ({ build: {
  production: { channel: 'production', environment: 'production', distribution: 'store', env: { EXPO_PUBLIC_BACKEND_ENV: 'production' } },
  'native-sensor-ios': { extends: 'production', env: { ANYVO_NATIVE_SENSOR_XCTEST: '1' } },
} });
const build = (hash: string) => ({ id: buildId, status: 'FINISHED', platform: 'ios', runtimeVersion: runtime,
  appVersion: '1.0.5', appBuildVersion: '52', channel: 'production', buildProfile: 'native-sensor-ios',
  gitCommitHash: hash, distribution: 'store', isForIosSimulator: false });
function call(input: Record<string, unknown>): string[] {
  const script = `import {evaluateNativeBaseBuild} from './scripts/update-production.mjs';process.stdout.write(JSON.stringify(evaluateNativeBaseBuild(${JSON.stringify(input)})));`;
  const result = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}
const evaluate = (patch = {}, config: unknown = sourceEas(), version: unknown = '1.0.5') => call({
  build: { ...build('a'.repeat(40)), ...patch }, buildId, platform: 'ios', runtime, expectedAppVersion: version, nativeSourceEas: config,
});

describe('custom native profile requires committed production origin and separate marketing version', () => {
  it('accepts a store device build without equating marketing version and native runtime', () => expect(evaluate()).toEqual([]));
  it('fails closed without the native-source profile proof', () => expect(evaluate({}, null).join()).toContain('belegte direkte production-Vererbung'));
  it.each([
    { buildProfile: 'preview' }, { platform: 'android' }, { distribution: 'internal' }, { isForIosSimulator: true },
    { status: 'ERRORED' }, { runtimeVersion: '1.0.5' }, { channel: 'preview' }, { gitCommitHash: null }, { appVersion: '1.0.6' },
  ])('does not relax existing build evidence %j', patch => expect(evaluate(patch).length).toBeGreaterThan(0));
  it.each(['environment', 'channel', 'distribution'] as const)('rejects a custom profile overriding %s', key => {
    const config = sourceEas(); Object.assign(config.build['native-sensor-ios'], { [key]: 'preview' });
    expect(evaluate({}, config).length).toBeGreaterThan(0);
  });
  it('rejects an unverified inheritance chain or backend override', () => {
    const config = sourceEas(); config.build['native-sensor-ios'].extends = 'preview';
    expect(evaluate({}, config).length).toBeGreaterThan(0);
    const other = sourceEas(); Object.assign(other.build['native-sensor-ios'].env, { EXPO_PUBLIC_BACKEND_ENV: 'staging' });
    expect(evaluate({}, other).join()).toContain('Profil-Backend');
  });
  it('does not fall back to runtime when the marketing version is absent', () => expect(evaluate({}, sourceEas(), null).join()).toContain('Marketingversion'));
});

describe('first OTA uses the actual native source commit, never the old105 route or current uncommitted profile', () => {
  let h: Harness, nativeSource: string;
  const git = (...args: string[]) => execFileSync('git', args, { cwd: h.repo, encoding: 'utf8', env: { ...process.env,
    GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid' } }).trim();
  beforeAll(() => {
    h = createHarness({ appJson: { expo: { version: '1.0.5', runtimeVersion: { policy: 'appVersion' }, ios: { runtimeVersion: runtime } } } });
    writeFileSync(join(h.repo, 'eas.json'), JSON.stringify(sourceEas())); git('add', 'eas.json'); git('commit', '-qm', 'native production profile'); nativeSource = git('rev-parse', 'HEAD');
    writeFileSync(join(h.repo, 'UI.txt'), 'UI release\n'); git('add', 'UI.txt'); git('commit', '-qm', 'UI only');
  });
  afterAll(() => destroyHarness(h));
  beforeEach(() => {
    h.resetCalls();
    const b = build(nativeSource);
    h.setState({ groups: [{ group: 'old105', entries: [{ platform: 'ios', id: 'u-old105', gitCommitHash: h.base, runtimeVersion: '1.0.5' }] },
      { group: 'android104', entries: [{ platform: 'android', id: 'u-android104', gitCommitHash: h.base, runtimeVersion: '1.0.4' }] }],
    builds: { [buildId]: { ...b, platform: 'IOS', distribution: 'STORE' } } });
  });
  const args = ['--platform', 'ios', '--runtime', runtime, '--initial-runtime-release', '--initial-runtime-build-id', buildId, '--message', 'fixture only'];
  it('permits a dry-run against the native commit with zero publication', () => {
    const result = h.run([...args, '--dry-run'], { envFile: h.fullEnvFile });
    expect(result.code).toBe(0); expect(result.out).toContain('FIRST OTA FOR RUNTIME'); expect(result.out).toContain(nativeSource);
    expect(result.out).toContain('Publish würde ERLAUBT'); expect(h.updateCalls()).toEqual([]);
  });
  it('rejects a native commit without eas.json even though the local release has a valid profile', () => {
    const state = h.state(); (state.builds![buildId] as Record<string, unknown>).gitCommitHash = h.base; h.setState(state);
    const result = h.run([...args, '--confirm']);
    expect(result.code).toBe(1); expect(result.out).toContain('belegte direkte production-Vererbung'); expect(h.updateCalls()).toEqual([]);
  });
  it('simulates exactly one iOS publish and leaves the other platform and old runtime unchanged', () => {
    const result = h.run([...args, '--confirm'], { env: { FAKE_RELEASE_RUNTIME: runtime } });
    expect(result.code).toBe(0); expect(h.updateCalls()).toHaveLength(1);
    expect(h.updateCalls()[0]).toEqual(expect.arrayContaining(['--platform', 'ios', '--environment', 'production']));
    expect(h.state().groups[0].entries[0].runtimeVersion).toBe(runtime);
    expect(h.state().groups.slice(1).map(group => group.group)).toEqual(['old105', 'android104']);
  });
  it('stops if a new OTA appears before initial publication', () => {
    const state = h.state(); state.raceAtList = 3; state.raceGroup = { group: 'race', entries: [{ platform: 'ios', id: 'u-race', runtimeVersion: runtime, gitCommitHash: h.base }] }; h.setState(state);
    const result = h.run([...args, '--confirm']);
    expect(result.code).toBe(1); expect(result.out).toContain('Production changed'); expect(h.updateCalls()).toEqual([]);
  });
});
