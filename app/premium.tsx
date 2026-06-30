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
  activatePlan, trialEndDate, getFounderSlots, claimFounderSlot, getPlanSubscription,
} from '@/services/subscriptionService';
import { PLAN_META, type SubscriptionPlan } from '@/features/subscription/plans';
import { useAccess } from '@/hooks/useAccess';

interface CardDef { plan: SubscriptionPlan; badge?: string; features: string[]; founder?: boolean }

const CARDS: CardDef[] = [
  { plan: 'beginner_trial', badge: 'Start', features: ['7 Tage kostenlos', 'Alle Active-Funktionen', 'Danach Active CHF 10.00/Mt.', 'Kein Trainerzugang'] },
  { plan: 'founder_active', badge: 'Nur 77×', founder: true, features: ['Dauerhaft CHF 4.00/Mt.', 'Solange das Abo aktiv bleibt', 'Alle Active-Funktionen', 'Kein Trainerzugang'] },
  { plan: 'active', features: ['Training, Hunde, Fortschritt', 'KI-Auswertung', 'Kalender & Sprachnotizen', 'Kein Trainerzugang'] },
  { plan: 'trainer', badge: 'Pro', features: ['Alles aus Active', 'Kundenverwaltung & Pläne', 'Umfragen & Feedback', 'Trainer-Dashboard'] },
];

const MONTH_MS = 30 * 86400000;

export default function PremiumScreen() {
  const router = useRouter();
  const [laden, setLaden] = useState<SubscriptionPlan | null>(null);
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [slots, setSlots] = useState<{ used: number; remaining: number }>({ used: 0, remaining: 77 });
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null);
  const { access } = useAccess();

  useEffect(() => {
    (async () => {
      setPackages(await getPackages());
      setSlots(await getFounderSlots());
      const { data: { user } } = await supabase.auth.getUser();
      if (user) { const sub = await getPlanSubscription(user.id); setCurrentPlan(sub?.plan ?? null); }
    })();
  }, []);

  const iapReady = purchasesReady() && packages.length > 0;
  const founderAvailable = slots.remaining > 0 || currentPlan === 'founder_active';

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
        setSlots(s => ({ used: claim.remaining != null ? 77 - claim.remaining : s.used, remaining: claim.remaining }));
        if (!claim.ok) { Alert.alert('Founder Active', claim.error === 'Founder offer sold out' ? 'Das Founder-Angebot ist leider ausverkauft.' : (claim.error ?? 'Nicht verfügbar.')); return; }
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
            <Ionicons name="star" size={34} color={C.accent} />
          </View>
          <Text style={S.headerTitel}>ANYVO wählen</Text>
          <Text style={S.headerSub}>Nur Monatsabos · jederzeit kündbar.</Text>
        </View>

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
        {CARDS.map(card => {
          const meta = PLAN_META[card.plan];
          const isCurrent = currentPlan === card.plan;
          const soldOut = card.founder && !founderAvailable;
          const busy = laden === card.plan;
          const pkgPrice = packages.find(p => p.productId === meta.productId)?.priceString;
          return (
            <View key={card.plan} style={[S.card, card.founder && S.cardFounder, isCurrent && S.cardCurrent]}>
              <View style={S.cardHead}>
                <View style={{ flex: 1 }}>
                  <View style={S.nameRow}>
                    <Text style={S.cardName}>{meta.name}</Text>
                    {card.badge && <View style={[S.badge, card.founder && S.badgeFounder]}><Text style={[S.badgeTxt, card.founder && { color: '#04201b' }]}>{card.badge}</Text></View>}
                  </View>
                  <Text style={S.cardPrice}>{card.plan === 'beginner_trial' ? '7 Tage gratis' : (pkgPrice ?? meta.priceLabel)}</Text>
                  {card.founder && <Text style={S.founderSlots}>{founderAvailable ? `Noch ${slots.remaining} von 77` : 'Ausverkauft'}</Text>}
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
                <View style={S.soldOut}><Text style={S.soldOutTxt}>Ausverkauft</Text></View>
              ) : (
                <AnimatedPressable style={[S.cta, !card.founder && card.plan !== 'trainer' && S.ctaAlt]} scale={0.97} onPress={() => choose(card.plan)} disabled={busy}>
                  {(card.founder || card.plan === 'trainer') && <LinearGradient colors={['#00FFCC', '#00f0c8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
                  {busy ? <ActivityIndicator color={card.founder || card.plan === 'trainer' ? C.accentText : C.white} /> : (
                    <Text style={[S.ctaTxt, (card.founder || card.plan === 'trainer') ? { color: C.accentText } : { color: C.white }]}>
                      {card.plan === 'beginner_trial' ? 'Gratis starten' : `${meta.name} wählen`}
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

  card:        { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 12 },
  cardFounder: { borderColor: C.accent, backgroundColor: 'rgba(0,245,212,0.06)' },
  cardCurrent: { borderColor: C.accentMid },
  cardHead:    { flexDirection: 'row', alignItems: 'flex-start' },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName:    { fontSize: 18, color: C.white, fontWeight: '900', letterSpacing: -0.3 },
  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  badgeFounder:{ backgroundColor: C.accent, borderColor: C.accent },
  badgeTxt:    { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 0.5 },
  cardPrice:   { fontSize: 15, color: C.white, fontWeight: '700', marginTop: 4 },
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
