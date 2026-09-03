import { useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
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
import { HelpButton } from '@/components/help/HelpButton';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { AudioRecorder } from '@/components/ui/AudioRecorder';
import { CompactDurationStepper } from '@/components/ui/CompactDurationStepper';
import { MultiVideoUpload } from '@/components/training/MultiVideoUpload';
import { MetricsInput } from '@/components/training/MetricsInput';
import { CustomExerciseSheet } from '@/components/training/CustomExerciseSheet';
import { SelectedExerciseCard } from '@/components/training/SelectedExerciseCard';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { DISCIPLINES, customToDiscipline, disciplineColor, type Discipline } from '@/constants/disciplines';
import { DEFAULT_SPARTEN } from '@/constants/sparten';
import {
  createDocumentedUnit, updateDocumentedUnit, getTrainingUnitById, getRecentExerciseNames,
} from '@/services/trainingUnitService';
import { updateCustomCategory } from '@/services/customCategoryService';
import { handleQuotaBlock } from '@/features/subscription/quotaUx';
import { DateField } from '@/components/ui/DateField';
import { DogIcon } from '@/components/ui/DogIcon';
import { queryClient } from '@/lib/queryClient';
import { tapHaptic, successHaptic } from '@/lib/haptics';
import type { AudioNote } from '@/types';
import type { TrainingMetrics } from '@/types/analytics';
import type { TrainingUnit } from '@/types/trainingUnit';
import { useT } from '@/i18n';

const EMPTY_METRICS: TrainingMetrics = {
  motivation: null, konzentration: null, praezision: null,
  ausdauer: null, trieblage: null, impulskontrolle: null,
};

const SCORE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function ymd(d: Date) { return d.toISOString().split('T')[0]; }

interface SelExercise {
  discipline: string;
  name:       string;
  rating:     number | null;
  notes:      string | null;
}

export default function DocumentScreen() {
  const router = useRouter();
  const { t } = useT();
  const { id, duration, dogId: dogIdParam, discipline: discParam, note: noteParam } =
    useLocalSearchParams<{ id?: string; duration?: string; dogId?: string; discipline?: string; note?: string }>();
  const editing = !!id;
  // Vom Timer mitgegebene Dauer (Sekunden) → Minuten vorbefüllen.
  const initialMin = duration ? Math.max(1, Math.round(Number(duration) / 60)) : 45;
  const { dogs, loading: dogsLoading } = useDogs();
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
  const [customSheetOpen, setCustomSheetOpen] = useState(false);
  const [recentNames, setRecentNames] = useState<string[]>([]);
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
      setSelected((u.exercises ?? []).map(e => ({
        discipline: e.discipline, name: e.exercise_name, rating: e.rating, notes: e.notes,
      })));
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

  // Genau einen Hund erst nach abgeschlossenem Load automatisch wählen. Die
  // Auswahl aus Navigation oder Edit-Modus bleibt dabei unverändert.
  useEffect(() => {
    if (!editing && !dogsLoading && !dogId && dogs.length === 1) setDogId(dogs[0].id);
  }, [dogsLoading, dogs, editing, dogId]);

  const disc = disciplines.find(d => d.key === activeDisc) ?? disciplines[0];
  const isCustomDiscipline = !!disc?.key.startsWith('custom:');
  const activeCategory = isCustomDiscipline
    ? categories.find(c => `custom:${c.id}` === disc?.key)
    : undefined;

  // Vorschläge aus der eigenen Trainingshistorie für FESTE Sparten (siehe
  // CustomExerciseSheet-Kommentar): kein neues Schema, rein lesende Query.
  useEffect(() => {
    if (!disc || isCustomDiscipline || !session?.user.id) { setRecentNames([]); return; }
    let cancelled = false;
    getRecentExerciseNames(session.user.id, disc.label).then(({ data }) => {
      if (!cancelled) setRecentNames(data.filter(n => !disc.exercises.includes(n)));
    });
    return () => { cancelled = true; };
  }, [disc?.key, isCustomDiscipline, session?.user.id]);

  const isSelected = (label: string, name: string) =>
    selected.some(e => e.discipline === label && e.name === name);

  // „Eigene Übung"-Kennzeichnung ohne neue Spalte: eine Übung gilt als eigen,
  // wenn sie NICHT in der (festen oder eigenen) Übungsliste der Sparte steht.
  // Funktioniert dadurch automatisch auch nach dem erneuten Laden eines
  // gespeicherten Trainings — exercise_name selbst wird bereits unverändert
  // gespeichert, dafür ist keine Migration nötig.
  const isCustomExercise = (discLabel: string, name: string) => {
    const d = disciplines.find(x => x.label === discLabel);
    return !d || !d.exercises.includes(name);
  };

  const toggleExercise = (label: string, name: string) => {
    tapHaptic();
    setSelected(prev =>
      prev.some(e => e.discipline === label && e.name === name)
        ? prev.filter(e => !(e.discipline === label && e.name === name))
        : [...prev, { discipline: label, name, rating: null, notes: null }],
    );
  };

  const handleAddCustomExercise = async (name: string, saveForFuture: boolean) => {
    if (!disc) return;
    // Duplikat-Prüfung ATOMAR im Updater (nicht vorher per isSelected/geschlossener
    // Closure): ein doppelt ausgelöstes „Hinzufügen" (z. B. Doppel-Tap, bevor React
    // neu rendert) darf dieselbe Übung nie zweimal einfügen — die Prüfung muss auf
    // dem tatsächlichen State zum Zeitpunkt der Anwendung laufen, nicht auf einem
    // möglicherweise veralteten `selected` aus dem Moment des Funktionsaufrufs.
    setSelected(prev =>
      prev.some(e => e.discipline === disc.label && e.name === name)
        ? prev
        : [...prev, { discipline: disc.label, name, rating: null, notes: null }],
    );
    setCustomSheetOpen(false);
    // Eigene Sparte + „für zukünftige Trainings speichern": dieselbe Persistenz
    // wie im Kategorie-Editor (app/unit/new-category.tsx) — keine zweite Logik.
    if (activeCategory && saveForFuture && !activeCategory.exercises.includes(name)) {
      const { error } = await updateCustomCategory(activeCategory.id, {
        name: activeCategory.name, icon: activeCategory.icon, color: activeCategory.color,
        exercises: [...activeCategory.exercises, name],
      });
      if (!error) queryClient.invalidateQueries({ queryKey: ['customCategories'] });
    }
  };

  const setExerciseRating = (idx: number, rating: number | null) => {
    setSelected(prev => prev.map((e, i) => (i === idx ? { ...e, rating } : e)));
  };
  const setExerciseNotes = (idx: number, notes: string) => {
    setSelected(prev => prev.map((e, i) => (i === idx ? { ...e, notes } : e)));
  };
  const removeExercise = (idx: number) => {
    tapHaptic();
    setSelected(prev => prev.filter((_, i) => i !== idx));
  };

  const canSave = !!dogId && selected.length > 0;

  // Stabile ID pro Doku-Versuch → idempotenter Quota-Claim über Retries hinweg.
  const unitIdRef = useRef(Crypto.randomUUID());

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
      rating: e.rating, notes: e.notes?.trim() || null, duration_sec: null, seq_index: i,
    }));

    const { error } = editing
      ? await updateDocumentedUnit(id!, payload, exercises)
      : (await createDocumentedUnit(session.user.id, payload, exercises, unitIdRef.current));
    setSaving(false);
    if (error) {
      // NEWBIE-Quota (nur bei NEUER Doku): Upgrade- bzw. Retry-UX, sonst generisch.
      if (handleQuotaBlock(error, 'training', t, () => router.push('/premium' as never))) return;
      Alert.alert(t('common.error'), error.message ?? t('training.saveError')); return;
    }
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
          <Text style={s.eyebrow}>{t('training.diary')}</Text>
          <Text style={s.title}>{editing ? t('training.editTraining') : t('training.documentTraining')}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <HelpButton topicId="document_training" autoShow tint={C.white} />
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Trainingskontext: Hund + Sparte kompakt in einer Card */}
          <View style={s.contextCard}>
            {!dogsLoading && dogs.length === 0 ? (
              <>
                <Text style={s.label}>{t('training.dogLabel')}</Text>
                <View style={s.emptyDogCard}>
                  <Text style={s.emptyDogTxt}>{t('training.addFirstDog')}</Text>
                  <TouchableOpacity style={s.addDogBtn} onPress={() => router.push('/add-dog')} activeOpacity={0.8}>
                    <Text style={s.addDogTxt}>{t('training.addFirstDog')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : dogs.length === 1 ? (
              <>
                <Text style={s.label}>{t('training.dogLabel')}</Text>
                <View style={s.lockedDog} accessibilityLabel={t('training.chooseDogA11y', { dog: dogs[0].name })}>
                  <DogIcon size={14} color={C.accent} />
                  <Text style={s.lockedDogTxt}>{dogs[0].name}</Text>
                </View>
              </>
            ) : dogs.length > 1 && (
              <>
                <Text style={s.label}>{t('training.dogLabel')}</Text>
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

            <Text style={[s.label, { marginTop: dogs.length > 0 ? 16 : 0 }]}>{t('training.disciplineLabel')}</Text>
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
              {/* Eigene Kategorie anlegen — dieselbe Route/Logik wie app/unit/start.tsx. */}
              <TouchableOpacity
                style={s.chip}
                onPress={() => { tapHaptic(); router.push('/unit/new-category'); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('training.createCategory')}
              >
                <Ionicons name="add" size={13} color={C.accent} />
                <Text style={[s.chipTxt, { color: C.accent, fontWeight: '700' }]}>{t('training.createCategory')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Übungen (Mehrfachauswahl) — Chips, unverändert in der Logik */}
          {disc && (
            <>
              <Text style={s.label}>{t('training.exercisesFor', { discipline: disc.label.toUpperCase() })}</Text>
              <View style={s.chipRow}>
                {disc.exercises.filter(e => e !== 'Eigene Übung').map(ex => {
                  const aktiv = isSelected(disc.label, ex);
                  return (
                    <TouchableOpacity key={ex} style={[s.chip, aktiv && { borderColor: disc.accent, backgroundColor: `${disc.accent}1A` }]} onPress={() => toggleExercise(disc.label, ex)} activeOpacity={0.8}>
                      <Text style={[s.chipTxt, aktiv && { color: disc.accent, fontWeight: '700' }]}>{ex}</Text>
                    </TouchableOpacity>
                  );
                })}
                {recentNames.map(ex => {
                  const aktiv = isSelected(disc.label, ex);
                  return (
                    <TouchableOpacity key={`recent-${ex}`} style={[s.chip, aktiv && { borderColor: disc.accent, backgroundColor: `${disc.accent}1A` }]} onPress={() => toggleExercise(disc.label, ex)} activeOpacity={0.8}>
                      <Text style={[s.chipTxt, aktiv && { color: disc.accent, fontWeight: '700' }]}>{ex}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={s.chip}
                  onPress={() => { tapHaptic(); setCustomSheetOpen(true); }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('training.addCustomExercise')}
                >
                  <Ionicons name="add" size={13} color={disc.accent} />
                  <Text style={[s.chipTxt, { color: disc.accent, fontWeight: '700' }]}>{t('training.addCustomExercise')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Ausgewählte Übungen → Karten mit Bewertung + Notiz */}
          {selected.length > 0 && (
            <>
              <Text style={s.label}>{t('training.selectedCount', { count: selected.length })}</Text>
              <View style={s.selectedList}>
                {selected.map((e, i) => (
                  <SelectedExerciseCard
                    key={`${e.discipline}-${e.name}`}
                    name={e.name}
                    accentColor={disciplineColor(e.discipline)}
                    isCustom={isCustomExercise(e.discipline, e.name)}
                    rating={e.rating}
                    notes={e.notes}
                    onRatingChange={r => setExerciseRating(i, r)}
                    onNotesChange={n => setExerciseNotes(i, n)}
                    onRemove={() => removeExercise(i)}
                  />
                ))}
              </View>
            </>
          )}

          {/* Trainingsnotiz */}
          <Text style={s.label}>{t('training.descriptionLabel')}</Text>
          <TextInput style={s.textarea} placeholder={t('training.descriptionPlaceholder')} placeholderTextColor={C.placeholder} value={description} onChangeText={setDescription} multiline />

          {/* Datum + Dauer */}
          <Text style={s.label}>{t('training.dateLabel')}</Text>
          <DateField value={date} onChange={setDate} maximumDate={new Date()} />

          <Text style={s.label}>{t('training.durationLabel')}</Text>
          <CompactDurationStepper value={durationMin} onChange={setDurationMin} />

          {/* Gesamteindruck 1–10 — kompakte Segment-Leiste, Datenformat unverändert */}
          <Text style={[s.label, { marginTop: 22 }]}>{t('training.ratingLabel')}</Text>
          <View style={s.scoreCompact}>
            <Text style={s.scoreValue}>{score ? `${score}/10` : '—/10'}</Text>
            <View style={s.scoreBar}>
              {SCORE_STEPS.map(n => {
                const aktiv = score >= n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[s.scoreSeg, aktiv && s.scoreSegActive]}
                    onPress={() => { tapHaptic(); setScore(score === n ? 0 : n); }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={String(n)}
                  />
                );
              })}
            </View>
          </View>

          {/* Metriken (optional, Basis für KI-Auswertung) — bereits kompakt, unverändert */}
          <Text style={[s.label, { marginTop: 22 }]}>{t('training.metricsLabel')}</Text>
          <MetricsInput value={metrics} onChange={setMetrics} />

          {/* Medien: Fotos/Videos/Sprachaufnahmen gemeinsam gruppiert, Upload-/
              Storage-Logik der drei bestehenden Komponenten vollständig unverändert. */}
          <Text style={[s.label, { marginTop: 22 }]}>{t('training.mediaLabel')}</Text>
          <View style={s.mediaCard}>
            <Text style={s.mediaSubLabel}>{t('training.photosLabel')}</Text>
            <PhotoPicker value={photos} onChange={setPhotos} />
            <Text style={[s.mediaSubLabel, { marginTop: 16 }]}>{t('training.videosLabel')}</Text>
            <MultiVideoUpload value={videos} onChange={setVideos} />
            <Text style={[s.mediaSubLabel, { marginTop: 16 }]}>{t('training.voiceRecordingsLabel')}</Text>
            <AudioRecorder value={audio} onChange={setAudio} />
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Speichern — sticky/fixed CTA über dem Home Indicator */}
      <SafeAreaView edges={['bottom']} style={s.footer}>
        {!canSave && (
          <Text style={s.saveHint}>
            {!dogId ? t('training.chooseDogSaveHint') : t('training.chooseExerciseSaveHint')}
          </Text>
        )}
        <AnimatedPressable style={[s.saveBtn, !canSave && { opacity: 0.4 }]} scale={0.97} disabled={!canSave || saving} onPress={speichern}>
          <LinearGradient colors={['#00FFCC', '#00FFCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <Ionicons name="checkmark-circle" size={22} color={C.accentText} />
          <Text style={s.saveTxt}>{saving ? t('common.saving') : editing ? t('training.saveChanges') : t('training.saveUnit')}</Text>
        </AnimatedPressable>
      </SafeAreaView>

      <CustomExerciseSheet
        visible={customSheetOpen}
        onClose={() => setCustomSheetOpen(false)}
        isCustomDiscipline={isCustomDiscipline}
        onSave={handleAddCustomExercise}
      />
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

  contextCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14 },

  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden' },
  chipActive:   { borderColor: C.accent },
  chipTxt:      { fontSize: 13, color: C.muted, fontWeight: '600' },
  chipTxtActive:{ color: C.accentText, fontWeight: '700' },
  lockedDog: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: C.cardAlt, borderRadius: 20, borderWidth: 1, borderColor: C.accent, paddingHorizontal: 14, paddingVertical: 8 },
  lockedDogTxt: { fontSize: 13, color: C.white, fontWeight: '700' },
  emptyDogCard: { gap: 10, backgroundColor: C.cardAlt, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  emptyDogTxt: { fontSize: 13, color: C.subtle },
  addDogBtn: { alignSelf: 'flex-start', borderRadius: 12, borderWidth: 1, borderColor: C.accent, paddingHorizontal: 12, paddingVertical: 8 },
  addDogTxt: { fontSize: 13, color: C.accent, fontWeight: '700' },

  selectedList: { gap: 10 },

  textarea: { backgroundColor: C.input, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 14, padding: 14, minHeight: 90, textAlignVertical: 'top' },

  scoreCompact: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreValue:   { fontSize: 15, color: C.white, fontWeight: '900', minWidth: 46 },
  scoreBar:     { flex: 1, flexDirection: 'row', gap: 4 },
  scoreSeg:     { flex: 1, height: 26, borderRadius: 7, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  scoreSegActive:{ backgroundColor: C.accent, borderColor: C.accent },

  mediaCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14 },
  mediaSubLabel: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.2 },

  footer:  { paddingHorizontal: 20, paddingTop: 10, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  saveHint:{ fontSize: 12.5, color: C.muted, textAlign: 'center', marginBottom: 10, fontWeight: '600' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: 18, overflow: 'hidden', marginBottom: 10 },
  saveTxt: { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },
});
