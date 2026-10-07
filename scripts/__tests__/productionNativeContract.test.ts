/**
 * Android hotfix release contract: preserve the existing 1.0.3 binary runtime.
 * The canonical main retains its independent iOS 1.0.4 / Build 49 contract.
 */
import { readFileSync } from 'fs';

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));

describe('Production-Native-Vertrag', () => {
  it('Android hotfix uses Runtime 1.0.3 and the unchanged production app identity', () => {
    expect(app.version).toBe('1.0.3');
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
