import { C } from '@/constants/colors';
import { HOME_SECTIONS, setHomeSection, useHomeLayout } from '@/stores/homeLayout';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ScrollView, StyleSheet, Switch, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeCustomizeScreen() {
  const router = useRouter();
  const layout = useHomeLayout();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>ERSCHEINUNGSBILD</Text>
          <Text style={s.headerTitle}>Startbildschirm</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.intro}>
          Wähle, welche Abschnitte auf deinem Startbildschirm angezeigt werden.
          Die Begrüßung oben bleibt immer sichtbar.
        </Text>

        <View style={s.karte}>
          {HOME_SECTIONS.map((sec, i) => (
            <View
              key={sec.key}
              style={[s.zeile, i < HOME_SECTIONS.length - 1 && s.zeileTrenner]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.zeileLabel}>{sec.label}</Text>
                <Text style={s.zeileSub}>{sec.beschreibung}</Text>
              </View>
              <Switch
                value={layout[sec.key]}
                onValueChange={(v) => setHomeSection(sec.key, v)}
                trackColor={{ false: C.cardAlt, true: C.accent }}
                thumbColor={C.white}
              />
            </View>
          ))}
        </View>

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

  intro: { fontSize: 14, color: C.muted, lineHeight: 22, marginBottom: 24 },

  karte: {
    backgroundColor: C.card,
    borderRadius:    18,
    borderWidth:     1,
    borderColor:     C.border,
    overflow:        'hidden',
  },
  zeile: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               12,
    paddingHorizontal: 16,
    paddingVertical:   16,
  },
  zeileTrenner: { borderBottomWidth: 1, borderBottomColor: C.border },
  zeileLabel:   { fontSize: 15, color: C.white, fontWeight: '600', marginBottom: 2 },
  zeileSub:     { fontSize: 12, color: C.muted },
});
