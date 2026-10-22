import { execFileSync, spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { createHarness, destroyHarness, type Harness } from './otaReleaseHarness';

const runtime = '1.0.5-greeting-v1';
const buildId = '008a9051-2e8d-412b-ab27-3b3ead621efb';
const appJson = { expo: { version: '1.0.5', runtimeVersion: { policy: 'appVersion' }, android: { runtimeVersion: runtime } } };
const build = (commit = 'a'.repeat(40)) => ({ id: buildId, status: 'FINISHED', platform: 'android',
  runtimeVersion: runtime, appVersion: '1.0.5', channel: 'production', buildProfile: 'production', gitCommitHash: commit });
const evaluate = (extra: Record<string, unknown> = {}) => {
  const args = { build: build(), buildId, platform: 'android', runtime, nativeAppJson: appJson,
    releaseAppVersion: '1.0.5', ...extra };
  const js = `import {evaluateNativeBaseBuild} from './scripts/update-production.mjs'; console.log(JSON.stringify(evaluateNativeBaseBuild(${JSON.stringify(args)})));`;
  const result = spawnSync('node', ['--input-type=module', '-e', js], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout) as string[];
};

describe('Initial native runtime overrides require immutable source proof', () => {
  it('accepts the declared Android literal runtime only with matching native and release app versions', () => {
    expect(evaluate()).toEqual([]);
  });
  it.each([undefined, null, {}, { expo: { version: '1.0.5', runtimeVersion: { policy: 'appVersion' } } },
    { expo: { ...appJson.expo, android: { runtimeVersion: null } } }])('refuses missing or mismatched native configuration: %p', nativeAppJson => {
    expect(evaluate({ nativeAppJson }).length).toBeGreaterThan(0);
  });
  it.each([undefined, null, '1.0.6'])('refuses a different or unknown release app version: %p', releaseAppVersion => {
    expect(evaluate({ releaseAppVersion }).length).toBeGreaterThan(0);
  });
  it('refuses an inconsistent native app version even if the runtime literal matches', () => {
    expect(evaluate({ nativeAppJson: { expo: { ...appJson.expo, version: '1.0.6' } } }).length).toBeGreaterThan(0);
  });
  it.each([{ status: 'ERRORED' }, { platform: 'ios' }, { runtimeVersion: 'other' }, { channel: 'preview' },
    { buildProfile: 'preview' }, { gitCommitHash: null }, { id: 'other' }, { appVersion: '' }])('retains existing fail-closed native metadata checks: %p', patch => {
    expect(evaluate({ build: { ...build(), ...patch } }).length).toBeGreaterThan(0);
  });
  it('preserves the existing appVersion-policy case without adding a new proof requirement', () => {
    expect(evaluate({ runtime: '1.0.5', build: { ...build(), runtimeVersion: '1.0.5' }, nativeAppJson: undefined, releaseAppVersion: undefined })).toEqual([]);
  });
  it.each(['47', '48'])('refuses the previous Android %s runtime for the new native runtime', appBuildVersion => {
    expect(evaluate({ build: { ...build(), appBuildVersion, runtimeVersion: '1.0.5' } }).length).toBeGreaterThan(0);
  });
});

describe('Initial override CLI reads native commit rather than trusting the current app.json', () => {
  let h: Harness;
  const state = (commit: string) => h.setState({ ...h.defaultState(), groups: [], builds: {
    [buildId]: { ...build(commit), platform: 'ANDROID', runtime: { version: runtime } },
  } });
  const run = () => h.run(['--platform', 'android', '--runtime', runtime, '--initial-runtime-release',
    '--initial-runtime-build-id', buildId, '--dry-run', '--message', 'fixture only'], { envFile: h.fullEnvFile });
  const commitFixture = () => {
    const options = { cwd: h.repo, encoding: 'utf8' as const };
    execFileSync('git', ['add', '-A'], options);
    execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture proof'], options);
    return execFileSync('git', ['rev-parse', 'HEAD'], options).trim();
  };
  afterEach(() => destroyHarness(h));
  it('permits an actual same-source declared override in dry-run and never calls update', () => {
    h = createHarness({ appJson, appVersion: '1.0.5' }); state(h.base);
    const result = run(); expect(result.code).toBe(0); expect(result.out).toContain('Publish würde ERLAUBT.');
    expect(h.updateCalls()).toEqual([]);
  });
  it('refuses a native commit whose app.json contradicts runtime metadata even when current app.json matches', () => {
    h = createHarness({ appJson: { expo: { version: '1.0.5', runtimeVersion: { policy: 'appVersion' } } }, appVersion: '1.0.5' });
    writeFileSync(join(h.repo, 'app.json'), JSON.stringify(appJson)); commitFixture(); state(h.base);
    expect(run().code).toBe(1); expect(h.updateCalls()).toEqual([]);
  });
  it('refuses dynamic native configuration without evaluating it', () => {
    h = createHarness({ appJson, appVersion: '1.0.5' });
    writeFileSync(join(h.repo, 'app.config.js'), 'throw new Error("must never execute native configuration");\n');
    state(commitFixture()); const result = run(); expect(result.code).toBe(1);
    expect(result.out).not.toContain('must never execute native configuration'); expect(h.updateCalls()).toEqual([]);
  });
  it('refuses malformed app.json from the native commit even when the release config is valid', () => {
    h = createHarness({ appJson, appVersion: '1.0.5' });
    writeFileSync(join(h.repo, 'app.json'), '{broken'); const nativeCommit = commitFixture();
    writeFileSync(join(h.repo, 'app.json'), JSON.stringify(appJson)); commitFixture(); state(nativeCommit);
    expect(run().code).toBe(1); expect(h.updateCalls()).toEqual([]);
  });
});
