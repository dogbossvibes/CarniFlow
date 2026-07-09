import { C } from '@/constants/colors';
import { LOCALES, useT, type Locale, type TranslationKey } from '@/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Sprach-Name je Locale übersetzt anzeigen (z. B. „Schwiizerdütsch" im gsw-Modus).
const NAME_KEY: Record<Locale, TranslationKey> = {
  'de-CH':  'language.optDeCH',
  'gsw-CH': 'language.optGswCH',
  'de-DE':  'language.optDeDE',
};

// Sprach-Auswahl. Der Screen selbst nutzt bereits i18n und aktualisiert sich
// beim Umschalten sofort (reaktiver Store). Auswahl wird lokal (AsyncStorage)
// gespeichert; Standard bleibt Deutsch Schweiz.
export default function LanguageScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useT();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>ANYVO</Text>
          <Text style={s.headerTitle}>{t('language.title')}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.intro}>{t('language.subtitle')}</Text>

        <View style={s.karte}>
          {LOCALES.map((opt, i) => {
            const active = opt.code === locale;
            return (
              <TouchableOpacity
                key={opt.code}
                style={[s.zeile, i < LOCALES.length - 1 && s.zeileTrenner]}
                onPress={() => setLocale(opt.code)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.zeileLabel}>{t(NAME_KEY[opt.code])}</Text>
                  <Text style={s.zeileSub}>{opt.hint}</Text>
                </View>
                {active
                  ? <Ionicons name="checkmark-circle" size={22} color={C.accent} />
                  : <View style={s.radio} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={s.note}>{t('language.note')}</Text>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  intro:   { fontSize: 14, color: C.muted, lineHeight: 22, marginBottom: 24 },

  karte:   { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  zeile:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  zeileTrenner: { borderBottomWidth: 1, borderBottomColor: C.border },
  zeileLabel:   { fontSize: 15, color: C.white, fontWeight: '600', marginBottom: 2 },
  zeileSub:     { fontSize: 12, color: C.muted },
  radio:   { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.border },

  note:    { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 16, paddingHorizontal: 4 },
});
