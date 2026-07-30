import { de } from '../locales/de';
import { gsw } from '../locales/gsw';
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
});
