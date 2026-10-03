import { readFileSync } from 'fs';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';

// NEWBIE ist dauerhaft kostenlos (CHF 0), kein Trial, kein Ablaufdatum. Diese Suite
// belegt statisch (analog app/__tests__/membership.test.ts), dass die alte
// Trial-Framing entfernt ist und nicht wieder hereinrutschen kann: kein
// „Noch 7 Tage gratis"/„Newbie-Testphase endet am …"/„Testabo kündigen" mehr für
// NEWBIE, ohne den ACTIVE-3-Tage-Trial-Funnel (c210008) anzufassen.
const premium = readFileSync('app/premium.tsx', 'utf8');
const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');
const subscriptionService = readFileSync('services/subscriptionService.ts', 'utf8');
const plans = readFileSync('features/subscription/plans.ts', 'utf8');

describe('NEWBIE ist kein Trial — Paywall (app/premium.tsx)', () => {
  it.each([deCH, gswCH, en, fr, itLocale])('zeigt Backpack bis 2 Einträge pro Hund auf der NEWBIE-Karte', locale => {
    expect(locale['premium.featureBackpackNewbie']).toContain('Backpack');
    expect(locale['premium.featureBackpackNewbie']).toContain('2');
    expect(locale['premium.featureBackpackNewbie']).toEqual(locale['membership.benefit.backpackNewbie']);
  });
  it('aktiviert NEWBIE ohne trialing-Status und ohne trial_ends_at', () => {
    expect(premium).toMatch(/activatePlan\(\{ userId: user\.id, plan, status: 'active' \}\)/);
    expect(premium).not.toMatch(/status: 'trialing'/);
    expect(premium).not.toMatch(/trialEndDate/);
  });

  it('das Trial-Countdown-Banner ist für NEWBIE nie erreichbar, auch nicht mit einem Alt-Status', () => {
    // trialing schliesst NEWBIE explizit aus — der gesamte Banner-Block
    // ({trialing && !access.isLifetime && (...)}) kann für NEWBIE nie rendern.
    expect(premium).toMatch(/currentPlan !== 'newbie'/);
    expect(premium).toMatch(/\{trialing && !access\.isLifetime && \(/);
  });

  it('zeigt für NEWBIE einen neutralen Upgrade-Hinweis statt „bevor die Testphase endet"', () => {
    expect(premium).toMatch(/premium\.newbieFreeNotice/);
    expect(premium).toMatch(/currentPlan === 'newbie'/);
  });

  it('NEWBIE-Karte wirbt nicht mehr mit 7 Tagen / „Alle Active-Funktionen" / Auto-Wechsel zu Active', () => {
    expect(premium).not.toMatch(/features: \['premium\.feature7Days', 'premium\.featureActive', 'premium\.featureThenActive'/);
    expect(premium).toMatch(/features: \['premium\.featureOneDog', 'premium\.featureTwoTrainingsMonth', 'premium\.featureOneTrackMonth', 'premium\.featureTrainerConnect', 'premium\.featureHealthRecord', 'premium\.featureHealthSharing', 'premium\.featureBackpackNewbie', 'premium\.featureFiveCommands', 'premium\.featureCalendarTimer'\]/);
  });

  it('Customer Release Phase 8: weder NEWBIE- noch ACTIVE-Karte behaupten „Kein Trainerzugang" — beide connecten ungegatet', () => {
    // app/trainer/index.tsx (Client verbindet sich per Code mit seinem Trainer)
    // hat KEINE pro_member/trainer_module-Prüfung — die Verbindung ist für ALLE
    // Pläne inkl. NEWBIE/ACTIVE ungegatet. featureNoTrainer existiert nirgends
    // mehr (auch nicht als i18n-Key) und darf nicht wieder auftauchen.
    expect(premium).not.toMatch(/featureNoTrainer/);
    const newbieCardLine = premium.split('\n').find(l => l.includes("plan: 'newbie', badgeKey:"));
    const activeCardLine = premium.split('\n').find(l => l.includes("plan: 'active',"));
    expect(newbieCardLine).toBeDefined();
    expect(activeCardLine).toBeDefined();
    expect(newbieCardLine).toMatch(/featureTrainerConnect/);
    expect(activeCardLine).toMatch(/featureTrainerConnect/);
    const trainerIndex = readFileSync('app/trainer/index.tsx', 'utf8');
    expect(trainerIndex).not.toMatch(/isPro\b|pro_member|trainer_module|useCapabilities/);
    for (const locale of ['i18n/de-CH.ts', 'i18n/gsw-CH.ts', 'i18n/locales/en.ts', 'i18n/locales/fr.ts', 'i18n/locales/it.ts']) {
      expect(readFileSync(locale, 'utf8')).not.toMatch(/featureNoTrainer/);
    }
  });

  it('professioneller Trainerbereich bleibt getrennt gegatet: (tabs)/clients.tsx und trainer/edit.tsx prüfen trainer_module, nie generisches isPro', () => {
    const clients = readFileSync('app/(tabs)/clients.tsx', 'utf8');
    const trainerEdit = readFileSync('app/trainer/edit.tsx', 'utf8');
    expect(clients).toMatch(/isTrainerModule/);
    expect(clients).not.toMatch(/\bisPro\b/);
    expect(trainerEdit).toMatch(/isTrainerModule/);
    expect(trainerEdit).not.toMatch(/\bisPro\b/);
  });

  it('Track-Sharing-CTA „Trainer verbinden" führt zum Client-Connect-Screen, nicht zur professionellen Kundenverwaltung', () => {
    const trackDetail = readFileSync('app/track/[id].tsx', 'utf8');
    expect(trackDetail).not.toMatch(/router\.push\('\/\(tabs\)\/clients' as never\)/);
    expect(trackDetail).toMatch(/router\.push\('\/trainer' as never\)/);
  });

  it('NEWBIE-Preis kommt aus derselben PLAN_META-Quelle wie alle anderen Karten (kein Sonderfall mehr)', () => {
    expect(premium).toMatch(/\{pkgPrice \?\? \(iapLoading \? '…' : meta\.priceLabel\)\}/);
    expect(premium).not.toMatch(/card\.plan === 'newbie' \? t\('premium\.free7Days'\)/);
  });
});

describe('NEWBIE ist kein Trial — „Testabo kündigen" nie erreichbar', () => {
  it('app/premium.tsx: der Cancel-Link steckt nur im trialing-Block, der NEWBIE ausschliesst', () => {
    const bannerIdx = premium.indexOf('{trialing && !access.isLifetime && (');
    const cancelLinkIdx = premium.indexOf("t('premium.cancelTrialLink')");
    expect(bannerIdx).toBeGreaterThan(-1);
    expect(cancelLinkIdx).toBeGreaterThan(bannerIdx);
  });

  it('app/(tabs)/profile.tsx: der Cancel-Link steckt nur im isPro-Block — NEWBIE ist nie isPro', () => {
    const proBlockIdx = profile.indexOf('{isPro && (');
    const cancelLinkIdx = profile.indexOf("t('premium.cancelTrialLink')");
    expect(proBlockIdx).toBeGreaterThan(-1);
    expect(cancelLinkIdx).toBeGreaterThan(proBlockIdx);
  });

  it('app/(tabs)/profile.tsx wirbt nicht mehr mit „7 Tage gratis testen"', () => {
    expect(profile).not.toMatch(/premium\.try7Days/);
    expect(profile).toMatch(/premium\.upgradeActive/);
  });
});

describe('NEWBIE ist kein Trial — Aktivierungslogik (services/subscriptionService.ts)', () => {
  it('kein impliziter trialing-Default mehr für NEWBIE', () => {
    expect(subscriptionService).toMatch(/const status: SubscriptionStatus = args\.status \?\? 'active';/);
    expect(subscriptionService).not.toMatch(/args\.plan === 'newbie' \? 'trialing' : 'active'/);
  });

  it('profiles-Spiegel folgt isPremiumPlan statt pauschal \'premium\' für jeden aktivierten Plan', () => {
    expect(subscriptionService).toMatch(/premiumMirror = isPremiumPlan\(args\.plan\)/);
    expect(subscriptionService).toMatch(/plan: premiumMirror \? 'premium' : 'free'/);
    expect(subscriptionService).toMatch(/plan_expires_at: premiumMirror \? \(args\.periodEndsAt \?\? args\.trialEndsAt \?\? null\) : null/);
  });
});

describe('NEWBIE ist kein Trial — isTrialLapsed schliesst NEWBIE aus (features/subscription/plans.ts)', () => {
  it('kurzschliesst plan === newbie auf false, bevor status/trial_ends_at geprüft werden', () => {
    expect(plans).toMatch(/if \(!sub \|\| sub\.plan === 'newbie'\) return false;/);
  });
});

describe('ACTIVE-3-Tage-Trial-Funnel (c210008) bleibt unangetastet', () => {
  const activeTrialFiles = [
    'features/subscription/activeTrial.ts',
    'services/activeTrialService.ts',
    'components/subscription/ActiveTrialGate.tsx',
    'components/subscription/ActiveTrialSheet.tsx',
    'hooks/useActiveTrialOffer.ts',
  ];
  it('keine dieser Dateien referenziert NEWBIE-spezifische Legacy-Trial-Strings', () => {
    for (const file of activeTrialFiles) {
      const content = readFileSync(file, 'utf8');
      expect(content).not.toMatch(/Newbie-Testphase|premium\.trialEndsDate|premium\.cancelTrialLink/);
    }
  });
});
