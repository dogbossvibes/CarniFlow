import { C } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const UPDATED = '29. Mai 2026';

interface Section {
  title: string;
  body:  string;
}

const SECTIONS: Section[] = [
  {
    title: '1. Verantwortliche Stelle',
    body:  'ANYVO\nE-Mail: support@anyvo.app\n\nDiese Datenschutzerklärung gilt für die ANYVO-App (iOS und Android).',
  },
  {
    title: '2. Welche Daten wir erheben',
    body:  '• Konto: E-Mail-Adresse, optionaler Anzeigename\n• Hunde: Name, Rasse, Geburtsdatum, Gewicht, Geschlecht, Foto\n• Trainingseinheiten: Datum, Kategorie, Typ, Trainer, Dauer, Bewertung, Notizen, Fotos, Videos, Sprachnotizen\n• Leistungsmetriken: Motivation, Konzentration, Präzision, Ausdauer, Trieblage, Impulskontrolle\n• Standort & Wetter: Stadt/Region und Temperatur werden beim Anlegen einer Einheit automatisch ermittelt (nur wenn du die Berechtigung erteilst)\n• Push-Token: ein Gerätekennzeichen für Benachrichtigungen (nur wenn du Mitteilungen erlaubst)\n\nWir erheben KEINE Tracking- oder Werbedaten und nutzen keine Analyse-SDKs.',
  },
  {
    title: '3. Zweck der Verarbeitung',
    body:  '• Bereitstellung der Trainings-Tracking-Funktionen\n• KI-gestützte Analyse deiner Trainingsfortschritte (Claude, Anthropic)\n• Trainer-Betreuung: Wenn du eine Einheit als „geteilt" markierst, kann deine verbundene Trainer:in sie inkl. Übungen, Notizen, Medien und Hundenamen einsehen und kommentieren. Pro Einheit widerrufbar; Verbindung jederzeit trennbar.\n• Kommunikation bei Support-Anfragen',
  },
  {
    title: '4. Drittanbieter',
    body:  'Supabase (Supabase Inc., USA) — Authentifizierung, Datenbank, Dateispeicher. Deine Daten werden verschlüsselt übertragen und auf Servern in der EU gespeichert.\n\nAnthropic (USA) — KI-Analyse. Beim Starten einer KI-Analyse werden Trainingsdaten der letzten Einheiten übermittelt: Metriken, Bewertungen, Dauer sowie Notizen, Übungstitel und Hundename. Es werden keine Kontodaten (E-Mail) übertragen.\n\nOpen-Meteo (Schweiz) — kostenloser Wetterdienst ohne API-Schlüssel. Es werden nur GPS-Koordinaten übermittelt; keine personenbezogenen Daten.',
  },
  {
    title: '5. Datenspeicherung',
    body:  'Deine Daten werden so lange gespeichert, wie dein Konto aktiv ist. Du kannst dein Konto und alle zugehörigen Daten jederzeit dauerhaft löschen (Einstellungen → Konto löschen).',
  },
  {
    title: '6. Deine Rechte',
    body:  'Du hast das Recht auf:\n• Auskunft über gespeicherte Daten\n• Berichtigung unrichtiger Daten\n• Löschung deiner Daten (direkt in der App möglich)\n• Einschränkung der Verarbeitung\n• Datenportabilität\n\nFür Anfragen wende dich an: support@anyvo.app',
  },
  {
    title: '7. Datensicherheit',
    body:  'Alle Verbindungen sind TLS-verschlüsselt. Passwörter werden niemals im Klartext gespeichert. Der Zugriff auf Daten ist durch Row-Level Security (RLS) auf deinen Account beschränkt.',
  },
  {
    title: '8. Kinder',
    body:  'ANYVO richtet sich nicht an Kinder unter 16 Jahren. Wir erheben wissentlich keine Daten von Minderjährigen.',
  },
  {
    title: '9. Änderungen',
    body:  'Wesentliche Änderungen dieser Erklärung werden in der App angekündigt. Das Datum der letzten Aktualisierung steht oben auf dieser Seite.',
  },
  {
    title: '10. Kontakt',
    body:  'Fragen zum Datenschutz:\nsupport@anyvo.app',
  },
];

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>LEGAL</Text>
          <Text style={s.headerTitle}>Datenschutz</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.updated}>Zuletzt aktualisiert: {UPDATED}</Text>
        <Text style={s.intro}>
          Diese Datenschutzerklärung beschreibt, wie ANYVO deine Daten erhebt,
          verwendet und schützt.
        </Text>

        {SECTIONS.map(sec => (
          <View key={sec.title} style={s.section}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            <Text style={s.sectionBody}>{sec.body}</Text>
          </View>
        ))}

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
});
