import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useCapabilities } from '@/hooks/useCapabilities';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const MODULES: { icon: IconName; color: string; title: string; sub: string; route: string }[] = [
  { icon: 'people',      color: '#60A5FA', title: 'Kunden',        sub: 'Verbindungen verwalten',       route: '/(tabs)/clients' },
  { icon: 'clipboard',   color: '#00F5D4', title: 'Trainingspläne', sub: 'Pläne erstellen & teilen',     route: '/trainer/plaene' },
  { icon: 'megaphone',   color: '#A78BFA', title: 'Umfragen',       sub: 'Terminumfragen & Ergebnisse',  route: '/umfrage/meine' },
  { icon: 'chatbubbles', color: '#F472B6', title: 'Nachrichten',    sub: 'Chat & Feedback',              route: '/chat' },
  { icon: 'stats-chart', color: '#FF8A3D', title: 'Analysen',       sub: 'Kundenfortschritt & Aktivität', route: '/(tabs)/activity' },
];

export default function HubScreen() {
  const router = useRouter();
  const { isTrainerModule } = useCapabilities();

  if (!isTrainerModule) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}><Text style={s.title}>Hub</Text></View>
        <View style={s.locked}>
          <Ionicons name="lock-closed" size={32} color={C.muted} />
          <Text style={s.lockedTxt}>Trainer-Modul erforderlich</Text>
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
        <Text style={s.eyebrow}>TRAINER</Text>
        <Text style={s.title}>Hub</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {MODULES.map(m => (
          <TouchableOpacity key={m.title} style={s.card} onPress={() => router.push(m.route as never)} activeOpacity={0.85}>
            <View style={[s.icon, { backgroundColor: `${m.color}1A` }]}>
              <Ionicons name={m.icon} size={22} color={m.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{m.title}</Text>
              <Text style={s.cardSub}>{m.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.subtle} />
          </TouchableOpacity>
        ))}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  eyebrow: { fontSize: 9, color: '#00F5D4', fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
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
