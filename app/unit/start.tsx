import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import { DISCIPLINES, customToDiscipline, type Discipline } from '@/constants/disciplines';
import { DEFAULT_SPARTEN } from '@/constants/sparten';
import { HelpButton } from '@/components/help/HelpButton';
import { HeroImage } from '@/components/training/HeroImage';
import { DisciplineGridCard } from '@/components/training/DisciplineGridCard';
import { useActiveTraining, startUnit, addExercise } from '@/stores/activeTraining';
import { createTrainingUnit } from '@/services/trainingUnitService';
import { DogIcon } from '@/components/ui/DogIcon';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { tapHaptic } from '@/lib/haptics';
import { useT } from '@/i18n';

export default function UnitStartScreen() {
  const router = useRouter();
  const { t } = useT();
  const { dogs, loading: dogsLoading } = useDogs();
  const { session } = useSession();
  const { profile } = useProfile();
  const active = useActiveTraining();
  const { categories, refresh } = useCustomCategories();
  const creating = useRef(false);

  // Eigene Kategorien aktualisieren, wenn man vom Anlegen zurückkehrt.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const addMode = !!active.unitId;
  const [selectedDogId, setSelectedDogId] = useState<string | null>(
    addMode ? active.dogId : dogs.length === 1 ? dogs[0].id : null,
  );
  const [dogPickerOpen, setDogPickerOpen] = useState(false);   // nur UI-Disclosure; Auswahllogik unverändert

  // useDogs lädt asynchron: Genau einen Hund erst nach abgeschlossenem Load
  // übernehmen. Ohne Auswahlfeld gibt es sonst keinen Weg, die für den Start
  // benötigte dogId zu setzen.
  useEffect(() => {
    if (!addMode && !dogsLoading && !selectedDogId && dogs.length === 1) setSelectedDogId(dogs[0].id);
  }, [addMode, dogsLoading, dogs, selectedDogId]);

  // Feste Sparten nach den im Profil aktivierten filtern. Fallback = Standard-
  // Sparten (nicht „alle"), damit Opt-in-Sparten wie Obedience für neue Nutzer
  // ohne gesetzte aktive_sparten NICHT vorab erscheinen.
  const aktiveSparten = profile?.aktive_sparten ?? DEFAULT_SPARTEN;
  const fixed   = DISCIPLINES.filter(d => !d.custom && aktiveSparten.includes(d.label));
  const cards   = [...fixed, ...categories.map(customToDiscipline)];
  const selectedDogName = dogs.find(d => d.id === selectedDogId)?.name ?? null;

  // Standard-Sparten (Fährte, Unterordnung, Schutzdienst) direkt ohne
  // Übungs-/Unterkategorie-Auswahl ins Live-Tracking starten.
  const startDirect = async (disc: Discipline, dogId: string, dogName: string | null) => {
    const ownerId = session?.user.id;
    if (!ownerId) { Alert.alert(t('common.error'), t('training.sessionMissing')); return; }

    if (!active.unitId) {
      if (creating.current) return;
      creating.current = true;
      const { data, error } = await createTrainingUnit(ownerId, dogId);
      creating.current = false;
      if (error || !data) {
        Alert.alert(t('common.error'), error?.message ?? t('training.startError'));
        return;
      }
      startUnit({ unitId: data.id, dogId, dogName: dogName || null });
    }
    // Eintrag auf Sparten-Ebene (kein Unterkategorie-Name).
    addExercise({ discipline: disc.label, exercise_name: disc.label, rating: null, notes: null, duration_sec: null });
    router.replace('/unit/live');
  };

  const handleDiscipline = (disc: Discipline) => {
    const dogId   = addMode ? active.dogId : selectedDogId;
    const dogName = addMode ? active.dogName : dogs.find(d => d.id === dogId)?.name ?? null;
    if (!dogId) {
      Alert.alert(t('training.chooseDogFirstTitle'), t('training.chooseDogFirstBody'));
      return;
    }

    // Eigene/individuelle Kategorien behalten die Übungsauswahl; die festen
    // Standard-Sparten starten direkt ohne Unterkategorie.
    const isCustom = disc.key.startsWith('custom:');
    if (!isCustom) {
      startDirect(disc, dogId, dogName);
      return;
    }

    if (disc.exercises.length === 0) {
      Alert.alert(t('training.noExercisesTitle'), t('training.noExercisesBody'));
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
            <View style={{ flex: 1 }} />
            <HelpButton topicId="start_training" autoShow tint={C.white} />
          </View>
          <View style={s.heroText}>
            <Text style={s.eyebrow}>ANYVO</Text>
            <Text style={s.heroTitle}>{addMode ? t('training.addExercise') : t('training.trainToday')}</Text>
            <Text style={s.heroSub}>
              {addMode ? t('training.addDisciplineHint') : t('training.chooseDisciplineHint')}
            </Text>
          </View>
        </SafeAreaView>
      </HeroImage>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Hundauswahl: kompakter Selector (bestehende Auswahllogik/IDs) */}
        {addMode ? (
          <View style={s.lockedDog}>
            <DogIcon size={14} color={C.accent} />
            <Text style={s.lockedDogTxt}>{active.dogName ?? t('dogs.dogFallback')}</Text>
          </View>
        ) : (
          <>
            <Text style={s.label}>{t('training.dogLabel')}</Text>
            {!dogsLoading && dogs.length === 0 ? (
              <View style={s.emptyBox}><Text style={s.emptyTxt}>{t('training.addFirstDog')}</Text></View>
            ) : dogs.length === 1 ? (
              <View style={s.lockedDog} accessibilityLabel={t('training.chooseDogA11y', { dog: dogs[0].name })}>
                <DogIcon size={14} color={C.accent} />
                <Text style={s.lockedDogTxt}>{dogs[0].name}</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={s.dogSelector}
                  activeOpacity={0.85}
                  onPress={() => { tapHaptic(); if (dogs.length > 1) setDogPickerOpen(o => !o); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('training.chooseDogA11y', { dog: selectedDogName ?? t('training.noDogSelected') })}
                >
                  <View style={s.dogAvatar}><DogIcon size={18} color={C.accent} /></View>
                  <Text style={s.dogSelectorName} numberOfLines={1}>
                    {selectedDogName ?? t('training.chooseDogTitle')}
                  </Text>
                  {dogs.length > 1 && (
                    <Ionicons name={dogPickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
                  )}
                </TouchableOpacity>

                {dogPickerOpen && dogs.length > 1 && (
                  <View style={s.dogRow}>
                    {dogs.map(d => {
                      const aktiv = selectedDogId === d.id;
                      return (
                        <TouchableOpacity
                          key={d.id}
                          style={[s.dogChip, aktiv && s.dogChipActive]}
                          onPress={() => { tapHaptic(); setSelectedDogId(d.id); setDogPickerOpen(false); }}
                          activeOpacity={0.8}
                        >
                          {aktiv && <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />}
                          <DogIcon size={13} color={aktiv ? C.accentText : C.muted} />
                          <Text style={[s.dogChipTxt, aktiv && s.dogChipTxtActive]}>{d.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </>
        )}

        <Text style={s.label}>{t('training.disciplineLabel')}</Text>
        {/* 2-Spalten-Raster (2x2 im Standardfall) — Auswahl folgt aktive_sparten */}
        <View style={s.grid}>
          {cards.map(d => {
            const customId = d.key.startsWith('custom:') ? d.key.slice('custom:'.length) : null;
            return (
              <DisciplineGridCard
                key={d.key}
                discipline={d}
                onPress={() => handleDiscipline(d)}
                onEdit={customId ? () => router.push({ pathname: '/unit/new-category', params: { id: customId } }) : undefined}
              />
            );
          })}
        </View>

        {/* Eigene Kategorie — separate Outline-Aktion (keine 5. gleichwertige Karte) */}
        {!addMode && (
          <TouchableOpacity
            style={s.createBtn}
            activeOpacity={0.85}
            onPress={() => { tapHaptic(); router.push('/unit/new-category'); }}
            accessibilityRole="button"
            accessibilityLabel={t('training.createCategory')}
          >
            <Ionicons name="add" size={20} color={C.accent} />
            <Text style={s.createBtnTxt}>{t('training.createCategory')}</Text>
          </TouchableOpacity>
        )}

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

  // Kompakter Hund-Selector
  dogSelector:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12 },
  dogAvatar:       { width: 34, height: 34, borderRadius: 10, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  dogSelectorName: { flex: 1, fontSize: 15, color: C.white, fontWeight: '700' },

  dogRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  dogChip:  { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden' },
  dogChipActive:    { borderColor: C.accent },
  dogChipTxt:       { fontSize: 13, color: C.muted, fontWeight: '600' },
  dogChipTxtActive: { color: C.accentText, fontWeight: '700' },

  // 2-Spalten-Sparten-Raster (robust: Breite je Karte + space-between)
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },

  // Eigene Kategorie — Outline-Aktion, volle Breite, Mint
  createBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: C.accent, borderStyle: 'dashed', backgroundColor: C.accentDim },
  createBtnTxt: { fontSize: 15, color: C.accent, fontWeight: '800' },
});
