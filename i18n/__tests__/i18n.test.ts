jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageTag: 'de-CH', languageCode: 'de', regionCode: 'CH' }]),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from '../config';
import {
  normalizeLocale, detectDeviceLocale, translate,
  setPreference, applyRemoteLocale, getLocale, getPreference,
} from '../index';

const setDevice = (tag: string) =>
  (getLocales as jest.Mock).mockReturnValue([{ languageTag: tag, languageCode: tag.split('-')[0] }]);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('i18n Phase 1 — Fundament', () => {
  // ── Legacy-/Normalisierung (1–6, 20) ──
  it('1. de-CH → de', () => expect(normalizeLocale('de-CH')).toBe('de'));
  it('2. de-DE → de', () => expect(normalizeLocale('de-DE')).toBe('de'));
  it('3. gsw-CH → gsw', () => expect(normalizeLocale('gsw-CH')).toBe('gsw'));
  it('4. fr-CH → fr', () => expect(normalizeLocale('fr-CH')).toBe('fr'));
  it('5. fr-FR → fr', () => expect(normalizeLocale('fr-FR')).toBe('fr'));
  it('6. en-US → en', () => expect(normalizeLocale('en-US')).toBe('en'));
  it('6b. it-CH → it', () => expect(normalizeLocale('it-CH')).toBe('it'));
  it('6c. it-IT → it', () => expect(normalizeLocale('it-IT')).toBe('it'));
  it('6d. en-GB → en', () => expect(normalizeLocale('en-GB')).toBe('en'));
  it('6e. unbekannt (pt-BR) → de', () => expect(normalizeLocale('pt-BR')).toBe('de'));
  it('20. Legacy-Wert gsw-CH wird korrekt gelesen', () => {
    applyRemoteLocale('gsw-CH');
    expect(getPreference()).toBe('gsw');
    expect(getLocale()).toBe('gsw');
  });

  // ── Automatische Erkennung (7–9) ──
  it('7. Auto + fr-CH → fr', () => { setDevice('fr-CH'); expect(detectDeviceLocale()).toBe('fr'); });
  it('8. Auto + de-CH → de', () => { setDevice('de-CH'); expect(detectDeviceLocale()).toBe('de'); });
  it('9. Auto + gsw → de (nie automatisch gsw)', () => { setDevice('gsw'); expect(detectDeviceLocale()).toBe('de'); });
  it('9b. Auto + it-CH → it', () => { setDevice('it-CH'); expect(detectDeviceLocale()).toBe('it'); });
  it('9c. Auto + it-IT → it', () => { setDevice('it-IT'); expect(detectDeviceLocale()).toBe('it'); });
  it('9d. Auto + en-GB → en', () => { setDevice('en-GB'); expect(detectDeviceLocale()).toBe('en'); });
  it('9e. Auto + en-US → en', () => { setDevice('en-US'); expect(detectDeviceLocale()).toBe('en'); });
  it('9f. Auto + unbekannt → de', () => { setDevice('pt-BR'); expect(detectDeviceLocale()).toBe('de'); });

  // ── Manuelle Auswahl (10–11) ──
  it('10. manuell gsw → gsw', () => { setPreference('gsw'); expect(getLocale()).toBe('gsw'); });
  it('11. manuell fr → fr', () => { setPreference('fr'); expect(getLocale()).toBe('fr'); });
  it('11b. manuell it → it', () => { setPreference('it'); expect(getLocale()).toBe('it'); });
  it('11c. manuell en → en', () => { setPreference('en'); expect(getLocale()).toBe('en'); });

  // ── Fallback (12–13) ──
  it('12. fehlender fr-Key → de-Fallback', () => {
    i18n.addResource('de', 'translation', 'test.onlyDe', 'NurDeutsch');
    expect(i18n.t('test.onlyDe', { lng: 'fr' })).toBe('NurDeutsch');
  });
  it('13. fehlender gsw-Key → de-Fallback', () => {
    // 'doghub.tab.training' ist in gsw nicht überschrieben → de
    expect(translate('doghub.tab.training', undefined, 'gsw')).toBe('Training');
  });

  // ── Pluralisierung (14–15) ──
  it('14. deutsche Singular/Plural', () => {
    expect(translate('trainingCount', { count: 1 }, 'de')).toBe('1 Training');
    expect(translate('trainingCount', { count: 2 }, 'de')).toBe('2 Trainings');
  });
  it('15. französische Singular/Plural', () => {
    expect(translate('trainingCount', { count: 1 }, 'fr')).toBe('1 entraînement');
    expect(translate('trainingCount', { count: 2 }, 'fr')).toBe('2 entraînements');
  });
  it('15b. italienische Singular/Plural', () => {
    expect(translate('trainingCount', { count: 1 }, 'it')).toBe('1 allenamento');
    expect(translate('trainingCount', { count: 2 }, 'it')).toBe('2 allenamenti');
  });
  it('15c. englische Singular/Plural', () => {
    expect(translate('trainingCount', { count: 1 }, 'en')).toBe('1 training session');
    expect(translate('trainingCount', { count: 2 }, 'en')).toBe('2 training sessions');
  });

  // ── Persistenz (16–19) ──
  it('16. Persistenz auto', async () => { setPreference('auto'); await flush(); expect(await AsyncStorage.getItem('app_locale')).toBe('auto'); });
  it('17. Persistenz de',   async () => { setPreference('de');   await flush(); expect(await AsyncStorage.getItem('app_locale')).toBe('de'); });
  it('18. Persistenz gsw',  async () => { setPreference('gsw');  await flush(); expect(await AsyncStorage.getItem('app_locale')).toBe('gsw'); });
  it('19. Persistenz fr',   async () => { setPreference('fr');   await flush(); expect(await AsyncStorage.getItem('app_locale')).toBe('fr'); });
  it('19b. Persistenz it',  async () => { setPreference('it');   await flush(); expect(await AsyncStorage.getItem('app_locale')).toBe('it'); });
  it('19c. Persistenz en',  async () => { setPreference('en');   await flush(); expect(await AsyncStorage.getItem('app_locale')).toBe('en'); });
});

describe('i18n Phase 1 — Intl-Formatter', () => {
  const { formatDate, formatDistance } = require('../format');
  it('Datum de → TT.MM.JJJJ', () => {
    expect(formatDate(new Date(2024, 11, 12), undefined, 'de')).toBe('12.12.2024');
  });
  it('Distanz < 1000 m → „x m"', () => {
    expect(formatDistance(500, 'de')).toMatch(/^500\s?m$/);
  });
  it('Distanz ≥ 1000 m → „x.x km"', () => {
    expect(formatDistance(1500, 'de')).toMatch(/1[.,]5\s?km/);
  });
  it('fr-Dezimaltrennzeichen ist Komma', () => {
    expect(formatDistance(1500, 'fr')).toMatch(/1,5\s?km/);
  });
  it('en nutzt en-GB-Datum und Punkt als Dezimaltrennzeichen', () => {
    expect(formatDate(new Date(2024, 11, 12), undefined, 'en')).toBe('12/12/2024');
    expect(formatDistance(1500, 'en')).toMatch(/1\.5\s?km/);
  });
});
