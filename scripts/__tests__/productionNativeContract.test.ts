/** iOS-OTA-Vertrag gegen die unabhängig geprüfte Build-57-IPA.
 * Die globale Version ist kein Ersatz für plattformspezifische Expo-Werte.
 * Historische Build-49-Erwartungen gehören nicht zum aktuellen Release-Vertrag.
 */
import { readFileSync } from 'fs';
import { getAppVersion, getRuntimeVersionAsync } from '@expo/config-plugins/build/utils/Updates';
import { getBuildNumber, getVersion } from '@expo/config-plugins/build/ios/Version';

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const binary = JSON.parse(readFileSync('scripts/__tests__/fixtures/ios-build57-contract.json', 'utf8'));

describe('Production-Native-Vertrag', () => {
  it('aufgelöste iOS-Version, Runtime und Build passen zur geprüften Build-57-IPA', async () => {
    expect(getVersion(app)).toBe(binary.version);
    expect(getAppVersion(app, 'ios')).toBe(binary.version);
    expect(await getRuntimeVersionAsync(process.cwd(), app, 'ios')).toBe(binary.runtimeVersion);
    expect(getBuildNumber(app)).toBe(binary.buildNumber);
    expect(app.ios.bundleIdentifier).toBe(binary.bundleIdentifier);
    expect(eas.cli.appVersionSource).toBe('local');
    expect(eas.build.production.autoIncrement).toBe(false);
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
