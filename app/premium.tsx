import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { usePlan } from '@/hooks/usePlan';
import { getPackages, buyPackage, restorePurchases, purchasesReady, type PurchasePackage, type Tier } from '@/lib/purchases';
import { recordSubscription } from '@/services/subscriptionService';

// ─── Daten ────────────────────────────────────────────────────────────────────

const CUSTOMER_FEATURES = [
  { icon: '📋', label: 'Training erfassen' },
  { icon: '📍', label: 'Live Tracking' },
  { icon: '🐕', label: 'Hunde verwalten' },
  { icon: '📈', label: 'Fortschritt' },
  { icon: '✨', label: 'KI-Auswertung' },
  { icon: '📊', label: 'Erweiterte Statistiken' },
  { icon: '🗓️', label: 'Termine' },
  { icon: '☁️', label: 'Cloud Sync' },
];

const TRAINER_EXTRA = [
  { icon: '👥', label: 'Kundenverwaltung' },
  { icon: '🗂️', label: 'Trainingspläne erstellen & teilen' },
  { icon: '📣', label: 'Umfragen & Codes' },
  { icon: '💬', label: 'Chat mit Kunden' },
  { icon: '🎙', label: 'Sprach- & Textkommentare' },
  { icon: '🎬', label: 'Videofeedback' },
  { icon: '📊', label: 'Trainer-Statistiken' },
];

const PLAN_META: Record<Tier, { name: string; fallbackPrice: string; tagline: string }> = {
  customer: { name: 'Kunde',   fallbackPrice: 'CHF 7.90',  tagline: 'Alle Trainings-Features' },
  trainer:  { name: 'Trainer', fallbackPrice: 'CHF 29.90', tagline: 'Kunde + Trainer-Tools' },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PremiumScreen() {
  const router  = useRouter();
  const { isPremium, trialUsed, expiresAt } = usePlan();

  const [laden, setLaden] = useState(false);
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [selectedTier, setSelectedTier] = useState<Tier>('customer');

  // Angebote von RevenueCat laden (Store-Preise). Leer = IAP nicht konfiguriert.
  useEffect(() => { (async () => setPackages(await getPackages()))(); }, []);
  const iapReady = purchasesReady() && packages.length > 0;
  const pkgFor = (tier: Tier) => packages.find(p => p.tier === tier) ?? null;

  // Stufe in profiles aktivieren (Trainer setzt zusätzlich role + is_trainer).
  const activateTier = async (tier: Tier, expiration: string | null, productId?: string | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const patch: Record<string, unknown> = { plan: 'premium', plan_expires_at: expiration, trial_used: true };
    if (tier === 'trainer') { patch.role = 'trainer'; patch.is_trainer = true; }
    await supabase.from('profiles').update(patch).eq('id', user.id);
    await recordSubscription({ userId: user.id, tier, productId, expiresAt: expiration });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  const handleBuy = async () => {
    const pkg = pkgFor(selectedTier);
    if (!pkg) { Alert.alert('Hinweis', 'Dieser Plan ist gerade nicht verfügbar.'); return; }
    setLaden(true);
    const res = await buyPackage(pkg);
    setLaden(false);
    if (res.cancelled) return;
    if (!res.ok || !res.tier) { Alert.alert('Hinweis', res.error ?? 'Kauf wurde nicht abgeschlossen.'); return; }
    await activateTier(res.tier, res.expiration, pkg.productId);
    Alert.alert(
      res.tier === 'trainer' ? 'Trainer aktiv! 🎉' : 'Willkommen bei Premium! 🎉',
      'Deine Funktionen sind freigeschaltet.',
      [{ text: "Los geht's!", onPress: () => router.back() }],
    );
  };

  const handleRestore = async () => {
    setLaden(true);
    const res = await restorePurchases();
    setLaden(false);
    if (res.tier) {
      await activateTier(res.tier, res.expiration);
      Alert.alert('Wiederhergestellt', 'Dein Abo ist wieder aktiv.', [{ text: 'OK', onPress: () => router.back() }]);
    } else {
      Alert.alert('Nichts gefunden', res.error ?? 'Keine aktiven Käufe gefunden.');
    }
  };

  const activateTrial = async () => {
    setLaden(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht eingeloggt.');
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      const { error } = await supabase
        .from('profiles')
        .update({ plan: 'premium', plan_expires_at: expires.toISOString(), trial_used: true })
        .eq('id', user.id);
      if (error) throw error;
      Alert.alert('7 Tage gratis!', 'Dein Test ist aktiv. Viel Spaß mit allen Features!', [{ text: "Los geht's!", onPress: () => router.back() }]);
    } catch {
      Alert.alert('Ups, kurze Pause 🐾', 'Test noch nicht aktiviert — versuch es nochmal!');
    } finally {
      setLaden(false);
    }
  };

  // ── Bereits Premium ──
  if (isPremium) {
    return (
      <SafeAreaView style={S.safe} edges={['top']}>
        <TouchableOpacity style={S.closeBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="close" size={20} color={C.muted} />
        </TouchableOpacity>
        <View style={S.aktivBox}>
          <View style={S.aktivRing}>
            <LinearGradient
              colors={[`${C.accent}25`, `${C.accent}08`]}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="star" size={38} color={C.accent} />
          </View>
          <Text style={S.aktivTitel}>Premium aktiv</Text>
          <Text style={S.aktivSub}>
            {expiresAt
              ? `Aktiv bis ${expiresAt.toLocaleDateString('de-CH')}`
              : 'Unbegrenzt aktiv'}
          </Text>
          <Text style={S.aktivBeschreibung}>
            Du hast Zugriff auf alle Features.
          </Text>
          <AnimatedPressable style={S.zurueckBtn} onPress={() => router.back()} scale={0.97}>
            <LinearGradient
              colors={['#00FFCC', '#00FFCC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={S.zurueckBtnTxt}>Zurück</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Upgrade Screen ──
  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <TouchableOpacity style={S.closeBtn} onPress={() => router.back()} activeOpacity={0.7}>
        <Ionicons name="close" size={20} color={C.muted} />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.scroll}>

        {/* Header */}
        <View style={S.header}>
          <View style={S.headerRing}>
            <LinearGradient
              colors={[`${C.accent}25`, `${C.accent}08`]}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="star" size={36} color={C.accent} />
          </View>
          <Text style={S.headerTitel}>ANYVO Premium</Text>
          <Text style={S.headerSub}>
            Alles was du für professionelles{'\n'}Hundetraining brauchst.
          </Text>
        </View>

        {/* Plan-Auswahl: Kunde / Trainer */}
        {iapReady && (
          <View style={S.planSelRow}>
            {(['customer', 'trainer'] as Tier[]).map(tier => {
              const aktiv = selectedTier === tier;
              const m = PLAN_META[tier];
              return (
                <TouchableOpacity key={tier} style={[S.planSel, aktiv && S.planSelAktiv]} onPress={() => setSelectedTier(tier)} activeOpacity={0.85}>
                  <Text style={[S.planSelName, aktiv && { color: C.accent }]}>{m.name}</Text>
                  <Text style={[S.planSelPrice, aktiv && { color: C.accent }]}>{pkgFor(tier)?.priceString ?? m.fallbackPrice}</Text>
                  <Text style={S.planSelSub}>/ Monat</Text>
                  <Text style={S.planSelTag} numberOfLines={2}>{m.tagline}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Feature-Liste der gewählten Stufe */}
        <View style={S.featureKarte}>
          {[...CUSTOMER_FEATURES, ...(iapReady && selectedTier === 'trainer' ? TRAINER_EXTRA : [])].map((f, i) => (
            <View key={f.label} style={[S.featureZeile, i > 0 && S.featureTrenner]}>
              <Text style={S.featureIcon}>{f.icon}</Text>
              <Text style={S.featureLabel}>{f.label}</Text>
              <Ionicons name="checkmark" size={16} color={C.success} />
            </View>
          ))}
        </View>

        {iapReady ? (
          <>
            <AnimatedPressable style={S.kaufenBtn} onPress={handleBuy} disabled={laden} scale={0.97}>
              <LinearGradient colors={['#00FFCC', '#00FFCC', '#00f0c8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              {laden ? <ActivityIndicator color={C.accentText} /> : <Text style={S.kaufenBtnTxt}>{PLAN_META[selectedTier].name} abonnieren</Text>}
            </AnimatedPressable>

            <TouchableOpacity onPress={handleRestore} disabled={laden} style={S.restoreBtn} activeOpacity={0.7}>
              <Text style={S.restoreTxt}>Käufe wiederherstellen</Text>
            </TouchableOpacity>

            <Text style={S.legal}>7 Tage gratis testen · danach Zahlung über deinen App-Store-Account · jederzeit kündbar.</Text>
            <View style={S.linksRow}>
              <Text style={S.link} onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}>Nutzungsbedingungen</Text>
              <Text style={S.legal}>·</Text>
              <Text style={S.link} onPress={() => router.push('/privacy')}>Datenschutz</Text>
            </View>
          </>
        ) : (
          <>
            {!trialUsed ? (
              <AnimatedPressable style={S.kaufenBtn} onPress={activateTrial} disabled={laden} scale={0.97}>
                <LinearGradient colors={['#00FFCC', '#00FFCC', '#00f0c8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                {laden ? <ActivityIndicator color={C.accentText} /> : <Text style={S.kaufenBtnTxt}>7 Tage gratis aktivieren</Text>}
              </AnimatedPressable>
            ) : (
              <View style={S.infoBox}>
                <Ionicons name="time-outline" size={18} color={C.muted} />
                <Text style={S.infoTxt}>Du hast deine Gratis-Woche bereits genutzt. Weitere Optionen folgen bald.</Text>
              </View>
            )}
            <Text style={S.legal}>7 Tage gratis · Jederzeit kündbar · Keine Zahlungsdaten nötig</Text>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: C.bg },
  scroll:   { paddingHorizontal: 20, paddingBottom: 48 },
  closeBtn: {
    alignSelf:   'flex-end',
    padding:     16,
    marginRight: 4,
  },

  // Premium aktiv
  aktivBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 },
  aktivRing: {
    width:        88,
    height:       88,
    borderRadius: 44,
    borderWidth:  1,
    borderColor:  `${C.accent}30`,
    alignItems:   'center',
    justifyContent: 'center',
    overflow:     'hidden',
    marginBottom: 8,
  },
  aktivTitel:       { fontSize: 26, color: C.white,  fontWeight: '900', letterSpacing: -0.5 },
  aktivSub:         { fontSize: 13, color: C.accent, fontWeight: '600' },
  aktivBeschreibung:{ fontSize: 14, color: C.muted,  textAlign: 'center' },
  zurueckBtn: {
    borderRadius:      16,
    paddingHorizontal: 32,
    paddingVertical:   14,
    overflow:          'hidden',
    alignItems:        'center',
    justifyContent:    'center',
    marginTop:         8,
  },
  zurueckBtnTxt: { fontSize: 15, color: C.accentText, fontWeight: '800' },

  // Header
  header: { alignItems: 'center', paddingTop: 4, paddingBottom: 28, gap: 10 },
  headerRing: {
    width:        76,
    height:       76,
    borderRadius: 38,
    borderWidth:  1,
    borderColor:  `${C.accent}30`,
    alignItems:   'center',
    justifyContent: 'center',
    overflow:     'hidden',
    marginBottom: 4,
  },
  headerTitel: { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  headerSub:   { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },

  // Features
  featureKarte: {
    backgroundColor: C.card,
    borderRadius:    18,
    borderWidth:     1,
    borderColor:     C.border,
    paddingHorizontal: 16,
    marginBottom:    24,
  },
  featureZeile: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 13,
    gap:            12,
  },
  featureTrenner: { borderTopWidth: 1, borderTopColor: C.border },
  featureIcon:    { fontSize: 18, width: 26, textAlign: 'center' },
  featureLabel:   { flex: 1, fontSize: 14, color: C.white, fontWeight: '500' },

  // Pläne (Apple-Preise)
  planKarte:      { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 10, overflow: 'hidden' },
  planKarteAktiv: { borderColor: C.accent },
  planZeile:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  planName:       { fontSize: 15, color: C.white, fontWeight: '700' },
  planPeriod:     { fontSize: 12, color: C.muted, marginTop: 2 },
  planPreis:      { fontSize: 19, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  restoreBtn:     { alignItems: 'center', paddingVertical: 12, marginBottom: 4 },
  restoreTxt:     { fontSize: 13, color: C.muted, fontWeight: '600' },

  // Plan-Auswahl Kunde/Trainer
  planSelRow:   { flexDirection: 'row', gap: 10, marginBottom: 20 },
  planSel:      { flex: 1, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 16, gap: 2 },
  planSelAktiv: { borderColor: C.accent, backgroundColor: 'rgba(0,245,212,0.08)' },
  planSelName:  { fontSize: 14, color: C.white, fontWeight: '800' },
  planSelPrice: { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.5, marginTop: 6 },
  planSelSub:   { fontSize: 11, color: C.muted, fontWeight: '600' },
  planSelTag:   { fontSize: 11, color: C.subtle, marginTop: 8, lineHeight: 15 },

  // CTA
  kaufenBtn: {
    height:        56,
    borderRadius:  16,
    alignItems:    'center',
    justifyContent: 'center',
    marginTop:     8,
    marginBottom:  12,
    overflow:      'hidden',
  },
  kaufenBtnTxt: { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },

  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 8, marginBottom: 12 },
  infoTxt: { flex: 1, fontSize: 13, color: C.muted, lineHeight: 18 },

  legal: { fontSize: 12, color: C.subtle, textAlign: 'center', marginTop: 8 },
  linksRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6 },
  link: { fontSize: 12, color: C.accent, fontWeight: '600' },
});
