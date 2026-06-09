import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useProfile } from '@/hooks/useProfile';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const AREAS: { icon: IconName; color: string; title: string; sub: string; route: string }[] = [
  { icon: 'people',           color: '#60A5FA', title: 'Kunden',        sub: 'Verbundene Kund:innen verwalten', route: '/(tabs)/clients' },
  { icon: 'clipboard',        color: '#00F5D4', title: 'Trainingspläne', sub: 'Pläne erstellen & teilen',        route: '/trainer/plaene' },
  { icon: 'megaphone',        color: '#A78BFA', title: 'Umfragen',       sub: 'Terminumfragen & Ergebnisse',     route: '/umfrage/meine' },
  { icon: 'chatbubbles',      color: '#F472B6', title: 'Nachrichten',    sub: 'Chat & Feedback mit Kunden',      route: '/chat' },
  { icon: 'stats-chart',      color: '#FF8A3D', title: 'Analysen',       sub: 'Statistiken & Aktivität',         route: '/(tabs)/analytics' },
];

export default function TrainerDashboardScreen() {
  const router = useRouter();
  const { hasTrainerAccess } = useProfile();

  if (!hasTrainerAccess) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={22} color={C.white} /></TouchableOpacity>
          <Text style={s.title}>Trainer-Dashboard</Text>
        </View>
        <View style={s.locked}>
          <Ionicons name="lock-closed" size={32} color={C.muted} />
          <Text style={s.lockedTxt}>Trainer-Abo erforderlich</Text>
          <TouchableOpacity style={s.upgrade} onPress={() => router.push('/premium')} activeOpacity={0.85}>
            <Text style={s.upgradeTxt}>Trainer freischalten</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={22} color={C.white} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>TRAINER</Text>
          <Text style={s.title}>Dashboard</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {AREAS.map(a => (
          <TouchableOpacity key={a.title} style={s.card} onPress={() => router.push(a.route as never)} activeOpacity={0.85}>
            <View style={[s.icon, { backgroundColor: `${a.color}1A` }]}>
              <Ionicons name={a.icon} size={22} color={a.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{a.title}</Text>
              <Text style={s.cardSub}>{a.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.subtle} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, color: '#00F5D4', fontWeight: '800', letterSpacing: 2 },
  title:   { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  content: { paddingHorizontal: 20, paddingTop: 4, gap: 12 },
  card:    { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16 },
  icon:    { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, color: C.white, fontWeight: '800' },
  cardSub:   { fontSize: 12, color: C.muted, marginTop: 2 },
  locked:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  lockedTxt: { fontSize: 16, color: C.white, fontWeight: '700' },
  upgrade:  { backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  upgradeTxt: { fontSize: 15, color: C.accentText, fontWeight: '800' },
});
