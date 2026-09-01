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
  'premium.featureActive',
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
});

// Raw stub/machine-translation guard for IT and EN (added after the EN/IT quality
// audit found untranslated placeholder text like "Home reset message" and
// "Dog delete dog message {dog}" shipped as if they were real copy, plus German
// verb-final word order carried literally into "noun delete?"/"noun eliminare?"
// dialog titles). Deliberately generic pattern matches, not a full retranslation
// check — this only needs to catch the shape of these two specific failure modes
// if they reappear.
describe('IT/EN raw stub-translation guard', () => {
  it('has every German reference key in IT and EN, with no empty values', () => {
    expect(missingKeys(de, itLocale)).toEqual([]);
    expect(missingKeys(de, en)).toEqual([]);
    expect(emptyValues(itLocale)).toEqual([]);
    expect(emptyValues(en)).toEqual([]);
  });

  it('has no literal "[Domain] [filler words] message/body/title" placeholder stubs in EN', () => {
    // Requires >=2 lowercase filler words before the generic suffix, so genuine
    // short labels ("Voice message") don't false-positive on this check.
    const stubPattern = /^[A-Z][a-z]+(?: [a-z]+){2,} (message|body|title)$/;
    const stubs = keysOf(de).filter((key) => stubPattern.test(String(en[key as keyof typeof en] ?? '')));
    expect(stubs).toEqual([]);
  });

  it('has no German verb-final "noun delete?" word order in EN dialog titles', () => {
    const wrongOrderPattern = /^[a-z][a-z ]* (delete|remove|cancel)\?$/;
    const hits = keysOf(de).filter((key) => wrongOrderPattern.test(String(en[key as keyof typeof en] ?? '')));
    expect(hits).toEqual([]);
  });

  it('has no German verb-final "sostantivo eliminare?" word order in IT dialog titles', () => {
    const wrongOrderPattern = /^[a-zàèéìòù][a-zàèéìòù ]* (eliminare|rimuovere|annullare)\?$/;
    const hits = keysOf(de).filter((key) => wrongOrderPattern.test(String(itLocale[key as keyof typeof itLocale] ?? '')));
    expect(hits).toEqual([]);
  });
});
