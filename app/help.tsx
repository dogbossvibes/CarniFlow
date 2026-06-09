import { C } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SUPPORT_EMAIL = 'shadesofym@gmail.com';

// Alte Architektur braucht ein Opt-in für LayoutAnimation auf Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Faq {
  frage:   string;
  antwort: string;
}

const FAQS: Faq[] = [
  {
    frage:   'Wie lege ich einen Hund an?',
    antwort: 'Tippe auf der Startseite oder im Hunde-Bereich auf „+" und fülle Name, Rasse, Geburtsdatum und optional ein Foto aus. Du kannst die Angaben später jederzeit über „Bearbeiten" anpassen.',
  },
  {
    frage:   'Wie erfasse ich eine Trainingseinheit?',
    antwort: 'Über den „+"-Button startest du eine neue Einheit. Wähle den Hund, die Kategorie und füge deine Übungen mit Bewertung, Dauer und Notizen hinzu. Fotos, Videos und Sprachnotizen kannst du direkt anhängen.',
  },
  {
    frage:   'Wie bewerte ich die Leistung meines Hundes?',
    antwort: 'Pro Übung kannst du Metriken wie Motivation, Konzentration, Präzision, Ausdauer, Trieblage und Impulskontrolle bewerten. Diese fließen in deine Fortschrittsanalysen ein.',
  },
  {
    frage:   'Wie verbinde ich mich mit einem Trainer?',
    antwort: 'Unter Profil → Trainer → „Meine Trainer" kannst du eine Verbindung herstellen. Markierst du eine Einheit als „geteilt", sieht deine Trainer:in sie inklusive Übungen, Notizen und Medien und kann sie kommentieren. Du kannst das pro Einheit widerrufen oder die Verbindung jederzeit trennen.',
  },
  {
    frage:   'Wie aktiviere ich Benachrichtigungen?',
    antwort: 'Unter Profil → Konto → „Benachrichtigungen" kannst du sie per Schalter aktivieren. Falls sie vom System blockiert sind, führt dich die App direkt in die Systemeinstellungen, um sie für ANYVO zu erlauben.',
  },
  {
    frage:   'Was bringt mir Premium?',
    antwort: 'Premium schaltet erweiterte Analysen, unbegrenzte Einheiten und den PDF-Export frei. Du kannst es im Profil mit dem 30-Tage-Gratis-Test aktivieren.',
  },
  {
    frage:   'Wie werden meine Daten geschützt?',
    antwort: 'Alle Verbindungen sind TLS-verschlüsselt und der Zugriff ist über Row-Level Security auf dein Konto beschränkt. Details findest du in der Datenschutzerklärung unter Profil → Datenschutz.',
  },
  {
    frage:   'Wie lösche ich mein Konto?',
    antwort: 'Unter Profil → „Konto löschen" entfernst du dein Konto und alle zugehörigen Daten (Hunde, Einheiten, Notizen, Medien) unwiderruflich. Diese Aktion lässt sich nicht rückgängig machen.',
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const [offen, setOffen] = useState<number | null>(null);

  const toggle = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOffen(prev => (prev === i ? null : i));
  };

  const handleKontakt = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('ANYVO Support')}`;
    const ok = await Linking.canOpenURL(url);
    if (ok) {
      Linking.openURL(url);
    } else {
      Alert.alert('Kontakt', `Schreib uns eine E-Mail an:\n${SUPPORT_EMAIL}`);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>SUPPORT</Text>
          <Text style={s.headerTitle}>Hilfecenter</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.intro}>
          Häufige Fragen rund um ANYVO. Findest du keine Antwort, melde dich
          gerne direkt bei uns.
        </Text>

        <Text style={s.abschnitt}>HÄUFIGE FRAGEN</Text>
        <View style={s.faqWrap}>
          {FAQS.map((f, i) => {
            const aktiv = offen === i;
            return (
              <View key={f.frage} style={[s.faqItem, i < FAQS.length - 1 && s.faqTrenner]}>
                <TouchableOpacity
                  style={s.faqKopf}
                  onPress={() => toggle(i)}
                  activeOpacity={0.7}
                >
                  <Text style={s.faqFrage}>{f.frage}</Text>
                  <Ionicons
                    name={aktiv ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={aktiv ? C.accent : C.subtle}
                  />
                </TouchableOpacity>
                {aktiv && <Text style={s.faqAntwort}>{f.antwort}</Text>}
              </View>
            );
          })}
        </View>

        <Text style={s.abschnitt}>NOCH FRAGEN?</Text>
        <TouchableOpacity style={s.kontaktKarte} onPress={handleKontakt} activeOpacity={0.8}>
          <View style={s.kontaktIcon}>
            <Ionicons name="mail-outline" size={20} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.kontaktTitel}>Support kontaktieren</Text>
            <Text style={s.kontaktSub}>{SUPPORT_EMAIL}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.subtle} />
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 20,
    paddingTop:        12,
    paddingBottom:     16,
    gap:               12,
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

  intro: { fontSize: 14, color: C.muted, lineHeight: 22, marginBottom: 28 },

  abschnitt: {
    fontSize:      10,
    color:         C.muted,
    fontWeight:    '700',
    letterSpacing: 1.5,
    marginBottom:  10,
  },

  faqWrap: {
    backgroundColor: C.card,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     C.border,
    overflow:        'hidden',
    marginBottom:    28,
  },
  faqItem:    { paddingHorizontal: 18 },
  faqTrenner: { borderBottomWidth: 1, borderBottomColor: C.border },
  faqKopf: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingVertical: 16,
  },
  faqFrage:   { flex: 1, fontSize: 14, color: C.white, fontWeight: '600', lineHeight: 20 },
  faqAntwort: {
    fontSize:   13,
    color:      'rgba(255,255,255,0.6)',
    lineHeight: 21,
    paddingBottom: 16,
    paddingRight:  4,
  },

  kontaktKarte: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             14,
    backgroundColor: C.card,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         16,
  },
  kontaktIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: C.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  kontaktTitel: { fontSize: 15, color: C.white, fontWeight: '700', marginBottom: 2 },
  kontaktSub:   { fontSize: 13, color: C.muted },
});
