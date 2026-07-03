import { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Glass, isGlass } from '@/components/ui/Glass';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { AudioRecorder } from '@/components/ui/AudioRecorder';
import { DurationDrumPicker } from '@/components/ui/DurationDrumPicker';
import { MultiVideoUpload } from '@/components/training/MultiVideoUpload';
import { MetricsInput } from '@/components/training/MetricsInput';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { DISCIPLINES, customToDiscipline, disciplineColor, type Discipline } from '@/constants/disciplines';
import { DEFAULT_SPARTEN } from '@/constants/sparten';
import { createDocumentedUnit, updateDocumentedUnit, getTrainingUnitById } from '@/services/trainingUnitService';
import { DateField } from '@/components/ui/DateField';
import { queryClient } from '@/lib/queryClient';
import { tapHaptic, successHaptic } from '@/lib/haptics';
import type { AudioNote } from '@/types';
import type { TrainingMetrics } from '@/types/analytics';
import type { TrainingUnit } from '@/types/trainingUnit';

const EMPTY_METRICS: TrainingMetrics = {
  motivation: null, konzentration: null, praezision: null,
  ausdauer: null, trieblage: null, impulskontrolle: null,
};


function ymd(d: Date) { return d.toISOString().split('T')[0]; }

interface SelExercise { discipline: string; name: string }

export default function DocumentScreen() {
  const router = useRouter();
  const { id, duration, dogId: dogIdParam, discipline: discParam, note: noteParam } =
    useLocalSearchParams<{ id?: string; duration?: string; dogId?: string; discipline?: string; note?: string }>();
  const editing = !!id;
  // Vom Timer mitgegebene Dauer (Sekunden) → Minuten vorbefüllen.
  const initialMin = duration ? Math.max(1, Math.round(Number(duration) / 60)) : 45;
  const { dogs } = useDogs();
  const { session } = useSession();
  const { profile } = useProfile();
  const { categories } = useCustomCategories();

  // Feste Sparten nach den im Profil aktivierten filtern. Fallback = Standard-
  // Sparten (nicht „alle"), konsistent mit dem Sparten-Hub (app/unit/start.tsx),
  // damit Opt-in-Sparten wie Obedience nicht vorab erscheinen.
  const aktiveSparten = profile?.aktive_sparten ?? DEFAULT_SPARTEN;
  const disciplines: Discipline[] = [
    ...DISCIPLINES.filter(d => !d.custom && aktiveSparten.includes(d.label)),
    ...categories.map(customToDiscipline),
  ];

  // Vom KI-Hinweis/Timer vorgeschlagene Sparte (Label → Key), sofern aktiv.
  const paramDiscKey = discParam ? DISCIPLINES.find(d => d.label === discParam)?.key : undefined;
  const initialDisc = paramDiscKey && disciplines.some(d => d.key === paramDiscKey)
    ? paramDiscKey : (disciplines[0]?.key ?? 'faehrte');

  const [dogId, setDogId] = useState<string | null>(dogIdParam ?? (dogs.length === 1 ? dogs[0].id : null));
  const [activeDisc, setActiveDisc] = useState<string>(initialDisc);
  const [selected, setSelected] = useState<SelExercise[]>([]);
  const [customDraft, setCustomDraft] = useState('');
  const [description, setDescription] = useState(noteParam ?? '');
  const [score, setScore] = useState(0);
  const [date, setDate] = useState(new Date());
  const [durationMin, setDurationMin] = useState(initialMin);
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [audio, setAudio] = useState<AudioNote[]>([]);
  const [metrics, setMetrics] = useState<TrainingMetrics>(EMPTY_METRICS);
  const [saving, setSaving] = useState(false);

  // Edit-Modus: bestehende Einheit laden und Felder vorbelegen.
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await getTrainingUnitById(id);
      const u = data as TrainingUnit | null;
      if (!u) return;
      setDogId(u.dog_id);
      setSelected((u.exercises ?? []).map(e => ({ discipline: e.discipline, name: e.exercise_name })));
      setDescription(u.notes ?? '');
      setScore(u.score ?? 0);
      setDate(u.session_date ? new Date(u.session_date) : new Date());
      setDurationMin(u.duration_sec ? Math.round(u.duration_sec / 60) : 45);
      setPhotos(u.photos ?? []);
      setVideos(u.videos ?? []);
      setAudio((u.audio_files ?? []).map(a => ({ url: a.url, duration: a.duration, createdAt: '' })));
      setMetrics({
        motivation: u.motivation, konzentration: u.konzentration, praezision: u.praezision,
        ausdauer: u.ausdauer, trieblage: u.trieblage, impulskontrolle: u.impulskontrolle,
      });
    })();
  }, [id]);

  // Genau ein Hund → automatisch wählen, sobald die Hunde geladen sind.
  // (useDogs lädt async; die useState-Initialisierung greift zu früh, wenn dogs
  // noch leer ist → dogId bliebe sonst null und Speichern wäre nie möglich.)
  useEffect(() => {
    if (!editing && !dogId && dogs.length === 1) setDogId(dogs[0].id);
  }, [dogs, editing, dogId]);

  const disc = disciplines.find(d => d.key === activeDisc) ?? disciplines[0];
  const isSelected = (label: string, name: string) =>
    selected.some(e => e.discipline === label && e.name === name);

  const toggleExercise = (label: string, name: string) => {
    tapHaptic();
    setSelected(prev =>
      prev.some(e => e.discipline === label && e.name === name)
        ? prev.filter(e => !(e.discipline === label && e.name === name))
        : [...prev, { discipline: label, name }],
    );
  };

  const addCustom = () => {
    const v = customDraft.trim();
    if (!v || !disc) return;
    if (!isSelected(disc.label, v)) {
      tapHaptic();
      setSelected(prev => [...prev, { discipline: disc.label, name: v }]);
    }
    setCustomDraft('');
  };


  const canSave = !!dogId && selected.length > 0;

  const speichern = async () => {
    if (!canSave || !session?.user.id) return;
    setSaving(true);
    const started = new Date(date); started.setHours(12, 0, 0, 0);
    const ended = new Date(started.getTime() + durationMin * 60000);
    const payload = {
      dog_id:       dogId!,
      session_date: ymd(date),
      started_at:   started.toISOString(),
      ended_at:     ended.toISOString(),
      duration_sec: durationMin * 60,
      score:        score || null,
      notes:        description.trim() || null,
      photos,
      videos,
      audio_files:  audio.map(a => ({ url: a.url, duration: a.duration, transcript: null })),
      shared_with_trainer: profile?.share_trainings_default ?? false,
      ...metrics,
    };
    const exercises = selected.map((e, i) => ({
      discipline: e.discipline, exercise_name: e.name,
      rating: null, notes: null, duration_sec: null, seq_index: i,
    }));

    const { error } = editing
      ? await updateDocumentedUnit(id!, payload, exercises)
      : (await createDocumentedUnit(session.user.id, payload, exercises));
    setSaving(false);
    if (error) { Alert.alert('Fehler', error.message ?? 'Konnte nicht gespeichert werden.'); return; }
    successHaptic();
    queryClient.invalidateQueries({ queryKey: ['trainingFeed'] });
    queryClient.invalidateQueries({ queryKey: ['clientActivity'] });
    if (editing) router.replace({ pathname: '/unit/detail', params: { id: id! } });
    else         router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View>
          <Text style={s.eyebrow}>TRAININGSTAGEBUCH</Text>
          <Text style={s.title}>{editing ? 'Training bearbeiten' : 'Training dokumentieren'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Hund */}
          {dogs.length > 1 && (
            <>
              <Text style={s.label}>HUND</Text>
              <View style={s.chipRow}>
                {dogs.map(d => {
                  const aktiv = dogId === d.id;
                  return (
                    <TouchableOpacity key={d.id} style={[s.chip, aktiv && s.chipActive]} onPress={() => { tapHaptic(); setDogId(d.id); }} activeOpacity={0.8}>
                      {aktiv && <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />}
                      <Text style={[s.chipTxt, aktiv && s.chipTxtActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Sparte */}
          <Text style={s.label}>SPARTE</Text>
          <View style={s.chipRow}>
            {disciplines.map(d => {
              const aktiv = activeDisc === d.key;
              return (
                <TouchableOpacity key={d.key} style={[s.chip, aktiv && { borderColor: d.accent, backgroundColor: `${d.accent}1A` }]} onPress={() => { tapHaptic(); setActiveDisc(d.key); }} activeOpacity={0.8}>
                  <Ionicons name={d.icon} size={13} color={aktiv ? d.accent : C.muted} />
                  <Text style={[s.chipTxt, aktiv && { color: d.accent, fontWeight: '700' }]}>{d.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Übungen (Mehrfachauswahl) */}
          {disc && (
            <>
              <Text style={s.label}>ÜBUNGEN · {disc.label.toUpperCase()}</Text>
              <View style={s.chipRow}>
                {disc.exercises.filter(e => e !== 'Eigene Übung').map(ex => {
                  const aktiv = isSelected(disc.label, ex);
                  return (
                    <TouchableOpacity key={ex} style={[s.chip, aktiv && { borderColor: disc.accent, backgroundColor: `${disc.accent}1A` }]} onPress={() => toggleExercise(disc.label, ex)} activeOpacity={0.8}>
                      <Text style={[s.chipTxt, aktiv && { color: disc.accent, fontWeight: '700' }]}>{ex}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* Eigene Übung */}
              <View style={s.customRow}>
                <TextInput style={[s.input, s.flex]} placeholder="Eigene Übung…" placeholderTextColor={C.placeholder} value={customDraft} onChangeText={setCustomDraft} onSubmitEditing={addCustom} returnKeyType="done" />
                <TouchableOpacity style={[s.addBtn, { backgroundColor: disc.accent }]} onPress={addCustom} activeOpacity={0.8}>
                  <Ionicons name="add" size={22} color="#000" />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Ausgewählte Übungen */}
          {selected.length > 0 && (
            <>
              <Text style={s.label}>AUSGEWÄHLT ({selected.length})</Text>
              <View style={s.chipRow}>
                {selected.map((e, i) => (
                  <TouchableOpacity key={`${e.discipline}-${e.name}`} style={s.selChip} onPress={() => { tapHaptic(); setSelected(prev => prev.filter((_, idx) => idx !== i)); }} activeOpacity={0.8}>
                    <View style={[s.selDot, { backgroundColor: disciplineColor(e.discipline) }]} />
                    <Text style={s.selChipTxt}>{e.name}</Text>
                    <Ionicons name="close" size={13} color={C.muted} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Beschreibung */}
          <Text style={s.label}>WAS WURDE TRAINIERT?</Text>
          <TextInput style={s.textarea} placeholder="Beschreibe die Einheit…" placeholderTextColor={C.placeholder} value={description} onChangeText={setDescription} multiline />

          {/* Datum + Dauer */}
          <Text style={s.label}>DATUM</Text>
          <DateField value={date} onChange={setDate} maximumDate={new Date()} />

          <Text style={s.label}>DAUER</Text>
          <DurationDrumPicker value={durationMin} onChange={setDurationMin} />

          {/* Bewertung 1–10 */}
          <Text style={[s.label, { marginTop: 22 }]}>GESAMTBEWERTUNG</Text>
          <View style={s.scoreRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
              const aktiv = score >= n;
              return (
                <TouchableOpacity key={n} style={[s.scoreCell, aktiv && s.scoreCellActive]} onPress={() => { tapHaptic(); setScore(score === n ? 0 : n); }} activeOpacity={0.8}>
                  <Text style={[s.scoreTxt, aktiv && s.scoreTxtActive]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Fotos */}
          <Text style={[s.label, { marginTop: 22 }]}>FOTOS</Text>
          <PhotoPicker value={photos} onChange={setPhotos} />

          {/* Videos */}
          <Text style={[s.label, { marginTop: 22 }]}>VIDEOS</Text>
          <MultiVideoUpload value={videos} onChange={setVideos} />

          {/* Metriken (optional, Basis für KI-Auswertung) */}
          <Text style={[s.label, { marginTop: 22 }]}>METRIKEN (OPTIONAL)</Text>
          <MetricsInput value={metrics} onChange={setMetrics} />

          {/* Sprachaufnahmen */}
          <Text style={[s.label, { marginTop: 22 }]}>SPRACHAUFNAHMEN</Text>
          <AudioRecorder value={audio} onChange={setAudio} />

          {/* Speichern */}
          {!canSave && (
            <Text style={s.saveHint}>
              {!dogId ? 'Wähle oben einen Hund, um zu speichern.' : 'Wähle mindestens eine Übung, um zu speichern.'}
            </Text>
          )}
          <AnimatedPressable style={[s.saveBtn, !canSave && { opacity: 0.4 }]} scale={0.97} disabled={!canSave || saving} onPress={speichern}>
            <LinearGradient colors={['#00FFCC', '#00FFCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="checkmark-circle" size={22} color={C.accentText} />
            <Text style={s.saveTxt}>{saving ? 'Speichert…' : editing ? 'Änderungen speichern' : 'Einheit speichern'}</Text>
          </AnimatedPressable>

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  flex:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn:{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:  { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 18 },

  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden' },
  chipActive:   { borderColor: C.accent },
  chipTxt:      { fontSize: 13, color: C.muted, fontWeight: '600' },
  chipTxtActive:{ color: C.accentText, fontWeight: '700' },

  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  input:     { backgroundColor: C.input, borderRadius: 14, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  addBtn:    { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  selChip:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.cardAlt, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 9 },
  selDot:     { width: 7, height: 7, borderRadius: 3.5 },
  selChipTxt: { fontSize: 13, color: C.white, fontWeight: '600' },

  textarea: { backgroundColor: C.input, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 14, padding: 14, minHeight: 110, textAlignVertical: 'top' },

  cardGlass: { backgroundColor: 'transparent', overflow: 'hidden' },
  glassBg:   { ...StyleSheet.absoluteFillObject },

  scoreRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scoreCell:      { width: 44, height: 44, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  scoreCellActive:{ backgroundColor: C.accent, borderColor: C.accent },
  scoreTxt:       { fontSize: 15, color: C.muted, fontWeight: '800' },
  scoreTxtActive: { color: C.accentText },

  saveHint:{ fontSize: 12.5, color: C.muted, textAlign: 'center', marginTop: 26, marginBottom: -14, fontWeight: '600' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 60, borderRadius: 20, overflow: 'hidden', marginTop: 32 },
  saveTxt: { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },
});
