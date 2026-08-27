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
  // Loanwords ANYVO's own German copy already borrows from English/Italian —
  // matching them 1:1 is the correct translation, not a missed one.
  'profile.secTrainer',
  'profile.secSupport',
  'home.actionTrainingJournal',
  'calendar.timeline',
  'calendar.timePlaceholder',
  'dog.heatPhaseOptional',
  'dog.quickCustom',
  'sync.status',
  'trainer.eyebrow',
  'chat.title',
  'training.videosLabel',
  'training.minutesShort',
  'training.iconLabel',
  'training.pausedShort',
  'membership.active',
  'journal.title',
  'journal.statTrainings',
  'track.engineLabel',
  'profile.streakUpper',
  'timer.pause',
  'track.pause',
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
  /[ÄÖÜäöüß]|\b(Bitte|Dauerhaft|Diese|Eigene|Einheit|Fährte|Gegenstand|Hund|Hunde|Passwort|Schritte|Sicherheitscode|Speichern|Trainingstagebuch|Winkel|dein|deine|deinen|gesendet|konnte|löschen|speichern|wird|zuerst|Zugriff|Verwaltung|Funktionen|Einstellungen|Programm|erforderlich|freischalten|verfügbar|erfasse|Erinnerungen)\b/i;

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

// analyse.importantHints uses German-only adjective-declension suffixes
// ({suffixHint}/{suffixImportant}, e.g. "wichtige HinweisE" vs "wichtigeR Hinweis")
// that have no equivalent in French/Italian/English grammar. Those locales
// intentionally don't reference the two suffix placeholders (i18next simply
// ignores unused interpolation values) and phrase count-agnostic copy instead
// (e.g. "remarque(s) importante(s)").
const placeholderMismatchExceptions = new Set(['analyse.importantHints']);

function placeholderMismatches(reference: Record<string, unknown>, candidate: Record<string, unknown>) {
  return keysOf(reference).filter(
    (key) =>
      !placeholderMismatchExceptions.has(key) &&
      JSON.stringify(placeholders(reference[key])) !== JSON.stringify(placeholders(candidate[key])),
  );
}

// Catches machine/placeholder fallback text that never got translated: the
// whole value is just the dotted key split into words (e.g. key
// "track.searchStartHint" → value "Track search start hint"). A real
// translation practically never reads as its own key name.
function keyWords(key: string) {
  return key
    .split('.')
    .flatMap((part) =>
      part
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    );
}

function normalizedWords(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// A handful of keys have a genuine, natural translation that happens to read
// exactly like the key split into words (e.g. "training.journal" → "Training
// journal") — those are correct copy, not an untranslated fallback.
const keyNameLeakExceptions = new Set([
  'track.laidSince',
  'trainer.features',
  'trainer.moduleRequired',
  'trainer.workspace',
  'training.journal',
  'trainer.profile',
]);

function keyNameLeaks(candidate: Record<string, unknown>) {
  return keysOf(candidate).filter((key) => {
    if (keyNameLeakExceptions.has(key)) return false;
    const kw = keyWords(key);
    if (kw.length < 2) return false;
    return normalizedWords(candidate[key]).join(' ') === kw.join(' ');
  });
}

// Catches raw key fragments pasted into an otherwise-translated string (e.g.
// "Aiuto faqDogAnswer" or "trainer-Dashboard") — a stray mixed-case token with
// no space around the case change. A few real product terms, example
// usernames and hyphen/slash-joined proper nouns legitimately look like this,
// so they're exempted by substring.
const camelCaseLeakExceptions = ['iPhone GPS', 'MistyRunner', 'PapillonDeBrume', 'Apple/Google', 'Row-Level'];

function camelCaseFragmentLeaks(candidate: Record<string, unknown>) {
  return keysOf(candidate).filter((key) => {
    const value = String(candidate[key] ?? '');
    if (camelCaseLeakExceptions.some((exception) => value.includes(exception))) return false;
    return value
      .split(/\s+/)
      .filter((token) => !/^\{\w+\}[.,;:!?…]*$/.test(token)) // skip interpolation placeholders like "{inSteps}."
      // French/Italian elision ("d'ANYVO", "l'accès") legitimately puts a
      // capitalized word right after a lowercase letter — drop that prefix
      // before checking for a real key-fragment leak.
      .map((token) => token.replace(/^[dljmtcnsDLJMTCNS]['’](?=[\p{Lu}])/u, ''))
      .some((token) => /[\p{Ll}][\p{Lu}]/u.test(token.replace(/[^\p{L}0-9]/gu, '')) && token.replace(/[^\p{L}]/gu, '').length >= 5);
  });
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

  it('never leaves an untranslated key name as the French, Italian or English value', () => {
    expect(keyNameLeaks(fr)).toEqual([]);
    expect(keyNameLeaks(itLocale)).toEqual([]);
    expect(keyNameLeaks(en)).toEqual([]);
  });

  it('never leaves a raw camelCase key fragment inside a French, Italian or English value', () => {
    expect(camelCaseFragmentLeaks(fr)).toEqual([]);
    expect(camelCaseFragmentLeaks(itLocale)).toEqual([]);
    expect(camelCaseFragmentLeaks(en)).toEqual([]);
  });
});
