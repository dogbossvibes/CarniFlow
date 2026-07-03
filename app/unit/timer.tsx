import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { tapHaptic, successHaptic } from '@/lib/haptics';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { createDocumentedUnit } from '@/services/trainingUnitService';
import { queryClient } from '@/lib/queryClient';
import type { TrainingMetrics } from '@/types/analytics';

const EMPTY_METRICS: TrainingMetrics = {
  motivation: null, konzentration: null, praezision: null,
  ausdauer: null, trieblage: null, impulskontrolle: null,
};

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Schlichter Trainings-Timer: sofort loslegen (keine Sparten-/Hundeauswahl
// vorab). Am Ende führt „Fertig" direkt in die Dokumentation, wo Dauer schon
// vorbefüllt ist und Sparte/Übungen/Bewertung erfasst werden.
export default function TimerScreen() {
  const router = useRouter();
  const { dogs } = useDogs();
  const { session } = useSession();
  // Optionaler Kontext (z. B. aus dem KI-Hinweis / Schnellstart): Hund + Sparte
  // sind dann schon bekannt und werden an die Dokumentation durchgereicht.
  const { dogId, dogName, discipline, source, note } =
    useLocalSearchParams<{ dogId?: string; dogName?: string; discipline?: string; source?: string; note?: string }>();

  const baseRef = useRef(0);              // Sekunden aus abgeschlossenen Lauf-Segmenten
  const segStartRef = useRef(Date.now()); // Start des aktuellen laufenden Segments
  const [running, setRunning] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.floor(running ? baseRef.current + (now - segStartRef.current) / 1000 : baseRef.current);
  const contextLabel = [dogName, discipline].filter(Boolean).join(' · ');

  const togglePause = () => {
    tapHaptic();
    if (running) {
      baseRef.current += (Date.now() - segStartRef.current) / 1000;
      setRunning(false);
    } else {
      segStartRef.current = Date.now();
      setRunning(true);
    }
  };

  const discard = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/training' as never));

  // Minimal speichern: nur Dauer + Datum + Hund, ohne Sparte/Übungen/Notizen.
  const doSave = async (dogId: string) => {
    const ownerId = session?.user.id;
    if (!ownerId) { Alert.alert('Fehler', 'Sitzung fehlt.'); return; }
    const ended = new Date();
    const { error } = await createDocumentedUnit(ownerId, {
      dog_id:       dogId,
      session_date: ended.toISOString().split('T')[0],
      started_at:   new Date(ended.getTime() - elapsed * 1000).toISOString(),
      ended_at:     ended.toISOString(),
      duration_sec: elapsed,
      score: null, notes: null, photos: [], videos: [], audio_files: [],
      shared_with_trainer: false,
      ...EMPTY_METRICS,
    }, []);
    if (error) { Alert.alert('Fehler', error.message ?? 'Konnte nicht gespeichert werden.'); return; }
    successHaptic();
    queryClient.invalidateQueries({ queryKey: ['trainingFeed'] });
    queryClient.invalidateQueries({ queryKey: ['clientActivity'] });
    router.replace('/(tabs)/home');
  };

  const saveWithoutDoc = () => {
    if (dogId) { void doSave(dogId); return; }   // Hund aus Kontext bekannt → direkt speichern
    if (dogs.length === 0) { Alert.alert('Kein Hund', 'Lege zuerst einen Hund an.'); return; }
    if (dogs.length === 1) { void doSave(dogs[0].id); return; }
    Alert.alert('Für welchen Hund?', undefined, [
      ...dogs.map(d => ({ text: d.name, onPress: () => void doSave(d.id) })),
      { text: 'Abbrechen', style: 'cancel' as const },
    ]);
  };

  // „Fertig" → Wahl: dokumentieren, ohne Doku speichern oder verwerfen. Der
  // bekannte Kontext (Hund/Sparte/Notiz) wird an die Dokumentation weitergereicht.
  const finish = () => {
    tapHaptic();
    Alert.alert('Training beenden', `${formatTime(elapsed)} trainiert.`, [
      { text: 'Dokumentieren', onPress: () => router.replace({ pathname: '/unit/document', params: {
        duration: String(elapsed),
        ...(dogId ? { dogId } : {}),
        ...(discipline ? { discipline } : {}),
        ...(note ? { note } : {}),
      } }) },
      { text: 'Ohne Doku speichern', onPress: saveWithoutDoc },
      { text: 'Verwerfen', style: 'destructive', onPress: discard },
      { text: 'Abbrechen', style: 'cancel' },
    ]);
  };

  const cancel = () => {
    tapHaptic();
    if (elapsed < 3) { discard(); return; }
    Alert.alert('Training verwerfen?', 'Der Timer wird verworfen und nicht gespeichert.', [
      { text: 'Weiter', style: 'cancel' },
      { text: 'Verwerfen', style: 'destructive', onPress: discard },
    ]);
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.flex}>
        <TouchableOpacity style={s.cancelBtn} onPress={cancel} hitSlop={8} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>

        <View style={s.center}>
          {contextLabel ? <Text style={s.context}>{contextLabel}</Text> : null}
          <Text style={s.label}>{running ? 'TRAINING LÄUFT' : 'PAUSIERT'}</Text>
          <Text style={s.timer}>{formatTime(elapsed)}</Text>
          <Text style={s.hint}>
            {discipline ? 'Übungen & Bewertung dokumentierst du am Ende.' : 'Sparte & Übungen dokumentierst du am Ende.'}
          </Text>
        </View>

        <View style={s.bar}>
          <AnimatedPressable style={s.pauseBtn} scale={0.95} onPress={togglePause}>
            <Ionicons name={running ? 'pause' : 'play'} size={22} color={C.white} />
            <Text style={s.pauseTxt}>{running ? 'Pause' : 'Weiter'}</Text>
          </AnimatedPressable>

          <AnimatedPressable style={s.endBtn} scale={0.97} onPress={finish}>
            <LinearGradient colors={['#00FFCC', '#00FFCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="checkmark" size={20} color={C.accentText} />
            <Text style={s.endTxt}>Fertig</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  cancelBtn: { position: 'absolute', top: 8, left: 16, zIndex: 10, width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  context:{ fontSize: 15, color: C.white, fontWeight: '800', marginBottom: 2 },
  label:  { fontSize: 12, color: C.accent, fontWeight: '800', letterSpacing: 2 },
  timer:  { fontSize: 76, color: C.white, fontWeight: '900', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  hint:   { fontSize: 13, color: C.muted, fontWeight: '500', textAlign: 'center', marginTop: 4 },

  bar:      { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  pauseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: 120, height: 56, borderRadius: 18, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  pauseTxt: { fontSize: 15, color: C.white, fontWeight: '700' },
  endBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: 18, overflow: 'hidden' },
  endTxt:   { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },
});
