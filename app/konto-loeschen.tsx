import { C } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Linking, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const UPDATED = '2. Juli 2026';

const CONTACT_EMAIL = 'shadesofym@gmail.com';

interface Section { title: string; body: string }

const SECTIONS: Section[] = [
  {
    title: '1. In der App löschen',
    body:  'Du kannst dein Konto jederzeit selbst und dauerhaft löschen:\n\n1. Öffne die ANYVO-App\n2. Gehe auf den Tab „Profil"\n3. Scrolle nach unten und tippe auf „Konto löschen"\n4. Bestätige die Sicherheitsabfrage\n\nDein Konto und alle zugehörigen Daten werden sofort und unwiderruflich entfernt.',
  },
  {
    title: '2. Was gelöscht wird',
    body:  '• Dein Konto (E-Mail-Adresse, Anmeldedaten, Anzeigename)\n• Alle Hunde-Profile (Name, Rasse, Geburtsdatum, Gewicht, Abstammung, Fotos)\n• Alle Trainingseinheiten inkl. Bewertungen, Notizen, Fotos, Videos und Sprachnotizen\n• Fährten-/GPS-Aufzeichnungen, Routen und Marker\n• Leistungsmetriken und Auswertungen\n• Die Verknüpfung deines Abos/Kaufstatus\n\nDie Löschung ist endgültig und kann nicht rückgängig gemacht werden.',
  },
  {
    title: '3. Speicherdauer nach der Löschung',
    body:  'Mit deiner Bestätigung werden die Daten sofort aus der aktiven Datenbank entfernt. Kurzfristige, verschlüsselte Sicherungskopien werden innerhalb von 30 Tagen automatisch überschrieben. Danach sind keine Daten mehr vorhanden.',
  },
  {
    title: '4. Abo separat kündigen',
    body:  'Ein laufendes Abonnement wird über deinen Google-Play- bzw. App-Store-Account verwaltet und läuft mit der Konto-Löschung NICHT automatisch aus. Bitte kündige ein aktives Abo zusätzlich in den Einstellungen deines Stores.',
  },
  {
    title: '5. Kein Zugriff mehr auf die App?',
    body:  `Wenn du dich nicht mehr anmelden kannst, sende uns eine E-Mail von deiner bei ANYVO registrierten Adresse an ${CONTACT_EMAIL} mit dem Betreff „Konto löschen". Nach Verifizierung löschen wir dein Konto und alle Daten innerhalb von 30 Tagen.`,
  },
  {
    title: '6. Kontakt',
    body:  `ANYVO · dog.boss.vibes\nE-Mail: ${CONTACT_EMAIL}`,
  },
];

export default function KontoLoeschenScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>KONTO</Text>
          <Text style={s.headerTitle}>Konto löschen</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.updated}>Zuletzt aktualisiert: {UPDATED}</Text>
        <Text style={s.intro}>
          Hier erfährst du, wie du dein ANYVO-Konto und alle zugehörigen Daten
          dauerhaft löschst.
        </Text>

        {SECTIONS.map(sec => (
          <View key={sec.title} style={s.section}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            <Text style={s.sectionBody}>{sec.body}</Text>
          </View>
        ))}

        <TouchableOpacity style={s.webLink} onPress={() => Linking.openURL('https://anyvo.app/konto-loeschen')} activeOpacity={0.7}>
          <Ionicons name="globe-outline" size={15} color={C.accent} />
          <Text style={s.webLinkText}>Im Web ansehen: anyvo.app/konto-loeschen</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 20,
    paddingTop:      12,
    paddingBottom:   16,
    gap:             12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerSub:   { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  updated: { fontSize: 11, color: C.subtle, marginBottom: 16, fontWeight: '600' },
  intro:   { fontSize: 14, color: C.muted, lineHeight: 22, marginBottom: 28 },

  section: {
    backgroundColor: C.card,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         18,
    marginBottom:    12,
  },
  sectionTitle: {
    fontSize:     12,
    color:        C.accent,
    fontWeight:   '800',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  sectionBody: {
    fontSize:  13,
    color:     'rgba(255,255,255,0.65)',
    lineHeight: 21,
  },
  webLink:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, marginTop: 4 },
  webLinkText: { fontSize: 13, color: C.accent, fontWeight: '700' },
});
