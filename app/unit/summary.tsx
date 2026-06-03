import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { HeroImage } from '@/components/training/HeroImage';
import { MetricsInput } from '@/components/training/MetricsInput';
import { disciplineColor } from '@/constants/disciplines';
import { finishTrainingUnit } from '@/services/trainingUnitService';
import type { TrainingMetrics } from '@/types/analytics';
import { queryClient } from '@/lib/queryClient';
import { useActiveTraining, resetUnit } from '@/stores/activeTraining';
import { useProfile } from '@/hooks/useProfile';
import { successHaptic, tapHaptic } from '@/lib/haptics';

function formatDur(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export default function SummaryScreen() {
  const router = useRouter();
  const active = useActiveTraining();
  const { profile } = useProfile();
  const { duration } = useLocalSearchParams<{ duration: string }>();
  const durationSec = Number(duration ?? 0) || 0;

  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes]   = useState('');
  const [metrics, setMetrics] = useState<TrainingMetrics>({
    motivation: null, konzentration: null, praezision: null,
    ausdauer: null, trieblage: null, impulskontrolle: null,
  });
  const [saving, setSaving] = useState(false);

  if (!active.unitId) return <Redirect href="/(tabs)/home" />;

  const rated = active.exercises.filter(e => e.rating != null);
  const avg = rated.length ? rated.reduce((sum, e) => sum + (e.rating ?? 0), 0) / rated.length : null;

  const speichern = async () => {
    setSaving(true);
    const { error } = await finishTrainingUnit(
      active.unitId!,
      { duration_sec: durationSec, rating, notes: notes.trim() || null, shared_with_trainer: profile?.share_trainings_default ?? false, ...metrics },
      active.exercises.map((e, i) => ({
        discipline:    e.discipline,
        exercise_name: e.exercise_name,
        rating:        e.rating,
        notes:         e.notes,
        duration_sec:  e.duration_sec,
        seq_index:     i,
      })),
    );
    setSaving(false);

    if (error) {
      Alert.alert('Fehler', error.message ?? 'Einheit konnte nicht gespeichert werden.');
      return;
    }
    successHaptic();
    resetUnit();
    queryClient.invalidateQueries({ queryKey: ['trainingFeed'] });
    router.replace('/(tabs)/home');
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <HeroImage height={340} overlay={0.96} contentPosition="top">
          <SafeAreaView edges={['top']} style={s.heroSafe}>
            <View style={s.celebrate}>
              <View style={s.trophy}>
                <Ionicons name="trophy" size={26} color={C.accentText} />
              </View>
              <Text style={s.heroTitle}>Starke Einheit</Text>
              <Text style={s.heroSub}>{active.dogName ?? 'Dein Hund'} hat trainiert</Text>
            </View>
          </SafeAreaView>
        </HeroImage>

        <View style={s.body}>
          {/* Stats */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statVal}>{formatDur(durationSec)}</Text>
              <Text style={s.statLabel}>DAUER</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statVal}>{active.exercises.length}</Text>
              <Text style={s.statLabel}>ÜBUNGEN</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statVal}>{avg != null ? avg.toFixed(1) : '—'}</Text>
              <Text style={s.statLabel}>Ø BEWERTUNG</Text>
            </View>
          </View>

          {/* Übungsliste */}
          <Text style={s.label}>ÜBUNGEN</Text>
          {active.exercises.map((ex, i) => (
            <View key={`${ex.exercise_name}-${i}`} style={s.exRow}>
              <View style={[s.exDot, { backgroundColor: disciplineColor(ex.discipline) }]} />
              <Text style={s.exName}>{ex.exercise_name}</Text>
              <Text style={s.exDisc}>{ex.discipline}</Text>
              {ex.rating != null && (
                <View style={s.exStars}>
                  <Ionicons name="star" size={12} color={C.star} />
                  <Text style={s.exRating}>{ex.rating}</Text>
                </View>
              )}
            </View>
          ))}

          {/* Gesamtbewertung */}
          <Text style={s.label}>GESAMTBEWERTUNG</Text>
          <View style={s.bigStars}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => { tapHaptic(); setRating(n); }} hitSlop={6}>
                <Ionicons
                  name={rating != null && n <= rating ? 'star' : 'star-outline'}
                  size={32}
                  color={rating != null && n <= rating ? C.star : C.subtle}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Notizen */}
          <Text style={s.label}>NOTIZEN</Text>
          <TextInput
            style={s.notes}
            placeholder="Wie lief die Einheit?"
            placeholderTextColor={C.placeholder}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <Text style={s.label}>METRIKEN (OPTIONAL)</Text>
          <MetricsInput value={metrics} onChange={setMetrics} />

          <AnimatedPressable style={[s.saveBtn, saving && { opacity: 0.5 }]} scale={0.97} disabled={saving} onPress={speichern}>
            <LinearGradient colors={['#00FFCC', '#00FFCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="checkmark-circle" size={22} color={C.accentText} />
            <Text style={s.saveTxt}>{saving ? 'Speichert…' : 'Einheit speichern'}</Text>
          </AnimatedPressable>

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 0 },

  heroSafe:  { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 24 },
  celebrate: { gap: 8 },
  trophy:    { width: 56, height: 56, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  heroTitle: { fontSize: 36, color: C.white, fontWeight: '900', letterSpacing: -0.8 },
  heroSub:   { fontSize: 15, color: '#CFCFCF', fontWeight: '500' },

  body: { paddingHorizontal: 20, marginTop: 4 },

  statsRow:  { flexDirection: 'row', gap: 10, marginTop: 8 },
  statCard:  { flex: 1, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingVertical: 18, alignItems: 'center', gap: 6 },
  statVal:   { fontSize: 20, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1 },

  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12, marginTop: 24 },

  exRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
  exDot:    { width: 8, height: 8, borderRadius: 4 },
  exName:   { fontSize: 14, color: C.white, fontWeight: '700', flex: 1 },
  exDisc:   { fontSize: 12, color: C.muted, fontWeight: '500' },
  exStars:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4 },
  exRating: { fontSize: 12, color: C.star, fontWeight: '700' },

  bigStars: { flexDirection: 'row', gap: 12, justifyContent: 'center', paddingVertical: 4 },

  notes: { backgroundColor: C.input, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 14, padding: 14, minHeight: 90, textAlignVertical: 'top' },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 60, borderRadius: 20, overflow: 'hidden', marginTop: 28 },
  saveTxt: { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },
});
