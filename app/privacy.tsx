import { C } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Linking, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const UPDATED = '24. Juni 2026';

// Verantwortliche Stelle (revDSG: Identität der verantwortlichen Person).
const CONTROLLER_NAME    = 'Sandra Müller (ANYVO)';
const CONTROLLER_ADDRESS = 'Heid 196A, 3159 Riedstätt, Schweiz';
const CONTACT_EMAIL      = 'shadesofym@gmail.com';

interface Section {
  title: string;
  body:  string;
}

const SECTIONS: Section[] = [
  {
    title: '1. Verantwortliche Stelle',
    body:  `${CONTROLLER_NAME}\n${CONTROLLER_ADDRESS}\nE-Mail: ${CONTACT_EMAIL}\n\nDiese Datenschutzerklärung gilt für die ANYVO-App (iOS und Android). Sie richtet sich nach dem revidierten Schweizer Datenschutzgesetz (revDSG). Für Nutzer:innen in der EU/im EWR gilt zusätzlich die DSGVO.`,
  },
  {
    title: '2. Welche Daten wir verarbeiten',
    body:  '• Konto: E-Mail-Adresse, optionaler Anzeigename, bei Apple-Anmeldung die von Apple übermittelte Kennung\n• Hunde: Name, Rasse, Geschlecht, Geburtsdatum, Gewicht, Farbe, Sparte/Stufe/Bestwert, Mikrochip-Nr., Tasso-Registrierung, Tierarzt, Impfung, Futter, Foto, Abstammung\n• Trainingseinheiten: Datum, Kategorie, Typ, Trainer, Dauer, Bewertung, Notizen, Fotos, Videos, Sprachnotizen (Audio)\n• Leistungsmetriken: z. B. Motivation, Konzentration, Präzision, Ausdauer, Trieblage, Impulskontrolle\n• Präziser Standort & Fährten: Während einer aktiven Fährten-/Streckenaufnahme werden exakte GPS-Wegpunkte, Marker und die zurückgelegte Route erfasst und gespeichert (nur mit deiner Standort-Berechtigung; Erfassung auch kurz im Hintergrund während laufender Aufnahme)\n• Wetter: zur Position werden Temperatur, Wind und Luftfeuchte abgerufen\n• Mitteilungen: Push-Token (Gerätekennzeichen), nur wenn du Mitteilungen erlaubst\n• Abo/Käufe: Kauf- und Abo-Status (über RevenueCat)\n• Absturz-/Fehlerberichte: technische Diagnosedaten zur Fehlerbehebung (standardmässig aktiv, im Profil jederzeit deaktivierbar)\n\nWir nutzen KEINE Werbe-Tracking- oder Profiling-SDKs zu Werbezwecken.',
  },
  {
    title: '3. Zwecke und Rechtsgrundlagen',
    body:  '• Bereitstellung der App- und Tracking-Funktionen — zur Vertragserfüllung\n• Standorterfassung, Mitteilungen, Mikrofon/Sprachnotizen, geteilte Einheiten — auf Grundlage deiner Einwilligung (jederzeit widerrufbar)\n• KI-gestützte Analyse/Coaching und Sprachnotiz-Transkription — zur Vertragserfüllung bzw. auf deine Veranlassung\n• Stabilität und Sicherheit (Absturzberichte) — berechtigtes Interesse\n• Trainer-Betreuung: Markierst du eine Einheit als „geteilt", kann deine verbundene Trainer:in sie inkl. Übungen, Notizen, Medien und Hundenamen einsehen und kommentieren. Pro Einheit widerrufbar; Verbindung jederzeit trennbar.',
  },
  {
    title: '4. Drittanbieter / Auftragsbearbeiter',
    body:  '• Supabase (Supabase Inc., USA) — Authentifizierung, Datenbank, Dateispeicher (Fotos, Videos, Sprachnotizen). Übertragung verschlüsselt; Speicherung in der EU (Region Irland).\n• Anthropic (USA) — KI-Coaching/-Analyse. Übermittelt werden Trainingsdaten (Metriken, Bewertungen, Dauer, Notizen, Übungstitel, Hundename), keine E-Mail-Adresse.\n• OpenAI (USA) — Transkription von Sprachnotizen (das Audio wird zur Umwandlung in Text übermittelt). Über die API werden die Inhalte nicht zum Training der Modelle verwendet.\n• Open-Meteo (Deutschland/EU) — Wetterdienst ohne API-Schlüssel; übermittelt werden nur GPS-Koordinaten.\n• RevenueCat (USA) — Abwicklung/Verwaltung von Abos und Käufen.\n• Sentry (Functional Software Inc., USA; Datenspeicherung in der EU/Deutschland) — Absturz-/Fehlerdiagnose; in der App deaktivierbar.\n• Apple — Anmeldung mit Apple, Push (APNs), Kaufabwicklung im App Store. Google (FCM) für Push auf Android.\n• Expo (USA) — Zustellung von Push-Mitteilungen (Push-Token).',
  },
  {
    title: '5. Bekanntgabe ins Ausland',
    body:  'Einige Anbieter (u. a. Supabase, Anthropic, OpenAI, RevenueCat, Apple) sind in den USA ansässig oder können Daten dort verarbeiten (Sentry verarbeitet die Diagnosedaten in der EU/Deutschland, das Unternehmen sitzt jedoch in den USA). Die Übermittlung erfolgt auf Basis geeigneter Garantien (EU-Standardvertragsklauseln bzw. Swiss-/EU-US Data Privacy Framework). Auf Wunsch stellen wir Informationen zu den Garantien bereit.',
  },
  {
    title: '6. Standort & Fährten',
    body:  'Die präzise Standorterfassung erfolgt nur, wenn du die Berechtigung erteilst, und nur während einer aktiven Aufnahme. Dabei werden GPS-Wegpunkte und Marker gespeichert, um die Strecke darzustellen und auszuwerten. Du kannst die Berechtigung jederzeit in den Geräteeinstellungen widerrufen; einzelne Aufnahmen lassen sich in der App löschen.',
  },
  {
    title: '7. Speicherdauer & lokale Daten',
    body:  'Deine Daten werden gespeichert, solange dein Konto aktiv ist. Für die Offline-Nutzung legt die App eine lokale Kopie (u. a. Trainings-/Streckendaten) verschlüsselt auf deinem Gerät ab; Fotos/Videos/Sprachnotizen liegen vor dem Hochladen kurz lokal vor. Beim Löschen eines Hundes oder des Kontos werden die zugehörigen Daten entfernt.',
  },
  {
    title: '8. Deine Rechte',
    body:  'Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenherausgabe/-portabilität sowie Widerruf erteilter Einwilligungen. In der App kannst du einzelne Hunde löschen sowie dein Konto inkl. aller Daten dauerhaft entfernen (Profil → „Konto löschen"). Beschwerden kannst du an die zuständige Aufsichtsbehörde richten — in der Schweiz an den EDÖB, in der EU an deine Datenschutzbehörde.\n\nKontakt für Anfragen: ' + CONTACT_EMAIL,
  },
  {
    title: '9. Datensicherheit',
    body:  'Alle Verbindungen sind TLS-verschlüsselt. Passwörter werden niemals im Klartext gespeichert. Der Zugriff auf Daten ist serverseitig durch Row-Level Security (RLS) auf dein Konto beschränkt.',
  },
  {
    title: '10. Kinder',
    body:  'ANYVO richtet sich nicht an Kinder unter 16 Jahren. Wir erheben wissentlich keine Daten von Minderjährigen.',
  },
  {
    title: '11. Änderungen & Kontakt',
    body:  'Wesentliche Änderungen dieser Erklärung kündigen wir in der App an; das Datum oben zeigt die letzte Aktualisierung. Fragen zum Datenschutz: ' + CONTACT_EMAIL,
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

        <TouchableOpacity style={s.webLink} onPress={() => Linking.openURL('https://anyvo.app/datenschutz')} activeOpacity={0.7}>
          <Ionicons name="globe-outline" size={15} color={C.accent} />
          <Text style={s.webLinkText}>Im Web ansehen: anyvo.app/datenschutz</Text>
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
