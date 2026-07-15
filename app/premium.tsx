import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { getPackages, buyPackage, restorePurchases, purchasesReady, type PurchasePackage } from '@/lib/purchases';
import {
  activatePlan, trialEndDate, getFounderSlots, claimFounderSlot, getPlanSubscription, cancelTrial,
} from '@/services/subscriptionService';
import { PLAN_META, FOUNDER_SLOT_LIMIT, type SubscriptionPlan } from '@/features/subscription/plans';

// Anzeige-Text, wenn das Founder-Kontingent erschöpft ist (Server = Quelle der Wahrheit).
const FOUNDER_SOLD_OUT_MSG = 'Founder Edition ist leider ausverkauft.';
import { useAccess } from '@/hooks/useAccess';

interface CardDef { plan: SubscriptionPlan; badge?: string; features: string[]; founder?: boolean }

const CARDS: CardDef[] = [
  { plan: 'beginner_trial', badge: 'Start', features: ['7 Tage kostenlos', 'Alle Active-Funktionen', 'Danach Active CHF 6.00/Mt.', 'Kein Trainerzugang'] },
  { plan: 'founder_active', badge: `Nur ${FOUNDER_SLOT_LIMIT}×`, founder: true, features: ['Dauerhaft CHF 4.00/Mt.', 'Solange das Abo aktiv bleibt', 'Alle Active-Funktionen', 'Kein Trainerzugang'] },
  { plan: 'active', features: ['Training, Hunde, Fortschritt', 'Smart Auswertung', 'Kalender & Sprachnotizen', 'Kein Trainerzugang'] },
  { plan: 'trainer', badge: 'Profi', features: ['Alles aus Active', 'Kundenverwaltung & Pläne', 'Umfragen & Feedback', 'Trainer-Dashboard'] },
];

const MONTH_MS = 30 * 86400000;

export default function PremiumScreen() {
  const router = useRouter();
  const [laden, setLaden] = useState<SubscriptionPlan | null>(null);
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [slots, setSlots] = useState<{ used: number; remaining: number }>({ used: 0, remaining: FOUNDER_SLOT_LIMIT });
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const { access } = useAccess();

  useEffect(() => {
    (async () => {
      setPackages(await getPackages());
      setSlots(await getFounderSlots());
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const sub = await getPlanSubscription(user.id);
        setCurrentPlan(sub?.plan ?? null);
        setSubStatus(sub?.status ?? null);
        setTrialEndsAt(sub?.trial_ends_at ?? null);
        setCancelAtPeriodEnd(sub?.cancel_at_period_end === true);
      }
    })();
  }, []);

  const iapReady = purchasesReady() && packages.length > 0;
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
  // sonst Active. Beginner-Trial-Karte nur zeigen, wenn noch nie abonniert wurde.
  const recommendedPlan: SubscriptionPlan = founderAvailable ? 'founder_active' : 'active';
  const visibleCards = CARDS.filter(c => c.plan !== 'beginner_trial' || !currentPlan);
  // Preis-Anker für die Founder-Ersparnis: echter Active-Preis aus dem Store
  // (gleiche Währung wie die angezeigten Preise), sonst Fallback auf die CHF-Angabe.
  const activePriceStr = packages.find(p => p.productId === PLAN_META.active.productId)?.priceString ?? PLAN_META.active.priceLabel.replace('/Mt.', '');

  const finish = (plan: SubscriptionPlan) => {
    queryClient.invalidateQueries({ queryKey: ['capabilities'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    Alert.alert(`${PLAN_META[plan].name} aktiv 🎉`, 'Deine Funktionen sind freigeschaltet.', [{ text: "Los geht's!", onPress: () => router.back() }]);
  };

  const choose = async (plan: SubscriptionPlan) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert('Hinweis', 'Bitte zuerst anmelden.'); return; }
    setLaden(plan);
    try {
      // Beginner Trial: 7 Tage gratis, kein Kauf.
      if (plan === 'beginner_trial') {
        const { error } = await activatePlan({ userId: user.id, plan, status: 'trialing', trialEndsAt: trialEndDate() });
        if (error) { Alert.alert('Hinweis', 'Trial konnte nicht aktiviert werden.'); return; }
        finish(plan); return;
      }
      // Founder: zuerst Slot atomar beanspruchen.
      if (plan === 'founder_active') {
        const claim = await claimFounderSlot();
        setSlots(s => ({ used: claim.remaining != null ? FOUNDER_SLOT_LIMIT - claim.remaining : s.used, remaining: claim.remaining }));
        if (!claim.ok) { Alert.alert('Founder Active', claim.error === 'Founder offer sold out' ? FOUNDER_SOLD_OUT_MSG : (claim.error ?? 'Nicht verfügbar.')); return; }
      }
      const meta = PLAN_META[plan];
      if (iapReady) {
        const pkg = packages.find(p => p.productId === meta.productId);
        if (!pkg) { Alert.alert('Hinweis', 'Dieser Plan ist im Store gerade nicht verfügbar.'); return; }
        const res = await buyPackage(pkg);
        if (res.cancelled) return;
        if (!res.ok) { Alert.alert('Hinweis', res.error ?? 'Kauf wurde nicht abgeschlossen.'); return; }
        const { error } = await activatePlan({ userId: user.id, plan, periodEndsAt: res.expiration, providerProductId: meta.productId });
        if (error) { Alert.alert('Hinweis', 'Aktivierung fehlgeschlagen.'); return; }
        finish(plan);
      } else if (__DEV__) {
        // Dev/Test ohne konfigurierten Store: direkt aktivieren.
        const { error } = await activatePlan({ userId: user.id, plan, periodEndsAt: new Date(Date.now() + MONTH_MS).toISOString(), providerProductId: meta.productId });
        if (error) { Alert.alert('Hinweis', 'Aktivierung fehlgeschlagen.'); return; }
        finish(plan);
      } else {
        Alert.alert('Bald verfügbar', 'Käufe sind gerade nicht verfügbar. Bitte später erneut versuchen.');
      }
    } finally {
      setLaden(null);
    }
  };

  const handleCancelTrial = () => {
    Alert.alert(
      'Testabo kündigen?',
      trialEndLabel
        ? `Dein Zugriff bleibt bis zum ${trialEndLabel} bestehen und läuft danach automatisch aus. Es wird nichts abgebucht.`
        : 'Dein Zugriff bleibt bis zum Ende der Testphase bestehen und läuft danach automatisch aus. Es wird nichts abgebucht.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Kündigen', style: 'destructive', onPress: async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const { error } = await cancelTrial(user.id);
          if (error) { Alert.alert('Hinweis', 'Kündigung fehlgeschlagen. Bitte später erneut versuchen.'); return; }
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
    if (res.tier && user) {
      // Entitlement → Plan (Founder bleibt erhalten, wenn Provider es bestätigt).
      const plan: SubscriptionPlan = res.tier === 'trainer' ? 'trainer' : (currentPlan === 'founder_active' ? 'founder_active' : 'active');
      await activatePlan({ userId: user.id, plan, periodEndsAt: res.expiration });
      Alert.alert('Wiederhergestellt', 'Dein Abo ist wieder aktiv.', [{ text: 'OK', onPress: () => router.back() }]);
    } else {
      Alert.alert('Nichts gefunden', res.error ?? 'Keine aktiven Käufe gefunden.');
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
          <Text style={S.headerTitel}>{trialing ? 'Vollen Zugriff sichern' : (currentPlan ? 'Dein Plan' : 'ANYVO wählen')}</Text>
          <Text style={S.headerSub}>{trialing ? 'Wähle deinen Plan, bevor die Testphase endet.' : 'Nur Monatsabos · jederzeit kündbar.'}</Text>
        </View>

        {/* Trial-Countdown: motiviert zum Wechsel Testversion → Active, bevor der
            Zugriff endet. Nur während der laufenden Testphase (nicht bei Lifetime). */}
        {trialing && !access.isLifetime && (
          <View style={S.trialBanner}>
            <View style={S.trialIcon}><Ionicons name="hourglass-outline" size={20} color={C.warning} /></View>
            <View style={{ flex: 1 }}>
              <Text style={S.trialTitle}>
                {trialDaysLeft != null
                  ? (trialDaysLeft === 0 ? 'Testphase endet heute' : `Noch ${trialDaysLeft} ${trialDaysLeft === 1 ? 'Tag' : 'Tage'} gratis`)
                  : 'Testversion aktiv'}
              </Text>
              <Text style={S.trialSub}>
                {cancelAtPeriodEnd
                  ? (trialEndLabel
                      ? `Gekündigt — dein Zugriff läuft am ${trialEndLabel} aus. Es wird nichts abgebucht.`
                      : 'Gekündigt — dein Zugriff läuft am Ende der Testphase aus.')
                  : (trialEndLabel
                      ? `Deine Beginner-Testphase endet am ${trialEndLabel}. Sichere dir jetzt den vollen Zugriff — ohne Unterbruch.`
                      : 'Sichere dir jetzt den vollen Zugriff — ohne Unterbruch.')}
              </Text>
              {!cancelAtPeriodEnd && (
                <Text style={S.trialCancelLink} onPress={handleCancelTrial}>Testabo kündigen</Text>
              )}
            </View>
          </View>
        )}

        {access.isLifetime ? (
          <View style={[S.card, S.cardCurrent]}>
            <View style={S.cardHead}>
              <View style={{ flex: 1 }}>
                <View style={S.nameRow}>
                  <Text style={S.cardName}>{access.hasTrainerAccess ? 'Lifetime Trainer Zugriff aktiv' : 'Lifetime Zugriff aktiv'}</Text>
                  <View style={S.badge}><Text style={S.badgeTxt}>LIFETIME</Text></View>
                </View>
              </View>
            </View>
            <View style={S.featureList}>
              <View style={S.featureRow}>
                <Ionicons name="checkmark-circle" size={15} color={C.accent} />
                <Text style={S.featureTxt}>Du hast lebenslangen Zugriff auf diese Funktionen.</Text>
              </View>
            </View>
          </View>
        ) : (<>
        {visibleCards.map(card => {
          const meta = PLAN_META[card.plan];
          const isCurrent = currentPlan === card.plan;
          const soldOut = card.founder && !founderAvailable;
          const busy = laden === card.plan;
          const pkgPrice = packages.find(p => p.productId === meta.productId)?.priceString;
          const isRec = card.plan === recommendedPlan && !isCurrent && !soldOut;
          const filled = card.founder || card.plan === 'trainer' || isRec;   // Gradient-CTA
          return (
            <View key={card.plan} style={[S.card, card.founder && S.cardFounder, isRec && !card.founder && S.cardRec, isCurrent && S.cardCurrent]}>
              {isRec && (
                <View style={S.recStrip}>
                  <Ionicons name="star" size={11} color={C.accentText} />
                  <Text style={S.recStripTxt}>{card.founder ? 'BESTER PREIS' : 'EMPFOHLEN'}</Text>
                </View>
              )}
              <View style={S.cardHead}>
                <View style={{ flex: 1 }}>
                  <View style={S.nameRow}>
                    <Text style={S.cardName}>{meta.name}</Text>
                    {card.badge && <View style={[S.badge, card.founder && S.badgeFounder]}><Text style={[S.badgeTxt, card.founder && { color: '#04201b' }]}>{card.badge}</Text></View>}
                  </View>
                  <View style={S.priceRow}>
                    <Text style={S.cardPrice}>{card.plan === 'beginner_trial' ? '7 Tage gratis' : (pkgPrice ?? meta.priceLabel)}</Text>
                    {/* Ersparnis ggü. Active hervorheben (Conversion-Anker für Trial-Nutzer). */}
                    {card.founder && founderAvailable && <Text style={S.savings}>statt {activePriceStr}</Text>}
                  </View>
                  {card.founder && <Text style={S.founderSlots}>{founderAvailable ? `Noch ${slots.remaining} von ${FOUNDER_SLOT_LIMIT}` : 'Ausverkauft'}</Text>}
                </View>
              </View>

              <View style={S.featureList}>
                {card.features.map(f => (
                  <View key={f} style={S.featureRow}>
                    <Ionicons name="checkmark-circle" size={15} color={C.accent} />
                    <Text style={S.featureTxt}>{f}</Text>
                  </View>
                ))}
              </View>

              {isCurrent ? (
                <View style={S.currentTag}><Ionicons name="checkmark" size={15} color={C.accent} /><Text style={S.currentTxt}>Aktiv</Text></View>
              ) : soldOut ? (
                <View style={S.soldOut}><Text style={S.soldOutTxt}>{FOUNDER_SOLD_OUT_MSG}</Text></View>
              ) : (
                <AnimatedPressable style={[S.cta, !filled && S.ctaAlt]} scale={0.97} onPress={() => choose(card.plan)} disabled={busy}>
                  {filled && <LinearGradient colors={['#00FFCC', '#00f0c8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
                  {busy ? <ActivityIndicator color={filled ? C.accentText : C.white} /> : (
                    <Text style={[S.ctaTxt, filled ? { color: C.accentText } : { color: C.white }]}>
                      {card.plan === 'beginner_trial' ? 'Gratis starten' : (trialing ? `Jetzt auf ${meta.name} wechseln` : `${meta.name} wählen`)}
                    </Text>
                  )}
                </AnimatedPressable>
              )}
            </View>
          );
        })}

        <TouchableOpacity onPress={handleRestore} style={S.restoreBtn} activeOpacity={0.7}>
          <Text style={S.restoreTxt}>Käufe wiederherstellen</Text>
        </TouchableOpacity>
        </>)}
        {!access.isLifetime && <Text style={S.legal}>Zahlung über deinen App-Store-Account · jederzeit kündbar.</Text>}
        <View style={S.linksRow}>
          <Text style={S.link} onPress={() => router.push('/terms')}>Nutzungsbedingungen</Text>
          <Text style={S.legal}>·</Text>
          <Text style={S.link} onPress={() => router.push('/privacy')}>Datenschutz</Text>
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
  legal:      { fontSize: 12, color: C.subtle, textAlign: 'center', marginTop: 4 },
  linksRow:   { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6 },
  link:       { fontSize: 12, color: C.accent, fontWeight: '600' },
});
