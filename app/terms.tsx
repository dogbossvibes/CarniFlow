import { C } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Linking, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Nutzungsbedingungen / AGB für ANYVO. Vorlage nach Code-Faktenlage (Schweizer
// Recht, App-Store-Abos). HINWEIS: vor Veröffentlichung anwaltlich prüfen lassen.
const UPDATED = '24. Juni 2026';

const PROVIDER = 'Sandra Müller (ANYVO), Heid 196A, 3159 Riedstätt, Schweiz';
const CONTACT  = 'shadesofym@gmail.com';

interface Section { title: string; body: string }

const SECTIONS: Section[] = [
  {
    title: '1. Geltungsbereich & Anbieter',
    body:  `Diese Nutzungsbedingungen regeln die Nutzung der ANYVO-App (iOS und Android). Anbieter:\n${PROVIDER}\nE-Mail: ${CONTACT}\n\nMit der Registrierung oder Nutzung der App akzeptierst du diese Bedingungen.`,
  },
  {
    title: '2. Leistung',
    body:  'ANYVO ist eine App zur Dokumentation und Auswertung von Hundetraining (u. a. Trainingseinheiten, Fährten-/Streckenaufnahme per GPS, Medien, Notizen) sowie optionale KI-gestützte Auswertung. Funktionsumfang und Verfügbarkeit können sich weiterentwickeln. Die App ersetzt keine tierärztliche oder professionelle Beratung.',
  },
  {
    title: '3. Konto',
    body:  'Für die Nutzung ist ein Konto erforderlich. Du bist für die Richtigkeit deiner Angaben und die Geheimhaltung deiner Zugangsdaten verantwortlich. Das Mindestalter beträgt 16 Jahre. Du kannst dein Konto jederzeit in der App löschen (Profil → „Konto löschen").',
  },
  {
    title: '4. Abonnements & Käufe',
    body:  'Kostenpflichtige Funktionen werden als Abonnement oder Einmalkauf über den Apple App Store bzw. Google Play angeboten. Abrechnung, automatische Verlängerung und Kündigung erfolgen über dein Store-Konto gemäss dessen Bedingungen; die Kündigung ist dort jederzeit möglich. Es gelten die zum Kaufzeitpunkt angezeigten Preise. Für digitale Inhalte kann das gesetzliche Widerrufsrecht erlöschen, sobald die Leistung mit deiner Zustimmung beginnt.',
  },
  {
    title: '5. Zulässige Nutzung',
    body:  'Du verpflichtest dich, die App nicht missbräuchlich oder rechtswidrig zu nutzen, keine fremden Rechte zu verletzen und keine schädlichen Inhalte hochzuladen. Wir können Konten bei erheblichen Verstössen sperren.',
  },
  {
    title: '6. Deine Inhalte',
    body:  'Die Rechte an deinen Inhalten (Fotos, Videos, Notizen, Sprachnotizen, Trainingsdaten) verbleiben bei dir. Du räumst uns das einfache Recht ein, diese Inhalte ausschliesslich zum Betrieb der App zu speichern und zu verarbeiten. Markierst du eine Einheit als „geteilt", machst du sie für deine verbundene Trainer:in zugänglich.',
  },
  {
    title: '7. KI-Funktionen',
    body:  'KI-gestützte Auswertungen und die Transkription von Sprachnotizen werden über externe Dienste erbracht und können fehlerhaft oder unvollständig sein. Sie stellen keine fachliche Empfehlung dar; Entscheidungen zum Training oder zur Gesundheit deines Hundes triffst du eigenverantwortlich.',
  },
  {
    title: '8. Haftung',
    body:  'Soweit gesetzlich zulässig, haften wir nicht für leichte Fahrlässigkeit. Unberührt bleibt die Haftung für Vorsatz, grobe Fahrlässigkeit sowie für Personenschäden. Zwingende Verbraucherschutzrechte bleiben unberührt. Für Trainingsentscheidungen und deren Folgen übernehmen wir keine Haftung.',
  },
  {
    title: '9. Verfügbarkeit & Änderungen',
    body:  'Wir bemühen uns um eine möglichst unterbrechungsfreie Verfügbarkeit, schulden diese aber nicht zu 100 %. Wir dürfen die App weiterentwickeln, Funktionen ändern oder einstellen. Wesentliche Änderungen dieser Bedingungen kündigen wir in der App an.',
  },
  {
    title: '10. Anwendbares Recht & Gerichtsstand',
    body:  'Es gilt schweizerisches Recht unter Ausschluss der Kollisionsnormen. Gerichtsstand ist – soweit zulässig – der Sitz des Anbieters. Für Verbraucher:innen in der EU/im EWR bleiben die zwingenden Schutzvorschriften und der Gerichtsstand ihres Wohnsitzlandes unberührt.',
  },
  {
    title: '11. Kontakt',
    body:  `Fragen zu diesen Bedingungen:\n${CONTACT}`,
  },
];

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>LEGAL</Text>
          <Text style={s.headerTitle}>Nutzungsbedingungen</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.updated}>Zuletzt aktualisiert: {UPDATED}</Text>
        <Text style={s.intro}>
          Diese Nutzungsbedingungen (AGB) regeln die Nutzung der ANYVO-App.
        </Text>

        {SECTIONS.map(sec => (
          <View key={sec.title} style={s.section}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            <Text style={s.sectionBody}>{sec.body}</Text>
          </View>
        ))}

        <TouchableOpacity style={s.webLink} onPress={() => Linking.openURL('https://anyvo.app/agb')} activeOpacity={0.7}>
          <Ionicons name="globe-outline" size={15} color={C.accent} />
          <Text style={s.webLinkText}>Im Web ansehen: anyvo.app/agb</Text>
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
