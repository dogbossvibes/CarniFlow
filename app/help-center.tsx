import { GuidedTour } from '@/components/help/GuidedTour';
import { HelpSheet } from '@/components/help/HelpSheet';
import { C } from '@/constants/colors';
import {
  HELP_CATEGORY_LABEL,
  HELP_CATEGORY_ORDER,
  topicsByCategory,
  type HelpTopic,
} from '@/features/help/helpRegistry';
import { resetHelpSeen } from '@/stores/helpSeen';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Zentrales Hilfe-Center: „ANYVO kennenlernen" + alle Help-Themen nach
// Kategorie (datengetrieben aus der Registry) + Reset. Kein Handbuch —
// jeder Eintrag öffnet eine kompakte Anleitung.
export default function HelpCenterScreen() {
  const router = useRouter();
  const [topic, setTopic] = useState<HelpTopic | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  const onReset = () => {
    Alert.alert(
      'Alle Hinweise erneut anzeigen',
      'Möchtest du alle Einführungshinweise zurücksetzen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Zurücksetzen', style: 'destructive', onPress: () => resetHelpSeen() },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>HILFE</Text>
          <Text style={s.headerTitle}>Hilfe & ANYVO kennenlernen</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* ── ANYVO KENNENLERNEN ── */}
        <TouchableOpacity
          style={s.tourCard}
          onPress={() => setTourOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="ANYVO kennenlernen, geführter Rundgang"
        >
          <View style={s.tourIcon}>
            <Ionicons name="compass-outline" size={22} color={C.accentText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.tourTitle}>ANYVO kennenlernen</Text>
            <Text style={s.tourSub}>Kurzer geführter Rundgang in 6 Schritten</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.accentText} />
        </TouchableOpacity>

        {/* ── KATEGORIEN ── */}
        {HELP_CATEGORY_ORDER.map((cat) => {
          const topics = topicsByCategory(cat);
          if (topics.length === 0) return null;
          return (
            <View key={cat}>
              <Text style={s.abschnitt}>{HELP_CATEGORY_LABEL[cat].toUpperCase()}</Text>
              <View style={s.karte}>
                {topics.map((tp, i) => (
                  <TouchableOpacity
                    key={tp.id}
                    style={[s.zeile, i < topics.length - 1 && s.trenner]}
                    onPress={() => setTopic(tp)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={tp.title}
                  >
                    <Text style={s.zeileLabel}>{tp.title}</Text>
                    <Ionicons name="chevron-forward" size={16} color={C.subtle} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}

        {/* ── HÄUFIGE FRAGEN (bestehende FAQ) ── */}
        <Text style={s.abschnitt}>MEHR</Text>
        <View style={s.karte}>
          <TouchableOpacity
            style={s.zeile}
            onPress={() => router.push('/help')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Häufige Fragen"
          >
            <Text style={s.zeileLabel}>Häufige Fragen & Support</Text>
            <Ionicons name="chevron-forward" size={16} color={C.subtle} />
          </TouchableOpacity>
        </View>

        {/* ── RESET ── */}
        <TouchableOpacity
          style={s.resetBtn}
          onPress={onReset}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Alle Hinweise erneut anzeigen"
        >
          <Ionicons name="refresh-outline" size={18} color={C.accent} />
          <Text style={s.resetText}>Alle Hinweise erneut anzeigen</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>

      <HelpSheet visible={topic != null} topic={topic} onClose={() => setTopic(null)} showDetails />
      <GuidedTour visible={tourOpen} onClose={() => setTourOpen(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerSub: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  tourCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.accent, borderRadius: 18, padding: 16, marginBottom: 8,
  },
  tourIcon: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  tourTitle: { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: -0.2 },
  tourSub: { fontSize: 13, color: `${C.accentText}b0`, fontWeight: '600', marginTop: 2 },

  abschnitt: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginTop: 24, marginBottom: 10 },
  karte: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  zeile: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 16, minHeight: 56,
  },
  trenner: { borderBottomWidth: 1, borderBottomColor: C.border },
  zeileLabel: { flex: 1, fontSize: 15, color: C.white, fontWeight: '600' },

  resetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 28, paddingVertical: 16, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
  },
  resetText: { fontSize: 15, color: C.accent, fontWeight: '700' },
});
