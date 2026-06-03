import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { disciplineColor } from '@/constants/disciplines';
import { useActiveTraining, updateExercise, removeExercise } from '@/stores/activeTraining';
import { tapHaptic } from '@/lib/haptics';

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function Stars({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <View style={s.starsRow}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => { tapHaptic(); onChange(n); }} hitSlop={6}>
          <Ionicons
            name={value != null && n <= value ? 'star' : 'star-outline'}
            size={18}
            color={value != null && n <= value ? C.star : C.subtle}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function LiveScreen() {
  const router = useRouter();
  const active = useActiveTraining();

  const [elapsed, setElapsed] = useState(() =>
    active.startedAt ? Math.floor((Date.now() - active.startedAt) / 1000) : 0,
  );
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Kein aktives Training → zurück zum Start.
  if (!active.unitId) return <Redirect href="/unit/start" />;

  const beenden = () => {
    tapHaptic();
    router.push({ pathname: '/unit/summary', params: { duration: String(elapsed) } });
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.flex}>
        {/* Timer-Kopf */}
        <View style={s.timerWrap}>
          <Text style={s.timerLabel}>{running ? 'TRAINING LÄUFT' : 'PAUSIERT'}</Text>
          <Text style={s.timer}>{formatTime(elapsed)}</Text>
          <View style={s.dogChip}>
            <Ionicons name="paw" size={13} color={C.accent} />
            <Text style={s.dogChipTxt}>{active.dogName ?? 'Hund'}</Text>
          </View>
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Text style={s.sectionLabel}>ÜBUNGEN ({active.exercises.length})</Text>

          {active.exercises.map((ex, i) => {
            const accent = disciplineColor(ex.discipline);
            return (
              <View key={`${ex.exercise_name}-${i}`} style={s.exCard}>
                <View style={s.exTop}>
                  <View style={[s.exDot, { backgroundColor: accent }]} />
                  <View style={s.flex}>
                    <Text style={s.exName}>{ex.exercise_name}</Text>
                    <Text style={s.exDisc}>{ex.discipline}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { tapHaptic(); removeExercise(i); }} hitSlop={8}>
                    <Ionicons name="close-circle" size={22} color={C.subtle} />
                  </TouchableOpacity>
                </View>
                <Stars value={ex.rating} onChange={n => updateExercise(i, { rating: n })} />
              </View>
            );
          })}

          {/* + Übung hinzufügen */}
          <AnimatedPressable style={s.addBtn} scale={0.97} onPress={() => { tapHaptic(); router.push('/unit/start'); }}>
            <Ionicons name="add" size={20} color={C.accent} />
            <Text style={s.addTxt}>Übung hinzufügen</Text>
          </AnimatedPressable>

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Bottom Action Bar */}
        <View style={s.bar}>
          <AnimatedPressable
            style={s.pauseBtn}
            scale={0.95}
            onPress={() => { tapHaptic(); setRunning(r => !r); }}
          >
            <Ionicons name={running ? 'pause' : 'play'} size={22} color={C.white} />
            <Text style={s.pauseTxt}>{running ? 'Pause' : 'Weiter'}</Text>
          </AnimatedPressable>

          <AnimatedPressable style={s.endBtn} scale={0.97} onPress={beenden}>
            <LinearGradient colors={['#00FFCC', '#00FFCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="flag" size={20} color={C.accentText} />
            <Text style={s.endTxt}>Training beenden</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  timerWrap:  { alignItems: 'center', paddingTop: 18, paddingBottom: 18, gap: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  timerLabel: { fontSize: 11, color: C.accent, fontWeight: '800', letterSpacing: 2 },
  timer:      { fontSize: 64, color: C.white, fontWeight: '900', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  dogChip:    { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 7 },
  dogChipTxt: { fontSize: 13, color: C.white, fontWeight: '700' },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18 },

  sectionLabel: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },

  exCard: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 10, gap: 12 },
  exTop:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exDot:  { width: 10, height: 10, borderRadius: 5 },
  exName: { fontSize: 15, color: C.white, fontWeight: '700' },
  exDisc: { fontSize: 12, color: C.muted, fontWeight: '500', marginTop: 1 },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', paddingVertical: 16, marginTop: 4 },
  addTxt: { fontSize: 14, color: C.accent, fontWeight: '700' },

  bar:      { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  pauseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: 120, height: 56, borderRadius: 18, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  pauseTxt: { fontSize: 15, color: C.white, fontWeight: '700' },
  endBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: 18, overflow: 'hidden' },
  endTxt:   { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },

  starsRow: { flexDirection: 'row', gap: 8 },
});
