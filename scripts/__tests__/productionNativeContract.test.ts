/**
 * Production-Native-Vertrag 1.0.4 (Live Activity V2, Schnellstart-Widget, App Intents):
 * eigener Runtime-Vertrag ggü. Store-Binary 1.0.3 (48). Keine Internal-Werte.
 */
import { readFileSync } from 'fs';

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));

describe('Production-Native-Vertrag', () => {
  it('Version 1.0.4 → Runtime 1.0.4 (policy appVersion), iOS-Build 49', () => {
    expect(app.version).toBe('1.0.4');
    expect(app.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(app.ios.buildNumber).toBe('49');
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
