import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { tapHaptic, successHaptic } from '@/lib/haptics';
import { addCommand, type CommandCategory } from '@/features/dogs/dogCommands';

const SPORT = C.trackPrimary;   // Mint
const PRIVAT = C.trackPurple;   // Violett

// Häufige Kommandos je Kategorie (Sport / Alltag) für schnelles Hinzufügen.
const PRESETS: Record<CommandCategory, string[]> = {
  sport:   ['Sitz', 'Platz', 'Steh', 'Bleib', 'Hier', 'Fuss', 'Voraus', 'Zurück', 'Apport', 'Bring', 'Aus', 'Stopp'],
  private: ['Hier', 'Sitz', 'Platz', 'Bleib', 'Aus', 'Nein', 'Warte', 'Komm', 'Pass auf', 'Lass es', 'Tür', 'Auto'],
};

// Schneller Kommando-Picker: Kategorie + Vorlage antippen = sofort angelegt.
// „Eigenes Kommando" öffnet das ausführliche Formular. Details lassen sich später
// je Kommando bearbeiten — so bleibt das Hinzufügen kurz und übersichtlich.
export default function DogCommandAdd() {
  const router = useRouter();
  const { t } = useT();
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const [category, setCategory] = useState<CommandCategory>('sport');
  const [added, setAdded] = useState<Record<string, true>>({});   // "cat:name" → schon hinzugefügt

  const col = category === 'sport' ? SPORT : PRIVAT;
  const keyOf = (name: string) => `${category}:${name}`;

  const quickAdd = async (name: string) => {
    if (!dogId || added[keyOf(name)]) return;
    tapHaptic();
    setAdded(a => ({ ...a, [keyOf(name)]: true }));
    await addCommand(dogId, {
      name, category, area: null, verbalCue: name, handSignal: null, goal: null, description: null,
      steps: [], tips: [], commonMistakes: [], difficulty: 'easy', isFavorite: false,
    });
    successHaptic();
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity>
          <Text style={s.barTitle}>{t('commands.add')}</Text>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}><Text style={[s.done, { color: col }]}>{t('common.done')}</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Kategorie-Umschalter */}
          <View style={s.seg}>
            {(['sport', 'private'] as CommandCategory[]).map(cat => {
              const on = category === cat; const c = cat === 'sport' ? SPORT : PRIVAT;
              return (
                <TouchableOpacity key={cat} style={[s.segBtn, on && { backgroundColor: c }]} onPress={() => setCategory(cat)} activeOpacity={0.9}>
                  <Ionicons name={cat === 'sport' ? 'trophy' : 'home'} size={15} color={on ? '#04201b' : C.trackTextSec} />
                  <Text style={[s.segTxt, on && s.segTxtOn]}>{cat === 'sport' ? 'Hundesport' : 'Alltag / Privat'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.hint}>Tippe ein Kommando an, um es hinzuzufügen. Feinschliff (Handsignal, Ziel, Schritte) machst du danach direkt im Kommando.</Text>

          {/* Vorlagen-Grid */}
          <View style={s.grid}>
            {PRESETS[category].map(name => {
              const on = !!added[keyOf(name)];
              return (
                <TouchableOpacity key={name} style={[s.tile, on && { borderColor: col, backgroundColor: `${col}1E` }]} onPress={() => quickAdd(name)} activeOpacity={0.85} disabled={on}>
                  <Ionicons name={on ? 'checkmark-circle' : 'add-circle-outline'} size={16} color={on ? col : C.trackTextMut} />
                  <Text style={[s.tileTxt, on && { color: C.trackText }]}>{name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Eigenes Kommando → volles Formular */}
          <TouchableOpacity style={s.custom} activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/dog-command/edit', params: { dogId } } as never)}>
            <View style={s.customIcon}><Ionicons name="create-outline" size={18} color={col} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.customTitle}>{t('cmd.createOwn')}</Text>
              <Text style={s.customSub}>Mit allen Details: Signal, Handsignal, Ziel, Schritte …</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.trackBg },
  bar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn:   { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  barTitle:  { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  done:      { fontSize: 15, fontWeight: '800' },
  scroll:    { padding: 16, gap: 14 },
  seg:       { flexDirection: 'row', gap: 6, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, padding: 4 },
  segBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 11, paddingVertical: 11 },
  segTxt:    { fontSize: 13.5, color: C.trackTextSec, fontWeight: '700' },
  segTxtOn:  { color: '#04201b', fontWeight: '800' },
  hint:      { fontSize: 12.5, color: C.trackTextMut, lineHeight: 17 },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile:      { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: '30%', flexGrow: 1, justifyContent: 'center', backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 14, paddingHorizontal: 10 },
  tileTxt:   { fontSize: 14.5, color: C.trackTextSec, fontWeight: '700' },
  custom:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, borderStyle: 'dashed', padding: 14, marginTop: 4 },
  customIcon:{ width: 40, height: 40, borderRadius: 13, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  customTitle:{ fontSize: 15, color: C.trackText, fontWeight: '800' },
  customSub: { fontSize: 12, color: C.trackTextSec, marginTop: 2 },
});
