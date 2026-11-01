import { execFileSync, spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { createHarness, destroyHarness, type Harness } from './otaReleaseHarness';

const RUNTIME = '1.0.5-motion-v2';
const BUILD = '87a55197-8a18-487d-85a7-6ef16ae33168';
const APP = { expo: { version: '1.0.5', runtimeVersion: { policy: 'appVersion' }, ios: { runtimeVersion: RUNTIME } } };
const EAS = { build: {
  production: { channel: 'production', environment: 'production', distribution: 'store' },
  'native-sensor-ios': { extends: 'production' },
} };
const build = (hash = 'a'.repeat(40)) => ({ id: BUILD, status: 'FINISHED', platform: 'ios', runtimeVersion: RUNTIME,
  appVersion: '1.0.5', appBuildVersion: '52', channel: 'production', buildProfile: 'native-sensor-ios', gitCommitHash: hash });
const input = () => ({ build: build(), buildId: BUILD, platform: 'ios', runtime: RUNTIME,
  nativeConfig: { appJson: APP, easJson: EAS }, releaseAppVersion: '1.0.5' });
function call(fn: string, ...args: unknown[]): any {
  const code = `import * as m from './scripts/update-production.mjs'; process.stdout.write(JSON.stringify(m[${JSON.stringify(fn)}](...${JSON.stringify(args)})));`;
  const result = spawnSync('node', ['--input-type=module', '-e', code], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

describe('Initial-Runtime: belegte native Production-Konfiguration', () => {
  it('validiert App-Version separat von der expliziten iOS-Runtime', () => {
    expect(call('evaluateNativeBaseBuild', input())).toEqual([]);
  });
  it.each([
    { status: 'ERRORED' }, { platform: 'android' }, { channel: 'preview' },
    { runtimeVersion: '1.0.5' }, { appVersion: '1.0.4' }, { buildProfile: 'unknown' },
    { gitCommitHash: null }, { id: 'another-build' },
  ])('verweigert abweichende Build-Metadaten %j', patch => {
    expect(call('evaluateNativeBaseBuild', { ...input(), build: { ...build(), ...patch } }).length).toBeGreaterThan(0);
  });
  it.each([
    { nativeConfig: undefined }, { nativeConfig: null }, { releaseAppVersion: '1.0.6' },
    { nativeConfig: { appJson: { expo: { version: '1.0.5', runtimeVersion: 'wrong' } }, easJson: EAS } },
    { nativeConfig: { appJson: { expo: { version: 'wrong', runtimeVersion: RUNTIME } }, easJson: EAS } },
    { nativeConfig: { appJson: APP, easJson: {} } },
  ])('verweigert unvollständigen/abweichenden Konfigurationsbeleg %j', patch => {
    expect(call('evaluateNativeBaseBuild', { ...input(), ...patch }).length).toBeGreaterThan(0);
  });
  it.each([
    { channel: 'preview' }, { environment: 'preview' }, { distribution: 'internal' },
    { developmentClient: true }, { ios: { simulator: true } }, { ios: { buildConfiguration: 'Debug' } },
    { ios: { channel: 'preview' } }, { ios: { distribution: 'internal' } }, { config: 'custom.yml' },
  ])('verweigert unsichere abgeleitete Profilwerte %j', patch => {
    const eas = { build: { ...EAS.build, 'native-sensor-ios': { extends: 'production', ...patch } } };
    expect(call('resolveProductionBuildProfile', eas, 'native-sensor-ios', 'ios')).toBeNull();
  });
  it('prüft Vererbung, Zyklus, fehlende Eltern und geerbte Plattformwerte', () => {
    for (const build of [
      { native: { extends: 'missing' } },
      { production: { extends: 'native' }, native: { extends: 'production' } },
      { native: { channel: 'production', environment: 'production', distribution: 'store' } },
      { production: { ...EAS.build.production, ios: { simulator: true } }, native: { extends: 'production', ios: {} } },
    ]) expect(call('resolveProductionBuildProfile', { build }, 'native', 'ios')).toBeNull();
    const eas = { build: { ...EAS.build, native: { extends: 'native-sensor-ios', ios: { buildConfiguration: 'Release' } } } };
    expect(call('resolveProductionBuildProfile', eas, 'native', 'ios')).toMatchObject(EAS.build.production);
  });
});

// Ausschließlich temporäres Fixture-Repo und Fake-EAS: keine echte Veröffentlichung.
describe('Build-52-Guard über den echten CLI-Pfad', () => {
  let h: Harness;
  afterEach(() => { if (h) destroyHarness(h); });
  function setup(easJson: unknown = EAS) {
    h = createHarness({ appJson: APP, easJson });
    h.setState({ groups: [
      { group: 'old-ios', entries: [{ platform: 'ios', id: 'old-ios-id', runtimeVersion: '1.0.5', gitCommitHash: h.other }] },
      { group: 'android', entries: [{ platform: 'android', id: 'android-id', runtimeVersion: '1.0.4', gitCommitHash: h.other }] },
    ], builds: { [BUILD]: build(h.base) } });
  }
  const args = ['--platform', 'ios', '--initial-runtime-release', '--initial-runtime-build-id', BUILD,
    '--confirm', '--message', 'fixture-native-runtime'];

  it('veröffentlicht in der Simulation ausschließlich die belegte iOS-Runtime und prüft sie nach', () => {
    setup();
    const result = h.run(args, { env: { FAKE_RELEASE_RUNTIME: RUNTIME } });
    expect(result.code).toBe(0);
    expect(result.out).toContain('Zweiter EAS-Check: Production unverändert.');
    expect(result.out).toContain(`Runtime: ${RUNTIME}`);
    expect(h.updateCalls()).toHaveLength(1);
    expect(h.updateCalls()[0]).toEqual(['update', '--channel', 'production', '--environment', 'production',
      '--platform', 'ios', '--message', 'fixture-native-runtime', '--non-interactive']);
    expect(h.state().groups[0].entries).toEqual([{ platform: 'ios', id: 'u-new-ios', runtimeVersion: RUNTIME, gitCommitHash: h.release }]);
    expect(h.state().groups.slice(1).map(g => g.group)).toEqual(['old-ios', 'android']);
  });

  it('vertraut nicht auf erst im Release hinzugefügte Profile, wenn sie am Build-Commit fehlen', () => {
    setup(null);
    writeFileSync(join(h.repo, 'eas.json'), JSON.stringify(EAS));
    execFileSync('git', ['add', 'eas.json'], { cwd: h.repo });
    execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'release-only-profile'], { cwd: h.repo });
    const result = h.run(args);
    expect(result.code).toBe(1);
    expect(result.out).toContain('kein belegtes Production-Store-Profil');
    expect(h.updateCalls()).toEqual([]);
  });

  it('stoppt auch mit gültigem Build 52 bei zwischenzeitlicher OTA derselben Runtime', () => {
    setup();
    h.setState({ ...h.state(), raceAtList: 3,
      raceGroup: { group: 'racing-ios', entries: [{ platform: 'ios', id: 'race', runtimeVersion: RUNTIME, gitCommitHash: h.base }] } });
    const result = h.run(args);
    expect(result.code).toBe(1);
    expect(h.updateCalls()).toEqual([]);
  });
});
