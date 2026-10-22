/** Android native release: preserve app identity and build the reviewed1.0.5 runtime. */
import { readFileSync } from 'fs';

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));

describe('Production-Native-Vertrag', () => {
  it('Android native build uses1.0.5, versionCode48 and verified install hooks', () => {
    expect(app.version).toBe('1.0.5');
    expect(app.android.runtimeVersion).toBe('1.0.5');
    expect(app.android.versionCode).toBe(48);
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.postinstall).toBe('node scripts/patch-expo-task-manager.cjs');
    expect(pkg.expo.autolinking.android.buildFromSource).toEqual(['expo-task-manager', 'unimodules-app-loader']);
    expect(pkg.scripts['eas-build-post-install']).toBe('node scripts/eas-build-post-install.cjs');
    const hook = readFileSync('scripts/eas-build-post-install.cjs', 'utf8');
    expect(hook).toContain("'patch-expo-task-manager.cjs'), '--check'");
    expect(hook).toContain('EAS_BUILD_GIT_COMMIT_HASH');
    expect(hook).toContain("run('set-env', ['EXPO_PUBLIC_RELEASE_GIT_COMMIT', commit]");
    expect(app.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(app.ios.buildNumber).toBe('48');
    expect(app.android.package).toBe('com.anyvo.app');
    expect(eas.cli.appVersionSource).toBe('local');
    expect(eas.build.production.autoIncrement).toBe(false);
  });
  it('Production-Identität: com.anyvo.app, Schema anyvo, Channel/Environment production', () => {
    expect(app.ios.bundleIdentifier).toBe('com.anyvo.app');
    expect(app.scheme).toBe('anyvo');
    expect(eas.build.production.channel).toBe('production');
    expect(eas.build.production.environment).toBe('production');
  });
  it('keine Internal-Werte im Production-Stand', () => {
    const all = readFileSync('app.json', 'utf8') + readFileSync('eas.json', 'utf8');
    expect(all).not.toMatch(/anyvo-internal|com\.anyvo\.app\.internal|"channel": "internal"|"ios-internal"|APP_VARIANT/);
  });
});
