import { useRef } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  interpolate, useAnimatedRef, useAnimatedStyle, useScrollOffset,
} from 'react-native-reanimated';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { getDiscipline, type Discipline } from '@/constants/disciplines';
import { HeroImage } from '@/components/training/HeroImage';
import { ExerciseCard } from '@/components/training/ExerciseCard';
import { createTrainingUnit } from '@/services/trainingUnitService';
import { useActiveTraining, startUnit, addExercise } from '@/stores/activeTraining';

const HERO_H = 260;

export default function DisciplineScreen() {
  const router = useRouter();
  const { session } = useSession();
  const active = useActiveTraining();
  const params = useLocalSearchParams<{
    discipline: string; dogId: string; dogName: string;
    label?: string; accent?: string; icon?: string; exercises?: string;
  }>();
  const { discipline, dogId, dogName } = params;

  // Statische Sparte, sonst aus Params rekonstruierte eigene Kategorie.
  const disc: Discipline | undefined =
    getDiscipline(discipline ?? '') ??
    (params.label
      ? {
          key:       discipline ?? '',
          label:     params.label,
          subtitle:  'Individuelles Training',
          emoji:     '⭐',
          icon:      (params.icon || 'ellipse-outline') as Discipline['icon'],
          accent:    params.accent || '#A78BFA',
          hero:      false,
          exercises: params.exercises ? (JSON.parse(params.exercises) as string[]) : [],
        }
      : undefined);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollOffset(scrollRef);
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(offset.value, [-HERO_H, 0, HERO_H], [-HERO_H / 2, 0, HERO_H * 0.6]) },
      { scale: interpolate(offset.value, [-HERO_H, 0], [2, 1], 'clamp') },
    ],
  }));

  const creating = useRef(false);

  if (!disc) {
    return (
      <SafeAreaView style={s.fallback}><Text style={s.fallbackTxt}>Unbekannte Sparte</Text></SafeAreaView>
    );
  }

  const handleChoose = async (name: string) => {
    const ownerId = session?.user.id;
    if (!ownerId || !dogId) {
      Alert.alert('Fehler', 'Sitzung oder Hund fehlt.');
      return;
    }

    // Einheit beim ersten Übungsklick anlegen (sonst an laufende anhängen).
    if (!active.unitId) {
      if (creating.current) return;
      creating.current = true;
      const { data, error } = await createTrainingUnit(ownerId, dogId);
      creating.current = false;
      if (error || !data) {
        Alert.alert('Fehler', error?.message ?? 'Einheit konnte nicht gestartet werden.');
        return;
      }
      startUnit({ unitId: data.id, dogId, dogName: dogName || null });
    }

    addExercise({ discipline: disc.label, exercise_name: name, rating: null, notes: null, duration_sec: null });
    router.replace('/unit/live');
  };

  return (
    <View style={s.root}>
      <Animated.ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        <Animated.View style={[s.heroWrap, heroStyle]}>
          <HeroImage height={HERO_H} contentPosition="top" overlay={0.95}>
            <View style={s.heroText}>
              <View style={[s.badge, { backgroundColor: `${disc.accent}22`, borderColor: `${disc.accent}55` }]}>
                <Ionicons name={disc.icon} size={14} color={disc.accent} />
                <Text style={[s.badgeTxt, { color: disc.accent }]}>{disc.emoji}</Text>
              </View>
              <Text style={s.title}>{disc.label}</Text>
              <Text style={s.subtitle}>{disc.subtitle}</Text>
            </View>
          </HeroImage>
        </Animated.View>

        <View style={s.body}>
          <Text style={s.label}>WÄHLE DEINE ÜBUNG</Text>
          <View style={s.grid}>
            {disc.exercises.map(ex => (
              <ExerciseCard key={ex} name={ex} accent={disc.accent} icon={disc.icon} onPress={() => handleChoose(ex)} />
            ))}
          </View>
          <View style={{ height: 48 }} />
        </View>
      </Animated.ScrollView>

      {/* Fixierter Zurück-Button über dem Hero */}
      <SafeAreaView edges={['top']} style={s.backWrap} pointerEvents="box-none">
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  scrollContent: { paddingBottom: 0 },
  heroWrap:      { height: HERO_H },
  heroText:      { paddingHorizontal: 20, paddingBottom: 22, gap: 6 },
  badge:         { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  badgeTxt:      { fontSize: 12, fontWeight: '800' },
  title:         { fontSize: 32, color: C.white, fontWeight: '900', letterSpacing: -0.6 },
  subtitle:      { fontSize: 14, color: '#CFCFCF', fontWeight: '500' },

  body:    { paddingHorizontal: 20, marginTop: -8 },
  backWrap:{ position: 'absolute', top: 0, left: 20, right: 20 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },

  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 14, marginTop: 18 },
  grid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },

  fallback:    { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  fallbackTxt: { color: C.muted, fontSize: 15 },
});
