import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useDogs } from '@/hooks/useDogs';
import { DISCIPLINES, customToDiscipline, type Discipline } from '@/constants/disciplines';
import { HeroImage } from '@/components/training/HeroImage';
import { DisciplineCard } from '@/components/training/DisciplineCard';
import { useActiveTraining } from '@/stores/activeTraining';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { tapHaptic } from '@/lib/haptics';

export default function UnitStartScreen() {
  const router = useRouter();
  const { dogs } = useDogs();
  const active = useActiveTraining();
  const { categories, refresh } = useCustomCategories();

  // Eigene Kategorien aktualisieren, wenn man vom Anlegen zurückkehrt.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const addMode = !!active.unitId;
  const [selectedDogId, setSelectedDogId] = useState<string | null>(
    addMode ? active.dogId : dogs.length === 1 ? dogs[0].id : null,
  );

  const fixed   = DISCIPLINES.filter(d => !d.custom);
  const creator = DISCIPLINES.find(d => d.custom)!;
  const cards   = [...fixed, ...categories.map(customToDiscipline)];

  const handleDiscipline = (disc: Discipline) => {
    const dogId   = addMode ? active.dogId : selectedDogId;
    const dogName = addMode ? active.dogName : dogs.find(d => d.id === dogId)?.name ?? null;
    if (!dogId) {
      Alert.alert('Hund wählen', 'Bitte wähle zuerst einen Hund für diese Einheit.');
      return;
    }
    if (disc.exercises.length === 0) {
      Alert.alert('Keine Übungen', 'Diese Kategorie hat noch keine Übungen.');
      return;
    }
    router.push({
      pathname: '/unit/[discipline]',
      params: {
        discipline: disc.key, dogId, dogName: dogName ?? '',
        label: disc.label, accent: disc.accent, icon: String(disc.icon),
        exercises: JSON.stringify(disc.exercises),
      },
    });
  };

  return (
    <View style={s.root}>
      <HeroImage height={300} overlay={0.92}>
        <SafeAreaView edges={['top']} style={s.heroSafe}>
          <View style={s.topRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={22} color={C.white} />
            </TouchableOpacity>
            {!addMode && (
              <TouchableOpacity style={s.backBtn} onPress={() => router.push('/unit/history')} activeOpacity={0.7}>
                <Ionicons name="time-outline" size={20} color={C.white} />
              </TouchableOpacity>
            )}
          </View>
          <View style={s.heroText}>
            <Text style={s.eyebrow}>ANYVO</Text>
            <Text style={s.heroTitle}>{addMode ? 'Übung hinzufügen' : 'Heute trainieren'}</Text>
            <Text style={s.heroSub}>
              {addMode ? 'Wähle eine weitere Sparte für die laufende Einheit.' : 'Wähle eine Sparte und leg los.'}
            </Text>
          </View>
        </SafeAreaView>
      </HeroImage>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Hundauswahl bzw. fixierter Hund */}
        {addMode ? (
          <View style={s.lockedDog}>
            <Ionicons name="paw" size={14} color={C.accent} />
            <Text style={s.lockedDogTxt}>{active.dogName ?? 'Hund'}</Text>
          </View>
        ) : (
          <>
            <Text style={s.label}>HUND</Text>
            {dogs.length === 0 ? (
              <View style={s.emptyBox}><Text style={s.emptyTxt}>Zuerst einen Hund anlegen</Text></View>
            ) : (
              <View style={s.dogRow}>
                {dogs.map(d => {
                  const aktiv = selectedDogId === d.id;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[s.dogChip, aktiv && s.dogChipActive]}
                      onPress={() => { tapHaptic(); setSelectedDogId(d.id); }}
                      activeOpacity={0.8}
                    >
                      {aktiv && <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />}
                      <Ionicons name="paw" size={13} color={aktiv ? C.accentText : C.muted} />
                      <Text style={[s.dogChipTxt, aktiv && s.dogChipTxtActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}

        <Text style={s.label}>SPARTE</Text>
        <View style={s.cards}>
          {cards.map(d => {
            const customId = d.key.startsWith('custom:') ? d.key.slice('custom:'.length) : null;
            return (
              <DisciplineCard
                key={d.key}
                discipline={d}
                onPress={() => handleDiscipline(d)}
                onEdit={customId ? () => router.push({ pathname: '/unit/new-category', params: { id: customId } }) : undefined}
              />
            );
          })}
          {/* Eigene Kategorie anlegen */}
          {!addMode && (
            <DisciplineCard discipline={creator} onPress={() => router.push('/unit/new-category')} />
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.bg },
  heroSafe: { flex: 1, paddingHorizontal: 20, justifyContent: 'space-between', paddingBottom: 20 },
  topRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn:  { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  heroText: { gap: 4 },
  eyebrow:  { fontSize: 10, color: C.accent, fontWeight: '800', letterSpacing: 3 },
  heroTitle:{ fontSize: 30, color: C.white, fontWeight: '900', letterSpacing: -0.6 },
  heroSub:  { fontSize: 14, color: '#CFCFCF', fontWeight: '500', maxWidth: '90%' },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8 },

  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 18 },

  lockedDog:    { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.accent, paddingHorizontal: 14, paddingVertical: 8, marginTop: 8 },
  lockedDogTxt: { fontSize: 13, color: C.white, fontWeight: '700' },

  emptyBox: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, alignItems: 'center' },
  emptyTxt: { fontSize: 13, color: C.subtle },

  dogRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dogChip:  { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden' },
  dogChipActive:    { borderColor: C.accent },
  dogChipTxt:       { fontSize: 13, color: C.muted, fontWeight: '600' },
  dogChipTxtActive: { color: C.accentText, fontWeight: '700' },

  cards: { gap: 12 },
});
