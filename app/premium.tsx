import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';
import { haptic } from '@/lib/haptics';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { getPackages, buyPackage, restorePurchases, purchasesReady, hasStorePackageForProduct, restorePlanFromResult, getActiveStoreProductId, ensurePurchasesConfigured, type PurchasePackage } from '@/lib/purchases';
import {
  activatePlan, trialEndDate, getFounderSlots, claimFounderSlot, getPlanSubscription, cancelTrial,
} from '@/services/subscriptionService';
import { PLAN_META, FOUNDER_SLOT_LIMIT, canSwitchPlanInApp, type SubscriptionPlan } from '@/features/subscription/plans';
import { useT } from '@/i18n';
import type { TranslationKey } from '@/i18n/de-CH';

import { useAccess } from '@/hooks/useAccess';
import { useInternalTester } from '@/hooks/useInternalTester';

// Apple 3.1.2 (Auto-Renewable Subscriptions): funktionierende Links zu den
// Nutzungsbedingungen (Apple Standard-EULA) und zum Datenschutz direkt auf der
// Paywall. Extern via Linking geöffnet (iOS + Android; https wird ohne
// canOpenURL-Check unterstützt); Fehler crashen die App nicht.
const EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_URL = 'https://www.anyvo.app/datenschutz';
const openLegalLink = (url: string) => { Linking.openURL(url).catch(() => { /* no-op: kein Crash */ }); };

interface CardDef { plan: SubscriptionPlan; badgeKey?: TranslationKey; features: TranslationKey[]; founder?: boolean }

const CARDS: CardDef[] = [
  { plan: 'newbie', badgeKey: 'premium.badgeStart', features: ['premium.feature7Days', 'premium.featureActive', 'premium.featureThenActive', 'premium.featureNoTrainer'] },
  { plan: 'founder_active', badgeKey: 'premium.badgeFounderSlots', founder: true, features: ['premium.featureFounderPrice', 'premium.featureWhileActive', 'premium.featureActive', 'premium.featureNoTrainer'] },
  { plan: 'active', features: ['premium.featureTrainingProgress', 'premium.featureSmartAnalysis', 'premium.featureCalendarVoice', 'premium.featureNoTrainer'] },
  { plan: 'trainer', badgeKey: 'premium.badgePro', features: ['premium.featureAllActive', 'premium.featureClientPlans', 'premium.featurePollsFeedback', 'premium.featureTrainerDashboard'] },
];

const MONTH_MS = 30 * 86400000;
export default function PremiumScreen() {
  const router = useRouter();
  const { t } = useT();
  const [laden, setLaden] = useState<SubscriptionPlan | null>(null);
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [slots, setSlots] = useState<{ used: number; remaining: number }>({ used: 0, remaining: FOUNDER_SLOT_LIMIT });
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const { access } = useAccess();
  const { isInternalTester } = useInternalTester();

  const [iapLoading, setIapLoading] = useState(true);

  // ROOT FIX (Apple 2.1b): RevenueCat GARANTIERT initialisieren, BEVOR Offerings
  // geladen werden — sonst „no singleton" / leere Paywall. Danach erst getOfferings.
  const loadIap = useCallback(async () => {
    setIapLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    await ensurePurchasesConfigured(user?.id);
    const pkgs = await getPackages();
    setPackages(pkgs);
    setSlots(await getFounderSlots());
    if (user) {
      const sub = await getPlanSubscription(user.id);
      setCurrentPlan(sub?.plan ?? null);
      setSubStatus(sub?.status ?? null);
      setTrialEndsAt(sub?.trial_ends_at ?? null);
      setCancelAtPeriodEnd(sub?.cancel_at_period_end === true);
    }
    setIapLoading(false);
  }, []);

  useEffect(() => { void loadIap(); }, [loadIap]);

  const iapReady = purchasesReady() && packages.length > 0;
  // Nach dem Laden konfiguriert, aber keine Produkte → echter Ladefehler (Retry anbieten).
  const iapLoadError = !iapLoading && purchasesReady() && packages.length === 0;
  const founderAvailable = slots.remaining > 0 || currentPlan === 'founder_active';

  // Trial-Status: Restlaufzeit + Enddatum für das Countdown-Banner. „trialing"
  // meint den NOCH LAUFENDEN Trial (abgelaufene zählen nicht → normale Upgrade-Ansicht).
  const trialEnd = trialEndsAt ? new Date(trialEndsAt) : null;
  const trialing = subStatus === 'trialing' && (!trialEnd || trialEnd.getTime() > Date.now());
  const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000)) : null;
  const trialEndLabel = trialEnd
    ? `${String(trialEnd.getDate()).padStart(2, '0')}.${String(trialEnd.getMonth() + 1).padStart(2, '0')}.${trialEnd.getFullYear()}`
    : null;

  // Empfohlener Plan zum Upgraden: Founder Active (bester Preis) solange Slots frei,
  // sonst Active. Newbie-Trial-Karte nur zeigen, wenn noch nie abonniert wurde.
  const recommendedPlan: SubscriptionPlan = founderAvailable ? 'founder_active' : 'active';
  // Newbie-Trial-Karte nur ohne bestehendes Abo. Founder ist ein limitiertes
  // Gründer-Angebot NUR für Neu-Mitglieder aus Gratis (oder wer bereits Founder ist)
  // → bestehenden Active-/Trainer-Zahlern nicht als Wechselziel anbieten.
  const visibleCards = CARDS.filter(c => {
    if (c.plan === 'newbie') return !currentPlan;
    if (c.plan === 'founder_active') return currentPlan === 'founder_active' || !currentPlan || canSwitchPlanInApp(currentPlan, 'founder_active', { founderAvailable, platform: Platform.OS });
    return true;
  });
  // Preis-Anker für die Founder-Ersparnis: echter Active-Preis aus dem Store
  // (gleiche Währung wie die angezeigten Preise), sonst Fallback auf die CHF-Angabe.
  const activePriceStr = packages.find(p => p.productId === PLAN_META.active.productId)?.priceString ?? PLAN_META.active.priceLabel.replace('/Mt.', '');
  const packageForPlan = (plan: SubscriptionPlan) => {
    const productId = PLAN_META[plan].productId;
    return productId ? packages.find(p => p.productId === productId) ?? null : null;
  };

  const finish = (plan: SubscriptionPlan) => {
    haptic.success();   // Kauf/Aktivierung erfolgreich
    queryClient.invalidateQueries({ queryKey: ['capabilities'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    Alert.alert(t('premium.activeTitle', { plan: PLAN_META[plan].name }), t('premium.unlocked'), [{ text: t('trainer.letsGo'), onPress: () => router.back() }]);
  };

  const choose = async (plan: SubscriptionPlan) => {
    // Interner Tester: Premium ist bereits über die Berechtigungslogik
    // freigeschaltet — keine echte Kaufabwicklung, RevenueCat wird nicht berührt.
    if (isInternalTester) {
      Alert.alert(t('premium.internalTester'), t('premium.internalTesterBody'));
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert(t('trainer.connectHintTitle'), t('premium.loginRequired')); return; }
    // In-App nur erlaubte Upgrades. Downgrades/gesperrte Wechsel (inkl. Founder für
    // bestehende Zahler) laufen ausschliesslich über die Store-Abo-Verwaltung.
    if (plan !== 'newbie' && currentPlan && !canSwitchPlanInApp(currentPlan, plan, { founderAvailable, platform: Platform.OS })) {
      Alert.alert(t('common.notice'), t('membership.switchViaStore'));
      return;
    }
    setLaden(plan);
    try {
      // Newbie Trial: 7 Tage gratis, kein Kauf.
      if (plan === 'newbie') {
        const { error } = await activatePlan({ userId: user.id, plan, status: 'trialing', trialEndsAt: trialEndDate() });
        if (error) { Alert.alert(t('trainer.connectHintTitle'), t('premium.trialError')); return; }
        finish(plan); return;
      }
      const meta = PLAN_META[plan];
      if (purchasesReady() && !hasStorePackageForProduct(packages, meta.productId)) {
        if (__DEV__) {
          console.warn('[RevenueCat] package missing for plan', {
            plan,
            expectedProductId: meta.productId,
            loadedProductIds: packages.map(p => p.productId),
            loadedPackageIds: packages.map(p => p.id),
          });
        }
        Alert.alert(t('trainer.connectHintTitle'), plan === 'trainer' ? t('premium.trainerPackageUnavailable') : t('premium.packageUnavailable'));
        return;
      }
      // Founder: zuerst Slot atomar beanspruchen.
      if (plan === 'founder_active') {
        const claim = await claimFounderSlot();
        setSlots(s => ({ used: claim.remaining != null ? FOUNDER_SLOT_LIMIT - claim.remaining : s.used, remaining: claim.remaining }));
        if (!claim.ok) { haptic.warning(); Alert.alert('Founder Active', claim.error === 'Founder offer sold out' ? t('premium.founderSoldOut') : (claim.error ?? t('premium.notAvailable'))); return; }
      }
      if (iapReady) {
        const pkg = packageForPlan(plan);
        if (!pkg) return;
        // Android: bei einem Wechsel eines bestehenden bezahlten Abos den aktiven
        // Store-Produkt-Identifier bestimmen und übergeben → echter Upgrade statt
        // zweitem parallelem Abo. Fehlt er, würde Google doppelt abrechnen → dann
        // auf die Store-Abo-Verwaltung verweisen. iOS bleibt unverändert (Group).
        let oldProductIdentifier: string | null = null;
        if (Platform.OS === 'android' && currentPlan && currentPlan !== 'newbie' && plan !== currentPlan) {
          oldProductIdentifier = await getActiveStoreProductId();
          if (!oldProductIdentifier) {
            haptic.warning();
            Alert.alert(t('common.notice'), t('membership.switchViaStore'));
            return;
          }
        }
        const res = await buyPackage(pkg, { oldProductIdentifier });
        if (res.cancelled) return;
        if (!res.ok) { haptic.error(); Alert.alert(t('trainer.connectHintTitle'), res.error ?? t('premium.purchaseIncomplete')); return; }
        const { error } = await activatePlan({ userId: user.id, plan, periodEndsAt: res.expiration, providerProductId: meta.productId });
        if (error) { haptic.error(); Alert.alert(t('trainer.connectHintTitle'), t('premium.activationFailed')); return; }
        finish(plan);
      } else if (purchasesReady()) {
        Alert.alert(t('trainer.connectHintTitle'), plan === 'trainer' ? t('premium.trainerPackageUnavailable') : t('premium.packageUnavailable'));
      } else if (__DEV__) {
        // Dev/Test ohne konfigurierten Store: direkt aktivieren.
        const { error } = await activatePlan({ userId: user.id, plan, periodEndsAt: new Date(Date.now() + MONTH_MS).toISOString(), providerProductId: meta.productId });
        if (error) { Alert.alert(t('trainer.connectHintTitle'), t('premium.activationFailed')); return; }
        finish(plan);
      } else {
        Alert.alert(t('premium.comingSoon'), t('premium.purchaseUnavailable'));
      }
    } finally {
      setLaden(null);
    }
  };

  const handleCancelTrial = () => {
    Alert.alert(
      t('premium.cancelTrialTitle'),
      trialEndLabel
        ? t('premium.cancelTrialBodyDate', { date: trialEndLabel })
        : t('premium.cancelTrialBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('premium.cancel'), style: 'destructive', onPress: async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const { error } = await cancelTrial(user.id);
          if (error) { Alert.alert(t('trainer.connectHintTitle'), t('premium.cancelError')); return; }
          setCancelAtPeriodEnd(true);
          queryClient.invalidateQueries({ queryKey: ['capabilities'] });
          queryClient.invalidateQueries({ queryKey: ['userAccess'] });
        } },
      ],
    );
  };

  const handleRestore = async () => {
    setLaden('active');
    const res = await restorePurchases();
    setLaden(null);
    const { data: { user } } = await supabase.auth.getUser();
    const restoredPlan = restorePlanFromResult(res, currentPlan);
    if (restoredPlan && user) {
      const plan: SubscriptionPlan = restoredPlan;
      await activatePlan({ userId: user.id, plan, periodEndsAt: res.expiration });
      haptic.success();   // Restore erfolgreich
      Alert.alert(t('premium.restored'), t('premium.restoredBody'), [{ text: 'OK', onPress: () => router.back() }]);
    } else {
      haptic.warning();   // nichts wiederherzustellen
      Alert.alert(t('premium.noneFound'), res.error ?? t('premium.noneFoundBody'));
    }
  };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <TouchableOpacity style={S.closeBtn} onPress={() => router.back()} activeOpacity={0.7}>
        <Ionicons name="close" size={20} color={C.muted} />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.scroll}>
        <View style={S.header}>
          <View style={S.headerRing}>
            <LinearGradient colors={[`${C.accent}25`, `${C.accent}08`]} style={StyleSheet.absoluteFill} />
            <Ionicons name={trialing ? 'hourglass' : 'star'} size={34} color={C.accent} />
          </View>
          <Text style={S.headerTitel}>{trialing ? t('premium.secureAccess') : (currentPlan ? t('premium.yourPlan') : t('premium.chooseAnyvo'))}</Text>
          <Text style={S.headerSub}>{trialing ? t('premium.chooseBeforeTrialEnds') : t('premium.monthlyCancelable')}</Text>
        </View>

        {/* Trial-Countdown: motiviert zum Wechsel Testversion → Active, bevor der
            Zugriff endet. Nur während der laufenden Testphase (nicht bei Lifetime). */}
        {trialing && !access.isLifetime && (
          <View style={S.trialBanner}>
            <View style={S.trialIcon}><Ionicons name="hourglass-outline" size={20} color={C.warning} /></View>
            <View style={{ flex: 1 }}>
              <Text style={S.trialTitle}>
                {trialDaysLeft != null
                  ? (trialDaysLeft === 0 ? t('premium.trialEndsToday') : t('premium.trialDaysLeft', { days: trialDaysLeft, unit: trialDaysLeft === 1 ? t('premium.day') : t('premium.days') }))
                  : t('premium.trialActive')}
              </Text>
              <Text style={S.trialSub}>
                {cancelAtPeriodEnd
                  ? (trialEndLabel
                      ? t('premium.cancelledAccessEndsDate', { date: trialEndLabel })
                      : t('premium.cancelledAccessEnds'))
                  : (trialEndLabel
                      ? t('premium.trialEndsDate', { date: trialEndLabel })
                      : t('premium.secureFullAccess'))}
              </Text>
              {!cancelAtPeriodEnd && (
                <Text style={S.trialCancelLink} onPress={handleCancelTrial}>{t('premium.cancelTrialLink')}</Text>
              )}
            </View>
          </View>
        )}

        {access.isLifetime ? (
          <View style={[S.card, S.cardCurrent]}>
            <View style={S.cardHead}>
              <View style={{ flex: 1 }}>
                <View style={S.nameRow}>
                  <Text style={S.cardName}>{access.hasTrainerAccess ? t('premium.lifetimeTrainerActive') : t('premium.lifetimeActive')}</Text>
                  <View style={S.badge}><Text style={S.badgeTxt}>LIFETIME</Text></View>
                </View>
              </View>
            </View>
            <View style={S.featureList}>
              <View style={S.featureRow}>
                <Ionicons name="checkmark-circle" size={15} color={C.accent} />
                <Text style={S.featureTxt}>{t('premium.lifetimeFeature')}</Text>
              </View>
            </View>
          </View>
        ) : (<>
        {/* Echter Lade-/Fehlerzustand, statt sofort „—"/„nicht geladen" zu zeigen. */}
        {iapLoading && (
          <View style={S.loadingRow}><ActivityIndicator color={C.accent} /><Text style={S.loadingTxt}>{t('auth.recoveryChecking')}</Text></View>
        )}
        {iapLoadError && (
          <TouchableOpacity onPress={loadIap} style={S.retryRow} activeOpacity={0.8}>
            <Ionicons name="refresh" size={16} color={C.accent} />
            <Text style={S.retryTxt}>{t('premium.notLoaded')} · {t('connect.retry')}</Text>
          </TouchableOpacity>
        )}
        {visibleCards.map(card => {
          const meta = PLAN_META[card.plan];
          const isCurrent = currentPlan === card.plan;
          const soldOut = card.founder && !founderAvailable;
          const busy = laden === card.plan;
          const pkg = packageForPlan(card.plan);
          const pkgPrice = pkg?.priceString;
          const isRec = card.plan === recommendedPlan && !isCurrent && !soldOut;
          const filled = card.founder || card.plan === 'trainer' || isRec;   // Gradient-CTA
          const missingStorePackage = card.plan !== 'newbie' && purchasesReady() && !pkg && !iapLoading;
          // Gesperrter Wechsel (Downgrade / nicht erlaubt) → nicht kaufbar, Hinweis auf Store.
          const blockedSwitch = card.plan !== 'newbie' && !isCurrent && !soldOut
            && !canSwitchPlanInApp(currentPlan, card.plan, { founderAvailable, platform: Platform.OS });
          return (
            <View key={card.plan} style={[S.card, card.founder && S.cardFounder, isRec && !card.founder && S.cardRec, isCurrent && S.cardCurrent]}>
              {isRec && (
                <View style={S.recStrip}>
                  <Ionicons name="star" size={11} color={C.accentText} />
                  <Text style={S.recStripTxt}>{card.founder ? t('premium.bestPrice') : t('premium.recommended')}</Text>
                </View>
              )}
              <View style={S.cardHead}>
                <View style={{ flex: 1 }}>
                  <View style={S.nameRow}>
                    <Text style={S.cardName}>{meta.name}</Text>
                    {card.badgeKey && <View style={[S.badge, card.founder && S.badgeFounder]}><Text style={[S.badgeTxt, card.founder && { color: '#04201b' }]}>{t(card.badgeKey, { limit: FOUNDER_SLOT_LIMIT })}</Text></View>}
                  </View>
                  <View style={S.priceRow}>
                    <Text style={S.cardPrice}>{card.plan === 'newbie' ? t('premium.free7Days') : (pkgPrice ?? (iapLoading ? '…' : meta.priceLabel))}</Text>
                    {/* Ersparnis ggü. Active hervorheben (Conversion-Anker für Trial-Nutzer). */}
                    {card.founder && founderAvailable && <Text style={S.savings}>{t('premium.instead', { price: activePriceStr })}</Text>}
                  </View>
                  {card.founder && <Text style={S.founderSlots}>{founderAvailable ? t('premium.slotsLeft', { remaining: slots.remaining, limit: FOUNDER_SLOT_LIMIT }) : t('premium.soldOut')}</Text>}
                </View>
              </View>

              <View style={S.featureList}>
                {card.features.map(f => (
                  <View key={f} style={S.featureRow}>
                    <Ionicons name="checkmark-circle" size={15} color={C.accent} />
                    <Text style={S.featureTxt}>{t(f)}</Text>
                  </View>
                ))}
              </View>

              {isCurrent ? (
                <View style={S.currentTag}><Ionicons name="checkmark" size={15} color={C.accent} /><Text style={S.currentTxt}>{t('premium.current')}</Text></View>
              ) : soldOut ? (
                <View style={S.soldOut}><Text style={S.soldOutTxt}>{t('premium.founderSoldOut')}</Text></View>
              ) : blockedSwitch ? (
                <View style={S.soldOut}><Text style={S.soldOutTxt}>{t('membership.switchViaStore')}</Text></View>
              ) : missingStorePackage ? (
                <TouchableOpacity style={S.soldOut} onPress={() => Alert.alert(t('trainer.connectHintTitle'), card.plan === 'trainer' ? t('premium.trainerPackageUnavailable') : t('premium.packageUnavailable'))} activeOpacity={0.75}>
                  <Text style={S.soldOutTxt}>{t('premium.notLoaded')}</Text>
                </TouchableOpacity>
              ) : (
                <AnimatedPressable style={[S.cta, !filled && S.ctaAlt]} scale={0.97} onPress={() => choose(card.plan)} disabled={busy}>
                  {filled && <LinearGradient colors={['#00FFCC', '#00f0c8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
                  {busy ? <ActivityIndicator color={filled ? C.accentText : C.white} /> : (
                    <Text style={[S.ctaTxt, filled ? { color: C.accentText } : { color: C.white }]}>
                      {card.plan === 'newbie' ? t('premium.startFree') : (trialing ? t('premium.switchToPlan', { plan: meta.name }) : t('premium.choosePlan', { plan: meta.name }))}
                    </Text>
                  )}
                </AnimatedPressable>
              )}
            </View>
          );
        })}

        <TouchableOpacity onPress={handleRestore} style={S.restoreBtn} activeOpacity={0.7}>
          <Text style={S.restoreTxt}>{t('premium.restore')}</Text>
        </TouchableOpacity>
        </>)}
        {!access.isLifetime && <Text style={S.legal}>{t('premium.autoRenewNotice')}</Text>}
        {!access.isLifetime && <Text style={S.legal}>{t('premium.legal')}</Text>}
        <View style={S.linksRow}>
          <Text style={S.link} accessibilityRole="link" onPress={() => openLegalLink(EULA_URL)}>{t('premium.terms')}</Text>
          <Text style={S.legal}>·</Text>
          <Text style={S.link} accessibilityRole="link" onPress={() => openLegalLink(PRIVACY_URL)}>{t('premium.privacy')}</Text>
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: C.bg },
  scroll:   { paddingHorizontal: 18, paddingBottom: 40 },
  closeBtn: { alignSelf: 'flex-end', padding: 16, marginRight: 4 },
  header:   { alignItems: 'center', paddingTop: 2, paddingBottom: 18, gap: 8 },
  headerRing:{ width: 68, height: 68, borderRadius: 34, borderWidth: 1, borderColor: `${C.accent}30`, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headerTitel:{ fontSize: 23, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  headerSub:  { fontSize: 13, color: C.muted, textAlign: 'center' },

  trialBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.warningDim, borderWidth: 1, borderColor: 'rgba(255,184,0,0.35)', borderRadius: 16, padding: 14, marginBottom: 16 },
  trialIcon:   { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,184,0,0.14)', alignItems: 'center', justifyContent: 'center' },
  trialTitle:  { fontSize: 15, color: C.white, fontWeight: '900', letterSpacing: -0.2 },
  trialSub:    { fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 2, lineHeight: 16 },
  trialCancelLink: { fontSize: 12, color: C.warning, fontWeight: '800', marginTop: 8, textDecorationLine: 'underline' },

  card:        { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 12 },
  cardFounder: { borderColor: C.accent, backgroundColor: 'rgba(0,245,212,0.06)' },
  cardRec:     { borderColor: C.accent, backgroundColor: 'rgba(0,255,204,0.05)' },
  cardCurrent: { borderColor: C.accentMid },
  recStrip:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10 },
  recStripTxt: { fontSize: 10, color: C.accentText, fontWeight: '900', letterSpacing: 0.6 },
  priceRow:    { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  savings:     { fontSize: 12, color: C.muted, fontWeight: '600', textDecorationLine: 'line-through' },
  cardHead:    { flexDirection: 'row', alignItems: 'flex-start' },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName:    { fontSize: 18, color: C.white, fontWeight: '900', letterSpacing: -0.3 },
  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  badgeFounder:{ backgroundColor: C.accent, borderColor: C.accent },
  badgeTxt:    { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 0.5 },
  cardPrice:   { fontSize: 15, color: C.white, fontWeight: '700' },
  founderSlots:{ fontSize: 12, color: C.accent, fontWeight: '700', marginTop: 3 },

  featureList: { marginTop: 12, gap: 7 },
  featureRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureTxt:  { fontSize: 13, color: 'rgba(255,255,255,0.82)' },

  cta:    { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: 14 },
  ctaAlt: { backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.borderLight },
  ctaTxt: { fontSize: 14.5, fontWeight: '800' },
  currentTag: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: C.accentDim },
  currentTxt: { fontSize: 14, color: C.accent, fontWeight: '800' },
  soldOut:    { alignItems: 'center', marginTop: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: C.cardAlt },
  soldOutTxt: { fontSize: 14, color: C.muted, fontWeight: '700' },

  restoreBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  restoreTxt: { fontSize: 13, color: C.muted, fontWeight: '600' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 24 },
  loadingTxt: { fontSize: 13, color: C.muted },
  retryRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  retryTxt:   { fontSize: 13, color: C.white, fontWeight: '700' },
  legal:      { fontSize: 12, color: C.subtle, textAlign: 'center', marginTop: 4 },
  linksRow:   { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6 },
  link:       { fontSize: 12, color: C.accent, fontWeight: '600' },
});
