import { readFileSync } from 'fs';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';
import { CURRENT_WHATS_NEW_RELEASE } from '@/features/updates/whatsNew';

// jest.mock wird von babel-jest vor die Imports gehoben.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

describe('bestehender stiller OTA-Startpfad', () => {
  it('lässt Expo SDK 54 beim Start automatisch prüfen und laden, ohne Session-Reload', () => {
    const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
    expect(config.updates.url).toMatch(/^https:\/\/u\.expo\.dev\//);
    expect(config.updates.checkAutomatically).toBeUndefined();
    expect(config.updates.fallbackToCacheTimeout).toBeUndefined();
    expect(config.runtimeVersion).toEqual({ policy: 'appVersion' });
    const root = readFileSync('app/_layout.tsx', 'utf8');
    const tabs = readFileSync('app/(tabs)/_layout.tsx', 'utf8');
    expect(root + tabs).not.toMatch(/reloadAsync|checkForUpdateAsync|fetchUpdateAsync/);
  });
});

describe('Update-Texte und Profil', () => {
  it.each([deCH, gswCH, en, fr, itLocale])('hat vollständige Kundentexte in jeder Sprache', locale => {
    // Release-Texte kommen aus dem HEUTIGEN Release-Objekt (whatsNew.ts), nicht aus einem älteren Stand.
    const release = CURRENT_WHATS_NEW_RELEASE!;
    for (const key of [
      release.titleKey, ...release.itemKeys, 'updates.understood', 'updates.storeTitle',
      'updates.storeBody', 'updates.openAppStore', 'updates.current', 'updates.available', 'updates.status',
      'updates.version', 'updates.build',
    ] as const) expect((locale as Record<string, string | undefined>)[key]).toBeTruthy();
  });

  it('mountet genau EINE „Neu in ANYVO"-Oberfläche im Tab-Layout (kein doppeltes Modal)', () => {
    const tabs = readFileSync('app/(tabs)/_layout.tsx', 'utf8');
    expect(tabs).toContain('<UpdateExperience />');
    expect(tabs).not.toContain('WhatsNewExperience');
  });

  it('zeigt den Store-Status im Profil nur bei bekannter Version (keine Behauptung bei „unknown")', () => {
    const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');
    expect(profile).toContain("storeUpdateStatus !== 'unknown'");
  });

  it('liest Version und Build dynamisch statt aus einem UI-Literal', () => {
    const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');
    expect(profile).toContain('getInstalledVersion()');
    expect(profile).toContain('getInstalledBuild()');
    expect(profile).not.toContain('ANYVO v1.0.3');
  });

  it('verbindet Verstanden mit Persistenz und den Store-Button mit dem ANYVO-Link', () => {
    const ui = readFileSync('features/updates/UpdateExperience.tsx', 'utf8');
    expect(ui).toContain('markWhatsNewSeen(whatsNew.id)');
    expect(ui).toContain('onPress={closeWhatsNew}');
    expect(ui).toContain('Linking.openURL(ANYVO_APP_STORE_URL)');
  });
});
