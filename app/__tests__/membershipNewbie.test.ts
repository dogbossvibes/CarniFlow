// Mitgliedschaft → „Dein Plan": NEWBIE-Modell (dog 1 · training 2/Monat · track 1/Monat)
// und konsistente Texte in allen Sprachen. Quota bleibt serverautoritativ
// (newbieQuotaStatus) — keine zweite Quota-Logik im Screen.
import { readFileSync } from 'fs';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { deDE } from '@/i18n/de-DE';
import { de } from '@/i18n/locales/de';
import { gsw } from '@/i18n/locales/gsw';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';
import { NEWBIE_QUOTA, quotaLimit, quotaAllowsNew } from '@/features/subscription/plans';

const src = readFileSync('app/membership.tsx', 'utf8');
type Dict = Record<string, string | undefined>;
const LOCALES: Record<string, Dict> = { deCH, gswCH, deDE, de, gsw, en, fr, it: itLocale } as never;
const FULL: Record<string, Dict> = { deCH, gswCH, en, fr, it: itLocale } as never;

/** Den Literal-Block einer Konstante (BENEFITS.newbie / NEWBIE_LOCKED) aus dem Quelltext holen. */
function block(start: RegExp, end = '],'): string {
  const i = src.search(start);
  expect(i).toBeGreaterThanOrEqual(0);
  return src.slice(i, src.indexOf(end, i) + end.length);
}

describe('NEWBIE-Nutzung (Quota-Status)', () => {
  it('zeigt Training, Fährte und Hund — alle aus dem bestehenden newbieQuotaStatus', () => {
    expect(src).toContain("setTrainingUsage(await newbieQuotaStatus('training'))");
    expect(src).toContain("setTrackUsage(await newbieQuotaStatus('track'))");
    expect(src).toContain("setDogUsage(await newbieQuotaStatus('dog'))");
    expect(src).toContain("t('membership.trainingUsage')");
    expect(src).toContain("t('membership.trackUsage')");
    expect(src).toContain("t('membership.dogUsage')");
    expect(src).toContain('`${trackUsage.used} / ${trackUsage.limit}`');
    expect(src).toContain('`${trainingUsage.used} / ${trainingUsage.limit}`');
  });
  it('keine zweite Quota-Logik: keine lokalen Limits/Zähler im Screen', () => {
    expect(src).not.toMatch(/NEWBIE_QUOTA|quotaLimit|quotaAllowsNew|claimNewbieQuota/);
    expect(src).not.toMatch(/limit:\s*[0-9]/);
  });
  it('das Limit-Hinweis-Banner erscheint bei erreichtem Trainings- ODER Fährten-Limit', () => {
    expect(src).toContain('trackUsage.used >= trackUsage.limit');
    expect(src).toContain('trainingUsage.used >= trainingUsage.limit');
    expect(src).not.toContain('membership.trainingAvailable');   // war fix „1 Training verfügbar"
  });
  it('der Client-Spiegel stimmt mit dem serverautoritativen Modell überein: 1 / 2 / 1', () => {
    expect(NEWBIE_QUOTA).toEqual({ dog: 1, training: 2, track: 1 });
  });
});

describe('Dein Plan → Deine Vorteile (NEWBIE)', () => {
  const newbie = block(/newbie:\s*\[\s*\n\s*'membership\.benefit\.oneDog'/);
  it('enthält genau: 1 Hund · 2 Trainings/Monat · 1 Fährte/Monat · Journal · Trainer verbinden · Gesundheitsdaten', () => {
    const keys = [...newbie.matchAll(/'(membership\.benefit\.[A-Za-z]+)'/g)].map(m => m[1]);
    expect(keys).toEqual([
      'membership.benefit.oneDog', 'membership.benefit.twoTrainings', 'membership.benefit.oneTrack',
      'membership.benefit.journal', 'membership.benefit.trainerConnect', 'membership.benefit.generalHealth',
    ]);
  });
  it('Fährten stehen NICHT unter „In Active enthalten" (nicht Active-only)', () => {
    const locked = block(/const NEWBIE_LOCKED: TranslationKey\[\] = \[/, '];');
    expect(locked).not.toMatch(/tracks|Tracks/);
    expect(locked).not.toContain('membership.benefit.oneTrack');
    // Premium-only laut PREMIUM_CAPABILITIES: Läufigkeit, Ziel, Smart-Analyse. Backpack/Kommandos sind BASIS.
    expect([...locked.matchAll(/'membership\.benefit\.([A-Za-z]+)'/g)].map(m => m[1])).toEqual(['heat', 'goal', 'smartAnalysis']);
  });
  it('ACTIVE / FOUNDER / TRAINER / permanent: Fährten unbegrenzt, nie „GPS-Fährten"', () => {
    const premiumBlocks = src.match(/(active|founder_active|trainer|permanent): \[[^\]]*\]/g) ?? [];
    expect(premiumBlocks.length).toBe(4);
    for (const b of premiumBlocks) expect(b).toContain('membership.benefit.unlimitedTracks');
    expect(src).not.toContain('membership.benefit.tracks');
  });
  it('Planname: öffentlich „NEWBIE" (Hero + Vergleichskarte); „Kostenlos" nur Badge/Preis', () => {
    expect(src).toContain("newbie:         'membership.newbie'");
    expect(src).toContain("nameKey: 'membership.newbie', price: t('membership.free')");
    expect(src).toContain("{isNewbie ? t('membership.free') : t('membership.statusActive')}");
    for (const d of Object.values(FULL)) expect(d['membership.newbie']).toBe('NEWBIE');
  });
});

describe('ACTIVE bleibt unbegrenzt', () => {
  it('quotaLimit(isPro) = Infinity für alle Arten; NEWBIE begrenzt', () => {
    for (const k of ['dog', 'training', 'track'] as const) {
      expect(quotaLimit(true, k)).toBe(Infinity);
      expect(quotaAllowsNew(true, k, 10_000)).toBe(true);
    }
    expect(quotaAllowsNew(false, 'track', 0)).toBe(true);
    expect(quotaAllowsNew(false, 'track', 1)).toBe(false);
    expect(quotaAllowsNew(false, 'training', 1)).toBe(true);
    expect(quotaAllowsNew(false, 'training', 2)).toBe(false);
  });
  it('die Nutzungskarte erscheint nur für NEWBIE', () => {
    expect(src).toContain('{isNewbie && (\n          <View style={s.card}>\n            <Text style={s.sectionTitle}>{t(\'membership.usage\')}');
    expect(src).toContain('if (!isNewbie || !uid) return;');
  });
});

describe('i18n: alle Sprachen konsistent, keine veralteten Strings', () => {
  const NEW_KEYS = [
    'membership.newbie', 'membership.trackUsage', 'membership.benefit.twoTrainings',
    'membership.benefit.oneTrack', 'membership.benefit.unlimitedTracks', 'membership.benefit.trainerConnect',
  ];
  it.each(Object.keys(FULL))('%s: alle neuen Keys vorhanden und nicht leer', name => {
    for (const k of NEW_KEYS) expect((FULL[name][k] ?? '').length).toBeGreaterThan(0);
  });
  it.each(Object.keys(FULL))('%s: Training = 2, Fährte = 1 pro Monat', name => {
    expect(FULL[name]['membership.benefit.twoTrainings']).toMatch(/\b2\b/);
    expect(FULL[name]['membership.benefit.oneTrack']).toMatch(/\b1\b/);
  });
  it('die entfernten Keys existieren in keiner Sprache mehr', () => {
    for (const [name, d] of Object.entries(LOCALES)) {
      for (const k of ['membership.benefit.oneTraining', 'membership.benefit.tracks', 'membership.trainingAvailable']) {
        expect([name, Object.keys(d).includes(k)]).toEqual([name, false]);
      }
    }
  });
  it('kein veralteter NEWBIE-Text in den membership.*-Strings (1 Training/Monat, keine Fährte, „GPS-Fährten")', () => {
    const stale = /1 Training pro Mon|1 Training par mois|1 entraînement par mois|1 training per month|1 allenamento al mese|Keine Fährte|Aucune piste|No tracks? included|GPS-Fährten|GPS-tracks|GPS tracks|pistes GPS/i;
    for (const [name, d] of Object.entries(LOCALES)) {
      for (const [k, v] of Object.entries(d)) {
        if (!k.startsWith('membership.') || typeof v !== 'string') continue;
        expect([name, k, stale.test(v)]).toEqual([name, k, false]);
      }
    }
  });
  it('die Überschrift über den gesperrten Features heisst in jeder Sprache „in Active enthalten" (nicht „Inactive"/„attivo")', () => {
    expect(en['membership.inActive']).toBe('Included in Active');
    expect(itLocale['membership.inActive']).toBe('Incluso in Active');
    for (const d of Object.values(FULL)) expect(d['membership.inActive']).toMatch(/Active/);
  });
  it('Paywall-Karte (premium.featureOneTrackMonth) bleibt „1 … pro Monat" in allen Sprachen', () => {
    for (const d of Object.values(FULL)) expect(d['premium.featureOneTrackMonth']).toMatch(/\b1\b/);
  });
});
