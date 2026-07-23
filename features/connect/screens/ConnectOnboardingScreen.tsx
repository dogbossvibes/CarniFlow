import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Onboarding für ANYVO CONNECT. Erklärt Prinzip + Datenschutz, ohne beim Öffnen
// Daten zu schreiben. „Profil erstellen" führt in die Profil-Bearbeitung.
const POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'shield-checkmark-outline', title: 'Privatsphäre zuerst', text: 'Dein Profil ist standardmäßig nur für Freunde sichtbar. Du entscheidest, was öffentlich wird.' },
  { icon: 'paw-outline',              title: 'Als Halter oder Hund', text: 'Beiträge können im Namen eines Hundes erscheinen — die Identität bleibt immer deine Person.' },
  { icon: 'people-outline',           title: 'Trainingspartner finden', text: 'Verbinde dich mit Hundesportler:innen in deiner Region und teile Fortschritte.' },
];

export function ConnectOnboardingScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.badge}><Text style={s.badgeTxt}>CONNECT</Text></View>
        <Text style={s.title}>Willkommen in der{'\n'}ANYVO Community</Text>
        <Text style={s.sub}>
          Erstelle dein CONNECT-Profil, um Trainings zu teilen und Partner zu finden.
          Du kannst es jederzeit anpassen oder deaktivieren.
        </Text>

        <View style={s.points}>
          {POINTS.map(p => (
            <View key={p.title} style={s.point}>
              <View style={s.pIcon}><Ionicons name={p.icon} size={20} color={C.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.pTitle}>{p.title}</Text>
                <Text style={s.pText}>{p.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={s.cta} onPress={() => router.push('/connect/profil-bearbeiten')} activeOpacity={0.85} accessibilityRole="button">
          <Text style={s.ctaTxt}>Profil erstellen</Text>
          <Ionicons name="arrow-forward" size={18} color={C.accentText} />
        </TouchableOpacity>
        <TouchableOpacity style={s.ghost} onPress={() => router.push('/connect/datenschutz')} activeOpacity={0.7} accessibilityRole="button">
          <Text style={s.ghostTxt}>Zuerst Datenschutz-Einstellungen ansehen</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  content: { paddingHorizontal: 22, paddingTop: 8 },
  badge:   { alignSelf: 'flex-start', backgroundColor: C.accentDim, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  badgeTxt:{ fontSize: 10, color: C.accent, fontWeight: '800', letterSpacing: 1.5 },
  title:   { fontSize: 28, color: C.white, fontWeight: '900', letterSpacing: -0.6, marginTop: 16, lineHeight: 34 },
  sub:     { fontSize: 14.5, color: C.muted, lineHeight: 22, marginTop: 10 },
  points:  { marginTop: 26, gap: 14 },
  point:   { flexDirection: 'row', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  pIcon:   { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  pTitle:  { fontSize: 15, color: C.white, fontWeight: '800' },
  pText:   { fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 18 },
  cta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 16, paddingVertical: 16, marginTop: 30 },
  ctaTxt:  { fontSize: 16, color: C.accentText, fontWeight: '900' },
  ghost:   { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  ghostTxt:{ fontSize: 13, color: C.muted, fontWeight: '700' },
});
