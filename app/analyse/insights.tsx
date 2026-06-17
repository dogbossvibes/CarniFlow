import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Insight { icon: IconName; title: string; subtitle: string; query: string; category?: string }

// Version 1: noch keine komplexe KI — kuratierte semantische Suchvorschläge,
// die beim Klick die Smart Search mit passender Query öffnen.
const INSIGHTS: Insight[] = [
  { icon: 'warning-outline',     title: 'Probleme der letzten 30 Tage', subtitle: 'Wo gab es zuletzt Schwierigkeiten?', query: 'Finde Trainings mit Problemen oder Schwierigkeiten' },
  { icon: 'git-branch-outline',  title: 'Ähnliche Fährten finden',      subtitle: 'Vergleichbare Läufe wie zuletzt',  query: 'Finde ähnliche Fährten wie die letzte', category: 'Fährte' },
  { icon: 'trending-up-outline', title: 'Unterordnung Fortschritt',     subtitle: 'Entwicklung in der Unterordnung',  query: 'Zeige Fortschritt und Entwicklung in der Unterordnung', category: 'Unterordnung' },
  { icon: 'trending-down-outline', title: 'Trainings mit tiefem Score', subtitle: 'Schwächere Einheiten zuerst',      query: 'Trainings mit niedrigem Score oder schwacher Bewertung' },
  { icon: 'help-circle-outline', title: 'Notizen mit Unsicherheit',     subtitle: 'Wo wirkte der Hund unsicher?',     query: 'Zeige Notizen in denen der Hund unsicher war' },
];

export default function InsightsScreen() {
  const router = useRouter();

  const open = (i: Insight) =>
    router.push({ pathname: '/analyse/smart-search', params: { q: i.query, category: i.category ?? '' } } as never);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Insights</Text>
          <Text style={s.subtitle}>Geführte Auswertungen deiner Trainings.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={s.searchCta} onPress={() => router.push('/analyse/smart-search' as never)} activeOpacity={0.85}>
          <Ionicons name="sparkles" size={18} color={C.accentText} />
          <Text style={s.searchCtaTxt}>Eigene semantische Suche starten</Text>
          <Ionicons name="arrow-forward" size={16} color={C.accentText} />
        </TouchableOpacity>

        <Text style={s.sectionLabel}>Vorschläge</Text>
        <View style={{ gap: 11 }}>
          {INSIGHTS.map(i => (
            <TouchableOpacity key={i.title} style={s.card} onPress={() => open(i)} activeOpacity={0.85}>
              <View style={s.iconBox}><Ionicons name={i.icon} size={20} color={C.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{i.title}</Text>
                <Text style={s.cardSub}>{i.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  subtitle:{ fontSize: 12.5, color: C.muted, marginTop: 2 },
  content: { paddingHorizontal: 18, paddingTop: 4 },

  searchCta:{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 15, borderRadius: 18, backgroundColor: C.accent, marginBottom: 22 },
  searchCtaTxt:{ flex: 1, fontSize: 14.5, color: C.accentText, fontWeight: '800' },

  sectionLabel:{ fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, marginLeft: 2 },
  card:    { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  iconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  cardTitle:{ fontSize: 15, color: C.white, fontWeight: '700' },
  cardSub: { fontSize: 12, color: C.muted, marginTop: 2 },
});
