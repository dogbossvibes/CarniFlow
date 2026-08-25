import { de } from '../locales/de';
import { gsw } from '../locales/gsw';
import { fr } from '../locales/fr';
import { it as itLocale } from '../locales/it';
import { en } from '../locales/en';
import { execFileSync } from 'child_process';

function keysOf(obj: Record<string, unknown>) {
  return Object.keys(obj).sort();
}

function missingKeys(reference: Record<string, unknown>, candidate: Record<string, unknown>) {
  return keysOf(reference).filter((key) => !(key in candidate));
}

function emptyValues(candidate: Record<string, unknown>) {
  return keysOf(candidate).filter((key) => String(candidate[key] ?? '').trim().length === 0);
}

function hasFlatKey(candidate: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(candidate, key);
}

function placeholders(value: unknown) {
  return Array.from(String(value ?? '').matchAll(/\{\{?\w+\}?\}|\{\w+\}/g))
    .map((match) => match[0])
    .sort();
}

const intentionallyNeutralIdenticalKeys = new Set([
  'track.livePaused',
  'home.layout',
  'home.widgets',
  'dog.sport',
  'sync.online',
  'sync.offline',
  'sync.markers',
  'home.widgetLabel',
  'connect.identityA11y',
  'track.materialOther',
  'track.iphoneGps',
  'trainer.dashboard',
  'trainer.website',
  'analyse.trend',
  'journal.hoursShort',
  'trainer.workspace',
]);

const intentionallyNeutralValues = new Set([
  'ANYVO',
  'CONNECT',
  'Backpack',
  'Smart Analyse',
  'Smart Coach',
  'OK',
  'GPS',
  'LIVE',
  'ACTIVE',
  'NEWBIE',
  'Founder Active',
  'MFi',
  'CHF 0',
  'IGP',
  'IBGH',
  'Obedience',
  'Agility',
  'Hoopers',
  'AMICUS',
  'TASSO',
  'FINDEFIX',
  'WebView',
  'PDF',
  'JPG, PNG',
  'kg',
  'km',
  'cm',
  'Modal',
  'optional',
  'Start',
  'Trainer',
  'Training',
  'Timer',
  'Name',
  'ANYVO ID',
]);

const germanUiPattern =
  /[ÄÖÜäöüß]|\b(Bitte|Dauerhaft|Diese|Eigene|Einheit|Fährte|Gegenstand|Hund|Hunde|Passwort|Schritte|Sicherheitscode|Speichern|Trainingstagebuch|Winkel|dein|deine|deinen|gesendet|konnte|löschen|speichern|wird|zuerst)\b/i;

function untranslatedProductiveKeys(reference: Record<string, unknown>, candidate: Record<string, unknown>) {
  return keysOf(reference).filter((key) => {
    const value = String(candidate[key] ?? '');
    return (
      reference[key] === candidate[key] &&
      !intentionallyNeutralIdenticalKeys.has(key) &&
      !intentionallyNeutralValues.has(value)
    );
  });
}

function germanFallbackKeys(candidate: Record<string, unknown>) {
  return keysOf(candidate).filter((key) => {
    const value = String(candidate[key] ?? '');
    return germanUiPattern.test(value) && !intentionallyNeutralValues.has(value);
  });
}

const englishForeignUiPattern =
  /[ÄÖÜäöüßàâçéèêëîïôùûüÿœæÀÂÇÉÈÊËÎÏÔÙÛÜŸŒÆ]|\b(Bitte|Dauerhaft|Diese|Eigene|Einheit|Fährte|Gegenstand|Hund|Hunde|Passwort|Schritte|Sicherheitscode|Speichern|Trainingstagebuch|Winkel|dein|deine|deinen|gesendet|konnte|löschen|speichern|wird|zuerst|Choisis|chien|chiens|piste|entraînement|semaine|giorni|allenamento|cane|cani|traccia|oggetto|angolo|promemoria|Automatico|Automatique|Français|Italiano)\b/i;

function englishForeignFallbackKeys(candidate: Record<string, unknown>) {
  return keysOf(candidate).filter((key) => {
    const value = String(candidate[key] ?? '');
    return (
      englishForeignUiPattern.test(value) &&
      !intentionallyNeutralIdenticalKeys.has(key) &&
      !intentionallyNeutralValues.has(value)
    );
  });
}

function placeholderMismatches(reference: Record<string, unknown>, candidate: Record<string, unknown>) {
  return keysOf(reference).filter(
    (key) => JSON.stringify(placeholders(reference[key])) !== JSON.stringify(placeholders(candidate[key])),
  );
}

const importantAuthKeys = [
  'auth.login',
  'auth.register',
  'auth.forgotPassword',
  'auth.resetSuccess',
  'auth.newPasswordTitle',
  'auth.emailChangePending',
  'profile.accountSecurity',
];

const importantTrackKeys = [
  'track.lay',
  'track.search',
  'track.object',
  'track.angle',
  'track.lyingTime',
  'toast.startPointWait',
];

const importantHomeKeys = [
  'greeting.morning',
  'calendar.nextAppointment',
  'calendar.noAppointment',
  'training.today',
];

const importantProfileKeys = [
  'profile.title',
  'profile.language',
  'profile.logout',
  'profile.helpCenter',
];

const importantPhase2Keys = [
  'home.customizeTitle',
  'home.quickStart',
  'dog.photoAdd',
  'dog.save',
  'sync.offlineTitle',
  'sync.syncNow',
  'help.centerTitle',
  'help.tourTitle',
  'trainer.moduleRequired',
  'trainer.myTrainers',
  'connect.errorTitle',
  'track.gpsSource',
  'track.setMarker',
  'track.calibrateOrientation',
  'common.appErrorTitle',
];

const importantPhase3Keys = [
  'training.documentTraining',
  'training.saveUnit',
  'training.deleteUnitTitle',
  'training.exerciseCountShort',
  'comments.messagesCount',
  'comments.writeMessage',
  'premium.founderSoldOut',
  'trainer.deletePlanTitle',
  'media.addVideo',
  'appLock.unlock',
  'analyse.trainingBalance30',
];

describe('Swiss German localization consistency', () => {
  it('has every German reference key in Swiss German', () => {
    expect(missingKeys(de, gsw)).toEqual([]);
  });

  it('has no empty Swiss German values', () => {
    expect(emptyValues(gsw)).toEqual([]);
  });

  it('keeps the translation structure valid', () => {
    expect(keysOf(gsw)).toEqual(keysOf(de));
  });

  it('contains important Auth keys', () => {
    for (const key of importantAuthKeys) {
      expect(hasFlatKey(gsw, key)).toBe(true);
    }
  });

  it('contains important Track keys', () => {
    for (const key of importantTrackKeys) {
      expect(hasFlatKey(gsw, key)).toBe(true);
    }
  });

  it('contains important Home keys', () => {
    for (const key of importantHomeKeys) {
      expect(hasFlatKey(gsw, key)).toBe(true);
    }
  });

  it('contains important Profile keys', () => {
    for (const key of importantProfileKeys) {
      expect(hasFlatKey(gsw, key)).toBe(true);
    }
  });

  it('contains important Phase 2 migrated UI keys', () => {
    for (const key of importantPhase2Keys) {
      expect(hasFlatKey(gsw, key)).toBe(true);
      expect(hasFlatKey(de, key)).toBe(true);
    }
  });

  it('contains important Phase 3 migrated UI keys', () => {
    for (const key of importantPhase3Keys) {
      expect(hasFlatKey(gsw, key)).toBe(true);
      expect(hasFlatKey(de, key)).toBe(true);
    }
  });

  it('produces categorized hardcoded UI metrics for Phase 3', () => {
    const raw = execFileSync('node', ['scripts/localization-hardcoded-scan.mjs', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const report = JSON.parse(raw) as { rawCandidates: number; categoryCounts: Record<string, number>; releaseRelevantOpen: number };
    expect(report.rawCandidates).toBeGreaterThan(0);
    expect(report.categoryCounts).toHaveProperty('A');
    expect(report.categoryCounts).toHaveProperty('I');
    expect(report.releaseRelevantOpen).toBeGreaterThanOrEqual(0);
  });

  it('reports identical DE/CH strings without failing intentional terminology', () => {
    const identical = keysOf(de).filter((key) => de[key as keyof typeof de] === gsw[key as keyof typeof gsw]);
    expect(identical).toContain('training.title');
    expect(identical.length).toBeGreaterThan(0);
  });

  it('keeps every quickButton.* key non-empty in DE, gsw and FR', () => {
    const quickButtonKeys = keysOf(de).filter((key) => key.startsWith('quickButton.'));
    expect(quickButtonKeys.length).toBeGreaterThan(0);
    for (const key of quickButtonKeys) {
      expect(String(gsw[key as keyof typeof gsw] ?? '').trim().length).toBeGreaterThan(0);
      expect(String(fr[key as keyof typeof fr] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps French, Italian and English at runtime key parity with German', () => {
    expect(missingKeys(de, fr)).toEqual([]);
    expect(missingKeys(de, itLocale)).toEqual([]);
    expect(missingKeys(de, en)).toEqual([]);
    expect(emptyValues(fr)).toEqual([]);
    expect(emptyValues(itLocale)).toEqual([]);
    expect(emptyValues(en)).toEqual([]);
  });

  it('prevents French, Italian and English from silently falling back to German UI text', () => {
    expect(untranslatedProductiveKeys(de, fr)).toEqual([]);
    expect(untranslatedProductiveKeys(de, itLocale)).toEqual([]);
    expect(untranslatedProductiveKeys(de, en)).toEqual([]);
    expect(germanFallbackKeys(fr)).toEqual([]);
    expect(germanFallbackKeys(itLocale)).toEqual([]);
    expect(germanFallbackKeys(en)).toEqual([]);
    expect(englishForeignFallbackKeys(en)).toEqual([]);
  });

  it('keeps interpolation placeholders identical across German, French, Italian and English', () => {
    expect(placeholderMismatches(de, fr)).toEqual([]);
    expect(placeholderMismatches(de, itLocale)).toEqual([]);
    expect(placeholderMismatches(de, en)).toEqual([]);
  });
});
