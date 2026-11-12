import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { HeroImage } from '@/components/training/HeroImage';
import { UnitListCard } from '@/components/training/UnitListCard';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';
import type { FeedItem } from '@/services/trainingFeed';

// Training-Hub: Timer, Fährten-Tool (direkt unter dem Start, nicht mehr letzte
// Zeile), nachträglich dokumentieren und der Verlauf: die drei jüngsten Einträge
// als Vorschau, der vollständige Verlauf liegt im Trainingstagebuch
// (/training-journal). Die Vorschau liest nur — kein Löschen von hier aus.
export default function TrainingScreen() {
  const router = useRouter();
  const { t } = useT();
  const { feed } = useTrainingFeed();
  const recent = feed.slice(0, 3);

  const openFeedItem = (item: FeedItem) => {
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
            <Text style={s.title}>{t('training.title')}</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/unit/stats')} activeOpacity={0.7}>
            <Ionicons name="stats-chart-outline" size={20} color={C.white} />
          </TouchableOpacity>
        </View>

        {/* Hero-CTA: neue Einheit starten — direkt der Timer, ohne Sparten-Vorauswahl */}
        <AnimatedPressable style={s.heroWrap} scale={0.98} onPress={() => router.push('/unit/timer')}>
          <HeroImage height={200} rounded overlay={0.88}>
            <View style={s.heroInner}>
              <Text style={s.heroEyebrow}>{t('training.newUnit')}</Text>
              <Text style={s.heroTitle}>{t('training.start')}</Text>
              <View style={s.heroBtn}>
                <Ionicons name="play" size={15} color={C.accentText} />
                <Text style={s.heroBtnTxt}>{t('training.startTimer')}</Text>
              </View>
            </View>
          </HeroImage>
        </AnimatedPressable>

        {/* Fährten-Tool — eigener, hervorgehobener Einstieg direkt unter dem Start */}
        <AnimatedPressable style={[s.faehrteCard, s.faehrteTop]} scale={0.98} onPress={() => router.push('/track' as never)}>
          <View style={[s.actionIcon, { backgroundColor: `${C.success}1A` }]}>
            <Ionicons name="navigate" size={20} color={C.success} />
          </View>
          <View style={s.flex}>
            <Text style={s.docTitel}>{t('training.faehrteGps')}</Text>
            <Text style={s.docSub}>{t('training.faehrteSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </AnimatedPressable>

        {/* Nachträglich dokumentieren */}
        <AnimatedPressable style={s.docBtn} scale={0.98} onPress={() => router.push('/unit/document')}>
          <Ionicons name="create-outline" size={20} color={C.accent} />
          <View style={s.flex}>
            <Text style={s.docTitel}>{t('training.document')}</Text>
            <Text style={s.docSub}>{t('training.documentSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </AnimatedPressable>

        {/* Trainingstagebuch — vollständiger Verlauf */}
        <AnimatedPressable style={s.faehrteCard} scale={0.98} onPress={() => router.push('/training-journal')}>
          <View style={[s.actionIcon, { backgroundColor: `${C.accent}1A` }]}>
            <Ionicons name="book-outline" size={20} color={C.accent} />
          </View>
          <View style={s.flex}>
            <Text style={s.docTitel}>{t('training.journal')}</Text>
            <Text style={s.docSub}>{t('training.journalSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </AnimatedPressable>

        {/* Verlauf-Vorschau: die jüngsten Einträge, alles Weitere im Tagebuch */}
        {recent.length > 0 && (
          <View style={s.recent}>
            <View style={s.recentHead}>
              <Text style={s.recentTitle} accessibilityRole="header">{t('home.recentSessions')}</Text>
              <TouchableOpacity
                onPress={() => router.push('/training-journal')}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.viewAll')}
              >
                <Text style={s.recentLink}>{t('calendar.viewAll')}</Text>
              </TouchableOpacity>
            </View>
            {recent.map(item => (
              <UnitListCard key={`${item.source}-${item.id}`} unit={item} onPress={() => openFeedItem(item)} />
            ))}
          </View>
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

  docBtn:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 12 },
  faehrteCard:{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 16 },
  faehrteTop:{ marginBottom: 12, borderColor: C.accentMid },
  recent:     { marginTop: 24 },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  recentTitle:{ fontSize: 17, color: C.white, fontWeight: '800' },
  recentLink: { fontSize: 13, color: C.accent, fontWeight: '700' },
  flex:      { flex: 1 },
  docTitel:  { fontSize: 15, color: C.white, fontWeight: '700' },
  docSub:    { fontSize: 12, color: C.muted, fontWeight: '500', marginTop: 2 },

  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
