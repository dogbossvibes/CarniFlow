import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { HeroImage } from '@/components/training/HeroImage';
import { UnitListCard } from '@/components/training/UnitListCard';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';
import type { FeedItem } from '@/services/trainingFeed';

// Vereinheitlichter Trainings-Hub: der units-Flow ist der einzige
// Erfassungsweg. Alte training_sessions + GPS-Fährten erscheinen (lesend)
// im gemeinsamen Verlauf.
export default function TrainingScreen() {
  const router = useRouter();
  const { feed, loading, refresh } = useTrainingFeed();

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const openItem = (item: FeedItem) => {
    if      (item.source === 'unit')  router.push({ pathname: '/unit/detail', params: { id: item.id } });
    else if (item.source === 'track') router.push(`/track/${item.id}` as never);
    else                              router.push(`/training/${item.id}` as never);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>TRAINING HUB</Text>
            <Text style={s.title}>Training</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/unit/stats')} activeOpacity={0.7}>
            <Ionicons name="stats-chart-outline" size={20} color={C.white} />
          </TouchableOpacity>
        </View>

        {/* Hero-CTA: neue Einheit starten */}
        <AnimatedPressable style={s.heroWrap} scale={0.98} onPress={() => router.push('/unit/start')}>
          <HeroImage height={200} rounded overlay={0.88}>
            <View style={s.heroInner}>
              <Text style={s.heroEyebrow}>NEUE EINHEIT</Text>
              <Text style={s.heroTitle}>Training starten</Text>
              <View style={s.heroBtn}>
                <Ionicons name="play" size={15} color={C.accentText} />
                <Text style={s.heroBtnTxt}>Sparte wählen</Text>
              </View>
            </View>
          </HeroImage>
        </AnimatedPressable>

        {/* Nachträglich dokumentieren */}
        <AnimatedPressable style={s.docBtn} scale={0.98} onPress={() => router.push('/unit/document')}>
          <Ionicons name="create-outline" size={20} color={C.accent} />
          <View style={s.flex}>
            <Text style={s.docTitel}>Training dokumentieren</Text>
            <Text style={s.docSub}>Nachträglich mit Fotos, Videos & Notizen</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </AnimatedPressable>

        {/* Sekundäre Aktionen */}
        <View style={s.actions}>
          <AnimatedPressable style={s.actionCard} scale={0.97} onPress={() => router.push('/track/setup' as never)}>
            <View style={[s.actionIcon, { backgroundColor: `${C.success}1A` }]}>
              <Ionicons name="map" size={20} color={C.success} />
            </View>
            <Text style={s.actionLabel}>Fährte (GPS)</Text>
            <Text style={s.actionSub}>Mit Live-Tracking</Text>
          </AnimatedPressable>
          <AnimatedPressable style={s.actionCard} scale={0.97} onPress={() => router.push('/unit/history')}>
            <View style={[s.actionIcon, { backgroundColor: `${C.accent}1A` }]}>
              <Ionicons name="time" size={20} color={C.accent} />
            </View>
            <Text style={s.actionLabel}>Voller Verlauf</Text>
            <Text style={s.actionSub}>Alle Einheiten</Text>
          </AnimatedPressable>
        </View>

        {/* Verlauf (vereinheitlicht) */}
        <Text style={s.sektionTitel}>Verlauf</Text>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} />
        ) : feed.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="footsteps-outline" size={30} color={C.subtle} />
            <Text style={s.emptyTitle}>Noch keine Einheiten</Text>
            <Text style={s.emptyTxt}>Starte oben dein erstes Training.</Text>
          </View>
        ) : (
          feed.slice(0, 20).map(item => (
            <UnitListCard key={`${item.source}-${item.id}`} unit={item} onPress={() => openItem(item)} />
          ))
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8 },

  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 16 },
  eyebrow: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:   { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  heroWrap:   { borderRadius: 24, marginBottom: 12 },
  heroInner:  { padding: 20, gap: 8 },
  heroEyebrow:{ fontSize: 10, color: C.accent, fontWeight: '800', letterSpacing: 2 },
  heroTitle:  { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  heroBtn:    { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, marginTop: 4 },
  heroBtnTxt: { fontSize: 14, color: C.accentText, fontWeight: '800' },

  docBtn:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 12 },
  flex:     { flex: 1 },
  docTitel: { fontSize: 15, color: C.white, fontWeight: '700' },
  docSub:   { fontSize: 12, color: C.muted, fontWeight: '500', marginTop: 2 },

  actions:    { flexDirection: 'row', gap: 12, marginBottom: 8 },
  actionCard: { flex: 1, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, gap: 8 },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel:{ fontSize: 14, color: C.white, fontWeight: '700' },
  actionSub:  { fontSize: 12, color: C.muted, fontWeight: '500' },

  sektionTitel: { fontSize: 18, color: C.white, fontWeight: '800', letterSpacing: -0.3, marginTop: 24, marginBottom: 14 },

  empty:      { alignItems: 'center', gap: 8, marginTop: 40, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, color: C.white, fontWeight: '700', marginTop: 6 },
  emptyTxt:   { fontSize: 13, color: C.subtle, textAlign: 'center' },
});
