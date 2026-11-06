import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';


// Training-Hub: fokussiert auf Timer + Fährten-Tool (+ nachträglich
// dokumentieren). Der vollständige Verlauf (/unit/history) wurde app-weit
// entfernt — Verlauf gibt es nur noch als Mini-Vorschau auf Home.
export default function TrainingScreen() {
  const router = useRouter();
  const { t } = useT();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>ANYVO</Text>
            <Text style={s.title}>{t('training.title')}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('training.stats')} style={s.iconBtn} onPress={() => router.push('/unit/stats')} activeOpacity={0.7}>
            <Ionicons name="stats-chart-outline" size={20} color={C.white} />
          </TouchableOpacity>
        </View>

        <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('training.startTimer')} style={s.heroWrap} scale={0.98} onPress={() => router.push('/unit/timer')}>
          <View style={s.heroHeading}>
            <Ionicons name="stopwatch-outline" size={36} color={C.accent} />
            <View style={s.flex}>
              <Text style={s.heroTitle}>{t('training.start')}</Text>
              <Text style={s.docSub}>{t('training.timerHint')}</Text>
            </View>
          </View>
          <View style={s.heroBtn}>
            <Ionicons name="play" size={18} color={C.accentText} />
            <Text style={s.heroBtnTxt}>{t('training.startTimer')}</Text>
          </View>
        </AnimatedPressable>

        {/* Nachträglich dokumentieren */}
        <AnimatedPressable accessibilityRole="button" style={s.docBtn} scale={0.98} onPress={() => router.push('/unit/document')}>
          <View style={s.actionIcon}><Ionicons name="create-outline" size={28} color={C.accent} /></View>
          <View style={s.flex}>
            <Text style={s.docTitel}>{t('training.document')}</Text>
            <Text style={s.docSub}>{t('training.documentSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </AnimatedPressable>

        {/* Trainingstagebuch */}
        <AnimatedPressable accessibilityRole="button" style={[s.faehrteCard, { marginBottom: 12 }]} scale={0.98} onPress={() => router.push('/training-journal')}>
          <View style={[s.actionIcon, { backgroundColor: `${C.accent}1A` }]}>
            <Ionicons name="book-outline" size={28} color={C.accent} />
          </View>
          <View style={s.flex}>
            <Text style={s.docTitel}>{t('training.journal')}</Text>
            <Text style={s.docSub}>{t('training.journalSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </AnimatedPressable>

        {/* Fährten-Tool */}
        <AnimatedPressable accessibilityRole="button" style={[s.faehrteCard, s.trackCard]} scale={0.98} onPress={() => router.push('/track' as never)}>
          <View style={[s.actionIcon, { backgroundColor: `${C.success}1A` }]}>
            <Ionicons name="trail-sign-outline" size={28} color={C.success} />
          </View>
          <View style={s.flex}>
            <Text style={s.docTitel}>{t('training.faehrteGps')}</Text>
            <Text style={s.docSub}>{t('training.faehrteSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </AnimatedPressable>

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
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  heroWrap: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 18, marginBottom: 12, gap: 18 },
  heroHeading: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroTitle: { fontSize: 21, color: C.white, fontWeight: '800' },
  heroBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.accent, borderRadius: 16, padding: 12 },
  heroBtnTxt: { fontSize: 16, color: C.accentText, fontWeight: '800' },
  trackCard: { backgroundColor: '#0B2220', borderColor: '#18534C' },

  docBtn:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 12 },
  faehrteCard:{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 16 },
  flex:      { flex: 1 },
  docTitel:  { fontSize: 17, color: C.white, fontWeight: '700' },
  docSub:    { fontSize: 14, lineHeight: 20, color: C.muted, fontWeight: '500', marginTop: 2 },

  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
