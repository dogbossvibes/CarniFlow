/** iOS-OTA-Vertrag gegen die geprüfte Build-60-IPA (main = iOS-60-Linie).
 * Die Build-57-Werte bleiben als Fixture für die eigene Release-Linie erhalten.
 * Die globale Version ist kein Ersatz für plattformspezifische Expo-Werte.
 * Historische Build-49-Erwartungen gehören nicht zum aktuellen Release-Vertrag.
 */
import { readFileSync } from 'fs';
import { getAppVersion, getRuntimeVersionAsync } from '@expo/config-plugins/build/utils/Updates';
import { getBuildNumber, getVersion } from '@expo/config-plugins/build/ios/Version';

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const binary = JSON.parse(readFileSync('scripts/__tests__/fixtures/ios-build60-contract.json', 'utf8'));

describe('Production-Native-Vertrag', () => {
  it('aufgelöste iOS-Version, Runtime und Build passen zur geprüften Build-60-IPA', async () => {
    expect(getVersion(app)).toBe(binary.version);
    expect(getAppVersion(app, 'ios')).toBe(binary.version);
    expect(await getRuntimeVersionAsync(process.cwd(), app, 'ios')).toBe(binary.runtimeVersion);
    expect(getBuildNumber(app)).toBe(binary.buildNumber);
    expect(app.ios.bundleIdentifier).toBe(binary.bundleIdentifier);
    expect(eas.cli.appVersionSource).toBe('local');
    expect(eas.build.production.autoIncrement).toBe(false);
  });
  it('Android: eigene SDK-58-Runtime, versionCode über allen vergebenen Play-Builds', async () => {
    // Play-Produktion ist 49, 50 ist für ein früheres AAB vergeben. Android darf nie die
    // iOS-Runtime oder die appVersion-Policy erben: alte Android-Runtimes sind SDK 54.
    expect(await getRuntimeVersionAsync(process.cwd(), app, 'android')).toBe('1.0.8-sdk58-android-v1');
    expect(await getRuntimeVersionAsync(process.cwd(), app, 'android')).not.toBe(binary.runtimeVersion);
    expect(app.android.versionCode).toBeGreaterThanOrEqual(51);
    expect(app.android.package).toBe('com.anyvo.app');
    expect(eas.build.production.android.buildType).toBe('app-bundle');
  });
  it('Production-Identität: com.anyvo.app, Schema anyvo, Channel/Environment production', () => {
    expect(app.ios.bundleIdentifier).toBe('com.anyvo.app');
    expect(app.scheme).toBe('anyvo');
    expect(eas.build.production.channel).toBe('production');
    expect(eas.build.production.environment).toBe('production');
    expect(eas.build.production.env.EXPO_PUBLIC_BACKEND_ENV).toBe('production');
  });
  it('keine Internal-Werte im Production-Stand', () => {
    const all = readFileSync('app.json', 'utf8') + readFileSync('eas.json', 'utf8');
    expect(all).not.toMatch(/anyvo-internal|com\.anyvo\.app\.internal|"channel": "internal"|"ios-internal"|APP_VARIANT/);
  });
});
