import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { useSession } from '@/hooks/useSession';
import { useCapabilities } from '@/hooks/useCapabilities';
import { queryClient } from '@/lib/queryClient';
import { getPackages, restorePurchases, restorePlanFromResult, getManagementURL, type PurchasePackage } from '@/lib/purchases';
import { getPlanSubscription, getFounderSlots, activatePlan } from '@/services/subscriptionService';
import { newbieQuotaStatus } from '@/services/quotaService';
import { PLAN_META, FOUNDER_SLOT_LIMIT, canSwitchPlanInApp, type SubscriptionPlan } from '@/features/subscription/plans';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Sichtbarer Plan im UI. 'permanent' = intern dauerhaft freigeschaltet
// (Sonderrecht/Entitlement) — der Begriff „Lifetime" wird bewusst NIE angezeigt.
type VisiblePlan = 'newbie' | 'active' | 'founder_active' | 'trainer' | 'permanent';

const PLAN_NAME_KEY: Record<VisiblePlan, TranslationKey> = {
  newbie:         'membership.free',
  active:         'membership.active',
  founder_active: 'membership.founder',
  trainer:        'membership.trainer',
  permanent:      'membership.permanentAccess',
};

// Vorteils-Listen = echte Capabilities des bestehenden Modells (keine erfundenen Features).
const BENEFITS: Record<VisiblePlan, TranslationKey[]> = {
  newbie: [
    'membership.benefit.oneDog', 'membership.benefit.oneTraining',
    'membership.benefit.journal', 'membership.benefit.generalHealth',
  ],
  active: [
    'membership.benefit.unlimitedDogs', 'membership.benefit.unlimitedTraining',
    'membership.benefit.journal', 'membership.benefit.generalHealth',
    'membership.benefit.heat', 'membership.benefit.tracks', 'membership.benefit.backpack',
    'membership.benefit.commands', 'membership.benefit.goal', 'membership.benefit.smartAnalysis',
  ],
  founder_active: [
    'membership.benefit.unlimitedDogs', 'membership.benefit.unlimitedTraining',
    'membership.benefit.journal', 'membership.benefit.generalHealth',
    'membership.benefit.heat', 'membership.benefit.tracks', 'membership.benefit.backpack',
    'membership.benefit.commands', 'membership.benefit.goal', 'membership.benefit.smartAnalysis',
  ],
  trainer: [
    'membership.benefit.unlimitedDogs', 'membership.benefit.unlimitedTraining',
    'membership.benefit.journal', 'membership.benefit.generalHealth',
    'membership.benefit.heat', 'membership.benefit.tracks', 'membership.benefit.backpack',
    'membership.benefit.commands', 'membership.benefit.goal', 'membership.benefit.smartAnalysis',
    'membership.benefit.trainerModule',
  ],
  permanent: [
    'membership.benefit.unlimitedDogs', 'membership.benefit.unlimitedTraining',
    'membership.benefit.journal', 'membership.benefit.generalHealth',
    'membership.benefit.heat', 'membership.benefit.tracks', 'membership.benefit.backpack',
    'membership.benefit.commands', 'membership.benefit.goal', 'membership.benefit.smartAnalysis',
    'membership.benefit.trainerModule',
  ],
};

// Was NEWBIE NICHT hat (Premium) → dezente Upgrade-Hinweise (echte gesperrte Features).
const NEWBIE_LOCKED: TranslationKey[] = [
  'membership.benefit.heat', 'membership.benefit.tracks', 'membership.benefit.backpack',
  'membership.benefit.commands', 'membership.benefit.goal', 'membership.benefit.smartAnalysis',
];

export default function MembershipScreen() {
  const router = useRouter();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const uid = session?.user.id;
  const { hasLifetimeAccess } = useCapabilities();

  const [dbPlan, setDbPlan] = useState<SubscriptionPlan | null>(null);
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [slots, setSlots] = useState<{ used: number; remaining: number }>({ used: 0, remaining: FOUNDER_SLOT_LIMIT });
  const [trainingUsage, setTrainingUsage] = useState<{ used: number; limit: number } | null>(null);
  const [dogUsage, setDogUsage] = useState<{ used: number; limit: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Sicherer Zurück-Weg (kein GO_BACK-Fehler ohne History).
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [router]);

  // Sichtbarer Plan: Store-Plan aus der DB hat Vorrang; sonst intern dauerhaft
  // freigeschaltet (Sonderrecht) → neutral 'permanent'; sonst Newbie/Kostenlos.
  const visiblePlan: VisiblePlan =
    dbPlan === 'active' || dbPlan === 'founder_active' || dbPlan === 'trainer' ? dbPlan
    : hasLifetimeAccess ? 'permanent'   // NUR internes Sonderrecht/Lifetime, NICHT allein isPro
    : 'newbie';
  const isNewbie = visiblePlan === 'newbie';

  // Offerings/Slots/Plan defensiv laden — getPackages() wirft nie, liefert [] bei Fehler.
  const loadPlanState = useCallback(async () => {
    setPackages(await getPackages());
    setSlots(await getFounderSlots());
    if (uid) {
      const sub = await getPlanSubscription(uid);
      setDbPlan(sub?.plan ?? null);
    }
  }, [uid]);

  // Bei jedem Fokus neu laden → nach einem Wechsel auf /premium spiegelt die Seite
  // den neuen Plan sofort wider (Kauf/Upgrade aktualisiert CustomerInfo + DB).
  useFocusEffect(useCallback(() => { void loadPlanState(); }, [loadPlanState]));

  // NEWBIE-Nutzung nur laden, wenn Newbie (bestehende Quota-Status-RPC, keine lokalen Zähler).
  useEffect(() => {
    if (!isNewbie || !uid) return;
    (async () => {
      setTrainingUsage(await newbieQuotaStatus('training'));
      setDogUsage(await newbieQuotaStatus('dog'));
    })();
  }, [isNewbie, uid]);

  const priceFor = (plan: SubscriptionPlan): string => {
    const pid = PLAN_META[plan].productId;
    const pkg = pid ? packages.find(p => p.productId === pid) : null;
    return pkg?.priceString ?? PLAN_META[plan].priceLabel;   // '—' neutraler Fallback, nie erfundener Preis
  };

  const founderAvailable = slots.remaining > 0 || visiblePlan === 'founder_active';

  const handleRestore = async () => {
    setBusy(true);
    const res = await restorePurchases();
    setBusy(false);
    const restored = restorePlanFromResult(res, dbPlan);
    if (restored && uid) {
      await activatePlan({ userId: uid, plan: restored, periodEndsAt: res.expiration });
      queryClient.invalidateQueries({ queryKey: ['capabilities'] });
      queryClient.invalidateQueries({ queryKey: ['userAccess'] });
      Alert.alert(t('premium.restored'), t('premium.restoredBody'));
      const sub = await getPlanSubscription(uid); setDbPlan(sub?.plan ?? null);
    } else {
      Alert.alert(t('premium.noneFound'), res.error ?? t('premium.noneFoundBody'));
    }
  };

  // „Abo verwalten" → bevorzugt die RevenueCat-Management-URL (korrekte Store-Abo-
  // Seite für iOS/Android), sonst plattformspezifischer Store-Fallback. Crash-safe.
  const handleManage = async () => {
    const rcUrl = await getManagementURL();
    const fallback = Platform.OS === 'ios'
      ? 'itms-apps://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
    try {
      await Linking.openURL(rcUrl ?? fallback);
    } catch {
      // z. B. iOS-Simulator (kein App Store installiert) → klaren Hinweis statt generisch.
      Alert.alert(t('common.notice'), Platform.OS === 'ios' ? t('membership.manageSimulator') : t('membership.manageUnavailable'));
    }
  };

  // Wechsel/Upgrade läuft über die bestehende Paywall /premium (kein zweiter Kauf-Flow).
  const goUpgrade = () => router.push('/premium');

  const compareCards: { plan: SubscriptionPlan; nameKey: TranslationKey; price: string; show: boolean }[] = [
    { plan: 'newbie', nameKey: 'membership.free', price: t('membership.free'), show: true },
    { plan: 'active', nameKey: 'membership.active', price: priceFor('active'), show: true },
    { plan: 'founder_active', nameKey: 'membership.founder', price: priceFor('founder_active'), show: founderAvailable },
    { plan: 'trainer', nameKey: 'membership.trainer', price: priceFor('trainer'), show: true },
  ];

  return (
    <View style={s.safe}>
      {/* Header: immer sichtbar inkl. Zurück-Button (Safe-Area beachtet). */}
      <View style={[s.headerBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={goBack} hitSlop={12} style={s.closeBtn}
          accessibilityRole="button" accessibilityLabel={t('common.back')} testID="membership-close">
          <Ionicons name="chevron-back" size={24} color={C.white} />
        </TouchableOpacity>
        <View style={s.headerTitles}>
          <Text style={s.eyebrow}>{t('membership.eyebrow')}</Text>
          <Text style={s.title}>{t('membership.title')}</Text>
          <Text style={s.subtitle} numberOfLines={2}>{t('membership.subtitle')}</Text>
        </View>
        <Image source={require('@/assets/images/anyvologo.png')} style={s.logo} contentFit="contain" />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Hero: aktueller Plan */}
        <View style={s.hero}>
          <View style={s.heroTop}>
            <Text style={s.heroCap}>{t('membership.currentPlan')}</Text>
            <View style={s.heroBadge}>
              <Ionicons name="checkmark-circle" size={13} color={C.accent} />
              <Text style={s.heroBadgeTxt}>{isNewbie ? t('membership.free') : t('membership.statusActive')}</Text>
            </View>
          </View>
          <Text style={s.heroPlan}>{t(PLAN_NAME_KEY[visiblePlan])}</Text>
          <Text style={s.heroStatus}>{isNewbie ? t('membership.freeHint') : t('membership.activeHint')}</Text>
        </View>

        {/* NEWBIE: Nutzung diesen Monat (bestehende Quota-Status-RPC) */}
        {isNewbie && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>{t('membership.usage')}</Text>
            <View style={s.usageRow}>
              <View style={s.usageItem}>
                <Ionicons name="barbell-outline" size={18} color={C.accent} />
                <Text style={s.usageLabel}>{t('membership.trainingUsage')}</Text>
                <Text style={s.usageValue}>{trainingUsage ? `${trainingUsage.used} / ${trainingUsage.limit}` : '–'}</Text>
              </View>
              <View style={s.usageDivider} />
              <View style={s.usageItem}>
                <Ionicons name="paw-outline" size={18} color={C.accent} />
                <Text style={s.usageLabel}>{t('membership.dogUsage')}</Text>
                <Text style={s.usageValue}>{dogUsage ? `${dogUsage.used} / ${dogUsage.limit}` : '–'}</Text>
              </View>
            </View>
            {trainingUsage && (
              <Text style={s.usageHint}>
                {trainingUsage.used >= trainingUsage.limit ? t('membership.limitReached') : t('membership.trainingAvailable')}
              </Text>
            )}
          </View>
        )}

        {/* Vorteile */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>{t('membership.benefits')}</Text>
          <View style={s.benefitList}>
            {BENEFITS[visiblePlan].map(k => (
              <View key={k} style={s.benefitRow}>
                <Ionicons name="checkmark-circle" size={16} color={C.accent} />
                <Text style={s.benefitTxt}>{t(k)}</Text>
              </View>
            ))}
          </View>
          {isNewbie && (
            <>
              <Text style={s.lockedTitle}>{t('membership.inActive')}</Text>
              <View style={s.benefitList}>
                {NEWBIE_LOCKED.map(k => (
                  <View key={k} style={s.benefitRow}>
                    <Ionicons name="lock-closed" size={15} color={C.muted} />
                    <Text style={[s.benefitTxt, s.benefitTxtLocked]}>{t(k)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Upgrade / Verwaltung */}
        <View style={s.actions}>
          {isNewbie ? (
            <TouchableOpacity style={s.ctaPrimary} onPress={goUpgrade} activeOpacity={0.9}>
              <Ionicons name="star" size={16} color={C.accentText} />
              <Text style={s.ctaPrimaryTxt}>{t('membership.upgradeActive')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.ctaSecondary} onPress={handleManage} activeOpacity={0.85}>
              <Ionicons name="settings-outline" size={16} color={C.white} />
              <Text style={s.ctaSecondaryTxt}>{t('membership.manage')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.ctaSecondary} onPress={handleRestore} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={C.white} /> : (
              <><Ionicons name="refresh-outline" size={16} color={C.white} /><Text style={s.ctaSecondaryTxt}>{t('membership.restore')}</Text></>
            )}
          </TouchableOpacity>
        </View>

        {/* Pläne vergleichen (kompakte Cards, keine Tabelle) */}
        <Text style={[s.sectionTitle, { paddingHorizontal: 4, marginTop: 8 }]}>{t('membership.compare')}</Text>
        <View style={s.compareWrap}>
          {compareCards.filter(c => c.show).map(c => {
            const current = c.plan === visiblePlan;
            // Wechselquelle: 'permanent' (Lifetime) hat bereits alles → keine Wechsel.
            const src: SubscriptionPlan | null = visiblePlan === 'permanent' ? null : visiblePlan;
            const canSwitch = !current && visiblePlan !== 'permanent'
              && canSwitchPlanInApp(src, c.plan, { founderAvailable });
            // Nur bei bezahlten Plänen auf einen nicht-erlaubten Wechsel hinweisen
            // (Downgrade/Kündigung → Store). Newbie/permanent brauchen keinen Hinweis.
            const storeHint = !current && !canSwitch
              && (visiblePlan === 'active' || visiblePlan === 'founder_active' || visiblePlan === 'trainer');
            const CardTag = canSwitch ? TouchableOpacity : View;
            return (
              <CardTag
                key={c.plan}
                style={[s.compareCard, current && s.compareCardCurrent, canSwitch && s.compareCardSwitch, storeHint && s.compareCardDisabled]}
                {...(canSwitch ? { onPress: goUpgrade, activeOpacity: 0.85, accessibilityRole: 'button' as const } : {})}
              >
                <Text style={s.compareName}>{t(c.nameKey)}</Text>
                <Text style={s.comparePrice}>{c.price}</Text>
                {current ? (
                  <Text style={s.compareCurrent}>{t('premium.current')}</Text>
                ) : canSwitch ? (
                  <View style={s.compareCta}>
                    <Text style={s.compareCtaTxt}>{t('membership.selectPlan')}</Text>
                    <Ionicons name="chevron-forward" size={13} color={C.accent} />
                  </View>
                ) : storeHint ? (
                  <Text style={s.compareHint}>{t('membership.switchViaStore')}</Text>
                ) : null}
              </CardTag>
            );
          })}
        </View>

        <Text style={s.legal}>{t('premium.legal')}</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, zIndex: 10 },
  closeBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  headerTitles: { flex: 1 },
  eyebrow:   { fontSize: 9, color: C.accent, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  title:     { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  subtitle:  { fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 16 },
  logo:      { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: C.border },
  content:   { paddingHorizontal: 20, paddingTop: 8 },

  hero:      { borderRadius: 24, borderWidth: 1, borderColor: C.accentMid, backgroundColor: C.accentDim, padding: 20, marginBottom: 14 },
  heroTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroCap:   { fontSize: 10, color: C.accent, fontWeight: '800', letterSpacing: 1.4 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.cardAlt, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: C.border },
  heroBadgeTxt: { fontSize: 10, color: C.white, fontWeight: '800', letterSpacing: 0.4 },
  heroPlan:  { fontSize: 28, color: C.white, fontWeight: '900', letterSpacing: -0.6, marginTop: 10 },
  heroStatus:{ fontSize: 13, color: C.muted, marginTop: 4 },

  card:      { borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 15, color: C.white, fontWeight: '800', letterSpacing: -0.2, marginBottom: 12 },

  usageRow:  { flexDirection: 'row', alignItems: 'center' },
  usageItem: { flex: 1, alignItems: 'center', gap: 5 },
  usageDivider: { width: 1, height: 40, backgroundColor: C.border },
  usageLabel:{ fontSize: 12, color: C.muted, fontWeight: '600' },
  usageValue:{ fontSize: 20, color: C.white, fontWeight: '900', letterSpacing: -0.3 },
  usageHint: { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 12 },

  benefitList: { gap: 9 },
  benefitRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitTxt:  { flex: 1, fontSize: 13.5, color: 'rgba(255,255,255,0.86)' },
  benefitTxtLocked: { color: C.muted },
  lockedTitle: { fontSize: 12, color: C.muted, fontWeight: '700', letterSpacing: 0.3, marginTop: 16, marginBottom: 10 },

  actions:   { gap: 10, marginBottom: 20 },
  ctaPrimary:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 16, paddingVertical: 15 },
  ctaPrimaryTxt: { fontSize: 15, color: C.accentText, fontWeight: '800' },
  ctaSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.borderLight, borderRadius: 16, paddingVertical: 14 },
  ctaSecondaryTxt: { fontSize: 14, color: C.white, fontWeight: '700' },

  compareWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  compareCard: { flexGrow: 1, minWidth: '46%', borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 14, gap: 4 },
  compareCardCurrent: { borderColor: C.accentMid, backgroundColor: C.accentDim },
  compareCardSwitch: { borderColor: C.accentMid },
  compareCardDisabled: { opacity: 0.55 },
  compareName: { fontSize: 14, color: C.white, fontWeight: '800' },
  comparePrice:{ fontSize: 13, color: C.muted, fontWeight: '600' },
  compareCurrent: { fontSize: 11, color: C.accent, fontWeight: '800', marginTop: 2 },
  compareCta:  { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  compareCtaTxt: { fontSize: 11, color: C.accent, fontWeight: '800' },
  compareHint: { fontSize: 10.5, color: C.muted, fontWeight: '600', marginTop: 2 },

  legal:     { fontSize: 12, color: C.subtle, textAlign: 'center', marginTop: 8 },
});
