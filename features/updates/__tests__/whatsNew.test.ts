import AsyncStorage from '@react-native-async-storage/async-storage';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';
import {
  CURRENT_WHATS_NEW_RELEASE, LAST_SEEN_WHATS_NEW_KEY,
  markWhatsNewSeen, pendingWhatsNew,
} from '@/features/updates/whatsNew';

// jest.mock wird von babel-jest vor die Imports gehoben.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

beforeEach(async () => { await AsyncStorage.clear(); });

describe('Neu in ANYVO', () => {
  it('zeigt die neue Release-ID auch nach den vorigen Hinweisen genau einmal', async () => {
    // Bereits bestätigte frühere „Neu in ANYVO"-Hinweise dürfen den neuen nicht unterdrücken.
    for (const previous of ['2026-09-newbie-backpack', '2026-10-tracking-ux', '2026-10-tracking-angle-analysis']) {
      await markWhatsNewSeen(previous);
      expect(CURRENT_WHATS_NEW_RELEASE?.id).toBe('2026-11-group-training-home-zone');
      expect(await pendingWhatsNew()).toEqual(CURRENT_WHATS_NEW_RELEASE);
    }
    await markWhatsNewSeen(CURRENT_WHATS_NEW_RELEASE!.id);
    expect(await AsyncStorage.getItem(LAST_SEEN_WHATS_NEW_KEY)).toBe('2026-11-group-training-home-zone');
    expect(await pendingWhatsNew()).toBeNull();   // nach „Verstanden" nicht erneut
  });

  it('Titel „Neu in ANYVO" und drei Texte zu Gruppentraining, Heimzone und Trainer-Kopie (alle Sprachen vorhanden)', () => {
    const release = CURRENT_WHATS_NEW_RELEASE!;
    expect(release.titleKey).toBe('updates.whatsNewTitle');
    expect(release.itemKeys).toEqual([
      'updates.whatsNewGroupTraining', 'updates.whatsNewHomeZone', 'updates.whatsNewTrainerCopy',
    ]);
    expect(deCH['updates.whatsNewTitle']).toBe('Neu in ANYVO');
    expect(deCH['updates.whatsNewGroupTraining']).toBe('Gruppentraining: Fährten für andere legen, übergeben und blind absuchen.');
    expect(deCH['updates.whatsNewHomeZone']).toBe('Heimzone: Dein Zuhause bleibt beim Teilen und Exportieren von Fährten verborgen.');
    expect(deCH['updates.whatsNewTrainerCopy']).toBe('Trainer sehen bei Freigaben eine gekürzte Kopie, dein Original bleibt bei dir.');
    for (const locale of [deCH, gswCH, en, fr, itLocale]) {
      for (const key of release.itemKeys) expect((locale as Record<string, string>)[key]).toBeTruthy();
    }
  });

  it('zeigt eine spätere Release-ID erneut', async () => {
    await markWhatsNewSeen(CURRENT_WHATS_NEW_RELEASE!.id);
    expect(await pendingWhatsNew({ ...CURRENT_WHATS_NEW_RELEASE!, id: 'next-release' })).not.toBeNull();
  });

  it('kann ohne Release-Hinweis deaktiviert werden', async () => {
    expect(await pendingWhatsNew(null)).toBeNull();
  });
});
